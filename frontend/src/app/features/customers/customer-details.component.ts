import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, msg, tk } from '../../core/i18n/i18n.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { AGREEMENT_STATUS_LABEL, SALE_STATUS_LABEL, SALE_TYPE_LABEL, actorLabel, errorMessage } from '../products/shared';
import { AGREEMENT_STATUS_CLASS } from '../products/installment-sales.component';
import { Agreement, Sale } from '../products/product.models';
import { Customer, CustomerStats, DOCUMENT_KINDS, DocumentKind } from './customer.models';
import { CustomersApiService, imageFileToDataUrl } from './customers-api.service';

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = { CNIC_FRONT: tk('CNIC front'), CNIC_BACK: tk('CNIC back'), OTHER: tk('Other ID') };

/** One customer: details, ID pictures (add / view / remove), purchase history and installment balances. */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'CUSTOMER' | t }}</div><h1>{{ customer()?.name || ('Customer' | t) }}</h1>
          <p *ngIf="customer() as c"><code dir="ltr">{{ c.customerCode }}</code> · <span dir="ltr">{{ c.phone }}</span></p></div>
        <div class="heading-actions">
          <a class="btn-outline record-cancel" [routerLink]="portal.link('customers')">{{ '← Back to customers' | t }}</a>
          <a *ngIf="customer() && portal.can('customers.manage')" class="btn btn-small" [routerLink]="portal.link('customers', customer()!._id, 'edit')">{{ 'Edit' | t }}</a>
        </div>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="success()" class="record-success" role="status">{{ success() | t }}</div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <ng-container *ngIf="customer() as c">
        <section class="metric-grid metric-grid-4" *ngIf="stats() as s" [attr.aria-label]="'Customer summary' | t">
          <article class="metric-card"><div class="metric-card-top"><span>{{ 'Purchases' | t }}</span><span class="metric-icon metric-blue">✓</span></div>
            <strong>{{ s.salesCount }}</strong><small>{{ 'Total {amount}' | t:{ amount: (s.totalCents / 100 | tMoney) } }}</small></article>
          <article class="metric-card"><div class="metric-card-top"><span>{{ 'Installment outstanding' | t }}</span><span class="metric-icon metric-violet">◔</span></div>
            <strong>{{ s.outstandingCents / 100 | tMoney }}</strong><small>{{ s.activeAgreements === 1 ? ('1 active agreement' | t) : ('{count} active agreements' | t:{ count: s.activeAgreements }) }}</small></article>
          <article class="metric-card" [class.metric-alert]="s.overdueAgreements"><div class="metric-card-top"><span>{{ 'Overdue' | t }}</span><span class="metric-icon metric-red">!</span></div>
            <strong>{{ s.overdueCents / 100 | tMoney }}</strong><small>{{ s.overdueAgreements === 1 ? ('1 agreement' | t) : ('{count} agreements' | t:{ count: s.overdueAgreements }) }}</small></article>
        </section>

        <section class="surface-card detail-card">
          <div class="detail-grid">
            <div><span>{{ 'PHONE' | t }}</span><strong dir="ltr">{{ c.phone }}</strong></div>
            <div><span>{{ 'CNIC' | t }}</span><strong dir="ltr">{{ c.cnicFormatted || '—' }}</strong></div>
            <div><span>{{ 'ADDRESS' | t }}</span><strong>{{ c.address || '—' }}</strong></div>
            <div><span>{{ 'ADDED BY' | t }}</span><strong>{{ actor(c.createdBy) | t }}</strong><small>{{ c.createdAt | tDate:'medium' }}</small></div>
          </div>
          <p *ngIf="c.notes" class="detail-description">{{ c.notes }}</p>
          <div *ngIf="portal.can('customers.delete')" class="detail-actions">
            <button type="button" class="btn-outline record-cancel danger-outline" (click)="remove(c)">{{ 'Delete customer' | t }}</button>
          </div>
        </section>

        <section class="surface-card data-page-card">
          <div class="data-page-toolbar">
            <div><h2>{{ 'ID pictures' | t }}</h2><p>{{ 'Front and back of the CNIC, or another ID. Up to 4 pictures, each under 3 MB.' | t }}</p></div>
            <div *ngIf="portal.can('customers.manage') && c.documents.length < 4" class="list-controls">
              <label class="list-sort"><span class="visually-hidden">{{ 'Picture type' | t }}</span><select [(ngModel)]="newKind"><option *ngFor="let k of kinds" [value]="k">{{ kindLabel[k] | t }}</option></select></label>
              <label class="btn btn-small record-add-button">{{ uploading() ? ('Uploading...' | t) : ('＋ Add picture' | t) }}<input type="file" accept="image/*" capture="environment" class="visually-hidden" [disabled]="uploading()" (change)="upload($event, c)"></label>
            </div>
          </div>
          <div *ngIf="c.documents.length; else noPictures" class="detail-images">
            <figure *ngFor="let d of c.documents" class="id-picture">
              <img *ngIf="pictures()[d._id]; else loadingPicture" [src]="pictures()[d._id]" [alt]="kindLabel[d.kind] | t" (click)="open(d._id)">
              <ng-template #loadingPicture><div class="record-loading">{{ 'Loading...' | t }}</div></ng-template>
              <figcaption><strong>{{ kindLabel[d.kind] | t }}</strong><small>{{ d.createdAt | tDate:'mediumDate' }} · {{ actor(d.uploadedBy) | t }}</small>
                <button *ngIf="portal.can('customers.manage')" type="button" class="record-delete" (click)="removePicture(c, d._id)">{{ 'Remove' | t }}</button></figcaption>
            </figure>
          </div>
          <ng-template #noPictures><p class="record-secondary">{{ 'No ID pictures yet.' | t }}</p></ng-template>
        </section>

        <section class="surface-card data-page-card">
          <div class="data-page-toolbar"><div><h2>{{ 'Installment agreements' | t }}</h2><p *ngIf="!portal.can('sales.viewAll')">{{ 'Only the sales you made are shown.' | t }}</p></div></div>
          <div *ngIf="agreements().length; else noAgreements" class="table-wrap">
            <table class="record-table">
              <thead><tr><th>{{ 'AGREEMENT' | t }}</th><th>{{ 'PRODUCT' | t }}</th><th>{{ 'TOTAL PRICE' | t }}</th><th>{{ 'COLLECTED' | t }}</th><th>{{ 'REMAINING BALANCE' | t }}</th><th>{{ 'NEXT DUE' | t }}</th><th>{{ 'STATUS' | t }}</th></tr></thead>
              <tbody><tr *ngFor="let a of agreements()">
                <td><a class="record-primary row-link" [routerLink]="portal.link('sales', 'installments', a._id)"><code dir="ltr">{{ a.agreementNumber }}</code></a><small class="record-secondary">{{ a.createdAt | tDate:'mediumDate' }}</small></td>
                <td>{{ a.item.productName }}<small class="record-secondary" dir="ltr">{{ a.item.serialNumber }}</small></td>
                <td>{{ a.totalPriceCents / 100 | tMoney }}</td><td>{{ a.collectedCents / 100 | tMoney }}</td><td>{{ a.balanceCents / 100 | tMoney }}</td>
                <td>{{ a.nextDueDate ? (a.nextDueDate | tDate:'mediumDate') : '—' }}</td>
                <td><span class="sale-badge" [ngClass]="agreementClass[a.displayStatus]">{{ agreementLabel[a.displayStatus] | t }}</span></td>
              </tr></tbody>
            </table>
          </div>
          <ng-template #noAgreements><p class="record-secondary">{{ 'No installment agreements.' | t }}</p></ng-template>
        </section>

        <section class="surface-card data-page-card">
          <div class="data-page-toolbar"><div><h2>{{ 'Purchase history' | t }}</h2></div></div>
          <div *ngIf="sales().length; else noSales" class="table-wrap">
            <table class="record-table">
              <thead><tr><th>{{ 'SALE' | t }}</th><th>{{ 'PRODUCT' | t }}</th><th>{{ 'TYPE' | t }}</th><th>{{ 'PRICE' | t }}</th><th>{{ 'SOLD BY' | t }}</th><th>{{ 'STATUS' | t }}</th></tr></thead>
              <tbody><tr *ngFor="let s of sales()">
                <td><a class="record-primary row-link" [routerLink]="portal.link('sales', s._id)"><code dir="ltr">{{ s.saleNumber }}</code></a><small class="record-secondary">{{ s.soldAt | tDate:'medium' }}</small></td>
                <td>{{ s.item.productName }}<small class="record-secondary" dir="ltr">{{ s.item.serialNumber }}</small></td>
                <td>{{ typeLabel[s.type] | t }}</td>
                <td>{{ s.salePriceCents / 100 | tMoney }}</td>
                <td>{{ actor(s.soldBy) | t }}</td>
                <td><span class="sale-badge" [ngClass]="s.status === 'COMPLETED' ? 'sale-paid' : 'sale-overdue'">{{ saleLabel[s.status] | t }}</span></td>
              </tr></tbody>
            </table>
          </div>
          <ng-template #noSales><p class="record-secondary">{{ 'No purchases yet.' | t }}</p></ng-template>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    .id-picture { margin: 0; width: 220px; display: flex; flex-direction: column; gap: 6px; }
    .id-picture img { width: 220px; height: 150px; object-fit: cover; border-radius: 10px; border: 1px solid #E5DDD0; cursor: zoom-in; background: #F1E9DC; }
    .id-picture figcaption { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .id-picture figcaption small { color: #5f5950; }
    .id-picture .record-delete { align-self: flex-start; background: none; border: 0; padding: 0; color: #aa3333; font: inherit; font-size: 12px; cursor: pointer; }
  `]
})
export class CustomerDetailsComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(CustomersApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  readonly kinds = DOCUMENT_KINDS;
  readonly kindLabel = DOCUMENT_KIND_LABEL;
  readonly agreementLabel = AGREEMENT_STATUS_LABEL;
  readonly agreementClass = AGREEMENT_STATUS_CLASS;
  readonly saleLabel = SALE_STATUS_LABEL;
  readonly typeLabel = SALE_TYPE_LABEL;
  readonly actor = actorLabel;
  customer = signal<Customer | null>(null);
  stats = signal<CustomerStats | null>(null);
  sales = signal<Sale[]>([]);
  agreements = signal<Agreement[]>([]);
  /** Loaded pictures by document id (data URLs). */
  pictures = signal<Record<string, string>>({});
  loading = signal(true);
  uploading = signal(false);
  error = signal<Msg>('');
  success = signal<Msg>('');
  newKind: DocumentKind = 'CNIC_FRONT';

  ngOnInit() { this.load(); }

  async upload(event: Event, c: Customer) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    this.success.set('');
    this.uploading.set(true);
    try {
      const image = await imageFileToDataUrl(file);
      this.api.addDocument(c._id, this.newKind, image).subscribe({
        next: ({ document }) => {
          this.uploading.set(false);
          this.customer.set({ ...c, documents: [...c.documents, document] });
          this.pictures.update(p => ({ ...p, [document._id]: image }));
          this.success.set(tk('Picture added.'));
          this.newKind = this.newKind === 'CNIC_FRONT' ? 'CNIC_BACK' : 'OTHER';
        },
        error: e => { this.uploading.set(false); this.error.set(errorMessage(e, tk('Unable to upload the picture. Please try again.'))); }
      });
    } catch (e) {
      this.uploading.set(false);
      this.error.set(e instanceof Error ? e.message : tk('Unable to read the image'));
    }
  }

  open(docId: string) {
    const src = this.pictures()[docId];
    if (src) window.open(src, '_blank', 'noopener');
  }

  async removePicture(c: Customer, docId: string) {
    const answer = await this.confirm.ask({ title: tk('Remove this picture?'), message: tk('The picture will be deleted from the customer’s record.'), confirmLabel: tk('Remove'), danger: true });
    if (!answer.confirmed) return;
    this.api.deleteDocument(c._id, docId).subscribe({
      next: () => { this.customer.set({ ...c, documents: c.documents.filter(d => d._id !== docId) }); this.success.set(tk('Picture removed.')); },
      error: e => this.error.set(errorMessage(e, tk('Unable to remove the picture. Please try again.')))
    });
  }

  async remove(c: Customer) {
    const answer = await this.confirm.ask({
      title: tk('Delete this customer?'),
      message: msg('{name} ({code}) will be removed. Customers with sales can’t be deleted. This is recorded in the audit log.', { name: c.name, code: c.customerCode }),
      confirmLabel: tk('Delete'), danger: true, reasonLabel: tk('Reason (required)')
    });
    if (!answer.confirmed) return;
    this.api.delete(c._id, answer.reason).subscribe({
      next: () => void this.router.navigate(this.portal.link('customers')),
      error: e => this.error.set(errorMessage(e, tk('Unable to delete this customer. Please try again.')))
    });
  }

  private load() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.get(id).subscribe({
      next: ({ customer, sales, agreements, stats }) => {
        this.customer.set(customer); this.sales.set(sales); this.agreements.set(agreements); this.stats.set(stats); this.loading.set(false);
        for (const d of customer.documents) {
          this.api.document(customer._id, d._id).subscribe({ next: ({ document }) => this.pictures.update(p => ({ ...p, [d._id]: document.dataUrl })), error: () => undefined });
        }
      },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load this customer.'))); }
    });
  }
}
