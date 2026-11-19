import { Routes } from '@angular/router';
import { platformAuthGuard, platformGuestGuard, platformPermissionGuard, platformReadyGuard } from './platform.guards';
import { PlatformLoginComponent } from './platform-login.component';
import { PlatformSetupComponent } from './platform-setup.component';
import { PlatformShellComponent } from './platform-shell.component';

/**
 * Bizora's own console at /platform-admin. Lazy-loaded, with its own layout, session and guards;
 * nothing here shares state with the shop portals.
 */
export const PLATFORM_ADMIN_ROUTES: Routes = [
  { path: 'login', component: PlatformLoginComponent, canActivate: [platformGuestGuard] },
  { path: 'setup', component: PlatformSetupComponent, canActivate: [platformAuthGuard] },
  {
    path: '',
    component: PlatformShellComponent,
    canActivate: [platformAuthGuard, platformReadyGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./platform-dashboard.component').then(m => m.PlatformDashboardComponent) },
      { path: 'shops', canActivate: [platformPermissionGuard('shops.view')], loadComponent: () => import('./platform-shops.component').then(m => m.PlatformShopsComponent) },
      { path: 'shops/:id', canActivate: [platformPermissionGuard('shops.view')], loadComponent: () => import('./platform-shop-detail.component').then(m => m.PlatformShopDetailComponent) },
      { path: 'administrators', canActivate: [platformPermissionGuard('admins.view')], loadComponent: () => import('./platform-admins.component').then(m => m.PlatformAdminsComponent) },
      { path: 'plans', canActivate: [platformPermissionGuard('plans.view')], loadComponent: () => import('./platform-plans.component').then(m => m.PlatformPlansComponent) },
      { path: 'analytics', canActivate: [platformPermissionGuard('analytics.view')], loadComponent: () => import('./platform-analytics.component').then(m => m.PlatformAnalyticsComponent) },
      { path: 'audit-logs', canActivate: [platformPermissionGuard('audit.view')], loadComponent: () => import('./platform-audit.component').then(m => m.PlatformAuditComponent) },
      { path: 'settings', canActivate: [platformPermissionGuard('settings.view')], loadComponent: () => import('./platform-settings.component').then(m => m.PlatformSettingsComponent) },
      { path: 'account', component: PlatformSetupComponent }
    ]
  },
  { path: '**', redirectTo: '' }
];
