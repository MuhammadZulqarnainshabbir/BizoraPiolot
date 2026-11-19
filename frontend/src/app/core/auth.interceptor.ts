import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_BASE } from './api';
import { AuthService } from './auth.service';
import { EmployeeAuthService, staffPath } from './employee-auth.service';
import { PortalService } from './portal.service';
import { PlatformAuthService } from '../features/platform-admin/platform-auth.service';

/** Owner-only endpoints. */
const OWNER_PATHS = ['/auth/me', '/auth/refresh', '/auth/shop-settings'];
/** Used by both portals: the token comes from the portal the user is in (managers may read /employees). */
const SHARED_PATHS = ['/products', '/sales', '/installments', '/dashboard', '/categories', '/customers', '/employees'];
const EMPLOYEE_PUBLIC_PATHS = ['/employee/login', '/employee/shops/'];

const matches = (path: string, prefix: string) =>
  prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);

/**
 * Attaches the right session token: owner endpoints get the owner's, employee endpoints the
 * employee's, shared endpoints the token of the current portal. A 401 means the session is over
 * (expired, revoked or deleted): sign out with an explanation instead of leaving a page of errors.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE)) return next(req);
  const path = req.url.slice(API_BASE.length);
  if (EMPLOYEE_PUBLIC_PATHS.some(prefix => matches(path, prefix))) return next(req);

  // Platform console: its own token; shop tokens are never sent here and vice versa.
  if (matches(path, '/platform-admin')) {
    const platform = inject(PlatformAuthService);
    const router = inject(Router);
    const token = platform.token;
    if (token && !path.startsWith('/platform-admin/auth/login')) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    return next(req).pipe(catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && token) {
        if (error.status === 401) platform.expire();
        else if (error.status === 403 && error.error?.code === 'SETUP_REQUIRED') void router.navigateByUrl('/platform-admin/setup');
      }
      return throwError(() => error);
    }));
  }

  const shared = SHARED_PATHS.some(prefix => matches(path, prefix));
  const asEmployee = path.startsWith('/employee/') || (shared && inject(PortalService).role() === 'employee');
  if (!asEmployee && !shared && !OWNER_PATHS.some(prefix => matches(path, prefix))) return next(req);

  if (asEmployee) {
    const employeeAuth = inject(EmployeeAuthService);
    const router = inject(Router);
    const token = employeeAuth.token;
    if (token) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    return next(req).pipe(catchError((error: unknown) => {
      const session = employeeAuth.session();
      if (error instanceof HttpErrorResponse && session) {
        if (error.status === 401) employeeAuth.expire();
        else if (error.status === 403 && error.error?.code === 'PASSWORD_CHANGE_REQUIRED') void router.navigate(staffPath(session, 'password'));
        else if (error.status === 403 && shopBlocked(error)) {
          // The platform suspended, deactivated or hasn't approved the shop: sign out and say why.
          employeeAuth.logout();
          void router.navigate(staffPath(session, 'login'), { queryParams: { blocked: error.error.code } });
        }
      }
      return throwError(() => error);
    }));
  }

  const auth = inject(AuthService);
  const token = auth.token;
  if (token) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return next(req).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401 && token) auth.expire();
    else if (error instanceof HttpErrorResponse && error.status === 403 && token && shopBlocked(error)) {
      auth.logout();
      void inject(Router).navigate(['/login'], { queryParams: { blocked: error.error.code } });
    }
    return throwError(() => error);
  }));
};

/** 403 from the shop lifecycle (SHOP_SUSPENDED, SHOP_DEACTIVATED, SHOP_PENDING). */
const shopBlocked = (error: HttpErrorResponse) => typeof error.error?.code === 'string' && error.error.code.startsWith('SHOP_');
