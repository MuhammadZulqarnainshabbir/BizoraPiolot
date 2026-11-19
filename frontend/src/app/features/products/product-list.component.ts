import { Component, DestroyRef, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PagedList, SortOption } from '../../core/paged-list';
import { PortalService } from '../../core/portal.service';
import { Employee, ShopDataService } from '../../core/shop-data.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { PagerComponent } from '../../core/ui/pager.component';
import { InventoryUnit, StockSummary, UnitStatus } from './product.models';
import { ProductsApiService } from './products-api.service';
import { UNIT_STATUS_LABEL, actorLabel, errorMessage } from './shared';

/**
 * Every inventory unit with its serial number. Used as a page in both portals and, with
 * `embedded`, inside the partner overview's expandable "Total product units" card.
 */
@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PagerComponent, ...I18N_PIPES],
  template: `
    <div [class.workspace-content]="!embedded">
      <div *ngIf="!embedded" class="page-heading">
        <div><div class="eyebrow">{{ 'INVENTORY' | t }}</div><h1>{{ 'Inventory' | t }}</h1><p>{{ 'Every unit in stock, each with its own serial number.' | t }}</p></div>
        <div class="heading-actions">
          <a class="btn-outline record-cancel" [routerLink]="portal.link('inventory', 'products')">{{ 'Stock by product' | t }}</a>
          <a *ngIf="portal.can('inventory.add')" class="btn btn-small record-add-button" [routerLink]="portal.link('inventory', 'add')">{{ '＋ Add stock' | t }}</a>
        </div>
      </div>

      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>

      <div *ngIf="summary() as s" class="status-chips" role="group" [attr.aria-label]="'Filter by status' | t">
        <button type="button" [class.active]="!status" (click)="setStatus('')">{{ 'All units' | t }} <b>{{ s.total }}</b></button>
        <button type="button" [class.active]="status === 'AVAILABLE'" (click)="setStatus('AVAILABLE')">{{ 'Available' | t }} <b>{{ s.available }}</b></button>
        <button type="button" [class.active]="status === 'SOLD_FULL_PRICE'" (click)="setStatus('SOLD_FULL_PRICE')">{{ 'Sold at full price' | t }} <b>{{ s.soldFullPrice }}</b></button>
        <button type="button" [class.active]="status === 'SOLD_INSTALLMENT'" (click)="setStatus('SOLD_INSTALLMENT')">{{ 'Sold on installment' | t }} <b>{{ s.soldInstallment }}</b></button>
        <button *ngIf="s.needsSerial" type="button" class="chip-warning" [class.active]="needsSerial" (click)="toggleNeedsSerial()">{{ 'Serial needed' | t }} <b>{{ s.needsSerial }}</b></button>
      </div>

      <section class="surface-card data-page-card">
        <div class="data-page-toolbar">
          <div><h2>{{ 'Units' | t }}</h2><p>{{ list.total() === 1 ? ('1 unit' | t) : ('{count} units' | t:{ count: list.total() }) }}</p></div>
          <div class="list-controls">
            <label class="list-search"><span class="visually-hidden">{{ 'Search inventory' | t }}</span><input type="search" [placeholder]="'Serial, product, brand, model' | t" maxlength="100" [value]="initialSearch" (input)="list.search($any($event.target).value)"></label>
            <label *ngIf="portal.can('sales.viewAll')" class="list-sort"><span class="visually-hidden">{{ 'Added by' | t }}</span>
              <select [ngModel]="addedBy" (ngModelChange)="addedBy = $event; list.goTo(1)">
                <option value="">{{ 'Added by anyone' | t }}</option>
                <option value="owner">{{ 'Shop owner' | t }}</option>
                <option *ngFor="let e of employees()" [value]="e._id">{{ e.name }} ({{ e.employeeId }})</option>
              </select></label>
            <label *ngIf="!portal.can('sales.viewAll')" class="list-sort"><span class="visually-hidden">{{ 'Added by' | t }}</span>
              <select [ngModel]="addedBy" (ngModelChange)="addedBy = $event; list.goTo(1)">
                <option value="">{{ 'Added by anyone' | t }}</option>
                <option value="me">{{ 'Added by me' | t }}</option>
              </select></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sort units' | t }}</span><select [ngModel]="list.sort" (ngModelChange)="list.changeSort($event)"><option *ngFor="let o of sortOptions" [value]="o.value">{{ o.label | t }}</option></select></label>
          </div>
        </div>
        <div *ngIf="list.loading() && !list.loaded()" class="record-loading" role="status">{{ 'Loading inventory...' | t }}</div>
        <div *ngIf="list.loaded() && list.records().length" class="table-wrap" [class.is-refreshing]="list.loading()">
          <table class="record-table">
            <thead><tr><th>{{ 'PRODUCT' | t }}</th><th>{{ 'SERIAL NUMBER' | t }}</th><th>{{ 'STATUS' | t }}</th><th>{{ 'PRICE' | t }}</th><th>{{ 'ADDED BY' | t }}</th><th>{{ 'DATE ADDED' | t }}</th><th>{{ 'ACTIONS' | t }}</th></tr></thead>
            <tbody><tr *ngFor="let unit of list.records()">
              <td><a class="record-primary row-link" [routerLink]="portal.link('inventory', 'units', unit._id)">{{ unit.productName }}</a><small class="record-secondary">{{ unit.brand }} · {{ unit.model }}</small></td>
              <td><code class="serial" dir="ltr">{{ unit.serialNumber }}</code><span *ngIf="unit.serialPending" class="sale-badge sale-overdue serial-flag">{{ 'Serial needed' | t }}</span></td>
              <td><span class="sale-badge" [ngClass]="statusClass(unit.status)">{{ statusLabel[unit.status] | t }}</span></td>
              <td>{{ unit.sellingPriceCents / 100 | tMoney }}</td>
              <td>{{ seller(unit) | t }}</td>
              <td>{{ unit.createdAt | tDate:'medium' }}</td>
              <td>
                <div class="record-actions">
                  <a [routerLink]="portal.link('inventory', 'units', unit._id)">{{ 'View' | t }}</a>
                  <ng-container *ngIf="canSell(unit)">
                    <button type="button" [attr.aria-expanded]="sellMenu() === unit._id" (click)="sellMenu.set(sellMenu() === unit._id ? null : unit._id)">{{ 'Mark as sold' | t }}</button>
                  </ng-container>
                </div>
                <div *ngIf="sellMenu() === unit._id" class="sell-menu">
                  <a [routerLink]="portal.link('sell', 'full-price', unit._id)">{{ 'Sold at full price' | t }}</a>
                  <a [routerLink]="portal.link('sell', 'installment', unit._id)">{{ 'Sold on installment' | t }}</a>
                </div>
              </td>
            </tr></tbody>
          </table>
        </div>
        <app-pager [list]="list"></app-pager>
        <div *ngIf="list.loaded() && !list.records().length" class="table-empty"><span class="empty-icon">▤</span>
          <strong>{{ hasFilters() ? ('No matching units' | t) : ('No stock yet' | t) }}</strong>
          <span>{{ hasFilters() ? ('Try a different search or filter.' | t) : ('Add products with their serial numbers to start your inventory.' | t) }}</span>
          <a *ngIf="!hasFilters() && portal.can('inventory.add')" class="text-link empty-add-link" [routerLink]="portal.link('inventory', 'add')">{{ 'Add stock' | t }} <span>→</span></a>
        </div>
      </section>
    </div>
  `
})
export class ProductListComponent implements OnInit {
  /** Shown inside another page (no heading). */
  @Input() embedded = false;
  portal = inject(PortalService);
  private api = inject(ProductsApiService);
  private shopData = inject(ShopDataService);
  private route = inject(ActivatedRoute);
  readonly statusLabel = UNIT_STATUS_LABEL;
  readonly sortOptions: SortOption[] = [
    { value: 'createdAt:desc', label: tk('Newest first') },
    { value: 'createdAt:asc', label: tk('Oldest first') },
    { value: 'productName:asc', label: tk('Product A–Z') },
    { value: 'sellingPriceCents:desc', label: tk('Price: high to low') },
    { value: 'sellingPriceCents:asc', label: tk('Price: low to high') }
  ];
  status: UnitStatus | '' = '';
  addedBy = '';
  needsSerial = false;
  initialSearch = '';
  error = signal<Msg>('');
  summary = signal<StockSummary | null>(null);
  employees = signal<Employee[]>([]);
  sellMenu = signal<string | null>(null);
  list = new PagedList<InventoryUnit>(
    query => this.api.units(query, { status: this.status, addedBy: this.addedBy, needsSerial: this.needsSerial ? 'true' : '' }),
    inject(DestroyRef),
    error => this.error.set(errorMessage(error, tk('Unable to load inventory. Please try again.'))),
    'createdAt:desc'
  );

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    this.status = (q.get('status') as UnitStatus) ?? '';
    this.needsSerial = q.get('needsSerial') === 'true';
    this.addedBy = q.get('addedBy') ?? '';
    this.initialSearch = q.get('search') ?? '';
    if (this.initialSearch) this.list.search(this.initialSearch); else this.list.reload();
    this.list.autoRefresh();
    this.loadSummary();
    if (this.portal.can('sales.viewAll')) {
      this.shopData.employees({ page: 1, limit: 100, search: '', sort: 'name', order: 'asc' }).subscribe({ next: p => this.employees.set(p.records), error: () => undefined });
    }
  }

  setStatus(status: UnitStatus | '') { this.status = status; this.needsSerial = false; this.list.goTo(1); }
  toggleNeedsSerial() { this.needsSerial = !this.needsSerial; this.status = ''; this.list.goTo(1); }
  hasFilters() { return Boolean(this.list.searchTerm() || this.status || this.addedBy || this.needsSerial); }
  canSell(unit: InventoryUnit) { return unit.status === 'AVAILABLE' && !unit.serialPending && this.portal.can('sales.create'); }
  seller(unit: InventoryUnit) { return actorLabel(unit.addedBy); }
  statusClass(status: UnitStatus) { return status === 'AVAILABLE' ? 'sale-paid' : status === 'SOLD_FULL_PRICE' ? 'sale-due' : 'sale-partial'; }

  private loadSummary() {
    this.api.stockSummary().subscribe({ next: s => this.summary.set(s), error: () => undefined });
  }
}
