import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PagedList, SortOption } from '../../core/paged-list';
import { PortalService } from '../../core/portal.service';
import { Employee, ShopDataService } from '../../core/shop-data.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { PagerComponent } from '../../core/ui/pager.component';
import { Agreement, AgreementDisplayStatus, InstallmentStats } from './product.models';
import { ProductsApiService } from './products-api.service';
import { AGREEMENT_STATUS_LABEL, actorLabel, errorMessage, saveBlob } from './shared';

export const AGREEMENT_STATUS_CLASS: Record<AgreementDisplayStatus, string> = {
  ACTIVE: 'sale-partial', COMPLETED: 'sale-paid', OVERDUE: 'sale-overdue', CANCELLED: 'sale-cancelled'
};

/**
 * Installment agreements. Owners: whole shop, metrics, filters and CSV export.
 * Employees: "My installment sales" (read-only; the server only returns their own).
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PagerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'SALES' | t }}</div><h1>{{ isOwner ? ('Installment sales' | t) : ('My installment sales' | t) }}</h1>
          <p>{{ isOwner ? ('Every installment agreement, what has been collected and what is still due.' | t) : ('Installment agreements for units you sold. Payments are recorded by the shop owner.' | t) }}</p></div>
        <div class="heading-actions">
          <a class="btn-outline record-cancel" [routerLink]="portal.link('sales', 'full-price')">{{ isOwner ? ('Full-price sales' | t) : ('My full-price sales' | t) }}</a>
          <button *ngIf="portal.can('reports.export')" type="button" class="btn btn-small" [disabled]="exporting()" (click)="export()">{{ exporting() ? ('Preparing...' | t) : ('Export CSV' | t) }}</button>
        </div>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>

      <section *ngIf="stats() as s" class="metric-grid" [attr.aria-label]="'Installment totals' | t">
        <article class="metric-card"><span>{{ 'TOTAL INSTALLMENT SALES' | t }}</span><strong>{{ s.totalSalesValueCents / 100 | tMoney }}</strong><small>{{ s.salesCount === 1 ? ('1 agreement' | t) : ('{count} agreements' | t:{ count: s.salesCount }) }}</small></article>
        <article class="metric-card"><span>{{ 'DOWN PAYMENTS COLLECTED' | t }}</span><strong>{{ s.downPaymentsCollectedCents / 100 | tMoney }}</strong></article>
        <article class="metric-card"><span>{{ 'INSTALLMENTS COLLECTED' | t }}</span><strong>{{ s.installmentPaymentsCollectedCents / 100 | tMoney }}</strong><small>{{ 'Total collected: {amount}' | t:{ amount: (s.totalCollectedCents / 100 | tMoney) } }}</small></article>
        <article class="metric-card"><span>{{ 'OUTSTANDING BALANCE' | t }}</span><strong>{{ s.outstandingCents / 100 | tMoney }}</strong></article>
        <article class="metric-card" [class.metric-alert]="s.overdueAgreements"><span>{{ 'OVERDUE' | t }}</span><strong>{{ s.overdueCents / 100 | tMoney }}</strong><small>{{ s.overdueAgreements === 1 ? ('1 agreement' | t) : ('{count} agreements' | t:{ count: s.overdueAgreements }) }}</small></article>
        <article class="metric-card"><span>{{ 'AGREEMENTS' | t }}</span><strong>{{ s.activeAgreements }}</strong><small>{{ '{active} active · {completed} completed · {cancelled} cancelled' | t:{ active: s.activeAgreements, completed: s.completedAgreements, cancelled: s.cancelledAgreements } }}</small></article>
      </section>

      <div class="status-chips" role="group" [attr.aria-label]="'Filter by status' | t">
        <button type="button" [class.active]="!status" (click)="setStatus('')">{{ 'All' | t }}</button>
        <button type="button" [class.active]="status === 'ACTIVE'" (click)="setStatus('ACTIVE')">{{ 'Active' | t }}</button>
        <button type="button" class="chip-warning" [class.active]="status === 'OVERDUE'" (click)="setStatus('OVERDUE')">{{ 'Overdue' | t }}</button>
        <button type="button" [class.active]="status === 'COMPLETED'" (click)="setStatus('COMPLETED')">{{ 'Completed' | t }}</button>
        <button type="button" [class.active]="status === 'CANCELLED'" (click)="setStatus('CANCELLED')">{{ 'Cancelled' | t }}</button>
      </div>

      <section class="surface-card data-page-card">
        <div class="data-page-toolbar">
          <div><h2>{{ 'Agreements' | t }}</h2><p>{{ list.total() === 1 ? ('1 agreement' | t) : ('{count} agreements' | t:{ count: list.total() }) }}</p></div>
          <div class="list-controls">
            <label class="list-search"><span class="visually-hidden">{{ 'Search agreements' | t }}</span><input type="search" [placeholder]="'Agreement no., serial, customer, phone' | t" maxlength="100" (input)="list.search($any($event.target).value)"></label>
            <label *ngIf="isOwner" class="list-sort"><span class="visually-hidden">{{ 'Sold by' | t }}</span>
              <select [ngModel]="soldBy" (ngModelChange)="soldBy = $event; list.goTo(1)">
                <option value="">{{ 'Sold by anyone' | t }}</option>
                <option value="owner">{{ 'Shop owner' | t }}</option>
                <option *ngFor="let e of employees()" [value]="e._id">{{ e.name }} ({{ e.employeeId }})</option>
              </select></label>
            <label class="list-date">{{ 'From' | t }}<input type="date" [ngModel]="from" (ngModelChange)="from = $event; list.goTo(1)"></label>
            <label class="list-date">{{ 'To' | t }}<input type="date" [ngModel]="to" (ngModelChange)="to = $event; list.goTo(1)"></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sort agreements' | t }}</span><select [ngModel]="list.sort" (ngModelChange)="list.changeSort($event)"><option *ngFor="let o of sortOptions" [value]="o.value">{{ o.label | t }}</option></select></label>
          </div>
        </div>
        <div *ngIf="list.loading() && !list.loaded()" class="record-loading" role="status">{{ 'Loading agreements...' | t }}</div>
        <div *ngIf="list.loaded() && list.records().length" class="table-wrap" [class.is-refreshing]="list.loading()">
          <table class="record-table">
            <thead><tr><th>{{ 'AGREEMENT' | t }}</th><th>{{ 'CUSTOMER' | t }}</th><th>{{ 'PRODUCT' | t }}</th><th>{{ 'TOTAL' | t }}</th><th>{{ 'COLLECTED' | t }}</th><th>{{ 'BALANCE' | t }}</th><th>{{ 'NEXT DUE' | t }}</th><th *ngIf="isOwner">{{ 'SOLD BY' | t }}</th><th>{{ 'STATUS' | t }}</th></tr></thead>
            <tbody><tr *ngFor="let a of list.records()" [class.sale-cancelled]="a.status === 'CANCELLED'">
              <td><a class="row-link" [routerLink]="portal.link('sales', 'installments', a._id)"><code dir="ltr">{{ a.agreementNumber }}</code></a><small class="record-secondary">{{ a.createdAt | tDate:'mediumDate' }}</small></td>
              <td><span class="record-primary">{{ a.customer.name }}</span><small class="record-secondary" dir="ltr">{{ a.customer.phone }}</small></td>
              <td><span class="record-primary">{{ a.item.productName }}</span><small class="record-secondary"><code dir="ltr">{{ a.item.serialNumber }}</code></small></td>
              <td>{{ a.totalPriceCents / 100 | tMoney }}</td>
              <td>{{ a.collectedCents / 100 | tMoney }}</td>
              <td><strong>{{ a.balanceCents / 100 | tMoney }}</strong></td>
              <td><ng-container *ngIf="a.nextDueDate; else noDue"><span class="record-primary">{{ a.nextDueDate | tDate:'mediumDate' }}</span><small class="record-secondary">{{ a.nextDueCents! / 100 | tMoney }}</small></ng-container><ng-template #noDue>—</ng-template></td>
              <td *ngIf="isOwner">{{ seller(a) | t }}</td>
              <td><span class="sale-badge" [ngClass]="statusClass[a.displayStatus]">{{ statusLabel[a.displayStatus] | t }}</span></td>
            </tr></tbody>
          </table>
        </div>
        <app-pager [list]="list"></app-pager>
        <div *ngIf="list.loaded() && !list.records().length" class="table-empty"><span class="empty-icon">₨</span>
          <strong>{{ hasFilters() ? ('No matching agreements' | t) : ('No installment sales yet' | t) }}</strong>
          <span>{{ hasFilters() ? ('Try a different search or filter.' | t) : ('Use “Mark as sold” on an inventory unit to sell it on installment.' | t) }}</span>
        </div>
      </section>
    </div>
  `
})
export class InstallmentSalesComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private shopData = inject(ShopDataService);
  private route = inject(ActivatedRoute);
  readonly isOwner = this.portal.can('sales.viewAll');
  readonly statusLabel = AGREEMENT_STATUS_LABEL;
  readonly statusClass = AGREEMENT_STATUS_CLASS;
  readonly sortOptions: SortOption[] = [
    { value: 'createdAt:desc', label: tk('Newest first') },
    { value: 'createdAt:asc', label: tk('Oldest first') },
    { value: 'nextDueDate:asc', label: tk('Next due date') },
    { value: 'balanceCents:desc', label: tk('Largest balance') }
  ];
  status = '';
  soldBy = '';
  from = '';
  to = '';
  error = signal<Msg>('');
  stats = signal<InstallmentStats | null>(null);
  employees = signal<Employee[]>([]);
  exporting = signal(false);
  list = new PagedList<Agreement>(
    query => this.api.installmentSales(query, this.filters()),
    inject(DestroyRef),
    e => this.error.set(errorMessage(e, tk('Unable to load installment sales. Please try again.'))),
    'createdAt:desc'
  );

  ngOnInit() {
    this.status = this.route.snapshot.queryParamMap.get('status') ?? '';
    this.list.reload();
    this.list.autoRefresh();
    if (this.isOwner) {
      this.api.installmentStats().subscribe({ next: s => this.stats.set(s), error: () => undefined });
      this.shopData.employees({ page: 1, limit: 100, search: '', sort: 'name', order: 'asc' }).subscribe({ next: p => this.employees.set(p.records), error: () => undefined });
    }
  }

  setStatus(status: string) { this.status = status; this.list.goTo(1); }
  filters() { return { status: this.status, soldBy: this.soldBy, from: this.from, to: this.to }; }
  hasFilters() { return Boolean(this.list.searchTerm() || this.status || this.soldBy || this.from || this.to); }
  seller(a: Agreement) { return actorLabel(a.soldBy); }

  export() {
    this.exporting.set(true);
    this.api.exportSales('installment', this.filters()).subscribe({
      next: res => { this.exporting.set(false); if (res.body) saveBlob(res.body, res.headers.get('Content-Disposition'), 'installment-sales.csv'); },
      error: e => { this.exporting.set(false); this.error.set(errorMessage(e, tk('Unable to export sales.'))); }
    });
  }
}
