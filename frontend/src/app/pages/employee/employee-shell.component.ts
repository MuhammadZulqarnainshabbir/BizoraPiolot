import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EmployeeAuthService, employeePath, staffPath } from '../../core/employee-auth.service';
import { TranslatePipe } from '../../core/i18n/i18n.pipes';
import { tk } from '../../core/i18n/i18n.service';
import { PortalService } from '../../core/portal.service';
import { SessionWarningComponent } from '../../core/session-warning.component';

/** Layout for the employee dashboard: sidebar, top bar, and the employee pages. */
@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe, SessionWarningComponent],
  template: `
    <main class="workspace employee-workspace" *ngIf="auth.session() as session">
      <aside class="workspace-sidebar">
        <a class="workspace-brand" [routerLink]="portal.link()"><span class="workspace-brand-icon">◈</span> {{ session.shop.shopName }}</a>
        <div class="workspace-label">{{ (manager ? 'MANAGER' : 'EMPLOYEE') | t }}</div>
        <nav *ngIf="manager" class="workspace-nav" [attr.aria-label]="'Manager dashboard' | t">
          <a [routerLink]="portal.link()" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active"><span>⌂</span> {{ 'Dashboard' | t }}</a>
          <a [routerLink]="portal.link('inventory')" routerLinkActive="active"><span>▤</span> {{ 'Inventory' | t }}</a>
          <a [routerLink]="portal.link('inventory', 'products')" routerLinkActive="active"><span>▦</span> {{ 'Products' | t }}</a>
          <a [routerLink]="portal.link('sales', 'full-price')" routerLinkActive="active"><span>↗</span> {{ 'Full-price sales' | t }}</a>
          <a [routerLink]="portal.link('sales', 'installments')" routerLinkActive="active"><span>◔</span> {{ 'Installment sales' | t }}</a>
          <a [routerLink]="portal.link('sales', 'history')" routerLinkActive="active"><span>☰</span> {{ 'Sales history' | t }}</a>
          <a [routerLink]="portal.link('customers')" routerLinkActive="active"><span>☺</span> {{ 'Customers' | t }}</a>
          <a *ngIf="portal.can('employees.view')" [routerLink]="portal.link('team')" routerLinkActive="active"><span>♙</span> {{ 'Team' | t }}</a>
        </nav>
        <nav *ngIf="!manager" class="workspace-nav" [attr.aria-label]="'Employee dashboard' | t">
          <a [routerLink]="portal.link()" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active"><span>⌂</span> {{ 'My summary' | t }}</a>
          <a [routerLink]="portal.link('inventory')" routerLinkActive="active"><span>▤</span> {{ 'Inventory' | t }}</a>
          <a [routerLink]="portal.link('sales', 'full-price')" routerLinkActive="active"><span>↗</span> {{ 'My full-price sales' | t }}</a>
          <a [routerLink]="portal.link('sales', 'installments')" routerLinkActive="active"><span>◔</span> {{ 'My installment sales' | t }}</a>
          <a [routerLink]="portal.link('customers')" routerLinkActive="active"><span>☺</span> {{ 'Customers' | t }}</a>
        </nav>
        <div class="workspace-sidebar-bottom">
          <div class="workspace-label">{{ 'ACCOUNT' | t }}</div>
          <a routerLink="password" routerLinkActive="active"><span>⚿</span> {{ 'Change password' | t }}</a>
          <button type="button" class="workspace-logout" (click)="logout()"><span>↪</span> {{ 'Log out' | t }}</button>
        </div>
        <div class="workspace-sidebar-foot">{{ (manager ? 'BIZORA PILOT · MANAGER' : 'BIZORA PILOT · EMPLOYEE') | t }}</div>
      </aside>
      <section class="workspace-main">
        <header class="workspace-topbar">
          <div class="workspace-breadcrumb"><span>{{ (manager ? 'Manager' : 'Employee') | t }}</span><span class="breadcrumb-divider" aria-hidden="true">/</span><strong>{{ session.shop.shopName }}</strong></div>
          <div class="workspace-topbar-end">
            <div class="workspace-user">
              <div class="workspace-user-avatar">{{ session.employee.name.charAt(0).toUpperCase() }}</div>
              <div class="workspace-user-copy"><strong>{{ session.employee.name }}</strong><span>{{ session.employee.employeeId }} · {{ session.employee.role }}</span></div>
            </div>
          </div>
        </header>
        <router-outlet></router-outlet>
      </section>
    </main>
    <app-session-warning [timer]="auth.sessionTimer" (logout)="logout()"></app-session-warning>
  `
})
export class EmployeeShellComponent implements OnInit {
  auth = inject(EmployeeAuthService);
  portal = inject(PortalService);
  private router = inject(Router);

