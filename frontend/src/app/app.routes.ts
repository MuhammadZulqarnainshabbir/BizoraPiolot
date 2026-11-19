import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { employeeGuard, employeePortalGuard, managerGuard, passwordChangedGuard } from './core/employee.guard';
import { LandingComponent } from './pages/landing/landing.component';
import { LoginComponent } from './pages/login/login.component';
import { ForgotPasswordComponent, ResetPasswordComponent } from './pages/login/password-recovery.component';
import { RegisterComponent } from './pages/register/register.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { ShopProfileComponent } from './pages/dashboard/dashboard-pages.component';
import { EmployeeLoginComponent } from './pages/employee/employee-login.component';
import { EmployeePasswordComponent, EmployeeShellComponent } from './pages/employee/employee-shell.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'register', component: RegisterComponent },
  // Shop owner's portal.
  {
    path: 'partnerdashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/products/partner-overview.component').then(m => m.PartnerOverviewComponent) },
      { path: 'profile', component: ShopProfileComponent },
      // Employees are managed from the shop profile; keep old links working.
      { path: 'employees', redirectTo: 'profile' },
      { path: '', loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCT_ROUTES) }
    ]
  },
  // The portal used to live at /dashboard; keep old links and bookmarks working.
  { path: 'dashboard', redirectTo: 'partnerdashboard', pathMatch: 'full' },
  { path: 'dashboard/:page', redirectTo: 'partnerdashboard/:page' },
  // Shop-specific employee app, e.g. /tenshop/<shopId>/employee/login
  { path: ':slug/:shopId/employee/login', component: EmployeeLoginComponent },
  {
    path: ':slug/:shopId/employee',
    component: EmployeeShellComponent,
    canActivate: [employeeGuard, employeePortalGuard],
    children: [
      { path: 'password', component: EmployeePasswordComponent },
      {
        path: '',
        canActivate: [passwordChangedGuard],
        children: [
          { path: '', pathMatch: 'full', loadComponent: () => import('./features/products/employee-overview.component').then(m => m.EmployeeOverviewComponent) },
          { path: '', loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCT_ROUTES) }
        ]
      }
    ]
  },
  // Manager portal: the same shell and pages as the employee portal, plus the shop dashboard, team page and shop-wide sales.
  {
    path: ':slug/:shopId/manager',
    component: EmployeeShellComponent,
    canActivate: [employeeGuard, managerGuard],
    children: [
      { path: 'password', component: EmployeePasswordComponent },
      {
        path: '',
        canActivate: [passwordChangedGuard],
        children: [
          { path: '', pathMatch: 'full', loadComponent: () => import('./features/products/manager-overview.component').then(m => m.ManagerOverviewComponent) },
          { path: 'team', loadComponent: () => import('./features/products/team.component').then(m => m.TeamComponent) },
          { path: '', loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCT_ROUTES) }
        ]
      }
    ]
  },
  // Bizora's own console (platform staff). Lazy-loaded; its own layout, session and guards (see features/platform-admin).
  { path: 'platform-admin', loadChildren: () => import('./features/platform-admin/platform-admin.routes').then(m => m.PLATFORM_ADMIN_ROUTES) },
  { path: '**', redirectTo: '' }
];
