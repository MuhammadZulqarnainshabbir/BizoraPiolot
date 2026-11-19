import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { API_BASE } from '../../core/api';
import { SessionGrant, SessionTimer } from '../../core/session-timer';

/** A Bizora staff account, as the server reports it after sign-in. */
export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN';
  status: 'active' | 'inactive';
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  permissions: string[];
}

export interface PlatformSession extends SessionGrant {
  scope: 'full' | 'setup';
  admin: PlatformAdmin;
  setupRequired: boolean;
  mfaRequired?: boolean;
}

const TOKEN_KEY = 'bizora_platform_token';
const ADMIN_KEY = 'bizora_platform_admin';
const SETUP_KEY = 'bizora_platform_setup';

const readAdmin = (): PlatformAdmin | null => {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_KEY) ?? 'null'); } catch { return null; }
};

/**
 * Platform console session. Entirely separate from the owner and employee sessions: its own
 * storage keys, its own token (audience "platform") and its own idle / maximum-length timer.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = `${API_BASE}/platform-admin`;

  readonly admin = signal<PlatformAdmin | null>(readAdmin());
  /** The account still needs a password change or MFA enrolment; only the set-up pages work. */
  readonly setupRequired = signal(sessionStorage.getItem(SETUP_KEY) === '1');
  /** Whether the platform requires every admin to enrol an authenticator (server setting). */
  readonly mfaRequired = signal(false);
  readonly permissions = computed(() => this.admin()?.permissions ?? []);

  readonly sessionTimer = new SessionTimer({
    storageKey: 'bizora_platform_session_times',
    zone: inject(NgZone),
    renew: () => this.refresh(),
    onExpire: () => this.expire()
  });

  get token(): string | null { return sessionStorage.getItem(TOKEN_KEY); }
  get authenticated(): boolean { return !!this.token && !this.sessionTimer.expired; }
  can(permission: string): boolean { return this.permissions().includes(permission); }

  login(data: { email: string; password: string; totp?: string }) {
    return this.http.post<PlatformSession>(`${this.api}/auth/login`, data).pipe(tap(res => this.save(res)));
  }

  me() {
    return this.http.get<{ admin: PlatformAdmin; mfaRequired: boolean; setupRequired: boolean }>(`${this.api}/me`).pipe(tap(res => {
      this.setAdmin(res.admin);
      this.setSetup(res.setupRequired);
      this.mfaRequired.set(res.mfaRequired);
    }));
  }

  refresh() {
    return this.http.post<PlatformSession>(`${this.api}/auth/refresh`, {}).pipe(tap(res => this.save(res)));
  }

  changePassword(data: { currentPassword: string; password: string }) {
    return this.http.post<PlatformSession>(`${this.api}/auth/change-password`, data).pipe(tap(res => this.save(res)));
  }

  mfaSetup() { return this.http.post<{ secret: string; otpauth: string }>(`${this.api}/auth/mfa/setup`, {}); }

  mfaEnable(code: string) {
    return this.http.post<PlatformSession>(`${this.api}/auth/mfa/enable`, { code }).pipe(tap(res => this.save(res)));
  }

  /** Ends every session of this admin on the server, then clears the browser. */
  logout() {
    const token = this.token;
    this.clear();
    if (token) this.http.post(`${this.api}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }).subscribe({ error: () => undefined });
    void this.router.navigateByUrl('/platform-admin/login');
  }

  /** The session ran out or the server rejected it. */
  expire() {
    if (!this.token) return;
    this.clear();
    void this.router.navigate(['/platform-admin/login'], { queryParams: { expired: 1 } });
  }

  private save(res: PlatformSession) {
    sessionStorage.setItem(TOKEN_KEY, res.token);
    this.setAdmin(res.admin);
    this.setSetup(res.setupRequired);
    if (res.mfaRequired !== undefined) this.mfaRequired.set(res.mfaRequired);
    this.sessionTimer.begin(res);
  }

  private setAdmin(admin: PlatformAdmin) {
    this.admin.set(admin);
    sessionStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  }

  private setSetup(required: boolean) {
    this.setupRequired.set(required);
    sessionStorage.setItem(SETUP_KEY, required ? '1' : '0');
  }

  private clear() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_KEY);
    sessionStorage.removeItem(SETUP_KEY);
    this.admin.set(null);
    this.setupRequired.set(false);
    this.sessionTimer.stop();
  }
}
