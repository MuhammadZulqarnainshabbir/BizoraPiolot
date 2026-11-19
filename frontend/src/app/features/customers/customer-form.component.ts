import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, msg, tk } from '../../core/i18n/i18n.service';
import { errorMessage } from '../products/shared';
import { Customer, isCnic } from './customer.models';
import { CustomersApiService } from './customers-api.service';

const cnicValidator = (control: AbstractControl): ValidationErrors | null => isCnic(String(control.value ?? '')) ? null : { cnic: true };

/** Create a customer, or edit one (…/customers/:id/edit). ID pictures are managed on the details page. */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'CUSTOMERS' | t }}</div><h1>{{ editing() ? ('Edit customer' | t) : ('Add customer' | t) }}</h1>
          <p>{{ editing() ? ('Update the details; past sales keep the details they were recorded with.' | t) : ('Name and phone are required. Add the CNIC and ID pictures for installment customers.' | t) }}</p></div>
        <a class="btn-outline record-cancel" [routerLink]="editing() ? portal.link('customers', editing()!._id) : portal.link('customers')">{{ '← Back' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}
        <a *ngIf="clashId()" class="text-link" [routerLink]="portal.link('customers', clashId()!)">{{ 'Open that customer' | t }} <span>→</span></a>
      </div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <form *ngIf="!loading()" class="surface-card record-form-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="record-form-grid">
          <label>{{ 'Customer name' | t }}<input formControlName="name" maxlength="120" autocomplete="off">
            <small class="field-error" *ngIf="invalid('name')">{{ 'Enter the customer’s name.' | t }}</small></label>
          <label>{{ 'Customer phone' | t }}<input formControlName="phone" type="tel" maxlength="40" dir="ltr" placeholder="0301-1234567">
            <small class="field-error" *ngIf="invalid('phone')">{{ 'Enter the customer’s phone number.' | t }}</small></label>
          <label>{{ 'CNIC' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="cnic" maxlength="20" dir="ltr" placeholder="12345-1234567-1" inputmode="numeric">
            <small class="field-error" *ngIf="invalid('cnic')">{{ 'CNIC must be 13 digits (e.g. 12345-1234567-1)' | t }}</small></label>
          <label>{{ 'Address' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="address" maxlength="300"></label>
          <label class="record-form-wide">{{ 'Notes' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><textarea formControlName="notes" rows="2" maxlength="500"></textarea></label>
          <label *ngIf="editing()" class="record-form-wide">{{ 'Reason for the change' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="reason" maxlength="500"></label>
        </div>
        <div class="record-form-actions">
          <a class="btn-outline record-cancel" [routerLink]="editing() ? portal.link('customers', editing()!._id) : portal.link('customers')">{{ 'Cancel' | t }}</a>
          <button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Saving...' | t) : editing() ? ('Save changes' | t) : ('Add customer' | t) }}</button>
        </div>
      </form>
    </div>
  `
})
export class CustomerFormComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(CustomersApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  editing = signal<Customer | null>(null);
  loading = signal(false);
  saving = signal(false);
  error = signal<Msg>('');
  clashId = signal<string | null>(null);
  private submitted = false;

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    phone: ['', [Validators.required, Validators.maxLength(40)]],
    cnic: ['', cnicValidator],
    address: [''],
    notes: [''],
    reason: ['']
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: ({ customer }) => {
        this.editing.set(customer);
        this.form.patchValue({ name: customer.name, phone: customer.phone, cnic: customer.cnicFormatted, address: customer.address, notes: customer.notes });
        this.loading.set(false);
      },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load this customer.'))); }
    });
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted);
  }

  submit() {
    this.submitted = true;
    this.error.set('');
    this.clashId.set(null);
    if (this.form.invalid || this.saving()) { this.form.markAllAsTouched(); this.error.set(tk('Check the highlighted fields.')); return; }
    const v = this.form.getRawValue();
    const data = { name: v.name.trim(), phone: v.phone.trim(), cnic: v.cnic.trim(), address: v.address.trim(), notes: v.notes.trim() };
    this.saving.set(true);
    const editing = this.editing();
    const request = editing ? this.api.update(editing._id, { ...data, reason: v.reason.trim() }) : this.api.create(data);
    request.subscribe({
      next: ({ customer }) => { this.saving.set(false); void this.router.navigate(this.portal.link('customers', customer._id)); },
      error: (e: unknown) => {
        this.saving.set(false);
        this.error.set(errorMessage(e, tk('Unable to save the customer. Please try again.')));
        if (e instanceof HttpErrorResponse && e.error?.code === 'DUPLICATE_CNIC' && e.error.details?.customerId) {
          this.clashId.set(e.error.details.customerId);
          this.error.set(msg('Another customer already has this CNIC: {name} ({code}).', { name: e.error.details.name, code: e.error.details.customerCode }));
        }
      }
    });
  }
}
