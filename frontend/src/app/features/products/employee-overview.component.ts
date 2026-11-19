import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { scrollToFragment } from '../../core/scroll-to-fragment';
import { EmployeeAuthService } from '../../core/employee-auth.service';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { EmployeeSummary, StockSummary } from './product.models';
import { ProductsApiService } from './products-api.service';
import { errorMessage } from './shared';

/** Employee home: their own sales summary, shop stock counts and shortcuts. */
@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'MY SUMMARY' | t }}</div><h1>{{ 'Hello, {name}' | t:{ name: auth.session()?.employee?.name || ('there' | t) } }}</h1><p>{{ 'Your sales and the shop’s stock today.' | t }}</p></div>
        <a *ngIf="portal.can('inventory.add')" class="btn btn-small record-add-button" [routerLink]="portal.link('inventory', 'add')">{{ '＋ Add stock' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert summary-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="!summary() && !error()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <section *ngIf="summary() as s" class="metric-grid metric-grid-4" [attr.aria-label]="'My summary' | t">
        <article class="metric-card"><div class="metric-card-top"><span>{{ 'My sales today' | t }}</span><span class="metric-icon metric-green">↗</span></div>
          <strong>{{ s.todaySalesCents / 100 | tMoney }}</strong><small>{{ s.todayCount === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: s.todayCount }) }}</small></article>
        <article class="metric-card"><div class="metric-card-top"><span>{{ 'My sales this month' | t }}</span><span class="metric-icon metric-green">↗</span></div>
          <strong>{{ s.monthSalesCents / 100 | tMoney }}</strong><small>{{ s.monthCount === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: s.monthCount }) }}</small></article>
        <a class="metric-card metric-link" [routerLink]="portal.link('sales', 'full-price')"><div class="metric-card-top"><span>{{ 'Sold at full price' | t }}</span><span class="metric-icon metric-blue">✓</span></div>
          <strong>{{ s.fullPriceCount }}</strong><small>{{ 'units, all time' | t }}</small></a>
        <a class="metric-card metric-link" [routerLink]="portal.link('sales', 'installments')"><div class="metric-card-top"><span>{{ 'Sold on installment' | t }}</span><span class="metric-icon metric-violet">◔</span></div>
          <strong>{{ s.installmentCount }}</strong><small>{{ '{active} active · {overdue} overdue' | t:{ active: s.installments.active, overdue: s.installments.overdue } }}</small></a>
        <article class="metric-card"><div class="metric-card-top"><span>{{ 'My total sales' | t }}</span><span class="metric-icon metric-green">₨</span></div>
          <strong>{{ s.totalSalesCents / 100 | tMoney }}</strong><small>{{ 'Outstanding on my installments: {amount}' | t:{ amount: (s.installments.outstandingCents / 100 | tMoney) } }}</small></article>
        <a class="metric-card metric-link" [routerLink]="portal.link('inventory')" [queryParams]="{ addedBy: 'me' }"><div class="metric-card-top"><span>{{ 'Units I added' | t }}</span><span class="metric-icon metric-violet">▤</span></div>
          <strong>{{ s.unitsAdded }}</strong><small>{{ 'all time' | t }}</small></a>
        <a *ngIf="stock() as st" class="metric-card metric-link" [routerLink]="portal.link('inventory')" [queryParams]="{ status: 'AVAILABLE' }"><div class="metric-card-top"><span>{{ 'Available in shop' | t }}</span><span class="metric-icon metric-blue">▤</span></div>
          <strong>{{ st.available }}</strong><small>{{ 'units ready to sell' | t }}</small></a>
      </section>

      <section class="overview-lower-grid">
        <article id="shop-management" class="surface-card quick-links-card nav-target">
          <div class="surface-heading"><div><h2>{{ 'Quick actions' | t }}</h2><p>{{ 'Find a unit, then use “Mark as sold”.' | t }}</p></div></div>
          <a class="quick-link" [routerLink]="portal.link('inventory')"><span class="quick-link-icon quick-blue">▤</span><span><strong>{{ 'Inventory' | t }}</strong><small>{{ 'Find a unit by serial number and sell it' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('inventory', 'add')"><span class="quick-link-icon quick-blue">＋</span><span><strong>{{ 'Add stock' | t }}</strong><small>{{ 'New units with serial numbers' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('sales', 'full-price')"><span class="quick-link-icon quick-green">↗</span><span><strong>{{ 'My full-price sales' | t }}</strong><small>{{ 'Units you sold at full price' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('sales', 'installments')"><span class="quick-link-icon quick-green">◔</span><span><strong>{{ 'My installment sales' | t }}</strong><small>{{ 'Balances and due dates' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('customers')"><span class="quick-link-icon quick-purple">☺</span><span><strong>{{ 'Customers' | t }}</strong><small>{{ 'Details, CNIC pictures and purchase history' | t }}</small></span><b>→</b></a>
        </article>
      </section>
    </div>
  `
})
export class EmployeeOverviewComponent implements OnInit {
  auth = inject(EmployeeAuthService);
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  summary = signal<EmployeeSummary | null>(null);
  stock = signal<StockSummary | null>(null);
  error = signal<Msg>('');

  constructor() {
    // The nav's "Features" link opens this page at #shop-management.
    scrollToFragment(inject(ActivatedRoute), inject(DestroyRef));
  }

  ngOnInit() {
    this.api.employeeSummary().subscribe({ next: s => this.summary.set(s), error: e => this.error.set(errorMessage(e, tk('Unable to load your summary.'))) });
    this.api.stockSummary().subscribe({ next: s => this.stock.set(s), error: () => undefined });
  }
}
