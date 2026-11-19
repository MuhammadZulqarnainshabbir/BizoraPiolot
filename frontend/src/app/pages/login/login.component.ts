import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TranslatePipe } from '../../core/i18n/i18n.pipes';
import { tk } from '../../core/i18n/i18n.service';

/** Why the platform signed the user out mid-session (see auth.interceptor.ts), by code. */
export const SHOP_BLOCKED_MESSAGES: Record<string, string> = {
  SHOP_SUSPENDED: tk('This shop has been suspended by Bizora. Please contact support.'),
  SHOP_DEACTIVATED: tk('This shop has been deactivated. Please contact Bizora support.'),
  SHOP_PENDING: tk('This shop is awaiting approval by Bizora. You will be able to sign in once it is approved.')
};

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
<main class="auth-shell"><div class="auth-panel">
  <div class="section-label">{{ 'WELCOME BACK' | t }}</div>
  <h1>{{ 'Sign in to your shop' | t }}</h1>
  <p class="muted">{{ 'Your workspace is waiting for you.' | t }}</p>
  <div *ngIf="expired && !error()" class="session-notice" role="status">{{ 'Your session expired. Please log in again.' | t }}</div>
  <div *ngIf="blocked && !error()" class="error" role="alert">{{ blocked | t }}</div>
  <div *ngIf="error()" class="error" role="alert">{{ error() | t }}</div>
  <form [formGroup]="form" (ngSubmit)="submit()">
    <label for="email">{{ 'Email address' | t }}</label>
    <input id="email" type="email" autocomplete="email" formControlName="email" placeholder="owner@example.com">
    <small *ngIf="form.controls.email.touched && form.controls.email.invalid">{{ 'Enter a valid email.' | t }}</small>
    <div class="password-label-row"><label for="password">{{ 'Password' | t }}</label><a routerLink="/forgot-password">{{ 'Forgot password?' | t }}</a></div>
    <input id="password" type="password" autocomplete="current-password" formControlName="password" [placeholder]="'Your password' | t">
    <button class="btn full" type="submit" [disabled]="loading()">{{ loading() ? ('Signing in...' | t) : ('Login →' | t) }}</button>
  </form>
  <p class="auth-switch">{{ 'New to Bizora Pilot?' | t }} <a routerLink="/register">{{ 'Register your shop' | t }}</a></p>
</div></main>`
})
export class LoginComponent {
  private fb = inject(FormBuilder); private auth = inject(AuthService); private router = inject(Router);
  loading = signal(false); error = signal('');
  /** Arrived here because the previous session ran out. */
  expired = inject(ActivatedRoute).snapshot.queryParamMap.has('expired');
  /** Signed out because the platform blocked the shop (suspended, deactivated, pending). */
  blocked = SHOP_BLOCKED_MESSAGES[inject(ActivatedRoute).snapshot.queryParamMap.get('blocked') ?? ''] ?? '';
  form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true); this.error.set('');
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl('/partnerdashboard'),
      error: err => { this.error.set(err.error?.message || tk('Unable to sign in')); this.loading.set(false); }
    });
  }
}
