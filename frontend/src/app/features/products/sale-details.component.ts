import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, msg, tk } from '../../core/i18n/i18n.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { Agreement, Sale } from './product.models';
import { ProductsApiService } from './products-api.service';
import { PAYMENT_METHOD_LABEL, SALE_STATUS_LABEL, SALE_TYPE_LABEL, actorLabel, downloadPdf, errorMessage } from './shared';

/** One sale (receipt view). The owner can cancel or refund it, with a reason. */
@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'SALE' | t }}</div><h1><code dir="ltr">{{ sale()?.saleNumber || '…' }}</code></h1>
          <p *ngIf="sale() as s">{{ typeLabel[s.type] | t }} · {{ s.soldAt | tDate:'medium' }}</p></div>
        <a class="btn-outline record-cancel" [routerLink]="backLink()">{{ '← Back to sales' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="success()" class="record-success" role="status">{{ success() | t }}</div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <section *ngIf="sale() as s" class="surface-card detail-card">
        <div class="detail-header">
          <div><span class="overview-kicker">{{ 'PRODUCT' | t }}</span><h2>{{ s.item.productName }}</h2><p class="record-secondary">{{ s.item.brand }} · {{ s.item.model }} · <code dir="ltr">{{ s.item.serialNumber }}</code></p></div>
          <span class="sale-badge big" [ngClass]="s.status === 'COMPLETED' ? 'sale-paid' : 'sale-overdue'">{{ statusLabel[s.status] | t }}</span>
        </div>
        <div class="sale-facts">
          <div><span>{{ 'LIST PRICE' | t }}</span><strong>{{ s.item.listPriceCents / 100 | tMoney }}</strong></div>
          <div><span>{{ s.type === 'INSTALLMENT' ? ('INSTALLMENT PRICE' | t) : ('SALE PRICE' | t) }}</span><strong>{{ s.salePriceCents / 100 | tMoney }}</strong></div>
          <div *ngIf="s.type === 'FULL_PRICE'"><span>{{ 'DISCOUNT' | t }}</span><strong>{{ s.discountCents / 100 | tMoney }}</strong></div>
          <div *ngIf="s.item.purchasePriceCents !== undefined"><span>{{ 'PURCHASE PRICE' | t }}</span><strong>{{ s.item.purchasePriceCents === null ? ('Not recorded' | t) : (s.item.purchasePriceCents / 100 | tMoney) }}</strong></div>
        </div>
        <div class="detail-grid">
          <div><span>{{ 'SOLD BY' | t }}</span><strong>{{ actor(s.soldBy) | t }}</strong></div>
          <div><span>{{ 'PAYMENT' | t }}</span><strong>{{ methodLabel[s.paymentMethod] | t }}</strong></div>
          <div><span>{{ 'CUSTOMER' | t }}</span>
            <strong><a *ngIf="s.customerId" [routerLink]="portal.link('customers', s.customerId)">{{ s.customer.name }}</a><ng-container *ngIf="!s.customerId">{{ s.customer.name || ('Walk-in customer' | t) }}</ng-container></strong>
            <small *ngIf="s.customer.phone" dir="ltr">{{ s.customer.phone }}</small></div>
          <div *ngIf="s.unitId"><span>{{ 'UNIT' | t }}</span><strong><a [routerLink]="portal.link('inventory', 'units', s.unitId)"><code dir="ltr">{{ s.item.serialNumber }}</code></a></strong></div>
          <div *ngIf="agreement() as a"><span>{{ 'INSTALLMENT AGREEMENT' | t }}</span><strong><a [routerLink]="portal.link('sales', 'installments', a._id)"><code dir="ltr">{{ a.agreementNumber }}</code></a></strong>
            <small>{{ '{collected} collected · {balance} remaining' | t:{ collected: (a.collectedCents / 100 | tMoney), balance: (a.balanceCents / 100 | tMoney) } }}</small></div>
          <div *ngIf="s.legacy"><span>{{ 'OLD RECORD' | t }}</span><strong>{{ 'Imported from the old sales records' | t }}</strong><small *ngIf="s.legacy.quantity > 1">{{ 'Quantity: {count}' | t:{ count: s.legacy.quantity } }}</small></div>
        </div>
        <p *ngIf="s.note" class="detail-description">{{ s.note }}</p>
        <div *ngIf="s.cancellation as c" class="record-alert" role="status"><ng-container *ngIf="s.status === 'REFUNDED'">{{ 'Refunded on {date} by {name}: {reason}' | t:{ date: (c.at | tDate:'medium'), name: (actor(c.by) | t), reason: c.reason } }}</ng-container><ng-container *ngIf="s.status !== 'REFUNDED'">{{ 'Cancelled on {date} by {name}: {reason}' | t:{ date: (c.at | tDate:'medium'), name: (actor(c.by) | t), reason: c.reason } }}</ng-container></div>
        <div class="detail-actions">
          <button type="button" class="btn btn-small" [disabled]="downloading()" (click)="downloadReceipt(s)">{{ downloading() ? ('Preparing PDF...' | t) : ('Download receipt (PDF)' | t) }}</button>
        </div>
        <div *ngIf="portal.can('sales.correct') && s.status === 'COMPLETED'" class="detail-actions">
          <span class="detail-actions-label">{{ 'Corrections:' | t }}</span>
          <button type="button" class="btn-outline record-cancel" (click)="correct(s, 'refund')">{{ 'Refund' | t }}</button>
          <button type="button" class="btn-outline record-cancel danger-outline" (click)="correct(s, 'cancel')">{{ 'Cancel sale' | t }}</button>
        </div>
      </section>
    </div>
  `
})
export class SaleDetailsComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);
  readonly statusLabel = SALE_STATUS_LABEL;
  readonly typeLabel = SALE_TYPE_LABEL;
  readonly methodLabel = PAYMENT_METHOD_LABEL;
  readonly actor = actorLabel;
  sale = signal<Sale | null>(null);
  agreement = signal<Agreement | null>(null);
  loading = signal(true);
  downloading = signal(false);
  error = signal<Msg>('');
  success = signal<Msg>('');

  ngOnInit() { this.load(); }

  backLink() { return this.portal.link('sales', this.sale()?.type === 'INSTALLMENT' ? 'installments' : 'full-price'); }

  downloadReceipt(s: Sale) {
    this.error.set('');
    this.downloading.set(true);
    downloadPdf(this.api.saleReceipt(s._id), `receipt-${s.saleNumber}.pdf`, e => this.error.set(errorMessage(e, tk('Unable to prepare the receipt. Please try again.'))), () => this.downloading.set(false));
  }

  async correct(s: Sale, action: 'cancel' | 'refund') {
    const refund = action === 'refund';
    const answer = await this.confirm.ask({
      title: refund ? tk('Refund this sale?') : tk('Cancel this sale?'),
      message: refund
        ? msg('Sale {number} will be marked as refunded and removed from sales totals. The unit is not returned to stock. This is recorded in the audit log.', { number: s.saleNumber })
        : msg('Sale {number} will be marked as cancelled and removed from sales totals. The unit is not returned to stock. This is recorded in the audit log.', { number: s.saleNumber }),
      confirmLabel: refund ? tk('Refund') : tk('Cancel sale'), danger: true, reasonLabel: tk('Reason (required)')
    });
    if (!answer.confirmed) return;
    this.api.correctSale(s._id, action, answer.reason).subscribe({
      next: ({ sale, agreement }) => { this.sale.set(sale); this.agreement.set(agreement); this.success.set(refund ? tk('Sale refunded.') : tk('Sale cancelled.')); },
      error: e => this.error.set(errorMessage(e, tk('Unable to update this sale. Please try again.')))
    });
  }

  private load() {
    this.api.sale(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: ({ sale, agreement }) => { this.sale.set(sale); this.agreement.set(agreement); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load this sale.'))); }
    });
  }
}
