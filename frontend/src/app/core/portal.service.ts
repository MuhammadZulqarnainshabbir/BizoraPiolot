import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './auth.service';
import { EmployeeAuthService, staffPath } from './employee-auth.service';

/** Which session a page uses: the owner's, or the staff session (employees and managers). */
export type PortalRole = 'owner' | 'employee';

const isEmployeeUrl = (url: string) => { const s = url.split(/[?#]/)[0].split('/')[3]; return s === 'employee' || s === 'manager'; };

/**
 * The portal the user is in (partner dashboard or employee portal), what they're allowed to do,
 * and where links go. Shared feature components use this instead of knowing about either portal,
 * so one component serves both and shows only the permitted actions. The server enforces the
 * same permissions; this only decides what to show.
 */
@Injectable({ providedIn: 'root' })
export class PortalService {
  private router = inject(Router);
  private owner = inject(AuthService);
  private employee = inject(EmployeeAuthService);
  private url = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url || location.pathname }
  );

  /** Employee pages use the employee session; everything else the owner session. */
  role(): PortalRole {
    return isEmployeeUrl(this.url()) || isEmployeeUrl(location.pathname) ? 'employee' : 'owner';
  }

  can(permission: string): boolean {
    const permissions = this.role() === 'employee' ? this.employee.session()?.permissions ?? [] : this.owner.permissions();
    return permissions.includes(permission);
  }

  /** Signed in to the staff portal as a manager. */
  isManager(): boolean {
    return this.role() === 'employee' && this.employee.session()?.employee.accessRole === 'manager';
  }

  /** Router commands for a page inside the current portal (owner, manager or employee), e.g. link('sales', 'full-price'). */
  link(...segments: (string | number)[]): (string | number)[] {
    const session = this.employee.session();
    const base = this.role() === 'employee' && session ? staffPath(session) : ['/partnerdashboard'];
    return [...base, ...segments];
  }

  /** IANA timezone of the user's shop: dates and times are shown in it. */
  timezone(): string {
    return (this.role() === 'employee' ? this.employee.session()?.shop.timezone : this.owner.shop()?.timezone) || 'Asia/Karachi';
  }

  /** Id of the signed-in user (owner: the shop id) — used to label "you". */
  actorId(): string | null {
    return this.role() === 'employee' ? this.employee.session()?.employee.id ?? null : this.owner.shop()?.id ?? null;
  }
}
