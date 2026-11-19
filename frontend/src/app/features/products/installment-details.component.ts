import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, msg, tk } from '../../core/i18n/i18n.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { Agreement, PAYMENT_METHODS, Payment, Sale } from './product.models';
import { ProductsApiService } from './products-api.service';
import { AGREEMENT_STATUS_CLASS } from './installment-sales.component';
import { AGREEMENT_STATUS_LABEL, FREQUENCY_LABEL, INSTALLMENT_STATE_LABEL, PAYMENT_METHOD_LABEL, actorLabel, downloadPdf, errorMessage, moneyValidator, toCents } from './shared';

/** One installment agreement: schedule, payments, and (owner) record a payment or cancel. */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'INSTALLMENT AGREEMENT' | t }}</div><h1><code dir="ltr">{{ agreement()?.agreementNumber || '…' }}</code></h1>
          <p *ngIf="agreement() as a">{{ a.item.productName }} · <code dir="ltr">{{ a.item.serialNumber }}</code></p></div>
        <a class="btn-outline record-cancel" [routerLink]="portal.link('sales', 'installments')">{{ '← Back to installment sales' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="success()" class="record-success" role="status">{{ success() | t }}</div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <ng-container *ngIf="agreement() as a">
        <section class="surface-card detail-card">
          <div class="detail-header">
            <div><span class="overview-kicker">{{ 'CUSTOMER' | t }}</span><h2><a *ngIf="a.customerId" [routerLink]="portal.link('customers', a.customerId)">{{ a.customer.name }}</a><ng-container *ngIf="!a.customerId">{{ a.customer.name }}</ng-container></h2>
              <p class="record-secondary"><span dir="ltr">{{ a.customer.phone }}</span><ng-container *ngIf="a.customer.address"> · {{ a.customer.address }}</ng-container><ng-container *ngIf="a.customer.reference"> · <span dir="ltr">{{ a.customer.reference }}</span></ng-container></p></div>
            <span class="sale-badge big" [ngClass]="statusClass[a.displayStatus]">{{ statusLabel[a.displayStatus] | t }}</span>
          </div>
          <div class="sale-facts">
            <div><span>{{ 'TOTAL PRICE' | t }}</span><strong>{{ a.totalPriceCents / 100 | tMoney }}</strong></div>
            <div><span>{{ 'DOWN PAYMENT' | t }}</span><strong>{{ a.downPaymentCents / 100 | tMoney }}</strong></div>
            <div><span>{{ 'COLLECTED' | t }}</span><strong>{{ a.collectedCents / 100 | tMoney }}</strong><small>{{ 'including down payment' | t }}</small></div>
            <div><span>{{ 'REMAINING BALANCE' | t }}</span><strong>{{ a.balanceCents / 100 | tMoney }}</strong><small *ngIf="a.overdueCents">{{ '{amount} overdue' | t:{ amount: (a.overdueCents / 100 | tMoney) } }}</small></div>
          </div>
          <div class="detail-grid">
            <div><span>{{ 'PLAN' | t }}</span><strong>{{ a.installmentCount }} × {{ frequencyLabel[a.frequency] | t }}</strong><small *ngIf="a.frequency === 'CUSTOM'">{{ 'every {count} days' | t:{ count: a.intervalDays } }}</small></div>
            <div><span>{{ 'NEXT DUE' | t }}</span><strong>{{ a.nextDueDate ? (a.nextDueDate | tDate:'mediumDate') : '—' }}</strong><small *ngIf="a.nextDueCents">{{ a.nextDueCents / 100 | tMoney }}</small></div>
            <div><span>{{ 'SOLD BY' | t }}</span><strong>{{ seller() | t }}</strong><small>{{ a.createdAt | tDate:'medium' }}</small></div>
            <div *ngIf="sale() as s"><span>{{ 'SALE' | t }}</span><strong><a [routerLink]="portal.link('sales', s._id)"><code dir="ltr">{{ s.saleNumber }}</code></a></strong></div>
            <div *ngIf="a.unitId"><span>{{ 'UNIT' | t }}</span><strong><a [routerLink]="portal.link('inventory', 'units', a.unitId)"><code dir="ltr">{{ a.item.serialNumber }}</code></a></strong></div>
          </div>
          <p *ngIf="a.notes" class="detail-description">{{ a.notes }}</p>
          <div *ngIf="a.cancellation as c" class="record-alert" role="status">{{ 'Cancelled on {date} by {name}: {reason}' | t:{ date: (c.at | tDate:'medium'), name: (actor(c.by) | t), reason: c.reason } }}</div>
          <div class="detail-actions">
            <button type="button" class="btn btn-small" [disabled]="downloading() === 'agreement'" (click)="downloadAgreement(a)">{{ downloading() === 'agreement' ? ('Preparing PDF...' | t) : ('Download agreement (PDF)' | t) }}</button>
          </div>
          <div *ngIf="isOwner && a.status !== 'CANCELLED' && sale()?.status === 'COMPLETED'" class="detail-actions">
            <button *ngIf="a.status === 'ACTIVE'" type="button" class="btn btn-small" (click)="openPayment(a)">{{ 'Record payment' | t }}</button>
            <button type="button" class="btn-outline record-cancel danger-outline" (click)="cancel(a)">{{ 'Cancel agreement' | t }}</button>
          </div>
          <p *ngIf="!isOwner && a.status === 'ACTIVE'" class="hint">{{ 'Payments are recorded by the shop owner.' | t }}</p>
        </section>

        <form *ngIf="paying()" class="surface-card record-form-card" [formGroup]="payForm" (ngSubmit)="pay(a)" novalidate>
          <div class="record-form-heading"><div><h2>{{ 'Record payment' | t }}</h2><p>{{ 'Remaining balance: {amount}' | t:{ amount: (a.balanceCents / 100 | tMoney) } }}</p></div>
            <button type="button" class="record-close" [attr.aria-label]="'Close form' | t" (click)="paying.set(false)">×</button></div>
          <div class="record-form-grid">
            <label>{{ 'Amount (Rs)' | t }}<input type="number" formControlName="amount" min="0.01" step="0.01">
              <small class="field-error" *ngIf="payForm.controls.amount.touched && (payForm.controls.amount.invalid || overpaying())">{{ overpaying() ? ('The amount is more than the remaining balance.' | t) : ('Enter an amount greater than zero, with at most 2 decimals.' | t) }}</small></label>
            <label>{{ 'Payment method' | t }}<select formControlName="method"><option *ngFor="let m of methods" [value]="m">{{ methodLabel[m] | t }}</option></select></label>
            <label class="record-form-wide">{{ 'Note' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="note" maxlength="500"></label>
          </div>
          <div class="record-form-actions"><button type="button" class="btn-outline record-cancel" (click)="paying.set(false)">{{ 'Cancel' | t }}</button>
            <button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Saving...' | t) : ('Save payment' | t) }}</button></div>
        </form>

        <section class="surface-card data-page-card">
          <div class="data-page-toolbar"><div><h2>{{ 'Payment schedule' | t }}</h2></div></div>
          <div class="table-wrap">
            <table class="record-table">
              <thead><tr><th>#</th><th>{{ 'DUE DATE' | t }}</th><th>{{ 'AMOUNT' | t }}</th><th>{{ 'PAID' | t }}</th><th>{{ 'STATUS' | t }}</th></tr></thead>
              <tbody><tr *ngFor="let e of a.schedule">
                <td>{{ e.number }}</td><td>{{ e.dueDate | tDate:'mediumDate' }}</td><td>{{ e.amountCents / 100 | tMoney }}</td><td>{{ e.paidCents / 100 | tMoney }}</td>
                <td><span class="sale-badge" [ngClass]="stateClass(e.state)">{{ stateLabel[e.state] | t }}</span></td>
              </tr></tbody>
            </table>
          </div>
        </section>

        <section class="surface-card data-page-card">
          <div class="data-page-toolbar"><div><h2>{{ 'Payments received' | t }}</h2></div></div>
          <div *ngIf="payments().length; else noPayments" class="table-wrap">
            <table class="record-table">
              <thead><tr><th>{{ 'DATE' | t }}</th><th>{{ 'TYPE' | t }}</th><th>{{ 'AMOUNT' | t }}</th><th>{{ 'METHOD' | t }}</th><th>{{ 'RECORDED BY' | t }}</th><th>{{ 'NOTE' | t }}</th><th>{{ 'RECEIPT' | t }}</th></tr></thead>
              <tbody><tr *ngFor="let p of payments()">
                <td>{{ p.paidAt | tDate:'medium' }}</td>
                <td>{{ p.kind === 'DOWN_PAYMENT' ? ('Down payment' | t) : ('Installment' | t) }}</td>
                <td>{{ p.amountCents / 100 | tMoney }}</td><td>{{ methodLabel[p.method] | t }}</td>
                <td>{{ actor(p.recordedBy) | t }}</td><td>{{ p.note || '—' }}</td>
                <td><div class="record-actions"><button type="button" [disabled]="downloading() === p._id" (click)="downloadPayment(a, p)">{{ downloading() === p._id ? ('Preparing...' | t) : ('PDF' | t) }}</button></div></td>
              </tr></tbody>
            </table>
          </div>
          <ng-template #noPayments><p class="record-secondary">{{ 'No payments yet.' | t }}</p></ng-template>
        </section>
      </ng-container>
    </div>
  `
})
export class InstallmentDetailsComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);
  private fb = inject(FormBuilder);
  readonly isOwner = this.portal.can('installments.recordPayment');
  readonly methods = PAYMENT_METHODS;
  readonly methodLabel = PAYMENT_METHOD_LABEL;
  readonly statusLabel = AGREEMENT_STATUS_LABEL;
  readonly statusClass = AGREEMENT_STATUS_CLASS;
  readonly stateLabel = INSTALLMENT_STATE_LABEL;
  readonly frequencyLabel = FREQUENCY_LABEL;
  agreement = signal<Agreement | null>(null);
  sale = signal<Sale | null>(null);
  payments = signal<Payment[]>([]);
  loading = signal(true);
  paying = signal(false);
  saving = signal(false);
  error = signal<Msg>('');
  success = signal<Msg>('');
  payForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, moneyValidator({ allowZero: false })]],
    method: ['CASH'],
    note: ['']
  });
  private amount = signal(0);
  overpaying = computed(() => toCents(this.amount()) > (this.agreement()?.balanceCents ?? 0));
  /** 'agreement' or a payment id while its PDF is being prepared. */
  downloading = signal<string | null>(null);

  downloadAgreement(a: Agreement) {
    this.error.set('');
    this.downloading.set('agreement');
    downloadPdf(this.api.saleReceipt(a.saleId), `receipt-${a.agreementNumber}.pdf`, e => this.error.set(errorMessage(e, tk('Unable to prepare the receipt. Please try again.'))), () => this.downloading.set(null));
  }

  downloadPayment(a: Agreement, p: Payment) {
    this.error.set('');
    this.downloading.set(p._id);
    downloadPdf(this.api.paymentReceipt(a._id, p._id), `payment-${a.agreementNumber}.pdf`, e => this.error.set(errorMessage(e, tk('Unable to prepare the receipt. Please try again.'))), () => this.downloading.set(null));
  }

  constructor() { this.payForm.controls.amount.valueChanges.subscribe(v => this.amount.set(Number(v) || 0)); }

  ngOnInit() { this.load(); }

  seller() { return actorLabel(this.agreement()?.soldBy); }
  actor = actorLabel;
  stateClass(state: string) {
    return state === 'PAID' ? 'sale-paid' : state === 'OVERDUE' ? 'sale-overdue' : state === 'PARTLY_PAID' ? 'sale-partial' : state === 'CANCELLED' ? 'sale-cancelled' : 'sale-due';
  }

  openPayment(a: Agreement) {
    this.success.set('');
    this.payForm.reset({ amount: (a.nextDueCents ?? a.balanceCents) / 100, method: 'CASH', note: '' });
    this.paying.set(true);
  }

  pay(a: Agreement) {
    if (this.payForm.invalid || this.overpaying() || this.saving()) { this.payForm.markAllAsTouched(); return; }
    const v = this.payForm.getRawValue();
    this.saving.set(true);
    this.error.set('');
    this.api.recordPayment(a._id, { amount: Number(v.amount), method: v.method, note: v.note.trim() }).subscribe({
      next: ({ agreement, payments }) => {
        this.saving.set(false); this.paying.set(false);
        this.agreement.set(agreement); this.payments.set(payments);
        this.success.set(agreement.status === 'COMPLETED' ? tk('Payment saved. This agreement is now fully paid.') : tk('Payment saved.'));
      },
      error: e => { this.saving.set(false); this.error.set(errorMessage(e, tk('Unable to save the payment. Please try again.'))); }
    });
  }

  async cancel(a: Agreement) {
    const answer = await this.confirm.ask({
      title: tk('Cancel this agreement?'),
      message: msg('Agreement {number} for {customer} will be cancelled and no more payments can be recorded. The unit is not returned to stock. This is recorded in the audit log.', { number: a.agreementNumber, customer: a.customer.name }),
      confirmLabel: tk('Cancel agreement'), danger: true, reasonLabel: tk('Reason (required)')
    });
    if (!answer.confirmed) return;
    this.api.correctSale(a.saleId, 'cancel', answer.reason).subscribe({
      next: () => { this.success.set(tk('Agreement cancelled.')); this.load(); },
      error: e => this.error.set(errorMessage(e, tk('Unable to cancel. Please try again.')))
    });
  }

  private load() {
    this.api.agreement(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: ({ agreement, sale, payments }) => { this.agreement.set(agreement); this.sale.set(sale); this.payments.set(payments); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load this agreement.'))); }
    });
  }
}
