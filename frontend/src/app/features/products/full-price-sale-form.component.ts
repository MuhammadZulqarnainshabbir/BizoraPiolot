import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { Customer } from '../customers/customer.models';
import { CustomerPickerComponent } from '../customers/customer-picker.component';
import { InventoryUnit, PAYMENT_METHODS, Sale } from './product.models';
import { ProductsApiService } from './products-api.service';
import { PAYMENT_METHOD_LABEL, downloadPdf, errorMessage, moneyValidator, toCents } from './shared';

/** "Sold at full price": records the sale; the server marks the unit SOLD_FULL_PRICE. */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, CustomerPickerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'MARK AS SOLD' | t }}</div><h1>{{ 'Sell at full price' | t }}</h1><p>{{ 'The sale time, your name and the shop are recorded automatically.' | t }}</p></div>
        <a class="btn-outline record-cancel" [routerLink]="unit() ? portal.link('inventory', 'units', unit()!._id) : portal.link('inventory')">{{ '← Back' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <section *ngIf="sold() as sale" class="surface-card record-form-card added-result" role="status">
        <h2>{{ 'Sale {number} recorded.' | t:{ number: sale.saleNumber } }}</h2>
        <p>{{ '{product} ({serial}) sold for {price}.' | t:{ product: sale.item.productName, serial: sale.item.serialNumber, price: (sale.salePriceCents / 100 | tMoney) } }}</p>
        <div class="record-form-actions">
          <button type="button" class="btn btn-small" [disabled]="downloading()" (click)="downloadReceipt(sale)">{{ downloading() ? ('Preparing PDF...' | t) : ('Download receipt (PDF)' | t) }}</button>
          <a class="btn-outline record-cancel" [routerLink]="portal.link('sales', sale._id)">{{ 'View sale' | t }}</a>
          <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory')">{{ 'Back to inventory' | t }}</a>
        </div>
      </section>

      <ng-container *ngIf="!sold() && unit() as u">
        <div *ngIf="u.status !== 'AVAILABLE' || u.serialPending" class="record-alert" role="alert">{{ u.serialPending ? ('Enter this unit’s real serial number before selling it' | t) : ('This unit has already been sold' | t) }}</div>
        <form *ngIf="u.status === 'AVAILABLE' && !u.serialPending" class="surface-card record-form-card" [formGroup]="form" (ngSubmit)="submit(u)" novalidate>
          <div class="sale-facts readonly-facts">
            <div><span>{{ 'PRODUCT' | t }}</span><strong>{{ u.productName }}</strong><small>{{ u.brand }} · {{ u.model }}</small></div>
            <div><span>{{ 'SERIAL NUMBER' | t }}</span><strong><code dir="ltr">{{ u.serialNumber }}</code></strong></div>
            <div><span>{{ 'SELLING PRICE' | t }}</span><strong>{{ u.sellingPriceCents / 100 | tMoney }}</strong></div>
            <div><span>{{ 'DISCOUNT' | t }}</span><strong>{{ discountCents() / 100 | tMoney }}</strong></div>
          </div>
          <div class="record-form-grid">
            <label>{{ 'Actual sale price (Rs)' | t }}<input type="number" formControlName="salePrice" min="0" step="0.01">
              <small class="field-error" *ngIf="form.controls.salePrice.invalid && form.controls.salePrice.touched">{{ 'Enter an amount of zero or more, with at most 2 decimals.' | t }}</small></label>
            <label>{{ 'Payment method' | t }}<select formControlName="paymentMethod"><option *ngFor="let m of methods" [value]="m">{{ methodLabel[m] | t }}</option></select></label>
            <app-customer-picker (picked)="pickCustomer($event)"></app-customer-picker>
            <label>{{ 'Customer name' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="customerName" maxlength="120"></label>
            <label>{{ 'Customer phone' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="customerPhone" type="tel" maxlength="40"></label>
            <label class="record-form-wide">{{ 'Note' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="note" maxlength="500"></label>
          </div>
          <div class="record-form-actions">
            <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory', 'units', u._id)">{{ 'Cancel' | t }}</a>
            <button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Recording...' | t) : ('Record full-price sale' | t) }}</button>
          </div>
        </form>
      </ng-container>
    </div>
  `
})
export class FullPriceSaleFormComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  readonly methods = PAYMENT_METHODS;
  readonly methodLabel = PAYMENT_METHOD_LABEL;
  unit = signal<InventoryUnit | null>(null);
  sold = signal<Sale | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<Msg>('');
  form = this.fb.nonNullable.group({
    salePrice: [0, [Validators.required, moneyValidator()]],
    paymentMethod: ['CASH'],
    customerName: [''], customerPhone: [''], note: ['']
  });
  private salePrice = toSignal(this.form.controls.salePrice.valueChanges, { initialValue: 0 });
  discountCents = computed(() => Math.max(0, (this.unit()?.sellingPriceCents ?? 0) - toCents(this.salePrice())));
  /** An existing customer record chosen in the picker; its details fill (and lock) the fields. */
  customer = signal<Customer | null>(null);
  downloading = signal(false);

  pickCustomer(c: Customer | null) {
    this.customer.set(c);
    const name = this.form.controls.customerName, phone = this.form.controls.customerPhone;
    if (c) { name.setValue(c.name); phone.setValue(c.phone); name.disable(); phone.disable(); }
    else { name.enable(); phone.enable(); }
  }

  downloadReceipt(sale: Sale) {
    this.error.set('');
    this.downloading.set(true);
    downloadPdf(this.api.saleReceipt(sale._id), `receipt-${sale.saleNumber}.pdf`, e => this.error.set(errorMessage(e, tk('Unable to prepare the receipt. Please try again.'))), () => this.downloading.set(false));
  }

  ngOnInit() {
    this.api.unit(this.route.snapshot.paramMap.get('unitId') ?? '').subscribe({
      next: ({ unit }) => { this.unit.set(unit); this.form.controls.salePrice.setValue(unit.sellingPriceCents / 100); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load this unit.'))); }
    });
  }

  submit(u: InventoryUnit) {
    if (this.form.invalid || this.saving()) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    const customer = this.customer();
    this.api.sellFullPrice({
      unitId: u._id, salePrice: Number(v.salePrice), paymentMethod: v.paymentMethod,
      ...(customer ? { customerId: customer._id } : { customer: { name: v.customerName.trim(), phone: v.customerPhone.trim() } }), note: v.note.trim()
    }).subscribe({
      next: ({ sale }) => { this.saving.set(false); this.sold.set(sale); },
      error: e => { this.saving.set(false); this.error.set(errorMessage(e, tk('Unable to record sale.'))); }
    });
  }
}
