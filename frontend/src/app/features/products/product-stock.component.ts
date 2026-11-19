import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList, SortOption } from '../../core/paged-list';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { PagerComponent } from '../../core/ui/pager.component';
import { InventoryUnit, Product } from './product.models';
import { ProductsApiService } from './products-api.service';
import { errorMessage } from './shared';

/** Stock grouped by product: available / sold counts, expandable to the available serial numbers. */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PagerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'INVENTORY' | t }}</div><h1>{{ 'Stock by product' | t }}</h1><p>{{ 'How many units of each product are available, with their serial numbers.' | t }}</p></div>
        <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory')">{{ '← Back to inventory' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <section class="surface-card data-page-card">
        <div class="data-page-toolbar">
          <div><h2>{{ 'Products' | t }}</h2><p>{{ list.total() === 1 ? ('1 product' | t) : ('{count} products' | t:{ count: list.total() }) }}</p></div>
          <div class="list-controls">
            <label class="list-search"><span class="visually-hidden">{{ 'Search products' | t }}</span><input type="search" [placeholder]="'Name, brand, model' | t" maxlength="100" (input)="list.search($any($event.target).value)"></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sort products' | t }}</span><select [ngModel]="list.sort" (ngModelChange)="list.changeSort($event)"><option *ngFor="let o of sortOptions" [value]="o.value">{{ o.label | t }}</option></select></label>
          </div>
        </div>
        <div *ngIf="list.loading() && !list.loaded()" class="record-loading" role="status">{{ 'Loading products...' | t }}</div>
        <div *ngIf="list.loaded() && list.records().length" class="table-wrap" [class.is-refreshing]="list.loading()">
          <table class="record-table">
            <thead><tr><th></th><th>{{ 'PRODUCT' | t }}</th><th>{{ 'CATEGORY' | t }}</th><th>{{ 'AVAILABLE' | t }}</th><th>{{ 'SOLD AT FULL PRICE' | t }}</th><th>{{ 'SOLD ON INSTALLMENT' | t }}</th></tr></thead>
            <tbody>
              <ng-container *ngFor="let p of list.records()">
                <tr>
                  <td><button type="button" class="expand-button" [attr.aria-expanded]="expanded() === p._id" [attr.aria-label]="expanded() === p._id ? ('Hide serial numbers' | t) : ('Show serial numbers' | t)" (click)="toggle(p)">{{ expanded() === p._id ? '▾' : '▸' }}</button></td>
                  <td><strong class="record-primary">{{ p.name }}</strong><small class="record-secondary">{{ p.brand }} · {{ p.model }} · {{ p.productCode }}</small></td>
                  <td><span class="record-primary">{{ p.category ? (p.category | t) : '—' }}</span><small *ngIf="p.subCategory" class="record-secondary">{{ p.subCategory | t }}</small></td>
                  <td><span class="sale-badge" [ngClass]="(p.stock?.AVAILABLE ?? 0) ? 'sale-paid' : 'sale-cancelled'">{{ p.stock?.AVAILABLE ?? 0 }}</span></td>
                  <td>{{ p.stock?.SOLD_FULL_PRICE ?? 0 }}</td>
                  <td>{{ p.stock?.SOLD_INSTALLMENT ?? 0 }}</td>
                </tr>
                <tr *ngIf="expanded() === p._id" class="expanded-row">
                  <td></td>
                  <td colspan="5">
                    <span *ngIf="loadingUnits()" class="record-secondary">{{ 'Loading...' | t }}</span>
                    <span *ngIf="!loadingUnits() && !units().length" class="record-secondary">{{ 'No units available.' | t }}</span>
                    <ul *ngIf="units().length" class="serial-list">
                      <li *ngFor="let u of units()"><a [routerLink]="portal.link('inventory', 'units', u._id)"><code dir="ltr">{{ u.serialNumber }}</code></a></li>
                    </ul>
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
        <app-pager [list]="list"></app-pager>
        <div *ngIf="list.loaded() && !list.records().length" class="table-empty"><span class="empty-icon">▤</span>
          <strong>{{ list.searchTerm() ? ('No matching products' | t) : ('No products yet' | t) }}</strong>
          <span>{{ list.searchTerm() ? ('Try a different search.' | t) : ('Add products with their serial numbers to start your inventory.' | t) }}</span>
        </div>
      </section>
    </div>
  `
})
export class ProductStockComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  readonly sortOptions: SortOption[] = [
    { value: 'name:asc', label: tk('Product A–Z') },
    { value: 'brand:asc', label: tk('Brand A–Z') },
    { value: 'updatedAt:desc', label: tk('Recently updated') }
  ];
  error = signal<Msg>('');
  expanded = signal<string | null>(null);
  units = signal<InventoryUnit[]>([]);
  loadingUnits = signal(false);
  list = new PagedList<Product>(
    query => this.api.products(query), inject(DestroyRef),
    e => this.error.set(errorMessage(e, tk('Unable to load products.'))), 'name:asc'
  );

  ngOnInit() { this.list.reload(); this.list.autoRefresh(); }

  toggle(p: Product) {
    if (this.expanded() === p._id) { this.expanded.set(null); return; }
    this.expanded.set(p._id);
    this.units.set([]);
    this.loadingUnits.set(true);
    this.api.units({ page: 1, limit: 100, search: '', sort: 'createdAt', order: 'asc' }, { productId: p._id, status: 'AVAILABLE' }).subscribe({
      next: page => { this.units.set(page.records); this.loadingUnits.set(false); },
      error: () => this.loadingUnits.set(false)
    });
  }
}
