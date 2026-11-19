import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList, SortOption } from '../../core/paged-list';
import { PortalService } from '../../core/portal.service';
import { Employee, ShopDataService } from '../../core/shop-data.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { PagerComponent } from '../../core/ui/pager.component';
import { FullPriceStats, Sale } from './product.models';
import { ProductsApiService } from './products-api.service';
import { PAYMENT_METHOD_LABEL, SALE_STATUS_LABEL, actorLabel, errorMessage, saveBlob } from './shared';

/**
 * Full-price sales. Owners: whole shop, metrics, per-employee totals, filters and CSV export.
 * Employees: "My full-price sales" (the server only returns their own).
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PagerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'SALES' | t }}</div><h1>{{ isOwner ? ('Full-price sales' | t) : ('My full-price sales' | t) }}</h1>
          <p>{{ isOwner ? ('Every unit sold at full price, by whom and when.' | t) : ('Units you sold at full price.' | t) }}</p></div>
        <div class="heading-actions">
          <a class="btn-outline record-cancel" [routerLink]="portal.link('sales', 'installments')">{{ 'Installment sales' | t }}</a>
          <button *ngIf="portal.can('reports.export')" type="button" class="btn btn-small" [disabled]="exporting()" (click)="export()">{{ exporting() ? ('Preparing...' | t) : ('Export CSV' | t) }}</button>
        </div>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>

      <ng-container *ngIf="stats() as s">
        <section class="metric-grid" [attr.aria-label]="'Full-price sales totals' | t">
          <article class="metric-card"><span>{{ 'TODAY' | t }}</span><strong>{{ s.totals.todayCents / 100 | tMoney }}</strong><small>{{ s.totals.todayCount === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: s.totals.todayCount }) }}</small></article>
          <article class="metric-card"><span>{{ 'THIS WEEK' | t }}</span><strong>{{ s.totals.weekCents / 100 | tMoney }}</strong><small>{{ s.totals.weekCount === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: s.totals.weekCount }) }}</small></article>
          <article class="metric-card"><span>{{ 'THIS MONTH' | t }}</span><strong>{{ s.totals.monthCents / 100 | tMoney }}</strong><small>{{ s.totals.monthCount === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: s.totals.monthCount }) }}</small></article>
          <article class="metric-card"><span>{{ 'ALL TIME' | t }}</span><strong>{{ s.totals.valueCents / 100 | tMoney }}</strong><small>{{ 'Discounts given: {amount}' | t:{ amount: (s.totals.discountCents / 100 | tMoney) } }}</small></article>
        </section>

        <div class="dashboard-two-col">
          <section class="surface-card data-page-card">
            <div class="data-page-toolbar"><div><h2>{{ 'Sales by employee' | t }}</h2></div></div>
            <div *ngIf="s.byEmployee.length; else noSellers" class="table-wrap">
              <table class="record-table"><thead><tr><th>{{ 'SOLD BY' | t }}</th><th>{{ 'SALES' | t }}</th><th>{{ 'VALUE' | t }}</th></tr></thead>
                <tbody><tr *ngFor="let e of s.byEmployee">
                  <td>{{ e.type === 'owner' ? ('Shop owner' | t) : e.name }} <small *ngIf="e.employeeId" class="record-secondary" dir="ltr">{{ e.employeeId }}</small></td>
                  <td>{{ e.count }}</td><td>{{ e.valueCents / 100 | tMoney }}</td></tr></tbody></table>
            </div>
            <ng-template #noSellers><p class="record-secondary">{{ 'No sales yet.' | t }}</p></ng-template>
          </section>
          <section class="surface-card data-page-card">
            <div class="data-page-toolbar"><div><h2>{{ 'Sales over time' | t }}</h2></div>
              <div class="status-chips compact" role="group" [attr.aria-label]="'Period' | t">
                <button type="button" [class.active]="period() === 'daily'" (click)="period.set('daily')">{{ 'Daily' | t }}</button>
                <button type="button" [class.active]="period() === 'weekly'" (click)="period.set('weekly')">{{ 'Weekly' | t }}</button>
                <button type="button" [class.active]="period() === 'monthly'" (click)="period.set('monthly')">{{ 'Monthly' | t }}</button>
              </div></div>
            <div *ngIf="s.series[period()].length; else noSeries" class="table-wrap">
              <table class="record-table"><thead><tr><th>{{ 'PERIOD' | t }}</th><th>{{ 'SALES' | t }}</th><th>{{ 'VALUE' | t }}</th></tr></thead>
                <tbody><tr *ngFor="let p of s.series[period()]"><td><ng-container *ngIf="period() === 'weekly'">{{ 'Week of' | t }} </ng-container>{{ p.period | tDate:(period() === 'monthly' ? 'MMM y' : 'mediumDate') }}</td><td>{{ p.count }}</td><td>{{ p.valueCents / 100 | tMoney }}</td></tr></tbody></table>
            </div>
            <ng-template #noSeries><p class="record-secondary">{{ 'No sales yet.' | t }}</p></ng-template>
          </section>
        </div>
      </ng-container>

      <section class="surface-card data-page-card">
        <div class="data-page-toolbar">
          <div><h2>{{ 'Sales' | t }}</h2><p>{{ list.total() === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: list.total() }) }}</p></div>
          <div class="list-controls">
            <label class="list-search"><span class="visually-hidden">{{ 'Search sales' | t }}</span><input type="search" [placeholder]="'Sale no., serial, product, customer' | t" maxlength="100" (input)="list.search($any($event.target).value)"></label>
            <label *ngIf="isOwner" class="list-sort"><span class="visually-hidden">{{ 'Sold by' | t }}</span>
              <select [ngModel]="soldBy" (ngModelChange)="soldBy = $event; list.goTo(1)">
                <option value="">{{ 'Sold by anyone' | t }}</option>
                <option value="owner">{{ 'Shop owner' | t }}</option>
                <option *ngFor="let e of employees()" [value]="e._id">{{ e.name }} ({{ e.employeeId }})</option>
              </select></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Status' | t }}</span>
              <select [ngModel]="status" (ngModelChange)="status = $event; list.goTo(1)">
                <option value="">{{ 'Any status' | t }}</option>
                <option value="COMPLETED">{{ 'Completed' | t }}</option>
                <option value="REFUNDED">{{ 'Refunded' | t }}</option>
                <option value="CANCELLED">{{ 'Cancelled' | t }}</option>
              </select></label>
            <label class="list-date">{{ 'From' | t }}<input type="date" [ngModel]="from" (ngModelChange)="from = $event; list.goTo(1)"></label>
            <label class="list-date">{{ 'To' | t }}<input type="date" [ngModel]="to" (ngModelChange)="to = $event; list.goTo(1)"></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sort sales' | t }}</span><select [ngModel]="list.sort" (ngModelChange)="list.changeSort($event)"><option *ngFor="let o of sortOptions" [value]="o.value">{{ o.label | t }}</option></select></label>
          </div>
        </div>
        <div *ngIf="list.loading() && !list.loaded()" class="record-loading" role="status">{{ 'Loading sales...' | t }}</div>
        <div *ngIf="list.loaded() && list.records().length" class="table-wrap" [class.is-refreshing]="list.loading()">
          <table class="record-table">
            <thead><tr><th>{{ 'SALE' | t }}</th><th>{{ 'PRODUCT' | t }}</th><th>{{ 'SERIAL NUMBER' | t }}</th><th>{{ 'PRICE' | t }}</th><th>{{ 'PAYMENT' | t }}</th><th *ngIf="isOwner">{{ 'SOLD BY' | t }}</th><th>{{ 'DATE' | t }}</th><th>{{ 'STATUS' | t }}</th></tr></thead>
            <tbody><tr *ngFor="let s of list.records()" [class.sale-cancelled]="s.status !== 'COMPLETED'">
              <td><a class="row-link" [routerLink]="portal.link('sales', s._id)"><code dir="ltr">{{ s.saleNumber }}</code></a></td>
              <td><span class="record-primary">{{ s.item.productName }}</span><small class="record-secondary">{{ s.customer.name || ('Walk-in customer' | t) }}</small></td>
              <td><code class="serial" dir="ltr">{{ s.item.serialNumber }}</code></td>
              <td><span class="record-primary">{{ s.salePriceCents / 100 | tMoney }}</span><small *ngIf="s.discountCents" class="record-secondary">{{ '{amount} off' | t:{ amount: (s.discountCents / 100 | tMoney) } }}</small></td>
              <td>{{ methodLabel[s.paymentMethod] | t }}</td>
              <td *ngIf="isOwner">{{ seller(s) | t }}</td>
              <td>{{ s.soldAt | tDate:'medium' }}</td>
              <td><span class="sale-badge" [ngClass]="s.status === 'COMPLETED' ? 'sale-paid' : 'sale-overdue'">{{ statusLabel[s.status] | t }}</span></td>
            </tr></tbody>
          </table>
        </div>
        <app-pager [list]="list"></app-pager>
        <div *ngIf="list.loaded() && !list.records().length" class="table-empty"><span class="empty-icon">₨</span>
          <strong>{{ hasFilters() ? ('No matching sales' | t) : ('No full-price sales yet' | t) }}</strong>
          <span>{{ hasFilters() ? ('Try a different search or filter.' | t) : ('Use “Mark as sold” on an inventory unit to record a sale.' | t) }}</span>
        </div>
      </section>
    </div>
  `
})
export class FullPriceSalesComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private shopData = inject(ShopDataService);
  readonly isOwner = this.portal.can('sales.viewAll');
  readonly methodLabel = PAYMENT_METHOD_LABEL;
  readonly statusLabel = SALE_STATUS_LABEL;
  readonly sortOptions: SortOption[] = [
    { value: 'soldAt:desc', label: tk('Newest first') },
    { value: 'soldAt:asc', label: tk('Oldest first') },
    { value: 'salePriceCents:desc', label: tk('Price: high to low') },
    { value: 'salePriceCents:asc', label: tk('Price: low to high') }
  ];
  soldBy = '';
  status = '';
  from = '';
  to = '';
  error = signal<Msg>('');
  stats = signal<FullPriceStats | null>(null);
  employees = signal<Employee[]>([]);
  period = signal<'daily' | 'weekly' | 'monthly'>('daily');
  exporting = signal(false);
  list = new PagedList<Sale>(
    query => this.isOwner ? this.api.fullPriceSales(query, this.filters()) : this.api.mySales(query, { ...this.filters(), type: 'FULL_PRICE' }),
    inject(DestroyRef),
    e => this.error.set(errorMessage(e, tk('Unable to load sales. Please try again.'))),
    'soldAt:desc'
  );

  ngOnInit() {
    this.list.reload();
    this.list.autoRefresh();
    if (this.isOwner) {
      this.api.fullPriceStats().subscribe({ next: s => this.stats.set(s), error: () => undefined });
      this.shopData.employees({ page: 1, limit: 100, search: '', sort: 'name', order: 'asc' }).subscribe({ next: p => this.employees.set(p.records), error: () => undefined });
    }
  }

  filters() { return { soldBy: this.soldBy, status: this.status, from: this.from, to: this.to }; }
  hasFilters() { return Boolean(this.list.searchTerm() || this.soldBy || this.status || this.from || this.to); }
  seller(s: Sale) { return actorLabel(s.soldBy); }

  export() {
    this.exporting.set(true);
    this.api.exportSales('full-price', { ...this.filters(), search: this.list.searchTerm() }).subscribe({
      next: res => { this.exporting.set(false); if (res.body) saveBlob(res.body, res.headers.get('Content-Disposition'), 'full-price-sales.csv'); },
      error: e => { this.exporting.set(false); this.error.set(errorMessage(e, tk('Unable to export sales.'))); }
    });
  }
}
