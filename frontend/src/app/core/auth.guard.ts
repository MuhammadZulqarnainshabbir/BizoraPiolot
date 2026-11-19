import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Owner pages need a session that hasn't expired; an expired one is cleared and explained. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.authenticated) return true;
  const hadSession = !!auth.token;
  if (hadSession) auth.logout();
  return inject(Router).createUrlTree(['/login'], hadSession ? { queryParams: { expired: 1 } } : {});
};
