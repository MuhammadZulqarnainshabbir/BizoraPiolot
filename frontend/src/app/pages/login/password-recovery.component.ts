import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { TranslatePipe } from '../../core/i18n/i18n.pipes';
import { tk } from '../../core/i18n/i18n.service';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpErrorResponse
    ? error.error?.message || fallback
    : fallback;
}

const INVALID_LINK = tk('This password reset link is invalid or has expired.');

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    <main class="auth-shell">
      <div class="auth-panel recovery-panel">
        <div class="section-label">{{ 'ACCOUNT RECOVERY' | t }}</div>
        <h1>{{ 'Forgot your password?' | t }}</h1>
        <p class="muted">{{ 'Enter the email address you use for your shop. We’ll send you a link to reset your password.' | t }}</p>
        <div *ngIf="error()" class="error" role="alert">{{ error() | t }}</div>
        <div *ngIf="sent()" class="recovery-success" role="status">{{ 'If an account exists for that email, a password reset link has been sent. Check your inbox.' | t }}</div>
        <form *ngIf="!sent()" [formGroup]="form" (ngSubmit)="submit()">
          <label for="recoveryEmail">{{ 'Email address' | t }}</label>
          <input id="recoveryEmail" type="email" autocomplete="email" formControlName="email" placeholder="owner@example.com">
          <small *ngIf="form.controls.email.touched && form.controls.email.invalid">{{ 'Enter a valid email address.' | t }}</small>
          <button class="btn full" type="submit" [disabled]="loading()">{{ loading() ? ('Sending link...' | t) : ('Send reset link →' | t) }}</button>
        </form>
        <p class="auth-switch"><a routerLink="/login">{{ '← Back to login' | t }}</a></p>
      </div>
    </main>
  `
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  loading = signal(false);
  sent = signal(false);
  error = signal('');
  form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]] });

  submit() {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.auth.forgotPassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.loading.set(false);
        this.sent.set(true);
      },
      error: error => {
        this.error.set(errorMessage(error, 'Unable to send a password reset link. Please try again.'));
        this.loading.set(false);
      }
    });
  }
}

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    <main class="auth-shell">
      <div class="auth-panel recovery-panel">
        <div class="section-label">{{ 'ACCOUNT RECOVERY' | t }}</div>
        <h1>{{ 'Choose a new password' | t }}</h1>
        <p class="muted">{{ 'Create a new password for your Bizora Pilot account.' | t }}</p>
        <div *ngIf="error()" class="error" role="alert">{{ error() | t }}</div>
        <div *ngIf="complete()" class="recovery-success" role="status">{{ 'Your password has been reset.' | t }} <a routerLink="/login">{{ 'Log in now →' | t }}</a></div>
        <form *ngIf="!complete() && token" [formGroup]="form" (ngSubmit)="submit()">
          <label for="newPassword">{{ 'New password' | t }}</label>
          <input id="newPassword" type="password" autocomplete="new-password" formControlName="password" [placeholder]="'At least 8 characters' | t">
          <small *ngIf="form.controls.password.touched && form.controls.password.invalid">{{ 'Use 8–128 characters.' | t }}</small>
          <label for="confirmNewPassword">{{ 'Confirm new password' | t }}</label>
          <input id="confirmNewPassword" type="password" autocomplete="new-password" formControlName="confirmPassword" [placeholder]="'Enter your new password again' | t">
          <small *ngIf="form.controls.confirmPassword.touched && form.controls.password.value !== form.controls.confirmPassword.value">{{ 'Passwords do not match.' | t }}</small>
          <button class="btn full" type="submit" [disabled]="loading()">{{ loading() ? ('Resetting password...' | t) : ('Reset password →' | t) }}</button>
        </form>
        <p class="auth-switch"><a routerLink="/login">{{ '← Back to login' | t }}</a></p>
      </div>
    </main>
  `
})
export class ResetPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') || '';
  loading = signal(false);
  complete = signal(false);
  error = signal(this.token ? '' : INVALID_LINK);
  form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', Validators.required]
  });

  submit() {
    if (!this.token) {
      this.error.set(INVALID_LINK);
      return;
    }
    const { password, confirmPassword } = this.form.getRawValue();
    if (this.form.invalid || password !== confirmPassword || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.auth.resetPassword({ token: this.token, password, confirmPassword }).subscribe({
      next: () => {
        this.loading.set(false);
        this.complete.set(true);
        this.form.reset();
        void this.router.navigate([], { queryParams: { token: null }, queryParamsHandling: 'merge', replaceUrl: true });
      },
      error: error => {
        this.error.set(errorMessage(error, 'Unable to reset your password. Request a new reset link and try again.'));
        this.loading.set(false);
      }
    });
  }
}
