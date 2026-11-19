import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { EmployeeManagerComponent } from './employees/employee-manager.component';
import { errorMessage } from '../../features/products/shared';

/** Common choices; any IANA timezone the browser knows is accepted. */
const TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'UTC'];

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, EmployeeManagerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'ACCOUNT SETTINGS' | t }}</div><h1>{{ 'Shop profile' | t }}</h1><p>{{ 'Your shop, owner information, and team.' | t }}</p></div>
      </div>
      <ng-container *ngIf="auth.shop() as shop">
        <section class="profile-banner">
          <div class="profile-avatar">{{ shop.shopName.charAt(0).toUpperCase() }}</div>
          <div><span class="overview-kicker">{{ 'SHOP PROFILE' | t }}</span><h2>{{ shop.shopName }}</h2><p>{{ 'Shop owner account' | t }}</p></div>
          <span class="profile-status"><span></span> {{ 'Registered' | t }}</span>
        </section>
        <section class="surface-card profile-details">
          <div class="profile-section-heading"><div><h2>{{ 'Business information' | t }}</h2><p>{{ 'Details provided when you registered your shop.' | t }}</p></div></div>
          <div class="profile-detail-grid">
            <div class="profile-detail"><span>{{ 'SHOP NAME' | t }}</span><strong>{{ shop.shopName }}</strong></div>
            <div class="profile-detail"><span>{{ 'OWNER' | t }}</span><strong>{{ shop.ownerName }}</strong></div>
            <div class="profile-detail"><span>{{ 'EMAIL ADDRESS' | t }}</span><strong dir="ltr">{{ shop.email }}</strong></div>
            <div class="profile-detail"><span>{{ 'PHONE NUMBER' | t }}</span><strong dir="ltr">{{ shop.phone }}</strong></div>
            <div class="profile-detail profile-address"><span>{{ 'SHOP ADDRESS' | t }}</span><strong>{{ shop.address }}</strong></div>
          </div>
        </section>

        <section class="surface-card profile-details">
          <div class="profile-section-heading"><div><h2>{{ 'Time zone' | t }}</h2><p>{{ 'Sale times, “today” totals and installment due dates use this time zone.' | t }}</p></div></div>
          <div *ngIf="tzError()" class="record-alert" role="alert">{{ tzError() | t }}</div>
          <div *ngIf="tzSaved()" class="record-success" role="status">{{ 'Time zone saved.' | t }}</div>
          <div class="employee-link-row">
            <label class="visually-hidden" for="shop-timezone">{{ 'Time zone' | t }}</label>
            <select id="shop-timezone" class="employee-link-input" dir="ltr" [ngModel]="timezone() || shop.timezone || 'Asia/Karachi'" (ngModelChange)="timezone.set($event); tzSaved.set(false)">
              <option *ngFor="let z of zones(shop.timezone)" [value]="z">{{ z }}</option>
            </select>
            <button type="button" class="btn btn-small" [disabled]="tzSaving() || !timezone() || timezone() === shop.timezone" (click)="saveTimezone()">{{ tzSaving() ? ('Saving...' | t) : ('Save' | t) }}</button>
          </div>
        </section>

        <section class="surface-card employee-link-card">
          <div>
            <h2>{{ 'Employee login link' | t }}</h2>
            <p>{{ 'Employees sign in here with their employee ID and password. This link is unique to {shop}.' | t:{ shop: shop.shopName } }}</p>
          </div>
          <div class="employee-link-row">
            <input class="employee-link-input" dir="ltr" [value]="loginLink()" readonly [attr.aria-label]="'Employee login link' | t" (focus)="$any($event.target).select()">
            <button type="button" class="btn btn-small" (click)="copyLink()">{{ copied() ? ('Copied ✓' | t) : ('Copy link' | t) }}</button>
            <a class="btn-outline record-cancel" [href]="loginLink()" target="_blank" rel="noopener">{{ 'Open ↗' | t }}</a>
          </div>
        </section>

        <section class="surface-card profile-details">
          <div class="profile-section-heading"><div><h2>{{ 'Receipt details' | t }}</h2><p>{{ 'Printed on every sale, agreement and payment receipt, together with your shop name, address, phone and email.' | t }}</p></div></div>
          <div *ngIf="receiptError()" class="record-alert" role="alert">{{ receiptError() | t }}</div>
          <div *ngIf="receiptSaved()" class="record-success" role="status">{{ 'Receipt details saved.' | t }}</div>
          <form class="record-form-grid" (ngSubmit)="saveReceiptDetails()">
            <label>{{ 'NTN (National Tax Number)' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input name="ntn" dir="ltr" [(ngModel)]="receipt.ntn" maxlength="30" (ngModelChange)="receiptSaved.set(false)"></label>
            <label>{{ 'STRN (Sales Tax Registration Number)' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input name="strn" dir="ltr" [(ngModel)]="receipt.strn" maxlength="30" (ngModelChange)="receiptSaved.set(false)"></label>
            <label class="record-form-wide">{{ 'Receipt terms' | t }} <span class="optional-label">{{ 'Optional · e.g. return, exchange and warranty policy' | t }}</span><textarea name="receiptNote" rows="3" [(ngModel)]="receipt.receiptNote" maxlength="1000" (ngModelChange)="receiptSaved.set(false)"></textarea></label>
            <div class="record-form-actions"><button type="submit" class="btn btn-small" [disabled]="receiptSaving()">{{ receiptSaving() ? ('Saving...' | t) : ('Save' | t) }}</button></div>
          </form>
        </section>

        <section class="surface-card employee-link-card">
          <div>
            <h2>{{ 'Shop code for the mobile app' | t }}</h2>
            <p>{{ 'In the Bizora Pilot app, employees choose “Employee” and enter this shop code with their employee ID and password.' | t }}</p>
          </div>
          <div class="employee-link-row">
            <input class="employee-link-input" dir="ltr" [value]="shop.shopCode || ('Not assigned yet' | t)" readonly [attr.aria-label]="'Shop code' | t" (focus)="$any($event.target).select()">
            <button type="button" class="btn btn-small" [disabled]="!shop.shopCode" (click)="copyCode()">{{ codeCopied() ? ('Copied ✓' | t) : ('Copy code' | t) }}</button>
          </div>
        </section>

        <app-employee-manager></app-employee-manager>
      </ng-container>
    </div>
  `
})
export class ShopProfileComponent {
  auth = inject(AuthService);
  copied = signal(false);
  timezone = signal('');
  tzSaving = signal(false);
  tzSaved = signal(false);
  tzError = signal<Msg>('');
  loginLink = computed(() => {
    const shop = this.auth.shop();
    return shop ? `${window.location.origin}/${shop.slug}/${shop.id}/employee/login` : '';
  });

  zones(current?: string) {
    return current && !TIMEZONES.includes(current) ? [current, ...TIMEZONES] : TIMEZONES;
  }

  saveTimezone() {
    const timezone = this.timezone();
    if (!timezone) return;
    this.tzSaving.set(true);
    this.tzError.set('');
    this.auth.updateSettings({ timezone }).subscribe({
      next: () => { this.tzSaving.set(false); this.tzSaved.set(true); },
      error: e => { this.tzSaving.set(false); this.tzError.set(errorMessage(e, tk('Unable to save changes. Please try again.'))); }
    });
  }

  copyLink() {
    const link = this.loginLink();
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => undefined);
  }

  receipt = { ntn: this.auth.shop()?.ntn ?? '', strn: this.auth.shop()?.strn ?? '', receiptNote: this.auth.shop()?.receiptNote ?? '' };
  receiptSaving = signal(false);
  receiptSaved = signal(false);
  receiptError = signal<Msg>('');

  saveReceiptDetails() {
    this.receiptSaving.set(true);
    this.receiptError.set('');
    this.auth.updateSettings({ ntn: this.receipt.ntn.trim(), strn: this.receipt.strn.trim(), receiptNote: this.receipt.receiptNote.trim() }).subscribe({
      next: () => { this.receiptSaving.set(false); this.receiptSaved.set(true); },
      error: e => { this.receiptSaving.set(false); this.receiptError.set(errorMessage(e, tk('Unable to save changes. Please try again.'))); }
    });
  }

  codeCopied = signal(false);

  copyCode() {
    const code = this.auth.shop()?.shopCode;
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    }).catch(() => undefined);
  }
}
