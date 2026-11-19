import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { apiMessage } from './platform-api.service';
import { PlatformAuthService } from './platform-auth.service';

/** Sign-in for Bizora staff. Separate from the shop login: different endpoint, token and session. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
<main class="pa-auth">
  <div class="pa-auth-panel">
    <div class="pa-auth-brand"><span aria-hidden="true">◈</span> Bizora <span>Platform</span></div>
    <h1>Platform console</h1>
    <p class="pa-muted">For Bizora staff only. Shop owners and employees sign in from their own pages.</p>
    @if (expired && !error()) { <div class="pa-notice" role="status">Your platform session ended. Please sign in again.</div> }
    @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label for="pa-email">Email</label>
      <input id="pa-email" type="email" autocomplete="username" formControlName="email">
      <label for="pa-password">Password</label>
      <input id="pa-password" type="password" autocomplete="current-password" formControlName="password">
      @if (needTotp()) {
        <label for="pa-totp">Authenticator code</label>
        <input id="pa-totp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" formControlName="totp" placeholder="123456">
      }
      <button class="pa-btn pa-full" type="submit" [disabled]="loading()">{{ loading() ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </div>
</main>`
})
export class PlatformLoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(PlatformAuthService);
  private router = inject(Router);
  loading = signal(false);
  error = signal('');
  needTotp = signal(false);
  expired = inject(ActivatedRoute).snapshot.queryParamMap.has('expired');
  form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required], totp: [''] });

  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true); this.error.set('');
    const { email, password, totp } = this.form.getRawValue();
    this.auth.login({ email, password, ...(totp ? { totp } : {}) }).subscribe({
      next: res => this.router.navigateByUrl(res.setupRequired ? '/platform-admin/setup' : '/platform-admin'),
      error: err => {
        if (err.error?.code === 'MFA_REQUIRED') this.needTotp.set(true);
        this.error.set(apiMessage(err, 'Unable to sign in'));
        this.loading.set(false);
      }
    });
  }
}