  /** Manager portal (more pages) or employee portal. */
  get manager(): boolean { return this.auth.isManager; }

  ngOnInit() {
    // Refresh the profile (access role, permissions, temp-password flag); the interceptor handles revoked sessions.
    // A promotion or demotion since the last visit moves the user to the right portal.
    this.auth.me().subscribe({
      next: session => {
        const expected = staffPath(session)[3];
        const actual = this.router.url.split(/[?#]/)[0].split('/')[3];
        if (expected !== actual) void this.router.navigate(staffPath(session), { replaceUrl: true });
      },
      error: () => undefined
    });
  }

  logout() {
    const shop = this.auth.session()?.shop;
    this.auth.logout();
    void this.router.navigate(shop ? employeePath(shop, 'login') : ['/']);
  }
}

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'ACCOUNT' | t }}</div><h1>{{ 'Change password' | t }}</h1><p>{{ 'Choose a password only you know.' | t }}</p></div>
      </div>
      <div *ngIf="auth.session()?.employee?.mustChangePassword" class="record-alert employee-temp-alert" role="status">{{ 'You’re signed in with a temporary password from your shop owner. Choose a new password to continue.' | t }}</div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="success()" class="record-success" role="status">{{ success() | t }}</div>
      <section class="surface-card record-form-card password-card">
        <form class="record-form-grid" [formGroup]="form" (ngSubmit)="submit()">
          <label class="record-form-wide">{{ 'Current password' | t }}<input type="password" formControlName="currentPassword" autocomplete="current-password"></label>
          <label>{{ 'New password' | t }}<input type="password" formControlName="password" autocomplete="new-password" [placeholder]="'At least 8 characters' | t"></label>
          <label>{{ 'Confirm new password' | t }}<input type="password" formControlName="confirmPassword" autocomplete="new-password"></label>
          <div class="record-form-actions"><button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Saving...' | t) : ('Change password' | t) }}</button></div>
        </form>
      </section>
    </div>
  `
})
export class EmployeePasswordComponent {
  auth = inject(EmployeeAuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  saving = signal(false);
  error = signal('');
  success = signal('');
  form = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', Validators.required]
  });

  submit() {
    if (this.saving()) return;
    this.error.set('');
    this.success.set('');
    const { currentPassword, password, confirmPassword } = this.form.getRawValue();
    if (this.form.invalid) {
      this.error.set(tk('Fill in all fields. New passwords need at least 8 characters.'));
      return;
    }
    if (password !== confirmPassword) {
      this.error.set(tk('New passwords do not match.'));
      return;
    }
    const wasTemporary = this.auth.session()?.employee.mustChangePassword;
    this.saving.set(true);
    this.auth.changePassword(currentPassword, password, confirmPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset();
        const session = this.auth.session();
        if (wasTemporary && session) void this.router.navigate(staffPath(session));
        else this.success.set(tk('Your password has been changed.'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(error instanceof HttpErrorResponse ? error.error?.message || tk('Unable to change password') : tk('Unable to change password'));
      }
    });
  }
}
