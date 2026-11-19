import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { EmployeeAuthService, employeePath, managerPath } from './employee-auth.service';

function shopParams(route: ActivatedRouteSnapshot) {
  let current: ActivatedRouteSnapshot | null = route;
  while (current && !current.paramMap.has('shopId')) current = current.parent;
  return { slug: current?.paramMap.get('slug') ?? 'shop', shopId: current?.paramMap.get('shopId') ?? '' };
}

/** Requires a staff session (employee or manager) for the shop in the URL; otherwise sends to that shop's login page. */
export const employeeGuard: CanActivateFn = route => {
  const auth = inject(EmployeeAuthService);
  const { slug, shopId } = shopParams(route);
  const session = auth.session();
  if (auth.active && session?.shop.id === shopId) return true;
  // A session for this shop that has run out: clear it and explain on the login page.
  const expired = !!auth.token && session?.shop.id === shopId;
  if (expired) auth.logout();
  return inject(Router).createUrlTree(['/', slug, shopId, 'employee', 'login'], expired ? { queryParams: { expired: 1 } } : {});
};

/** The manager portal is for managers; an employee who opens it is sent to the employee portal. */
export const managerGuard: CanActivateFn = () => {
  const session = inject(EmployeeAuthService).session();
  if (!session || session.employee.accessRole === 'manager') return true;
  return inject(Router).createUrlTree(employeePath(session.shop));
};

/** A manager who opens the employee portal is sent to the manager portal (same pages, more of them). */
export const employeePortalGuard: CanActivateFn = () => {
  const session = inject(EmployeeAuthService).session();
  if (!session || session.employee.accessRole !== 'manager') return true;
  return inject(Router).createUrlTree(managerPath(session.shop));
};

/** Employees with a temporary password must change it before using the rest of the app. */
export const passwordChangedGuard: CanActivateFn = route => {
  const session = inject(EmployeeAuthService).session();
  if (!session?.employee.mustChangePassword) return true;
  const { slug, shopId } = shopParams(route);
  return inject(Router).createUrlTree(['/', slug, shopId, session.employee.accessRole === 'manager' ? 'manager' : 'employee', 'password']);
};
