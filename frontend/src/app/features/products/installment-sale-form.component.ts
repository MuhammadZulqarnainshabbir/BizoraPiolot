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
import { Agreement, Frequency, InventoryUnit, PAYMENT_METHODS } from './product.models';
import { ProductsApiService } from './products-api.service';
import { FREQUENCY_LABEL, PAYMENT_METHOD_LABEL, addDays, addMonths, downloadPdf, errorMessage, moneyValidator, previewSchedule, toCents, todayIn } from './shared';

/** "Sold on installment": creates the sale and its installment agreement in one step. */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, CustomerPickerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'MARK AS SOLD' | t }}</div><h1>{{ 'Sell on installment' | t }}</h1><p>{{ 'The schedule is calculated for you. The sale time, your name and the shop are recorded automatically.' | t }}</p></div>
        <a class="btn-outline record-cancel" [routerLink]="unit() ? portal.link('inventory', 'units', unit()!._id) : portal.link('inventory')">{{ '← Back' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <section *ngIf="created() as a" class="surface-card record-form-card added-result" role="status">
        <h2>{{ 'Installment agreement {number} created.' | t:{ number: a.agreementNumber } }}</h2>
        <p>{{ '{product} ({serial}) for {customer}: {balance} remaining over {count} installments.' | t:{ product: a.item.productName, serial: a.item.serialNumber, customer: a.customer.name, balance: (a.balanceCents / 100 | tMoney), count: a.installmentCount } }}</p>
        <div class="record-form-actions">
          <button type="button" class="btn btn-small" [disabled]="downloading()" (click)="downloadReceipt(a)">{{ downloading() ? ('Preparing PDF...' | t) : ('Download agreement (PDF)' | t) }}</button>
          <a class="btn-outline record-cancel" [routerLink]="portal.link('sales', 'installments', a._id)">{{ 'View agreement' | t }}</a>
          <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory')">{{ 'Back to inventory' | t }}</a>
        </div>
      </section>

      <ng-container *ngIf="!created() && unit() as u">
        <div *ngIf="u.status !== 'AVAILABLE' || u.serialPending" class="record-alert" role="alert">{{ u.serialPending ? ('Enter this unit’s real serial number before selling it' | t) : ('This unit has already been sold' | t) }}</div>
        <form *ngIf="u.status === 'AVAILABLE' && !u.serialPending" class="surface-card record-form-card" [formGroup]="form" (ngSubmit)="submit(u)" novalidate>
          <div class="sale-facts readonly-facts">
            <div><span>{{ 'PRODUCT' | t }}</span><strong>{{ u.productName }}</strong><small>{{ u.brand }} · {{ u.model }}</small></div>
            <div><span>{{ 'SERIAL NUMBER' | t }}</span><strong><code dir="ltr">{{ u.serialNumber }}</code></strong></div>
            <div><span>{{ 'SELLING PRICE' | t }}</span><strong>{{ u.sellingPriceCents / 100 | tMoney }}</strong></div>
          </div>

          <fieldset class="form-section">
            <legend>{{ 'Customer' | t }}</legend>
            <div class="record-form-grid">
              <app-customer-picker (picked)="pickCustomer($event)"></app-customer-picker>
              <label>{{ 'Customer name' | t }}<input formControlName="customerName" maxlength="120">
                <small class="field-error" *ngIf="touchedInvalid('customerName')">{{ 'Enter the customer’s name.' | t }}</small></label>
              <label>{{ 'Customer phone' | t }}<input formControlName="customerPhone" type="tel" maxlength="40">
                <small class="field-error" *ngIf="touchedInvalid('customerPhone')">{{ 'Enter the customer’s phone number.' | t }}</small></label>
              <label>{{ 'Address' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="customerAddress" maxlength="300"></label>
              <label>{{ 'CNIC / reference' | t }} <span class="optional-label">{{ 'Optional · a 13-digit CNIC is saved on the customer record' | t }}</span><input formControlName="customerReference" maxlength="60" dir="ltr" placeholder="12345-1234567-1"></label>
              <p *ngIf="customer() as c" class="record-form-wide record-secondary">{{ 'Linked to customer {code}. Edit their record to change these details.' | t:{ code: c.customerCode } }}</p>
            </div>
          </fieldset>

          <fieldset class="form-section">
            <legend>{{ 'Installment plan' | t }}</legend>
            <div class="record-form-grid">
              <label>{{ 'Total installment price (Rs)' | t }}<input type="number" formControlName="totalPrice" min="0" step="0.01">
                <small class="field-error" *ngIf="touchedInvalid('totalPrice')">{{ 'Enter an amount greater than zero, with at most 2 decimals.' | t }}</small></label>
              <label>{{ 'Down payment (Rs)' | t }}<input type="number" formControlName="downPayment" min="0" step="0.01">
                <small class="field-error" *ngIf="downTooHigh()">{{ 'Down payment must be less than the total. Use a full-price sale instead.' | t }}</small></label>
              <label>{{ 'Number of installments' | t }}<input type="number" formControlName="installmentCount" min="1" max="120" step="1">
                <small class="field-error" *ngIf="touchedInvalid('installmentCount')">{{ 'Use a whole number from 1 to 120.' | t }}</small></label>
              <label>{{ 'Frequency' | t }}<select formControlName="frequency"><option *ngFor="let f of frequencies" [value]="f">{{ frequencyLabel[f] | t }}</option></select></label>
              <label *ngIf="frequency() === 'CUSTOM'">{{ 'Days between installments' | t }}<input type="number" formControlName="intervalDays" min="1" max="365" step="1"></label>
              <label>{{ 'First due date' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input type="date" formControlName="firstDueDate" [min]="today"></label>
              <label>{{ 'Down payment method' | t }}<select formControlName="paymentMethod"><option *ngFor="let m of methods" [value]="m">{{ methodLabel[m] | t }}</option></select></label>
              <label class="record-form-wide">{{ 'Notes' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="notes" maxlength="500"></label>
            </div>
          </fieldset>

          <div class="sale-preview" aria-live="polite">
            <div><span>{{ 'Total' | t }}</span><strong>{{ totalCents() / 100 | tMoney }}</strong></div>
            <div><span>{{ 'Down payment' | t }}</span><strong>{{ downCents() / 100 | tMoney }}</strong></div>
            <div><span>{{ 'Remaining balance' | t }}</span><strong>{{ financedCents() / 100 | tMoney }}</strong></div>
            <div *ngIf="schedule().length"><span>{{ 'Installment amount' | t }}</span><strong>{{ schedule()[0].amountCents / 100 | tMoney }} × {{ schedule().length }}</strong>
              <small *ngIf="schedule().at(-1)!.amountCents !== schedule()[0].amountCents">{{ 'last payment {amount}' | t:{ amount: (schedule().at(-1)!.amountCents / 100 | tMoney) } }}</small></div>
          </div>
          <div *ngIf="schedule().length" class="table-wrap sale-mini-table schedule-preview">
            <table><thead><tr><th>#</th><th>{{ 'DUE DATE' | t }}</th><th>{{ 'AMOUNT' | t }}</th></tr></thead>
              <tbody><tr *ngFor="let e of schedule().slice(0, 12)"><td>{{ e.number }}</td><td>{{ e.dueDate | tDate:'mediumDate' }}</td><td>{{ e.amountCents / 100 | tMoney }}</td></tr></tbody></table>
            <p *ngIf="schedule().length > 12" class="record-secondary">{{ '…and {count} more' | t:{ count: schedule().length - 12 } }}</p>
          </div>

          <div class="record-form-actions">
            <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory', 'units', u._id)">{{ 'Cancel' | t }}</a>
            <button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Recording...' | t) : ('Record installment sale' | t) }}</button>
          </div>
        </form>
      </ng-container>
    </div>
  `
})
export class InstallmentSaleFormComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  readonly methods = PAYMENT_METHODS;
  readonly methodLabel = PAYMENT_METHOD_LABEL;
  readonly frequencies: Frequency[] = ['MONTHLY', 'WEEKLY', 'CUSTOM'];
  readonly frequencyLabel = FREQUENCY_LABEL;
  readonly today = todayIn(this.portal.timezone());
  unit = signal<InventoryUnit | null>(null);
  created = signal<Agreement | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<Msg>('');

  form = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.maxLength(120)]],
    customerPhone: ['', [Validators.required, Validators.maxLength(40)]],
    customerAddress: [''], customerReference: [''],
    totalPrice: [0, [Validators.required, moneyValidator({ allowZero: false })]],
    downPayment: [0, [Validators.required, moneyValidator()]],
    installmentCount: [6, [Validators.required, Validators.min(1), Validators.max(120), Validators.pattern(/^\d+$/)]],
    frequency: ['MONTHLY' as Frequency],
    intervalDays: [30, [Validators.min(1), Validators.max(365)]],
    firstDueDate: [''],
    paymentMethod: ['CASH'],
    notes: ['']
  });
  private values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  frequency = computed(() => this.values().frequency ?? 'MONTHLY');
  totalCents = computed(() => toCents(this.values().totalPrice));
  downCents = computed(() => toCents(this.values().downPayment));
  financedCents = computed(() => Math.max(0, this.totalCents() - this.downCents()));
  downTooHigh = computed(() => this.totalCents() > 0 && this.downCents() >= this.totalCents());
  /** An existing customer record chosen in the picker; its details fill (and lock) the fields. */
  customer = signal<Customer | null>(null);
  downloading = signal(false);

  downloadReceipt(a: Agreement) {
    this.error.set('');
    this.downloading.set(true);
    downloadPdf(this.api.saleReceipt(a.saleId), `receipt-${a.agreementNumber}.pdf`, e => this.error.set(errorMessage(e, tk('Unable to prepare the receipt. Please try again.'))), () => this.downloading.set(false));
  }

  pickCustomer(c: Customer | null) {
    this.customer.set(c);
    const controls = [this.form.controls.customerName, this.form.controls.customerPhone, this.form.controls.customerAddress, this.form.controls.customerReference];
    if (c) {
      this.form.patchValue({ customerName: c.name, customerPhone: c.phone, customerAddress: c.address, customerReference: c.cnicFormatted });
      for (const control of controls) control.disable();
    } else {
      for (const control of controls) control.enable();
    }
  }
  schedule = computed(() => {
    const v = this.values();
    const count = Number(v.installmentCount);
    const frequency = (v.frequency ?? 'MONTHLY') as Frequency;
    const interval = Number(v.intervalDays) || 30;
    const first = v.firstDueDate || (frequency === 'MONTHLY' ? addMonths(this.today, 1) : addDays(this.today, frequency === 'WEEKLY' ? 7 : interval));
    return Number.isInteger(count) && count >= 1 && count <= 120 && !this.downTooHigh() ? previewSchedule(this.financedCents(), count, frequency, first, interval) : [];
  });

  ngOnInit() {
    this.api.unit(this.route.snapshot.paramMap.get('unitId') ?? '').subscribe({
      next: ({ unit }) => { this.unit.set(unit); this.form.controls.totalPrice.setValue(unit.sellingPriceCents / 100); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load this unit.'))); }
    });
  }

  touchedInvalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  submit(u: InventoryUnit) {
    if (this.form.invalid || this.downTooHigh() || this.saving()) { this.form.markAllAsTouched(); this.error.set(tk('Check the highlighted fields.')); return; }
    const v = this.form.getRawValue();
    const customer = this.customer();
    this.saving.set(true);
    this.error.set('');
    this.api.sellInstallment({
      unitId: u._id, totalPrice: Number(v.totalPrice), downPayment: Number(v.downPayment), installmentCount: Number(v.installmentCount),
      frequency: v.frequency, ...(v.frequency === 'CUSTOM' ? { intervalDays: Number(v.intervalDays) } : {}),
      ...(v.firstDueDate ? { firstDueDate: v.firstDueDate } : {}), paymentMethod: v.paymentMethod,
      ...(customer ? { customerId: customer._id } : { customer: { name: v.customerName.trim(), phone: v.customerPhone.trim(), address: v.customerAddress.trim(), reference: v.customerReference.trim() } }),
      notes: v.notes.trim()
    }).subscribe({
      next: ({ agreement }) => { this.saving.set(false); this.created.set(agreement); },
      error: e => { this.saving.set(false); this.error.set(errorMessage(e, tk('Unable to record sale.'))); }
    });
  }
}
