import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { Employee, ShopDataService } from '../../core/shop-data.service';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Msg, tk } from '../../core/i18n/i18n.service';
import { EmployeePerformance } from './product.models';
import { ProductsApiService } from './products-api.service';
import { errorMessage } from './shared';

interface TeamRow { employee: Employee; performance: EmployeePerformance | null; }

/** Manager's read-only view of the team: who works here and what each person has added and sold. Accounts are managed by the owner. */
@Component({
  standalone: true,
  imports: [CommonModule, ...I18N_PIPES],
  template: `
    <div class="workspace-content">
      <div class="page-heading">
        <div><div class="eyebrow">{{ 'TEAM' | t }}</div><h1>{{ 'Team' | t }}</h1><p>{{ 'Everyone with access to the shop and their sales performance. Accounts and permissions are managed by the shop owner.' | t }}</p></div>
      </div>
      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="loading()" class="record-loading" role="status">{{ 'Loading employees...' | t }}</div>
      <section *ngIf="!loading()" class="surface-card data-page-card">
        <div class="data-page-toolbar"><div><h2>{{ 'Your team' | t }}</h2><p>{{ rows().length === 1 ? ('1 employee' | t) : ('{count} employees' | t:{ count: rows().length }) }}</p></div></div>
        <div *ngIf="rows().length; else empty" class="table-wrap">
          <table class="record-table">
            <thead><tr><th>{{ 'EMPLOYEE' | t }}</th><th>{{ 'EMPLOYEE ID' | t }}</th><th>{{ 'ROLE' | t }}</th><th>{{ 'ACCESS' | t }}</th><th>{{ 'STATUS' | t }}</th><th>{{ 'UNITS ADDED' | t }}</th><th>{{ 'FULL PRICE' | t }}</th><th>{{ 'INSTALLMENT' | t }}</th><th>{{ 'TOTAL SALES' | t }}</th></tr></thead>
            <tbody><tr *ngFor="let r of rows()">
              <td><span class="employee-cell"><span class="employee-avatar">{{ r.employee.name.charAt(0).toUpperCase() }}</span><span><strong>{{ r.employee.name }}</strong><small class="record-secondary" dir="ltr">{{ r.employee.phone || r.employee.email }}</small></span></span></td>
              <td><code class="employee-id">{{ r.employee.employeeId }}</code></td>
              <td>{{ r.employee.role }}</td>
              <td>{{ (r.employee.accessRole === 'manager' ? 'Manager' : 'Employee') | t }}</td>
              <td><span class="employee-status" [class.employee-inactive]="r.employee.status === 'inactive'">{{ (r.employee.status === 'active' ? 'Active' : 'Inactive') | t }}</span></td>
              <td>{{ r.performance?.unitsAdded ?? 0 }}</td>
              <td>{{ r.performance?.fullPriceCount ?? 0 }} <small class="record-secondary">{{ (r.performance?.fullPriceCents ?? 0) / 100 | tMoney }}</small></td>
              <td>{{ r.performance?.installmentCount ?? 0 }} <small class="record-secondary">{{ (r.performance?.installmentCents ?? 0) / 100 | tMoney }}</small></td>
              <td><strong>{{ (r.performance?.totalSalesCents ?? 0) / 100 | tMoney }}</strong></td>
            </tr></tbody>
          </table>
        </div>
        <ng-template #empty><div class="table-empty"><span class="empty-icon">♙</span><strong>{{ 'No employees yet' | t }}</strong></div></ng-template>
      </section>
    </div>
  `
})
export class TeamComponent implements OnInit {
  portal = inject(PortalService);
  private data = inject(ShopDataService);
  private api = inject(ProductsApiService);
  rows = signal<TeamRow[]>([]);
  loading = signal(true);
  error = signal<Msg>('');

  ngOnInit() {
    forkJoin({
      employees: this.data.employees({ page: 1, limit: 100, search: '', sort: 'name', order: 'asc' }),
      performance: this.api.employeePerformance()
    }).subscribe({
      next: ({ employees, performance }) => {
        this.rows.set(employees.records.map(employee => ({ employee, performance: performance.find(p => p.id === employee._id) ?? null })));
        this.loading.set(false);
      },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, tk('Unable to load employees. Please try again.'))); }
    });
  }
}
