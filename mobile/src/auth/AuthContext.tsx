import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isApiError, loadApiUrl, setToken, setUnauthorizedHandler } from '@/api/client';
import { auth as ownerApi, employeeAuth } from '@/api/endpoints';
import type { EmployeeProfile, EmployeeShop, SessionGrant, Shop } from '@/api/models';

/**
 * Who is signed in (shop owner or employee), what they may do, and the session's lifetime.
 *
 * Session rules are the web app's (frontend/src/app/core/session-timer.ts): the server issues
 * short-lived tokens (the idle limit). While the user has touched the screen since the last
 * renewal, the token is renewed once half its lifetime has passed; otherwise it runs out, with
 * a warning shortly before. Renewals never pass the maximum session length, which gets its own
 * non-extendable warning. Times are this device's clock + the server's durations, so clock
 * differences don't matter.
 */

export interface OwnerSession { role: 'owner'; shop: Shop; permissions: string[]; }
export interface EmployeeSession { role: 'employee'; shop: EmployeeShop; employee: EmployeeProfile; permissions: string[]; }
export type Session = OwnerSession | EmployeeSession;
export interface RememberedShop { id: string; slug: string; shopName: string; shopCode: string | null; }
export interface SessionWarning { kind: 'idle' | 'ending'; secondsLeft: number; }

interface SessionTimes { issuedAt: number; expiresAt: number; sessionEndsAt: number; }

const TOKEN_KEY = 'bizora_token';
const SESSION_KEY = 'bizora_session';
const TIMES_KEY = 'bizora_session_times';
const LAST_SHOP_KEY = 'bizora_last_employee_shop';
const IDLE_WARNING_SECONDS = 120;
const ENDING_WARNING_SECONDS = 300;
export const SESSION_EXPIRED_NOTICE = 'Your session expired. Please log in again.';

