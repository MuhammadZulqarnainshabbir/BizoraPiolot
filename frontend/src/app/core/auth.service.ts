import { Injectable, NgZone, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { API_BASE } from './api';
import { SessionGrant, SessionTimer } from './session-timer';
/** shopCode: short code employees type in the mobile app to pick this shop (null for shops not yet backfilled). */
export interface Shop {
  id: string; shopName: string; slug: string; shopCode: string | null; ownerName: string; email: string; phone: string; address: string; timezone: string;
  /** Printed on receipts: National Tax Number, Sales Tax Registration Number, and the shop's own terms. */
  ntn: string; strn: string; receiptNote: string;
}
export interface ShopSettings { timezone?: string; ntn?: string; strn?: string; receiptNote?: string; }
interface AuthResponse extends SessionGrant { shop: Shop; permissions: string[]; }
interface RegistrationResponse { message: string; shop: Shop; }
interface MessageResponse { message: string; }

const TOKEN_KEY = 'electrohub_token';
const PERMISSIONS_KEY = 'electrohub_permissions';

const readPermissions = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(PERMISSIONS_KEY) ?? '[]'); } catch { return []; }
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = `${API_BASE}/auth`;
  shop = signal<Shop | null>(null);
  /** What the owner may do, as reported by the server (see backend config/permissions.js). */
  permissions = signal<string[]>(readPermissions());
  /** Idle and maximum-length expiry for the owner session. */
  readonly sessionTimer = new SessionTimer({
    storageKey: 'electrohub_session_times',
    zone: inject(NgZone),
    renew: () => this.refresh(),
    onExpire: () => this.expire()
  });

  get token(): string | null { return sessionStorage.getItem(TOKEN_KEY); }
  get authenticated(): boolean { return !!this.token && !this.sessionTimer.expired; }
  register(data: Record<string, string>) { return this.http.post<RegistrationResponse>(`${this.api}/register-shop`, data).pipe(tap(() => this.logout())); }
  login(data: { email: string; password: string }) { return this.http.post<AuthResponse>(`${this.api}/login`, data).pipe(tap(res => this.save(res))); }
  forgotPassword(data: { email: string }) { return this.http.post<MessageResponse>(`${this.api}/forgot-password`, data); }
  resetPassword(data: { token: string; password: string; confirmPassword: string }) { return this.http.post<MessageResponse>(`${this.api}/reset-password`, data); }
  me() {
    return this.http.get<{ shop: Shop; permissions: string[] }>(`${this.api}/me`).pipe(tap(res => {
      this.shop.set(res.shop);
      this.setPermissions(res.permissions);
    }));
  }

  /** Owner changes shop settings (timezone, receipt details). Only the fields sent change. */
  updateSettings(settings: ShopSettings) {
    return this.http.patch<{ shop: Shop }>(`${this.api}/shop-settings`, settings).pipe(tap(res => this.shop.set(res.shop)));
  }

  /** Renews the session token; called by the session timer while the owner is active. */
  refresh() {
    return this.http.post<SessionGrant>(`${this.api}/refresh`, {}).pipe(tap(grant => {
      sessionStorage.setItem(TOKEN_KEY, grant.token);
      this.sessionTimer.begin(grant);
    }));
  }

  logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PERMISSIONS_KEY);
    this.shop.set(null);
    this.permissions.set([]);
    this.sessionTimer.stop();
  }

  /** The session ran out or the server rejected it: sign out and say why on the login page. */
  expire() {
    if (!this.token) return;
    this.logout();
    void this.router.navigate(['/login'], { queryParams: { expired: 1 } });
  }

  private setPermissions(permissions: string[] = []) {
    this.permissions.set(permissions);
    sessionStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
  }

  private save(res: AuthResponse) {
    sessionStorage.setItem(TOKEN_KEY, res.token);
    this.shop.set(res.shop);
    this.setPermissions(res.permissions);
    this.sessionTimer.begin(res);
  }
}
