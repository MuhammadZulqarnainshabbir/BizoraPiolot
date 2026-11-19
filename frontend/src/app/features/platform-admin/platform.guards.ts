import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformAuthService } from './platform-auth.service';

/** Signed in to the platform console (any scope). */
export const platformAuthGuard: CanActivateFn = () => {
  const auth = inject(PlatformAuthService);
  return auth.authenticated ? true : inject(Router).createUrlTree(['/platform-admin/login']);
};

/** Signed in AND finished setting up (password changed, MFA enrolled when required). */
export const platformReadyGuard: CanActivateFn = () => {
  const auth = inject(PlatformAuthService);
  return auth.setupRequired() ? inject(Router).createUrlTree(['/platform-admin/setup']) : true;
};

/** Login page: already signed in → straight to the console. */
export const platformGuestGuard: CanActivateFn = () => {
  const auth = inject(PlatformAuthService);
  return auth.authenticated ? inject(Router).createUrlTree(['/platform-admin']) : true;
};

/** A page that needs a platform permission (the API enforces it too; this keeps the navigation honest). */
export const platformPermissionGuard = (permission: string): CanActivateFn => () => {
  const auth = inject(PlatformAuthService);
  return auth.can(permission) ? true : inject(Router).createUrlTree(['/platform-admin']);
};
