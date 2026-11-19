import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiMessage } from './platform-api.service';
import { PlatformAuthService } from './platform-auth.service';

/**
 * Account set-up and security: change password (forced after provisioning or a reset) and enrol
 * an authenticator app. Shown full-page at /platform-admin/setup while set-up is required, and
 * inside the console at /platform-admin/account afterwards.
 */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
<section class="pa-page pa-narrow">
  <header class="pa-page-head">
    <div>
      <div class="pa-eyebrow">{{ auth.setupRequired() ? 'FINISH SETTING UP' : 'YOUR ACCOUNT' }}</div>
      <h1>{{ auth.setupRequired() ? 'Secure your account' : 'Account security' }}</h1>
      <p class="pa-muted">Signed in as {{ auth.admin()?.email }} ({{ auth.admin()?.role }}).</p>
    </div>
    @if (auth.setupRequired()) { <button type="button" class="pa-btn-outline" (click)="auth.logout()">Sign out</button> }
  </header>

  @if (auth.setupRequired()) {
    <div class="pa-notice">
      @if (auth.admin()?.mustChangePassword) { <p>Choose your own password to replace the temporary one.</p> }
      @if (auth.mfaRequired() && !auth.admin()?.mfaEnabled) { <p>This platform requires an authenticator app for every administrator. Enrol one below.</p> }
    </div>
  }

  <div class="pa-card">
    <h2>Password</h2>
    @if (auth.admin()?.mustChangePassword) { <p class="pa-muted">Your temporary password must be replaced before you can use the console.</p> }
    @if (passwordMessage()) { <div class="pa-success" role="status">{{ passwordMessage() }}</div> }
    @if (passwordError()) { <div class="pa-error" role="alert">{{ passwordError() }}</div> }
    <form [formGroup]="passwordForm" (ngSubmit)="changePassword()" class="pa-form">
      <label for="pa-current">Current password</label>
      <input id="pa-current" type="password" autocomplete="current-password" formControlName="currentPassword">
      <label for="pa-new">New password</label>
      <input id="pa-new" type="password" autocomplete="new-password" formControlName="password">
      <small class="pa-hint">12–128 characters with upper and lower case letters and a digit.</small>
      <label for="pa-confirm">Confirm new password</label>
      <input id="pa-confirm" type="password" autocomplete="new-password" formControlName="confirm">
      <button class="pa-btn" type="submit" [disabled]="saving()">Change password</button>
    </form>
  </div>

  <div class="pa-card">
    <h2>Authenticator app (MFA)</h2>
    @if (auth.admin()?.mfaEnabled) {
      <p class="pa-success">Enabled. Sign-in asks for a 6-digit code from your authenticator app.</p>
    } @else if (auth.admin()?.mustChangePassword) {
      <p class="pa-muted">Change your password first, then enrol an authenticator app here.</p>
    } @else {
      <p class="pa-muted">Adds a second step at sign-in: a code from Google Authenticator, Authy, 1Password or any TOTP app.</p>
      @if (!secret()) {
        <button type="button" class="pa-btn-outline" (click)="startMfa()" [disabled]="saving()">Start enrolment</button>
      } @else {
        <ol class="pa-steps">
          <li>In your authenticator app choose "Enter a setup key" and paste this key:
            <code class="pa-secret">{{ secret() }}</code>
            <button type="button" class="pa-link" (click)="copy(secret())">Copy key</button>
            <span class="pa-muted"> (account: {{ auth.admin()?.email }}, issuer: Bizora Platform; or open <a [href]="otpauth()">this otpauth link</a> on a phone with the app installed).</span>
          </li>
          <li>Enter the 6-digit code the app shows now:</li>
        </ol>
        @if (mfaError()) { <div class="pa-error" role="alert">{{ mfaError() }}</div> }
        <form (ngSubmit)="enableMfa()" class="pa-inline-form">
          <input [formControl]="code" inputmode="numeric" maxlength="6" placeholder="123456" aria-label="Authenticator code">
          <button class="pa-btn" type="submit" [disabled]="saving() || code.invalid">Enable MFA</button>
        </form>
      }
    }
  </div>

  @if (!auth.setupRequired()) { <p><a routerLink="/platform-admin" class="pa-link">← Back to the dashboard</a></p> }
</section>`
})
export class PlatformSetupComponent {
  auth = inject(PlatformAuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  saving = signal(false);
  passwordMessage = signal('');
  passwordError = signal('');
  mfaError = signal('');
  secret = signal('');
  otpauth = signal('');
  code = this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/^\d{6}$/)]);
  passwordForm = this.fb.nonNullable.group({ currentPassword: ['', Validators.required], password: ['', [Validators.required, Validators.minLength(12)]], confirm: ['', Validators.required] });

  constructor() {
    // Refresh the profile so the page reflects the server's view (MFA requirement, flags).
    this.auth.me().subscribe({ error: () => undefined });
  }

  changePassword() {
    const { currentPassword, password, confirm } = this.passwordForm.getRawValue();
    this.passwordMessage.set(''); this.passwordError.set('');
    if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); this.passwordError.set('Fill in every field; the new password needs at least 12 characters.'); return; }
    if (password !== confirm) { this.passwordError.set('The new passwords do not match.'); return; }
    this.saving.set(true);
    this.auth.changePassword({ currentPassword, password }).subscribe({
      next: res => {
        this.saving.set(false);
        this.passwordForm.reset();
        this.passwordMessage.set('Password changed. Other sessions of your account have been signed out.');
        if (!res.setupRequired && this.router.url.startsWith('/platform-admin/setup')) void this.router.navigateByUrl('/platform-admin');
      },
      error: err => { this.saving.set(false); this.passwordError.set(apiMessage(err, 'Unable to change the password')); }
    });
  }

  startMfa() {
    this.saving.set(true); this.mfaError.set('');
    this.auth.mfaSetup().subscribe({
      next: res => { this.saving.set(false); this.secret.set(res.secret); this.otpauth.set(res.otpauth); },
      error: err => { this.saving.set(false); this.mfaError.set(apiMessage(err, 'Unable to start enrolment')); }
    });
  }

  enableMfa() {
    if (this.code.invalid) return;
    this.saving.set(true); this.mfaError.set('');
    this.auth.mfaEnable(this.code.value).subscribe({
      next: res => {
        this.saving.set(false); this.secret.set(''); this.code.reset();
        if (!res.setupRequired && this.router.url.startsWith('/platform-admin/setup')) void this.router.navigateByUrl('/platform-admin');
      },
      error: err => { this.saving.set(false); this.mfaError.set(apiMessage(err, 'That code was not accepted')); }
    });
  }

  copy(text: string) { void navigator.clipboard?.writeText(text); }
}
