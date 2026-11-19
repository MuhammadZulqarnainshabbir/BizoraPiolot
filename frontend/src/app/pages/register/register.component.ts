import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TranslatePipe } from '../../core/i18n/i18n.pipes';
import { tk } from '../../core/i18n/i18n.service';

function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true };
}

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
<main class="auth-shell"><div class="auth-panel register-panel">
  <div class="section-label">{{ 'GET STARTED' | t }}</div>
  <h1>{{ 'Register your shop' | t }}</h1>
  <p class="muted">{{ 'Create an owner account in a few easy steps.' | t }}</p>
  <div *ngIf="error()" class="error" role="alert">{{ error() | t }}</div>
  <form [formGroup]="form" (ngSubmit)="submit()">
    <div class="form-grid">
      <div><label for="shopName">{{ 'Shop name' | t }}</label><input id="shopName" formControlName="shopName" [placeholder]="'Electro World' | t"></div>
      <div><label for="ownerName">{{ 'Owner name' | t }}</label><input id="ownerName" formControlName="ownerName" [placeholder]="'Alex Morgan' | t"></div>
      <div><label for="email">{{ 'Email address' | t }}</label><input id="email" type="email" formControlName="email" autocomplete="email" placeholder="owner@example.com"></div>
      <div><label for="phone">{{ 'Phone number' | t }}</label><input id="phone" type="tel" formControlName="phone" placeholder="+49 123 456789"></div>
      <div class="span-two"><label for="address">{{ 'Shop address' | t }}</label><input id="address" formControlName="address" [placeholder]="'Street, city, country' | t"></div>
      <div><label for="password">{{ 'Password' | t }}</label><input id="password" type="password" formControlName="password" autocomplete="new-password" [placeholder]="'At least 8 characters' | t"></div>
      <div><label for="confirmPassword">{{ 'Confirm password' | t }}</label><input id="confirmPassword" type="password" formControlName="confirmPassword" autocomplete="new-password" [placeholder]="'Repeat your password' | t"></div>
    </div>
    <div *ngIf="form.touched && form.invalid" class="form-hint">{{ 'Complete all fields, enter a valid email, use at least 8 password characters, and ensure passwords match.' | t }}</div>
    <button class="btn full" type="submit" [disabled]="loading()">{{ loading() ? ('Creating account...' | t) : ('Create shop account →' | t) }}</button>
  </form>
  <p class="auth-switch">{{ 'Already registered?' | t }} <a routerLink="/login">{{ 'Login' | t }}</a></p>
</div></main>`
})
export class RegisterComponent {
  private fb = inject(FormBuilder); private auth = inject(AuthService); private router = inject(Router);
  loading = signal(false); error = signal('');
  form = this.fb.nonNullable.group({ shopName: ['', Validators.required], ownerName: ['', Validators.required], email: ['', [Validators.required, Validators.email]], phone: ['', Validators.required], address: ['', Validators.required], password: ['', [Validators.required, Validators.minLength(8)]], confirmPassword: ['', Validators.required] }, { validators: matchingPasswords });
  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true); this.error.set('');
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: err => { this.error.set(err.error?.message || tk('Unable to register shop')); this.loading.set(false); }
    });
  }
}
