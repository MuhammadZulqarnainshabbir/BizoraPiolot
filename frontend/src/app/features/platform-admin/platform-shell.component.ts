import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlatformAuthService } from './platform-auth.service';

interface NavItem { label: string; icon: string; link: string; permission?: string; exact?: boolean; }

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: '▦', link: '/platform-admin', exact: true },
  { label: 'Shops', icon: '🏬', link: '/platform-admin/shops', permission: 'shops.view' },
  { label: 'Plans & subscriptions', icon: '◎', link: '/platform-admin/plans', permission: 'plans.view' },
  { label: 'Analytics', icon: '◔', link: '/platform-admin/analytics', permission: 'analytics.view' },
  { label: 'Administrators', icon: '👤', link: '/platform-admin/administrators', permission: 'admins.view' },
  { label: 'Audit log', icon: '≡', link: '/platform-admin/audit-logs', permission: 'audit.view' },
  { label: 'Settings', icon: '⚙', link: '/platform-admin/settings', permission: 'settings.view' }
];

/** The console's own layout: sidebar, top bar with the signed-in admin, session warning. */
@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
<div class="pa-shell">
  <aside class="pa-sidebar">
    <a routerLink="/platform-admin" class="pa-brand"><span aria-hidden="true">◈</span> Bizora <span>Platform</span></a>
    <div class="pa-side-label">CONSOLE</div>
    <nav class="pa-nav" aria-label="Platform console">
      @for (item of items(); track item.link) {
        <a [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }"><span aria-hidden="true">{{ item.icon }}</span>{{ item.label }}</a>
      }
    </nav>
    <div class="pa-side-bottom">
      <a routerLink="/platform-admin/account" routerLinkActive="active"><span aria-hidden="true">🔒</span>Account & MFA</a>
      <button type="button" class="pa-logout" (click)="auth.logout()"><span aria-hidden="true">⎋</span>Sign out</button>
      <div class="pa-side-foot">PLATFORM ADMINISTRATION</div>
    </div>
  </aside>
  <main class="pa-main">
    <header class="pa-topbar">
      <div class="pa-crumb">Bizora Platform <span>›</span> <strong>Administration</strong></div>
      <div class="pa-user">
        <div class="pa-user-copy"><strong>{{ auth.admin()?.name }}</strong><span>{{ roleLabel() }} · {{ auth.admin()?.email }}</span></div>
        <div class="pa-avatar" aria-hidden="true">{{ initials() }}</div>
      </div>
    </header>
    @if (auth.sessionTimer.warning(); as warning) {
      <div class="pa-session-warning" role="status">
        @if (warning.kind === 'idle') {
          You will be signed out for inactivity in {{ warning.secondsLeft }}s.
          <button type="button" class="pa-link" (click)="auth.sessionTimer.stayActive()">Stay signed in</button>
        } @else {
          Your session reaches its maximum length in {{ warning.secondsLeft }}s; save your work.
          <button type="button" class="pa-link" (click)="auth.sessionTimer.dismissEndingWarning()">Dismiss</button>
        }
      </div>
    }
    <router-outlet></router-outlet>
  </main>
</div>`
})
export class PlatformShellComponent {
  auth = inject(PlatformAuthService);
  items = computed(() => NAV.filter(i => !i.permission || this.auth.can(i.permission)));
  roleLabel = computed(() => ({ SUPER_ADMIN: 'Super admin', SUPPORT_ADMIN: 'Support admin', FINANCE_ADMIN: 'Finance admin' })[this.auth.admin()?.role ?? 'SUPPORT_ADMIN']);
  initials = computed(() => (this.auth.admin()?.name ?? '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());

  constructor() {
    // Re-read the profile on load so role or permission changes made elsewhere apply at once.
    this.auth.me().subscribe({ error: () => undefined });
  }
}
