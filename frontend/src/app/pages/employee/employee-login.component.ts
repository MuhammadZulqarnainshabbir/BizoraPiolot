import { Component, OnInit, inject, signal } from '@angular/core';
import { SHOP_BLOCKED_MESSAGES } from '../login/login.component';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EmployeeAuthService, EmployeeShop, employeePath, staffPath } from '../../core/employee-auth.service';
import { TranslatePipe } from '../../core/i18n/i18n.pipes';
import { tk } from '../../core/i18n/i18n.service';

/** Shop-specific employee sign-in, reached via /:slug/:shopId/employee/login. */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  template: `
    <main class="auth-shell employee-auth-shell">
      <div class="auth-panel">

        <div *ngIf="loadingShop()" class="record-loading">{{ 'Loading sign-in page...' | t }}</div>

        <ng-container *ngIf="!loadingShop() && !shop()">
          <div class="section-label">{{ 'EMPLOYEE SIGN-IN' | t }}</div>
          <h1>{{ 'Login link not found' | t }}</h1>
          <p class="muted">{{ 'This employee login link is invalid. Ask your shop owner for the current link.' | t }}</p>
        </ng-container>

        <ng-container *ngIf="shop() as shop">
          <div class="employee-shop-mark">{{ shop.shopName.charAt(0).toUpperCase() }}</div>
          <div class="section-label">{{ 'EMPLOYEE SIGN-IN' | t }}</div>
          <h1>{{ shop.shopName }}</h1>
          <p class="muted">{{ 'Sign in with the employee ID and password from your shop owner.' | t }}</p>
          <div *ngIf="expired && !error()" class="session-notice" role="status">{{ 'Your session expired. Please log in again.' | t }}</div>
          <div *ngIf="blocked && !error()" class="error" role="alert">{{ blocked | t }}</div>
          <div *ngIf="error()" class="error" role="alert">{{ error() | t }}</div>
          <form [formGroup]="form" (ngSubmit)="submit(shop)">
            <label for="employeeId">{{ 'Employee ID' | t }}</label>
            <input id="employeeId" dir="ltr" formControlName="employeeId" autocomplete="username" placeholder="EMP-0001" autocapitalize="characters" spellcheck="false">
            <small *ngIf="form.controls.employeeId.touched && form.controls.employeeId.invalid">{{ 'Enter your employee ID.' | t }}</small>
            <label for="employeePassword">{{ 'Password' | t }}</label>
            <input id="employeePassword" type="password" formControlName="password" autocomplete="current-password" [placeholder]="'Your password' | t">
            <small *ngIf="form.controls.password.touched && form.controls.password.invalid">{{ 'Enter your password.' | t }}</small>
            <button class="btn full" type="submit" [disabled]="loading()">{{ loading() ? ('Signing in...' | t) : ('Sign in →' | t) }}</button>
          </form>
          <p class="auth-switch">{{ 'Forgot your password? Ask your shop owner to reset it.' | t }}</p>
        </ng-container>
      </div>
    </main>
  `
})
export class EmployeeLoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(EmployeeAuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  shop = signal<EmployeeShop | null>(null);
  /** Arrived here because the previous session ran out. */
  expired = this.route.snapshot.queryParamMap.has('expired');
  /** Signed out because the platform blocked the shop (suspended, deactivated, pending). */
  blocked = SHOP_BLOCKED_MESSAGES[this.route.snapshot.queryParamMap.get('blocked') ?? ''] ?? '';
  loadingShop = signal(true);
  loading = signal(false);
  error = signal('');
  form = this.fb.nonNullable.group({
    employeeId: ['', [Validators.required, Validators.maxLength(20)]],
    password: ['', [Validators.required, Validators.maxLength(128)]]
  });

  ngOnInit() {
    const shopId = this.route.snapshot.paramMap.get('shopId') ?? '';
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    const session = this.auth.session();
    if (this.auth.active && session?.shop.id === shopId) {
      void this.router.navigate(staffPath(session), { replaceUrl: true });
      return;
    }
    this.auth.shopInfo(shopId).subscribe({
      next: ({ shop }) => {
        this.shop.set(shop);
        this.loadingShop.set(false);
        // Keep the link tidy if the shop was renamed since it was shared.
        if (shop.slug !== slug) void this.router.navigate(employeePath(shop, 'login'), { replaceUrl: true });
      },
      error: () => this.loadingShop.set(false)
    });
  }

  submit(shop: EmployeeShop) {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { employeeId, password } = this.form.getRawValue();
    this.auth.login(shop.id, employeeId, password).subscribe({
      // Managers land on the manager portal, everyone else on the employee portal (a temporary password goes to the change-password page first).
      next: ({ employee }) => void this.router.navigate(staffPath({ shop, employee }, ...(employee.mustChangePassword ? ['password'] : []))),
      error: (error: unknown) => {
        this.error.set(error instanceof HttpErrorResponse ? error.error?.message || tk('Unable to sign in') : tk('Unable to sign in'));
        this.loading.set(false);
      }
    });
  }
}
