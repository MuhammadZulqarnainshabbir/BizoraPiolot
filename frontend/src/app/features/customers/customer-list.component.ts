import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PagedList, SortOption } from '../../core/paged-list';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { PagerComponent } from '../../core/ui/pager.component';
import { errorMessage } from '../products/shared';
import { Customer } from './customer.models';
import { CustomersApiService } from './customers-api.service';

/** Every customer of the shop, searchable by name, phone, CNIC or code. Used in both portals. */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PagerComponent, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'CUSTOMERS' | t }}</div><h1>{{ 'Customers' | t }}</h1><p>{{ 'Everyone who has bought from your shop, with their ID details and purchase history.' | t }}</p></div>
        <a *ngIf="portal.can('customers.manage')" class="btn btn-small record-add-button" [routerLink]="portal.link('customers', 'new')">{{ '＋ Add customer' | t }}</a>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>

      <section class="surface-card data-page-card">
        <div class="data-page-toolbar">
          <div><h2>{{ 'All customers' | t }}</h2><p>{{ list.searchTerm()
            ? (list.total() === 1 ? ('1 customer matching “{search}”' | t:{ search: list.searchTerm() }) : ('{count} customers matching “{search}”' | t:{ count: list.total(), search: list.searchTerm() }))
            : (list.total() === 1 ? ('1 customer' | t) : ('{count} customers' | t:{ count: list.total() })) }}</p></div>
          <div class="list-controls">
            <label class="list-search"><span class="visually-hidden">{{ 'Search customers' | t }}</span><input type="search" [placeholder]="'Name, phone, CNIC or code' | t" maxlength="100" [value]="initialSearch" (input)="list.search($any($event.target).value)"></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sort customers' | t }}</span><select [ngModel]="list.sort" (ngModelChange)="list.changeSort($event)"><option *ngFor="let o of sortOptions" [value]="o.value">{{ o.label | t }}</option></select></label>
          </div>
        </div>
        <div *ngIf="list.loading() && !list.loaded()" class="record-loading" role="status">{{ 'Loading customers...' | t }}</div>
        <div *ngIf="list.loaded() && list.records().length" class="table-wrap" [class.is-refreshing]="list.loading()">
          <table class="record-table">
            <thead><tr><th>{{ 'CUSTOMER' | t }}</th><th>{{ 'PHONE' | t }}</th><th>{{ 'CNIC' | t }}</th><th>{{ 'ADDRESS' | t }}</th><th>{{ 'ID PICTURES' | t }}</th><th>{{ 'ADDED' | t }}</th></tr></thead>
            <tbody><tr *ngFor="let c of list.records()">
              <td><a class="record-primary row-link" [routerLink]="portal.link('customers', c._id)">{{ c.name }}</a><small class="record-secondary" dir="ltr">{{ c.customerCode }}</small></td>
              <td dir="ltr">{{ c.phone }}</td>
              <td dir="ltr">{{ c.cnicFormatted || '—' }}</td>
              <td>{{ c.address || '—' }}</td>
              <td>{{ c.documents.length ? (c.documents.length === 1 ? ('1 picture' | t) : ('{count} pictures' | t:{ count: c.documents.length })) : ('None' | t) }}</td>
              <td>{{ c.createdAt | tDate:'mediumDate' }}</td>
            </tr></tbody>
          </table>
        </div>
        <app-pager [list]="list"></app-pager>
        <div *ngIf="list.loaded() && !list.records().length" class="table-empty"><span class="empty-icon">☺</span>
          <strong>{{ list.searchTerm() ? ('No matching customers' | t) : ('No customers yet' | t) }}</strong>
          <span>{{ list.searchTerm() ? ('Try a different name, phone or CNIC.' | t) : ('Customers are added here, or automatically when you record an installment sale.' | t) }}</span>
          <a *ngIf="!list.searchTerm() && portal.can('customers.manage')" class="text-link empty-add-link" [routerLink]="portal.link('customers', 'new')">{{ 'Add a customer' | t }} <span>→</span></a>
        </div>
      </section>
    </div>
  `
})
export class CustomerListComponent implements OnInit {
  portal = inject(PortalService);
  private api = inject(CustomersApiService);
  private route = inject(ActivatedRoute);
  readonly sortOptions: SortOption[] = [
    { value: 'updatedAt:desc', label: tk('Recently updated') },
    { value: 'createdAt:desc', label: tk('Newest first') },
    { value: 'name:asc', label: tk('Name A–Z') },
    { value: 'name:desc', label: tk('Name Z–A') }
  ];
  initialSearch = '';
  error = signal<Msg>('');
  list = new PagedList<Customer>(
    query => this.api.list(query),
    inject(DestroyRef),
    error => this.error.set(errorMessage(error, tk('Unable to load customers. Please try again.'))),
    'updatedAt:desc'
  );

  ngOnInit() {
    this.initialSearch = this.route.snapshot.queryParamMap.get('search') ?? '';
    if (this.initialSearch) this.list.search(this.initialSearch); else this.list.reload();
    this.list.autoRefresh();
  }
}
