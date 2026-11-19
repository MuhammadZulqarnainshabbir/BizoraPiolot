import { Injectable, NgZone, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { EMPLOYEE_API } from './api';
import { SessionGrant, SessionTimer } from './session-timer';

export interface EmployeeShop { id: string; shopName: string; slug: string; shopCode?: string | null; timezone: string; }
/** accessRole: 'employee' (fixed permissions) or 'manager' (operational defaults + the owner's overrides). `role` is the job title. */
export type AccessRole = 'employee' | 'manager';
export interface EmployeeProfile { id: string; employeeId: string; name: string; email: string; role: string; accessRole?: AccessRole; mustChangePassword: boolean; }
/** permissions: what the employee may do, as reported by the server (backend config/permissions.js). */
export interface EmployeeSession { employee: EmployeeProfile; shop: EmployeeShop; permissions?: string[]; }

const TOKEN_KEY = 'electrohub_employee_token';
const SESSION_KEY = 'electrohub_employee_session';

/** Builds the app path for a shop's employee area, e.g. ['/', 'tenshop', '<id>', 'employee', 'login']. */
export function employeePath(shop: Pick<EmployeeShop, 'id' | 'slug'>, ...rest: string[]): string[] {
  return ['/', shop.slug, shop.id, 'employee', ...rest];
}

/** The manager portal lives beside the employee one: ['/', 'tenshop', '<id>', 'manager', ...]. */
export function managerPath(shop: Pick<EmployeeShop, 'id' | 'slug'>, ...rest: string[]): string[] {
  return ['/', shop.slug, shop.id, 'manager', ...rest];
}

/** The portal for a staff session: managers go to /manager, everyone else to /employee. */
export function staffPath(session: Pick<EmployeeSession, 'shop' | 'employee'>, ...rest: string[]): string[] {
  return session.employee.accessRole === 'manager' ? managerPath(session.shop, ...rest) : employeePath(session.shop, ...rest);
}

/** Employee sessions are kept separately from the owner session so both can't be confused. */
@Injectable({ providedIn: 'root' })
export class EmployeeAuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly session = signal<EmployeeSession | null>(this.readSession());
  /** Idle and maximum-length expiry for the employee session. */
  readonly sessionTimer = new SessionTimer({
    storageKey: 'electrohub_employee_session_times',
    zone: inject(NgZone),
    renew: () => this.refresh(),
    onExpire: () => this.expire()
  });

  get token(): string | null { return sessionStorage.getItem(TOKEN_KEY); }
  /** Signed in with a token that hasn't run out. */
  get active(): boolean { return !!this.token && !this.sessionTimer.expired; }

  shopInfo(shopId: string) {
    return this.http.get<{ shop: EmployeeShop }>(`${EMPLOYEE_API}/shops/${encodeURIComponent(shopId)}`);
  }

  login(shopId: string, employeeId: string, password: string) {
    return this.http.post<SessionGrant & EmployeeSession>(`${EMPLOYEE_API}/login`, { shopId, employeeId, password })
      .pipe(tap(({ employee, shop, permissions, ...grant }) => this.save({ employee, shop, permissions }, grant)));
  }

  me() {
    return this.http.get<EmployeeSession>(`${EMPLOYEE_API}/me`)
      .pipe(tap(session => this.save(session)));
  }

  /** Signed in as a manager (accessRole from the server). */
  get isManager(): boolean { return this.session()?.employee.accessRole === 'manager'; }

  /**
   * Renews the session token; called by the session timer while the employee is active. The
   * server also returns the current profile and permissions, so a promotion, demotion or
   * permission change reaches the app at the next renewal.
   */
  refresh() {
    return this.http.post<SessionGrant & Partial<EmployeeSession>>(`${EMPLOYEE_API}/refresh`, {}).pipe(tap(({ employee, shop, permissions, ...grant }) => {
      const current = this.session();
      if (employee && shop) this.save({ employee, shop, permissions: permissions ?? current?.permissions }, grant);
      else {
        sessionStorage.setItem(TOKEN_KEY, grant.token);
        this.sessionTimer.begin(grant);
      }
    }));
  }

  changePassword(currentPassword: string, password: string, confirmPassword: string) {
    return this.http.post<SessionGrant & { employee: EmployeeProfile; permissions?: string[] }>(`${EMPLOYEE_API}/change-password`, { currentPassword, password, confirmPassword })
      .pipe(tap(({ employee, permissions, ...grant }) => {
        const shop = this.session()?.shop;
        if (shop) this.save({ employee, shop, permissions: permissions ?? this.session()?.permissions }, grant);
      }));
  }

  logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    this.session.set(null);
    this.sessionTimer.stop();
  }

  /** The session ran out or the server rejected it: sign out and say why on the shop's login page. */
  expire() {
    const shop = this.session()?.shop;
    if (!this.token) return;
    this.logout();
    void this.router.navigate(shop ? employeePath(shop, 'login') : ['/'], { queryParams: { expired: 1 } });
  }

  /** Stores the profile, and the new token when the response included one. */
  private save(session: EmployeeSession, grant?: SessionGrant) {
    if (grant) {
      sessionStorage.setItem(TOKEN_KEY, grant.token);
      this.sessionTimer.begin(grant);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.session.set(session);
  }

  private readSession(): EmployeeSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw && sessionStorage.getItem(TOKEN_KEY) ? JSON.parse(raw) as EmployeeSession : null;
    } catch {
      return null;
    }
  }
}
