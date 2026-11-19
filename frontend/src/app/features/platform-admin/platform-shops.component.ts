import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlatformApiService, PlatformPage, ShopStatus, ShopSummary, apiMessage } from './platform-api.service';

/** Every shop on the platform: search, filter by status / plan / registration date, sort, page. */
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
<section class="pa-page">
  <header class="pa-page-head">
    <div><div class="pa-eyebrow">SHOPS</div><h1>Shop management</h1><p class="pa-muted">Business details and lifecycle only. Sales, inventory and customers stay inside each shop.</p></div>
  </header>
  <form class="pa-filters" (ngSubmit)="search()">
    <label>Search<input type="search" [(ngModel)]="query.search" name="search" placeholder="Shop name, code or owner email" (input)="searchSoon()"></label>
    <label>Status<select [(ngModel)]="query.status" name="status" (change)="search()"><option value="">Any</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select></label>
    <label>Plan<input [(ngModel)]="query.planKey" name="planKey" placeholder="e.g. BASIC" (change)="search()"></label>
    <label>Registered from<input type="date" [(ngModel)]="query.from" name="from" (change)="search()"></label>
    <label>to<input type="date" [(ngModel)]="query.to" name="to" (change)="search()"></label>
    <label>Sort<select [(ngModel)]="query.sort" name="sort" (change)="search()"><option value="createdAt">Registration date</option><option value="shopName">Name</option><option value="status">Status</option><option value="lastActivityAt">Last activity</option></select></label>
    <button type="submit" class="pa-btn-outline">Apply</button>
  </form>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  <div class="pa-card pa-card-table" [class.pa-refreshing]="loading()">
    <table class="pa-table">
      <thead><tr><th>Shop</th><th>Owner</th><th>Status</th><th>Plan</th><th>Registered</th><th>Last activity</th></tr></thead>
      <tbody>
        @for (s of page()?.items ?? []; track s._id) {
          <tr>
            <td><a [routerLink]="['/platform-admin/shops', s._id]" class="pa-link"><strong>{{ s.shopName }}</strong></a><br><span class="pa-small pa-muted">{{ s.shopCode ?? '—' }} · {{ s.address }}</span></td>
            <td>{{ s.ownerName }}<br><span class="pa-small pa-muted">{{ s.email }}</span></td>
            <td><span class="pa-badge" [attr.data-status]="s.status">{{ s.status }}</span>@if (s.statusReason && s.status !== 'ACTIVE') { <br><span class="pa-small pa-muted">{{ s.statusReason }}</span> }</td>
            <td>{{ s.subscription?.planKey ?? 'Default' }}@if (s.subscription) { <br><span class="pa-small pa-muted">{{ s.subscription.status }}</span> }</td>
            <td>{{ s.createdAt | date:'mediumDate' }}</td>
            <td>{{ s.lastActivityAt ? (s.lastActivityAt | date:'short') : '—' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="pa-empty">{{ loading() ? 'Loading…' : 'No shops match these filters.' }}</td></tr>
        }
      </tbody>
    </table>
    @if (page(); as p) {
      <nav class="pa-pager" aria-label="Pages">
        <span>{{ p.total }} shop{{ p.total === 1 ? '' : 's' }}</span>
        @if (p.totalPages > 1) {
          <div><button type="button" class="pa-btn-outline pa-btn-sm" (click)="goTo(p.page - 1)" [disabled]="p.page <= 1">← Previous</button><span>Page {{ p.page }} of {{ p.totalPages }}</span><button type="button" class="pa-btn-outline pa-btn-sm" (click)="goTo(p.page + 1)" [disabled]="p.page >= p.totalPages">Next →</button></div>
        }
      </nav>
    }
  </div>
</section>`
})
export class PlatformShopsComponent {
  private api = inject(PlatformApiService);
  private router = inject(Router);
  readonly statuses: ShopStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];
  query = { search: '', status: '', planKey: '', from: '', to: '', sort: 'createdAt', order: 'desc', page: 1 };
  page = signal<PlatformPage<ShopSummary> | null>(null);
  loading = signal(true);
  error = signal('');
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    this.query.status = q.get('status') ?? '';
    this.query.search = q.get('search') ?? '';
    this.load();
  }

  searchSoon() { clearTimeout(this.timer); this.timer = setTimeout(() => this.search(), 350); }
  search() { this.query.page = 1; this.load(); }
  goTo(page: number) { this.query.page = page; this.load(); }

  load() {
    this.loading.set(true); this.error.set('');
    void this.router.navigate([], { queryParams: { status: this.query.status || null, search: this.query.search || null }, replaceUrl: true });
    this.api.shops({ ...this.query, order: this.query.sort === 'shopName' ? 'asc' : 'desc', limit: 20 }).subscribe({
      next: p => { this.page.set(p); this.loading.set(false); },
      error: err => { this.error.set(apiMessage(err, 'Unable to load shops')); this.loading.set(false); }
    });
  }
}
