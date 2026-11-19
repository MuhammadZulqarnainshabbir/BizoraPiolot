import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, msg, tk } from '../../core/i18n/i18n.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { InventoryUnit, Product, Sale } from './product.models';
import { ProductsApiService } from './products-api.service';
import { SALE_TYPE_LABEL, UNIT_STATUS_LABEL, actorLabel, errorMessage, moneyValidator } from './shared';

/** One inventory unit: product, serial number, prices, who added it, and its sale if sold. */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'PRODUCT DETAILS' | t }}</div><h1>{{ unit()?.productName || ('Product' | t) }}</h1><p *ngIf="unit() as u">{{ u.brand }} · {{ u.model }} · <code dir="ltr">{{ u.productCode }}</code></p></div>
        <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory')">{{ '← Back to inventory' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="success()" class="record-success" role="status">{{ success() | t }}</div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <ng-container *ngIf="unit() as u">
        <div *ngIf="u.serialPending" class="record-alert employee-temp-alert" role="status">{{ 'This unit came from your old stock records and has a temporary serial number. Enter the real serial number before it can be sold.' | t }}</div>

        <section class="surface-card detail-card">
          <div class="detail-header">
            <div><span class="overview-kicker">{{ 'SERIAL NUMBER' | t }}</span><h2><code class="serial big" dir="ltr">{{ u.serialNumber }}</code></h2></div>
            <span class="sale-badge big" [ngClass]="u.status === 'AVAILABLE' ? 'sale-paid' : u.status === 'SOLD_FULL_PRICE' ? 'sale-due' : 'sale-partial'">{{ statusLabel[u.status] | t }}</span>
          </div>
          <div class="detail-grid">
            <div><span>{{ 'CATEGORY' | t }}</span><strong>{{ u.category ? (u.category | t) : '—' }}</strong><small *ngIf="u.subCategory">{{ u.subCategory | t }}</small></div>
            <div><span>{{ 'SELLING PRICE' | t }}</span><strong>{{ u.sellingPriceCents / 100 | tMoney }}</strong></div>
            <div *ngIf="portal.can('inventory.viewCost')"><span>{{ 'PURCHASE PRICE' | t }}</span><strong>{{ u.purchasePriceCents === null || u.purchasePriceCents === undefined ? ('Not recorded' | t) : (u.purchasePriceCents / 100 | tMoney) }}</strong></div>
            <div><span>{{ 'ADDED BY' | t }}</span><strong>{{ addedBy() | t }}</strong><small>{{ u.createdAt | tDate:'medium' }}</small></div>
            <div><span>{{ 'SUPPLIER' | t }}</span><strong>{{ u.supplier.name || '—' }}</strong><small *ngIf="u.supplier.phone || u.supplier.invoiceRef" dir="ltr">{{ u.supplier.phone }} {{ u.supplier.invoiceRef }}</small></div>
            <div *ngIf="sale() as s"><span>{{ 'SALE' | t }}</span>
              <strong><a *ngIf="s.mine !== false" [routerLink]="saleLink(s)">{{ s.saleNumber }}</a><ng-container *ngIf="s.mine === false">{{ s.saleNumber }}</ng-container></strong>
              <small>{{ saleTypeLabel[s.type!] | t }} · {{ s.soldAt | tDate:'medium' }}</small></div>
          </div>
          <div *ngIf="product()?.description" class="detail-description"><span class="overview-kicker">{{ 'DESCRIPTION' | t }}</span><p>{{ product()?.description }}</p></div>
          <div *ngIf="product()?.imageUrls?.length" class="detail-images">
            <img *ngFor="let src of product()?.imageUrls" [src]="src" [alt]="'Photo of {product}' | t:{ product: u.productName }" loading="lazy" referrerpolicy="no-referrer">
          </div>

          <div class="detail-actions">
            <ng-container *ngIf="u.status === 'AVAILABLE' && !u.serialPending && portal.can('sales.create')">
              <span class="detail-actions-label">{{ 'Mark as sold:' | t }}</span>
              <a class="btn btn-small" [routerLink]="portal.link('sell', 'full-price', u._id)">{{ 'Sold at full price' | t }}</a>
              <a class="btn-outline record-cancel" [routerLink]="portal.link('sell', 'installment', u._id)">{{ 'Sold on installment' | t }}</a>
            </ng-container>
            <ng-container *ngIf="u.status === 'AVAILABLE' && portal.can('inventory.edit')">
              <button type="button" class="btn-outline record-cancel" (click)="startEdit(u)">{{ u.serialPending ? ('Enter real serial number' | t) : ('Edit' | t) }}</button>
              <button type="button" class="btn-outline record-cancel danger-outline" (click)="remove(u)">{{ 'Delete' | t }}</button>
            </ng-container>
          </div>
        </section>

        <form *ngIf="editing()" class="surface-card record-form-card" [formGroup]="form" (ngSubmit)="save(u)">
          <div class="record-form-heading"><div><h2>{{ 'Correct this unit' | t }}</h2><p>{{ 'Changes are recorded in the audit log.' | t }}</p></div><button type="button" class="record-close" [attr.aria-label]="'Close form' | t" (click)="editing.set(false)">×</button></div>
          <div class="record-form-grid">
            <label>{{ 'Serial number' | t }}<input formControlName="serialNumber" maxlength="100" dir="ltr"></label>
            <label>{{ 'Selling price (Rs)' | t }}<input type="number" formControlName="sellingPrice" min="0" step="0.01"></label>
            <label>{{ 'Purchase price (Rs)' | t }}<input type="number" formControlName="purchasePrice" min="0" step="0.01"></label>
            <label>{{ 'Supplier' | t }}<input formControlName="supplierName" maxlength="120"></label>
            <label class="record-form-wide">{{ 'Reason for the change' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input formControlName="reason" maxlength="500"></label>
          </div>
          <small class="field-error" *ngIf="form.invalid && form.touched">{{ 'Check the highlighted fields.' | t }}</small>
          <div class="record-form-actions"><button type="button" class="btn-outline record-cancel" (click)="editing.set(false)">{{ 'Cancel' | t }}</button><button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Saving...' | t) : ('Save changes' | t) }}</button></div>
        </form>
      </ng-container>
    </div>
  `
})
export class ProductDetailsComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private fb = inject(FormBuilder);
  readonly statusLabel = UNIT_STATUS_LABEL;
  readonly saleTypeLabel = SALE_TYPE_LABEL;
  unit = signal<InventoryUnit | null>(null);
  product = signal<Product | null>(null);
  sale = signal<(Partial<Sale> & { mine?: boolean }) | null>(null);
  loading = signal(true);
  editing = signal(false);
  saving = signal(false);
  error = signal<Msg>('');
  success = signal<Msg>('');
  form = this.fb.nonNullable.group({
    serialNumber: ['', [Validators.required, Validators.maxLength(100)]],
    sellingPrice: [0, [Validators.required, moneyValidator()]],
    purchasePrice: [null as number | null, moneyValidator()],
    supplierName: [''],
    reason: ['']
  });

  ngOnInit() { this.load(); }

  addedBy() { return actorLabel(this.unit()?.addedBy); }
  /** Sale page (it forwards installment sales to their agreement). */
  saleLink(s: Partial<Sale>) { return this.portal.link('sales', s._id!); }

  startEdit(u: InventoryUnit) {
    this.success.set('');
    this.form.reset({
      serialNumber: u.serialPending ? '' : u.serialNumber,
      sellingPrice: u.sellingPriceCents / 100,
      purchasePrice: u.purchasePriceCents === null || u.purchasePriceCents === undefined ? null : u.purchasePriceCents / 100,
      supplierName: u.supplier.name, reason: ''
    });
    this.editing.set(true);
  }

  save(u: InventoryUnit) {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');
    this.api.updateUnit(u._id, {
      ...(v.serialNumber.trim() !== u.serialNumber ? { serialNumber: v.serialNumber.trim() } : {}),
      sellingPrice: Number(v.sellingPrice),
      ...(v.purchasePrice !== null && String(v.purchasePrice) !== '' ? { purchasePrice: Number(v.purchasePrice) } : {}),
      supplier: { ...u.supplier, name: v.supplierName.trim() },
      reason: v.reason.trim()
    }).subscribe({
      next: ({ unit }) => { this.saving.set(false); this.editing.set(false); this.unit.set(unit); this.success.set(tk('Changes saved.')); },
      error: e => { this.saving.set(false); this.error.set(errorMessage(e, tk('Unable to save changes. Please try again.'))); }
    });
  }

  async remove(u: InventoryUnit) {
    const answer = await this.confirm.ask({
      title: tk('Delete this unit?'),
      message: msg('{product} with serial number {serial} will be removed from stock. This is recorded in the audit log.', { product: u.productName, serial: u.serialNumber }),
      confirmLabel: tk('Delete'), danger: true, reasonLabel: tk('Reason (required)')
    });
    if (!answer.confirmed) return;
    this.api.deleteUnit(u._id, answer.reason).subscribe({
      next: () => void this.router.navigate(this.portal.link('inventory')),
      error: e => this.error.set(errorMessage(e, tk('Unable to delete this unit. Please try again.')))
    });
  }

  private load() {
    const id = this.route.snapshot.paramMap.get('unitId') ?? '';
    this.api.unit(id).subscribe({
      next: ({ unit, product, sale }) => { this.unit.set(unit); this.product.set(product); this.sale.set(sale); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load this unit.'))); }
    });
  }
}
