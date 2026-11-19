import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EmployeeAuthService } from '../../core/employee-auth.service';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { EmployeePerformance, PartnerSummary, Product } from './product.models';
import { ProductsApiService } from './products-api.service';
import { errorMessage } from './shared';

/**
 * Manager home: the shop's operational picture (stock, sales totals, installments, team
 * activity) and shortcuts. Uses the same dashboard endpoints as the owner; the server leaves
 * cost figures out unless the manager has been granted inventory.viewCost.
 */
@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'SHOP DASHBOARD' | t }}</div><h1>{{ 'Good to see you, {name}' | t:{ name: auth.session()?.employee?.name || ('there' | t) } }}</h1><p>{{ 'Here’s what’s happening with the shop today.' | t }}</p></div>
        <a *ngIf="portal.can('inventory.add')" class="btn btn-small record-add-button" [routerLink]="portal.link('inventory', 'add')">{{ '＋ Add stock' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert summary-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="!summary() && !error()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <ng-container *ngIf="summary() as s">
        <div *ngIf="s.stock.needsSerial" class="record-alert employee-temp-alert" role="status">
          {{ s.stock.needsSerial === 1 ? ('1 unit from your old stock records needs its real serial number before it can be sold.' | t) : ('{count} units from your old stock records need their real serial numbers before they can be sold.' | t:{ count: s.stock.needsSerial }) }}
          <a class="text-link" [routerLink]="portal.link('inventory')" [queryParams]="{ needsSerial: 'true' }">{{ 'Fix now' | t }} <span>→</span></a>
        </div>
        <section class="metric-grid metric-grid-4" [attr.aria-label]="'Shop summary' | t">
          <a class="metric-card metric-link" [routerLink]="portal.link('inventory')">
            <div class="metric-card-top"><span>{{ 'Total product units' | t }}</span><span class="metric-icon metric-violet">▤</span></div>
            <strong>{{ s.stock.total }}</strong><small>{{ 'Every unit and its status' | t }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('inventory')" [queryParams]="{ status: 'AVAILABLE' }">
            <div class="metric-card-top"><span>{{ 'Available units' | t }}</span><span class="metric-icon metric-green">▤</span></div>
            <strong>{{ s.stock.available }}</strong><small>{{ 'Worth {amount} at selling price' | t:{ amount: (s.stock.availableSellingValueCents / 100 | tMoney) } }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('inventory')" [queryParams]="{ status: 'SOLD_FULL_PRICE' }">
            <div class="metric-card-top"><span>{{ 'Sold at full price' | t }}</span><span class="metric-icon metric-blue">✓</span></div>
            <strong>{{ s.stock.soldFullPrice }}</strong><small>{{ 'units' | t }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('inventory')" [queryParams]="{ status: 'SOLD_INSTALLMENT' }">
            <div class="metric-card-top"><span>{{ 'Sold on installment' | t }}</span><span class="metric-icon metric-blue">◔</span></div>
            <strong>{{ s.stock.soldInstallment }}</strong><small>{{ 'units' | t }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('sales', 'history')">
            <div class="metric-card-top"><span>{{ 'Today’s sales' | t }}</span><span class="metric-icon metric-green">↗</span></div>
            <strong>{{ s.sales.todayValueCents / 100 | tMoney }}</strong><small>{{ s.sales.todayCount === 1 ? ('1 sale' | t) : ('{count} sales' | t:{ count: s.sales.todayCount }) }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('sales', 'full-price')">
            <div class="metric-card-top"><span>{{ 'This month’s sales' | t }}</span><span class="metric-icon metric-green">₨</span></div>
            <strong>{{ s.sales.monthValueCents / 100 | tMoney }}</strong><small>{{ 'All time: {amount}' | t:{ amount: (s.sales.totalValueCents / 100 | tMoney) } }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('sales', 'installments')">
            <div class="metric-card-top"><span>{{ 'Active installment agreements' | t }}</span><span class="metric-icon metric-violet">◔</span></div>
            <strong>{{ s.installments.active }}</strong><small>{{ 'Outstanding {amount}' | t:{ amount: (s.installments.outstandingCents / 100 | tMoney) } }}</small></a>
          <a class="metric-card metric-link" [class.metric-alert]="s.installments.overdue" [routerLink]="portal.link('sales', 'installments')" [queryParams]="{ status: 'OVERDUE' }">
            <div class="metric-card-top"><span>{{ 'Overdue installments' | t }}</span><span class="metric-icon metric-red">!</span></div>
            <strong>{{ s.installments.overdueCents / 100 | tMoney }}</strong><small>{{ s.installments.overdue === 1 ? ('1 agreement' | t) : ('{count} agreements' | t:{ count: s.installments.overdue }) }}</small></a>
          <a *ngIf="outOfStock() !== null" class="metric-card metric-link" [routerLink]="portal.link('inventory', 'products')">
            <div class="metric-card-top"><span>{{ 'Products out of stock' | t }}</span><span class="metric-icon metric-red">▦</span></div>
            <strong>{{ outOfStock() }}</strong><small>{{ 'catalog products with no available unit' | t }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('customers')">
            <div class="metric-card-top"><span>{{ 'Customers' | t }}</span><span class="metric-icon metric-violet">☺</span></div>
            <strong>{{ s.customers.total }}</strong><small>{{ 'Details, CNIC pictures and purchase history' | t }}</small></a>
        </section>
      </ng-container>

      <section class="overview-lower-grid">
        <article *ngIf="portal.can('employees.view')" class="surface-card activity-card">
          <div class="surface-heading"><div><h2>{{ 'Team performance' | t }}</h2><p>{{ 'Stock added and sales made by each person.' | t }}</p></div><a [routerLink]="portal.link('team')" class="text-link">{{ 'Team' | t }} <span>→</span></a></div>
          <div *ngIf="team().length; else noTeam" class="table-wrap">
            <table class="record-table">
              <thead><tr><th>{{ 'NAME' | t }}</th><th>{{ 'UNITS ADDED' | t }}</th><th>{{ 'FULL PRICE' | t }}</th><th>{{ 'INSTALLMENT' | t }}</th><th>{{ 'TOTAL SALES' | t }}</th></tr></thead>
              <tbody><tr *ngFor="let e of team()">
                <td><span class="record-primary">{{ e.type === 'owner' ? ('Shop owner' | t) : e.name }}</span><small *ngIf="e.employeeId" class="record-secondary" dir="ltr">{{ e.employeeId }}</small></td>
                <td>{{ e.unitsAdded }}</td>
                <td>{{ e.fullPriceCount }} <small class="record-secondary">{{ e.fullPriceCents / 100 | tMoney }}</small></td>
                <td>{{ e.installmentCount }} <small class="record-secondary">{{ e.installmentCents / 100 | tMoney }}</small></td>
                <td><strong>{{ e.totalSalesCents / 100 | tMoney }}</strong></td>
              </tr></tbody>
            </table>
          </div>
          <ng-template #noTeam><p class="record-secondary">{{ 'No activity yet.' | t }}</p></ng-template>
        </article>
        <article id="shop-management" class="surface-card quick-links-card nav-target">
          <div class="surface-heading"><div><h2>{{ 'Quick actions' | t }}</h2><p>{{ 'Everything you need, in one place.' | t }}</p></div></div>
          <a *ngIf="portal.can('inventory.add')" class="quick-link" [routerLink]="portal.link('inventory', 'add')"><span class="quick-link-icon quick-blue">＋</span><span><strong>{{ 'Add stock' | t }}</strong><small>{{ 'New units with serial numbers' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('inventory')"><span class="quick-link-icon quick-blue">▤</span><span><strong>{{ 'Inventory' | t }}</strong><small>{{ 'Find a unit by serial number and sell it' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('sales', 'full-price')"><span class="quick-link-icon quick-green">↗</span><span><strong>{{ 'Full-price sales' | t }}</strong><small>{{ 'Totals by day, week and month' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('sales', 'installments')"><span class="quick-link-icon quick-green">◔</span><span><strong>{{ 'Installment sales' | t }}</strong><small>{{ 'Payments and balances' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('customers')"><span class="quick-link-icon quick-purple">☺</span><span><strong>{{ 'Customers' | t }}</strong><small>{{ 'Details, CNIC pictures and purchase history' | t }}</small></span><b>→</b></a>
        </article>
      </section>
    </div>
  `
})
export class ManagerOverviewComponent implements OnInit {
  auth = inject(EmployeeAuthService);
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  summary = signal<PartnerSummary | null>(null);
  team = signal<EmployeePerformance[]>([]);
  outOfStock = signal<number | null>(null);
  error = signal<Msg>('');

  ngOnInit() {
    this.api.partnerSummary().subscribe({ next: s => this.summary.set(s), error: e => this.error.set(errorMessage(e, tk('Unable to load the shop summary.'))) });
    if (this.portal.can('employees.view')) this.api.employeePerformance().subscribe({ next: t => this.team.set(t), error: () => undefined });
    this.api.products({ page: 1, limit: 100, search: '', sort: 'updatedAt', order: 'desc' }).subscribe({
      next: p => this.outOfStock.set(p.records.filter((x: Product) => (x.stock?.AVAILABLE ?? 0) === 0).length),
      error: () => undefined
    });
  }
}
