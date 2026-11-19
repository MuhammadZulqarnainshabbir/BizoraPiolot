import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList, SortOption } from '../../core/paged-list';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { PagerComponent } from '../../core/ui/pager.component';
import { Sale } from './product.models';
import { ProductsApiService } from './products-api.service';
import { SALE_STATUS_LABEL, SALE_TYPE_LABEL, actorLabel, errorMessage } from './shared';

/** All sales of both kinds in one list: the whole shop for the owner, own sales for employees. */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PagerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'SALES' | t }}</div><h1>{{ isOwner ? ('Sales history' | t) : ('My sales' | t) }}</h1>
          <p>{{ 'Full-price and installment sales together, newest first.' | t }}</p></div>
        <div class="heading-actions">
          <a class="btn-outline record-cancel" [routerLink]="portal.link('sales', 'full-price')">{{ 'Full price' | t }}</a>
          <a class="btn-outline record-cancel" [routerLink]="portal.link('sales', 'installments')">{{ 'Installment' | t }}</a>
        </div>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <section class="surface-card data-page-card">
        <div class="data-page-toolbar">
          <div><h2>{{ 'Sales' | t }}</h2><p>{{ list.total() === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: list.total() }) }}</p></div>
          <div class="list-controls">
            <label class="list-search"><span class="visually-hidden">{{ 'Search sales' | t }}</span><input type="search" [placeholder]="'Sale no., serial, product, customer' | t" maxlength="100" (input)="list.search($any($event.target).value)"></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sale type' | t }}</span>
              <select [ngModel]="type" (ngModelChange)="type = $event; list.goTo(1)">
                <option value="">{{ 'All types' | t }}</option>
                <option value="FULL_PRICE">{{ 'Full price' | t }}</option>
                <option value="INSTALLMENT">{{ 'Installment' | t }}</option>
              </select></label>
            <label class="list-date">{{ 'From' | t }}<input type="date" [ngModel]="from" (ngModelChange)="from = $event; list.goTo(1)"></label>
            <label class="list-date">{{ 'To' | t }}<input type="date" [ngModel]="to" (ngModelChange)="to = $event; list.goTo(1)"></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sort sales' | t }}</span><select [ngModel]="list.sort" (ngModelChange)="list.changeSort($event)"><option *ngFor="let o of sortOptions" [value]="o.value">{{ o.label | t }}</option></select></label>
          </div>
        </div>
        <div *ngIf="list.loading() && !list.loaded()" class="record-loading" role="status">{{ 'Loading sales...' | t }}</div>
        <div *ngIf="list.loaded() && list.records().length" class="table-wrap" [class.is-refreshing]="list.loading()">
          <table class="record-table">
            <thead><tr><th>{{ 'SALE' | t }}</th><th>{{ 'TYPE' | t }}</th><th>{{ 'PRODUCT' | t }}</th><th>{{ 'SERIAL NUMBER' | t }}</th><th>{{ 'PRICE' | t }}</th><th>{{ 'PROGRESS' | t }}</th><th *ngIf="isOwner">{{ 'SOLD BY' | t }}</th><th>{{ 'DATE' | t }}</th><th>{{ 'STATUS' | t }}</th></tr></thead>
            <tbody><tr *ngFor="let s of list.records()" [class.sale-cancelled]="s.status !== 'COMPLETED'">
              <td><a class="row-link" [routerLink]="portal.link('sales', s._id)"><code dir="ltr">{{ s.saleNumber }}</code></a></td>
              <td>{{ typeLabel[s.type] | t }}</td>
              <td><span class="record-primary">{{ s.item.productName }}</span><small class="record-secondary">{{ s.customer.name || ('Walk-in customer' | t) }}</small></td>
              <td><code class="serial" dir="ltr">{{ s.item.serialNumber }}</code></td>
              <td>{{ s.salePriceCents / 100 | tMoney }}</td>
              <td><ng-container *ngIf="s.agreement as a; else fullyPaid">{{ '{collected} of {total}' | t:{ collected: (a.collectedCents / 100 | tMoney), total: (a.totalPriceCents / 100 | tMoney) } }}</ng-container>
                <ng-template #fullyPaid>{{ s.type === 'FULL_PRICE' ? ('Paid in full' | t) : '—' }}</ng-template></td>
              <td *ngIf="isOwner">{{ actor(s.soldBy) | t }}</td>
              <td>{{ s.soldAt | tDate:'medium' }}</td>
              <td><span class="sale-badge" [ngClass]="s.status === 'COMPLETED' ? 'sale-paid' : 'sale-overdue'">{{ statusLabel[s.status] | t }}</span></td>
            </tr></tbody>
          </table>
        </div>
        <app-pager [list]="list"></app-pager>
        <div *ngIf="list.loaded() && !list.records().length" class="table-empty"><span class="empty-icon">₨</span>
          <strong>{{ hasFilters() ? ('No matching sales' | t) : ('No sales yet' | t) }}</strong>
          <span>{{ hasFilters() ? ('Try a different search or filter.' | t) : ('Use “Mark as sold” on an inventory unit to record a sale.' | t) }}</span>
        </div>
      </section>
    </div>
  `
})
export class ProductSalesHistoryComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  readonly isOwner = this.portal.can('sales.viewAll');
  readonly statusLabel = SALE_STATUS_LABEL;
  readonly typeLabel = SALE_TYPE_LABEL;
  readonly actor = actorLabel;
  readonly sortOptions: SortOption[] = [
    { value: 'soldAt:desc', label: tk('Newest first') },
    { value: 'soldAt:asc', label: tk('Oldest first') },
    { value: 'salePriceCents:desc', label: tk('Price: high to low') }
  ];
  type = '';
  from = '';
  to = '';
  error = signal<Msg>('');
  list = new PagedList<Sale>(
    query => this.api.sales(query, { type: this.type, from: this.from, to: this.to }),
    inject(DestroyRef),
    e => this.error.set(errorMessage(e, tk('Unable to load sales. Please try again.'))),
    'soldAt:desc'
  );

  ngOnInit() { this.list.reload(); this.list.autoRefresh(); }
  hasFilters() { return Boolean(this.list.searchTerm() || this.type || this.from || this.to); }
}
