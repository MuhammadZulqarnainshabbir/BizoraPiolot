import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Analytics, PlatformApiService, apiMessage, money } from './platform-api.service';

interface Series { label: string; points: { month: string; count: number }[]; color: string; }

/** Platform-wide trends from real aggregates: registrations, sales volume (count), stock added, feature adoption. */
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
<section class="pa-page">
  <header class="pa-page-head">
    <div><div class="pa-eyebrow">INSIGHT</div><h1>Analytics</h1><p class="pa-muted">Counts across all shops. No shop amounts, no customer data; Bizora revenue is subscription-based only.</p></div>
    <form class="pa-filters pa-filters-inline" (ngSubmit)="load()">
      <label>From<input type="date" [(ngModel)]="query.from" name="from"></label>
      <label>To<input type="date" [(ngModel)]="query.to" name="to"></label>
      <button type="submit" class="pa-btn-outline">Apply</button>
    </form>
  </header>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  @if (data(); as d) {
    <div class="pa-stats">
      <div class="pa-stat"><span>Shops</span><strong>{{ d.shops.total | number }}</strong><small>{{ d.shops.ACTIVE }} active</small></div>
      <div class="pa-stat"><span>Staff accounts</span><strong>{{ d.users.employees | number }}</strong><small>{{ d.users.managers }} managers</small></div>
      <div class="pa-stat"><span>Inventory units</span><strong>{{ d.records.units | number }}</strong><small>{{ d.records.products | number }} products</small></div>
      <div class="pa-stat"><span>Sales recorded</span><strong>{{ d.records.sales | number }}</strong><small>{{ d.records.activeAgreements | number }} active installment agreements</small></div>
      <div class="pa-stat"><span>Recurring revenue</span><strong>{{ d.subscriptions.pricesConfigured ? money(d.subscriptions.mrrCents) : '—' }}</strong><small>{{ d.subscriptions.pricesConfigured ? 'per month, active subscriptions' : 'no plan prices configured' }}</small></div>
    </div>

    @for (s of series(); track s.label) {
      <div class="pa-card">
        <h2>{{ s.label }}</h2>
        <figure class="pa-figure">
          <svg [attr.viewBox]="'0 0 ' + (s.points.length * 46 + 10) + ' 150'" role="img" [attr.aria-label]="s.label + ' per month'">
            @for (p of s.points; track p.month; let i = $index) {
              <rect [attr.x]="i * 46 + 8" [attr.y]="120 - height(p.count, max(s), 100)" width="30" [attr.height]="height(p.count, max(s), 100)" rx="3" [attr.fill]="s.color"><title>{{ p.month }}: {{ p.count }}</title></rect>
              <text [attr.x]="i * 46 + 23" [attr.y]="115 - height(p.count, max(s), 100)" font-size="10" text-anchor="middle" fill="currentColor">{{ p.count }}</text>
              <text [attr.x]="i * 46 + 23" y="138" font-size="10" text-anchor="middle" fill="currentColor">{{ p.month }}</text>
            }
            <line x1="0" y1="120.5" [attr.x2]="s.points.length * 46 + 10" y2="120.5" stroke="currentColor" stroke-opacity=".3"></line>
          </svg>
          <figcaption>{{ s.label }} per month, {{ d.range.from | date:'mediumDate' }} – {{ d.range.to | date:'mediumDate' }}.@if (!s.points.length) { Nothing in this range. }</figcaption>
        </figure>
      </div>
    }

    <div class="pa-grid-2">
      <div class="pa-card">
        <h2>Feature adoption</h2>
        <p class="pa-muted pa-small">Shops whose plan includes each deployed feature (per-shop overrides are shown on the shop page).</p>
        <figure class="pa-figure">
          <svg [attr.viewBox]="'0 0 360 ' + (d.featureAdoption.length * 30)" role="img" aria-label="Shops entitled to each feature">
            @for (f of d.featureAdoption; track f.key; let i = $index) {
              <text x="0" [attr.y]="i * 30 + 18" font-size="12" fill="currentColor">{{ f.label }}</text>
              <rect x="150" [attr.y]="i * 30 + 6" [attr.width]="width(f.shops, d.shops.total, 170)" height="16" rx="4" fill="#A68A64"></rect>
              <text [attr.x]="156 + width(f.shops, d.shops.total, 170)" [attr.y]="i * 30 + 18" font-size="12" fill="currentColor">{{ f.shops }}</text>
            }
          </svg>
          <figcaption>Out of {{ d.shops.total }} shops.</figcaption>
        </figure>
      </div>
      <div class="pa-card">
        <h2>Subscriptions by plan</h2>
        <table class="pa-table pa-table-compact">
          <thead><tr><th>Plan</th><th class="pa-num">Shops</th></tr></thead>
          <tbody>
            @for (row of entries(d.subscriptions.byPlan); track row.key) { <tr><td>{{ row.key }}</td><td class="pa-num">{{ row.value }}</td></tr> }
            <tr><td>Default plan (no record)</td><td class="pa-num">{{ d.subscriptions.onDefaultPlan }}</td></tr>
          </tbody>
        </table>
        <h3>API since {{ d.api.since | date:'short' }}</h3>
        <p class="pa-small pa-muted">{{ d.api.totals.requests | number }} requests · {{ d.api.totals.avgLatencyMs }} ms average · error rate {{ d.api.totals.errorRate * 100 | number:'1.0-2' }}%</p>
      </div>
    </div>
  } @else if (loading()) { <div class="pa-loading">Loading…</div> }
</section>`
})
export class PlatformAnalyticsComponent {
  private api = inject(PlatformApiService);
  readonly money = money;
  query = { from: '', to: '' };
  data = signal<Analytics | null>(null);
  series = signal<Series[]>([]);
  loading = signal(true);
  error = signal('');

  constructor() { this.load(); }

  load() {
    this.loading.set(true); this.error.set('');
    this.api.analytics(this.query).subscribe({
      next: d => {
        this.data.set(d);
        this.series.set([
          { label: 'Shop registrations', points: d.registrationsByMonth, color: '#A68A64' },
          { label: 'Completed sales (count)', points: d.salesByMonth, color: '#2f6f50' },
          { label: 'Inventory units added', points: d.unitsAddedByMonth, color: '#6b655c' }
        ]);
        this.loading.set(false);
      },
      error: err => { this.error.set(apiMessage(err, 'Unable to load analytics')); this.loading.set(false); }
    });
  }

  max(s: Series) { return Math.max(1, ...s.points.map(p => p.count)); }
  height(value: number, max: number, h: number) { return value ? Math.max(2, Math.round((value / max) * h)) : 0; }
  width(value: number, total: number, w: number) { return total ? Math.max(value ? 2 : 0, Math.round((value / total) * w)) : 0; }
  entries(map: Record<string, number>) { return Object.entries(map).map(([key, value]) => ({ key, value })); }
}