interface AuthValue {
  /** Stored session restored (or found absent); the app can render. */
  ready: boolean;
  session: Session | null;
  signedIn: boolean;
  mustChangePassword: boolean;
  /** Signed in as a manager (an employee account with shop-wide operational access). */
  isManager: boolean;
  warning: SessionWarning | null;
  /** Shown on the sign-in screens after a session ended by itself. */
  expiredNotice: string;
  lastEmployeeShop: RememberedShop | null;
  timezone: string;
  /** Id of the signed-in user (owner: the shop id). */
  actorId: string | null;
  can: (permission: string) => boolean;
  loginOwner: (email: string, password: string) => Promise<void>;
  /** Shop code + employee ID + password; the server verifies the employee belongs to that shop. */
  loginEmployee: (shopCode: string, employeeId: string, password: string) => Promise<EmployeeProfile>;
  logout: () => Promise<void>;
  /** Re-fetches the profile (shop settings, role, temp-password flag). */
  refreshProfile: () => Promise<void>;
  setShop: (shop: Shop) => void;
  /** Employee changed their password: the server returned a new token and profile. */
  applyEmployeeUpdate: (grant: SessionGrant, employee: EmployeeProfile) => void;
  stayActive: () => void;
  dismissEndingWarning: () => void;
  clearExpiredNotice: () => void;
  noteActivity: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

async function persist(token: string | null, session: Session | null, times: SessionTimes | null) {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token); else await SecureStore.deleteItemAsync(TOKEN_KEY);
    if (session) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)); else await AsyncStorage.removeItem(SESSION_KEY);
    if (times) await AsyncStorage.setItem(TIMES_KEY, JSON.stringify(times)); else await AsyncStorage.removeItem(TIMES_KEY);
  } catch { /* storage unavailable: the session lasts for this launch only */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);
  const [warning, setWarning] = useState<SessionWarning | null>(null);
  const [expiredNotice, setExpiredNotice] = useState('');
  const [lastEmployeeShop, setLastEmployeeShop] = useState<RememberedShop | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const timesRef = useRef<SessionTimes | null>(null);
  const lastActivity = useRef(Date.now());
  const lastRenewal = useRef(Date.now());
  const renewing = useRef(false);
  const endingDismissed = useRef(false);
  const warningRef = useRef<SessionWarning | null>(null);

  const setSession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  const updateWarning = useCallback((next: SessionWarning | null) => {
    const current = warningRef.current;
    if (current?.kind === next?.kind && current?.secondsLeft === next?.secondsLeft) return;
    warningRef.current = next;
    setWarning(next);
  }, []);

  const clear = useCallback(async () => {
    setToken(null);
    timesRef.current = null;
    endingDismissed.current = false;
    renewing.current = false;
    updateWarning(null);
    setSession(null);
    await persist(null, null, null);
  }, [setSession, updateWarning]);

  const expire = useCallback((message?: string) => {
    if (!sessionRef.current) return;
    setExpiredNotice(message || SESSION_EXPIRED_NOTICE);
    void clear();
  }, [clear]);

  const begin = useCallback((grant: SessionGrant) => {
    const now = Date.now();
    const times: SessionTimes = { issuedAt: now, expiresAt: now + grant.expiresIn * 1000, sessionEndsAt: now + grant.sessionEndsIn * 1000 };
    timesRef.current = times;
    lastRenewal.current = now;
    setToken(grant.token);
    if (warningRef.current?.kind === 'idle') updateWarning(null);
    void persist(grant.token, sessionRef.current, times);
  }, [updateWarning]);

  const renew = useCallback(() => {
    const current = sessionRef.current;
    if (renewing.current || !current || !timesRef.current) return;
    renewing.current = true;
    const call = current.role === 'employee' ? employeeAuth.refresh() : ownerApi.refresh();
    call.then((grant: SessionGrant & { employee?: EmployeeProfile; shop?: EmployeeShop; permissions?: string[] }) => {
        renewing.current = false;
        // A staff renewal carries the current profile and permissions (promotion, demotion, permission changes).
        const latest = sessionRef.current;
        if (latest?.role === 'employee' && grant.employee && grant.shop) {
          const next: Session = { role: 'employee', shop: grant.shop, employee: grant.employee, permissions: grant.permissions ?? latest.permissions };
          setSession(next);
          AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)).catch(() => undefined);
        }
        begin(grant);
      })
      .catch((error: unknown) => {
        renewing.current = false;
        // Rejected (session over or revoked): end it now. Network errors retry on the next tick.
        if (isApiError(error) && error.status === 401) expire();
      });
  }, [begin, expire]);

  const tick = useCallback(() => {
    const times = timesRef.current;
    if (!times || !sessionRef.current) return;
    const now = Date.now();
    const left = times.expiresAt - now;
    if (left <= 0) { expire(); return; }
    const canExtend = times.sessionEndsAt - times.expiresAt > 1000;
    const lifetime = times.expiresAt - times.issuedAt;
    if (canExtend && lastActivity.current > lastRenewal.current && left < lifetime / 2) renew();
    const secondsLeft = Math.ceil(left / 1000);
    let next: SessionWarning | null = null;
    if (!canExtend) {
      if (!endingDismissed.current && secondsLeft <= ENDING_WARNING_SECONDS) next = { kind: 'ending', secondsLeft };
    } else if (secondsLeft <= Math.min(IDLE_WARNING_SECONDS, lifetime / 4000)) {
      next = { kind: 'idle', secondsLeft };
    }
    updateWarning(next);
  }, [expire, renew, updateWarning]);

  // Restore a stored session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadApiUrl();
      try {
        const [token, sessionRaw, timesRaw, lastShopRaw] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY), AsyncStorage.getItem(SESSION_KEY), AsyncStorage.getItem(TIMES_KEY), AsyncStorage.getItem(LAST_SHOP_KEY)
        ]);
        if (cancelled) return;
        if (lastShopRaw) { try { setLastEmployeeShop(JSON.parse(lastShopRaw)); } catch { /* ignore */ } }
        const times = timesRaw ? (JSON.parse(timesRaw) as SessionTimes) : null;
        const stored = sessionRaw ? (JSON.parse(sessionRaw) as Session) : null;
        const valid = token && stored && times && [times.issuedAt, times.expiresAt, times.sessionEndsAt].every(Number.isFinite) && Date.now() < times.expiresAt;
        if (valid) {
          setToken(token);
          timesRef.current = times;
          // Only real input from here on counts as activity, so relaunching an idle app doesn't keep the session alive.
          lastRenewal.current = times.issuedAt;
          lastActivity.current = times.issuedAt;
          setSession(stored);
        } else if (token || stored) {
          await persist(null, null, null);
        }
      } catch { /* start signed out */ }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [setSession]);

  // The server rejected our token: the session is over.
  useEffect(() => {
    setUnauthorizedHandler(message => expire(message));
    return () => setUnauthorizedHandler(null);
  }, [expire]);

  // One-second tick while signed in; check immediately when the app returns to the foreground.
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [session, tick]);

  const loginOwner = useCallback(async (email: string, password: string) => {
    const res = await ownerApi.login(email, password);
    setExpiredNotice('');
    setSession({ role: 'owner', shop: res.shop, permissions: res.permissions ?? [] });
    lastActivity.current = Date.now();
    begin(res);
  }, [begin, setSession]);

  const loginEmployee = useCallback(async (shopCode: string, employeeId: string, password: string) => {
    const res = await employeeAuth.login(shopCode, employeeId, password);
    setExpiredNotice('');
    setSession({ role: 'employee', shop: res.shop, employee: res.employee, permissions: res.permissions ?? [] });
    lastActivity.current = Date.now();
    begin(res);
    const remembered: RememberedShop = { id: res.shop.id, slug: res.shop.slug, shopName: res.shop.shopName, shopCode: res.shop.shopCode ?? shopCode };
    setLastEmployeeShop(remembered);
    AsyncStorage.setItem(LAST_SHOP_KEY, JSON.stringify(remembered)).catch(() => undefined);
    return res.employee;
  }, [begin, setSession]);

  const logout = useCallback(async () => {
    setExpiredNotice('');
    await clear();
  }, [clear]);

  const refreshProfile = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    if (current.role === 'owner') {
      const res = await ownerApi.me();
      const next: Session = { role: 'owner', shop: res.shop, permissions: res.permissions ?? current.permissions };
      setSession(next);
    } else {
      const res = await employeeAuth.me();
      const next: Session = { role: 'employee', shop: res.shop, employee: res.employee, permissions: res.permissions ?? current.permissions };
      setSession(next);
    }
    try { await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionRef.current)); } catch { /* ignore */ }
  }, [setSession]);

  const setShop = useCallback((shop: Shop) => {
    const current = sessionRef.current;
    if (current?.role !== 'owner') return;
    const next: Session = { ...current, shop };
    setSession(next);
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)).catch(() => undefined);
  }, [setSession]);

  const applyEmployeeUpdate = useCallback((grant: SessionGrant, employee: EmployeeProfile) => {
    const current = sessionRef.current;
    if (current?.role !== 'employee') return;
    const next: Session = { ...current, employee };
    setSession(next);
    begin(grant);
  }, [begin, setSession]);

  const value = useMemo<AuthValue>(() => ({
    ready,
    session,
    signedIn: Boolean(session),
    mustChangePassword: session?.role === 'employee' && session.employee.mustChangePassword,
    isManager: session?.role === 'employee' && session.employee.accessRole === 'manager',
    warning,
    expiredNotice,
    lastEmployeeShop,
    timezone: session?.shop.timezone || 'Asia/Karachi',
    actorId: session ? (session.role === 'employee' ? session.employee.id : session.shop.id) : null,
    can: permission => Boolean(session?.permissions.includes(permission)),
    loginOwner,
    loginEmployee,
    logout,
    refreshProfile,
    setShop,
    applyEmployeeUpdate,
    stayActive: () => { lastActivity.current = Date.now(); renew(); },
    dismissEndingWarning: () => { endingDismissed.current = true; updateWarning(null); },
    clearExpiredNotice: () => setExpiredNotice(''),
    noteActivity: () => { lastActivity.current = Date.now(); }
  }), [ready, session, warning, expiredNotice, lastEmployeeShop, loginOwner, loginEmployee, logout, refreshProfile, setShop, applyEmployeeUpdate, renew, updateWarning]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/**
 * The signed-in session, for screens inside the protected area. It is null for the render in
 * which the user logs out (the screens are still mounted while the router switches away), so
 * screens render nothing in that case rather than throwing.
 */
export function useSession(): Session | null {
  return useAuth().session;
}
