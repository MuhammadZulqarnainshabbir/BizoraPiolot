import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PortalService } from '../../core/portal.service';
import { scrollToFragment } from '../../core/scroll-to-fragment';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { EmployeePerformance, PartnerSummary } from './product.models';
import { ProductListComponent } from './product-list.component';
import { ProductsApiService } from './products-api.service';
import { errorMessage } from './shared';

/** Owner home: stock and sales summary cards, team performance and shortcuts. */
@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ProductListComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'YOUR BUSINESS AT A GLANCE' | t }}</div><h1>{{ 'Good to see you, {name}' | t:{ name: auth.shop()?.ownerName || ('there' | t) } }}</h1><p>{{ 'Here’s what’s happening with your shop today.' | t }}</p></div>
        <a class="workspace-date" [routerLink]="portal.link('profile')"><span class="date-icon">◷</span> {{ 'Shop profile' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert summary-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="!summary() && !error()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>

      <ng-container *ngIf="summary() as s">
        <div *ngIf="s.stock.needsSerial" class="record-alert employee-temp-alert" role="status">
          {{ s.stock.needsSerial === 1 ? ('1 unit from your old stock records needs its real serial number before it can be sold.' | t) : ('{count} units from your old stock records need their real serial numbers before they can be sold.' | t:{ count: s.stock.needsSerial }) }}
          <a class="text-link" [routerLink]="portal.link('inventory')" [queryParams]="{ needsSerial: 'true' }">{{ 'Fix now' | t }} <span>→</span></a>
        </div>

        <section class="metric-grid metric-grid-4" [attr.aria-label]="'Shop summary' | t">
          <article class="metric-card metric-expandable" [class.is-open]="showUnits()">
            <button type="button" class="metric-toggle" [attr.aria-expanded]="showUnits()" aria-controls="overview-units" (click)="showUnits.set(!showUnits())">
              <div class="metric-card-top"><span>{{ 'Total product units' | t }}</span><span class="metric-icon metric-violet">{{ showUnits() ? '▾' : '▸' }}</span></div>
              <strong>{{ s.stock.total }}</strong><small>{{ showUnits() ? ('Hide the unit list' | t) : ('Show every unit' | t) }}</small>
            </button>
          </article>
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
            <div class="metric-card-top"><span>{{ 'Total sales value' | t }}</span><span class="metric-icon metric-green">↗</span></div>
            <strong>{{ s.sales.totalValueCents / 100 | tMoney }}</strong><small>{{ 'Today: {amount}' | t:{ amount: (s.sales.todayValueCents / 100 | tMoney) } }} · {{ 'This month: {amount}' | t:{ amount: (s.sales.monthValueCents / 100 | tMoney) } }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('sales', 'full-price')">
            <div class="metric-card-top"><span>{{ 'Full-price revenue' | t }}</span><span class="metric-icon metric-green">₨</span></div>
            <strong>{{ s.sales.fullPriceRevenueCents / 100 | tMoney }}</strong><small>{{ 'Total collected: {amount}' | t:{ amount: (s.collected.totalCents / 100 | tMoney) } }}</small></a>
          <a class="metric-card metric-link" [routerLink]="portal.link('sales', 'installments')">
            <div class="metric-card-top"><span>{{ 'Installment outstanding' | t }}</span><span class="metric-icon metric-violet">◔</span></div>
            <strong>{{ s.installments.outstandingCents / 100 | tMoney }}</strong><small>{{ s.installments.active === 1 ? ('1 active agreement' | t) : ('{count} active agreements' | t:{ count: s.installments.active }) }}</small></a>
          <a class="metric-card metric-link" [class.metric-alert]="s.installments.overdue" [routerLink]="portal.link('sales', 'installments')" [queryParams]="{ status: 'OVERDUE' }">
            <div class="metric-card-top"><span>{{ 'Overdue installments' | t }}</span><span class="metric-icon metric-red">!</span></div>
            <strong>{{ s.installments.overdueCents / 100 | tMoney }}</strong><small>{{ s.installments.overdue === 1 ? ('1 agreement' | t) : ('{count} agreements' | t:{ count: s.installments.overdue }) }}</small></a>
        </section>

        <section *ngIf="showUnits()" id="overview-units" class="overview-units">
          <app-product-list [embedded]="true"></app-product-list>
        </section>
      </ng-container>

      <section class="overview-lower-grid">
        <article class="surface-card activity-card">
          <div class="surface-heading"><div><h2>{{ 'Team performance' | t }}</h2><p>{{ 'Stock added and sales made by each person.' | t }}</p></div><a [routerLink]="portal.link('profile')" fragment="employees" class="text-link">{{ 'Employees' | t }} <span>→</span></a></div>
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
          <div class="surface-heading"><div><h2>{{ 'Shop management' | t }}</h2><p>{{ 'Everything you need, in one place.' | t }}</p></div></div>
          <a class="quick-link" [routerLink]="portal.link('inventory', 'add')"><span class="quick-link-icon quick-blue">＋</span><span><strong>{{ 'Add stock' | t }}</strong><small>{{ 'New units with serial numbers' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('inventory')"><span class="quick-link-icon quick-blue">▤</span><span><strong>{{ 'Inventory' | t }}</strong><small>{{ 'Every unit and its status' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('sales', 'full-price')"><span class="quick-link-icon quick-green">↗</span><span><strong>{{ 'Full-price sales' | t }}</strong><small>{{ 'Totals by day, week and month' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('sales', 'installments')"><span class="quick-link-icon quick-green">◔</span><span><strong>{{ 'Installment sales' | t }}</strong><small>{{ 'Payments and balances' | t }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('customers')"><span class="quick-link-icon quick-purple">☺</span><span><strong>{{ 'Customers' | t }}</strong><small>{{ summary()?.customers?.total ? ('{count} on record · CNIC pictures and purchase history' | t:{ count: summary()!.customers.total }) : ('Details, CNIC pictures and purchase history' | t) }}</small></span><b>→</b></a>
          <a class="quick-link" [routerLink]="portal.link('profile')" fragment="employees"><span class="quick-link-icon quick-purple">♙</span><span><strong>{{ 'Employees' | t }}</strong><small>{{ 'Accounts and login link' | t }}</small></span><b>→</b></a>
        </article>
      </section>
    </div>
  `
})
export class PartnerOverviewComponent implements OnInit {
  auth = inject(AuthService);
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  summary = signal<PartnerSummary | null>(null);
  team = signal<EmployeePerformance[]>([]);
  showUnits = signal(false);
  error = signal<Msg>('');

  constructor() {
    // The nav's "Features" link opens /partnerdashboard#shop-management.
    scrollToFragment(inject(ActivatedRoute), inject(DestroyRef));
  }

  ngOnInit() {
    this.api.partnerSummary().subscribe({ next: s => this.summary.set(s), error: e => this.error.set(errorMessage(e, tk('Unable to load your shop summary.'))) });
    this.api.employeePerformance().subscribe({ next: t => this.team.set(t), error: () => undefined });
  }
}
