import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dashboard, PlatformApiService, apiMessage, money } from './platform-api.service';
import { PlatformAuthService } from './platform-auth.service';

/** Platform overview: real counts from the database and real API metrics since the process started. */
@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
  template: `
<section class="pa-page">
  <header class="pa-page-head">
    <div><div class="pa-eyebrow">PLATFORM</div><h1>Dashboard</h1><p class="pa-muted">Live counts across every shop. Bizora revenue comes from subscriptions, never from shop sales.</p></div>
    <button type="button" class="pa-btn-outline" (click)="load()" [disabled]="loading()">Refresh</button>
  </header>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  @if (data(); as d) {
    <div class="pa-stats">
      <a class="pa-stat" routerLink="/platform-admin/shops"><span>Shops</span><strong>{{ d.shops.total | number }}</strong><small>{{ d.shops.ACTIVE }} active · {{ d.shops.SUSPENDED }} suspended</small></a>
      <a class="pa-stat" routerLink="/platform-admin/shops" [queryParams]="{ status: 'PENDING' }" [class.pa-stat-alert]="d.shops.PENDING > 0"><span>Awaiting approval</span><strong>{{ d.shops.PENDING | number }}</strong><small>{{ d.settings.registrationApproval === 'manual' ? 'Manual approval is on' : 'Registration is automatic' }}</small></a>
      <div class="pa-stat"><span>Users</span><strong>{{ d.users.owners + d.users.activeEmployees | number }}</strong><small>{{ d.users.owners }} owners · {{ d.users.activeEmployees }} active employees · {{ d.users.managers }} managers</small></div>
      <div class="pa-stat"><span>Monthly recurring revenue</span><strong>{{ d.subscriptions.pricesConfigured ? mrr() : '—' }}</strong><small>{{ d.subscriptions.pricesConfigured ? 'From active subscriptions at plan prices' : 'No plan prices configured yet' }}</small></div>
    </div>

    <div class="pa-grid-2">
      <div class="pa-card">
        <h2>Shops by status</h2>
        <figure class="pa-figure">
          <svg [attr.viewBox]="'0 0 320 ' + (statusRows().length * 34)" role="img" aria-label="Shops by lifecycle status">
            @for (row of statusRows(); track row.key; let i = $index) {
              <text [attr.x]="0" [attr.y]="i * 34 + 20" font-size="12" fill="currentColor">{{ row.key }}</text>
              <rect [attr.x]="110" [attr.y]="i * 34 + 8" [attr.width]="barWidth(row.value, d.shops.total, 170)" height="18" rx="4" [attr.fill]="row.color"></rect>
              <text [attr.x]="116 + barWidth(row.value, d.shops.total, 170)" [attr.y]="i * 34 + 21" font-size="12" fill="currentColor">{{ row.value }}</text>
            }
          </svg>
          <figcaption>Every shop counts once; deactivated shops keep their records.</figcaption>
        </figure>
      </div>
      <div class="pa-card">
        <h2>Subscriptions</h2>
        <table class="pa-table pa-table-compact">
          <thead><tr><th>Plan</th><th class="pa-num">Shops</th></tr></thead>
          <tbody>
            @for (row of planRows(); track row.key) { <tr><td>{{ row.key }}</td><td class="pa-num">{{ row.value }}</td></tr> }
            <tr><td>Default plan ({{ d.settings.defaultPlanKey }}), no subscription record</td><td class="pa-num">{{ d.subscriptions.onDefaultPlan }}</td></tr>
          </tbody>
        </table>
        <p class="pa-muted pa-small">Status: @for (s of statusEntries(d.subscriptions.byStatus); track s.key) { {{ s.key }} {{ s.value }}@if (!$last) {, } } @if (!statusEntries(d.subscriptions.byStatus).length) { no subscription records yet }</p>
      </div>
    </div>

    <div class="pa-grid-2">
      <div class="pa-card">
        <h2>API requests, last 24 hours</h2>
        <figure class="pa-figure">
          <svg viewBox="0 0 480 140" role="img" aria-label="API requests per hour for the last 24 hours">
            @for (h of d.api.hourly; track h.hour; let i = $index) {
              <rect [attr.x]="i * 20 + 2" [attr.y]="120 - barHeight(h.requests, maxHourly(), 100)" width="14" [attr.height]="barHeight(h.requests, maxHourly(), 100)" rx="2" fill="#A68A64"><title>{{ h.hour | date:'HH:mm' }}: {{ h.requests }} requests, {{ h.status5xx }} server errors</title></rect>
              @if (h.status5xx) { <rect [attr.x]="i * 20 + 2" [attr.y]="120 - barHeight(h.status5xx, maxHourly(), 100)" width="14" [attr.height]="barHeight(h.status5xx, maxHourly(), 100)" rx="2" fill="#c34b4b"></rect> }
            }
            <line x1="0" y1="120.5" x2="480" y2="120.5" stroke="currentColor" stroke-opacity=".3"></line>
            <text x="0" y="136" font-size="10" fill="currentColor">{{ d.api.hourly[0].hour | date:'HH:mm' }}</text>
            <text x="480" y="136" font-size="10" fill="currentColor" text-anchor="end">now</text>
          </svg>
          <figcaption>Gold: requests per hour; red: 5xx responses. Counted in this API process since {{ d.api.since | date:'medium' }} (restarts reset it).</figcaption>
        </figure>
        <p class="pa-small pa-muted">{{ d.api.totals.requests | number }} requests · average {{ d.api.totals.avgLatencyMs }} ms · {{ d.api.totals.status4xx }} client errors · {{ d.api.totals.status5xx }} server errors · up {{ uptime(d.api.uptimeSeconds) }}</p>
      </div>
      <div class="pa-card">
        <h2>Recent shops</h2>
        <table class="pa-table pa-table-compact">
          <thead><tr><th>Shop</th><th>Status</th><th>Registered</th></tr></thead>
          <tbody>
            @for (s of d.recentShops; track s._id) {
              <tr><td><a [routerLink]="['/platform-admin/shops', s._id]" class="pa-link">{{ s.shopName }}</a><br><span class="pa-small pa-muted">{{ s.shopCode }}</span></td><td><span class="pa-badge" [attr.data-status]="s.status">{{ s.status }}</span></td><td>{{ s.createdAt | date:'mediumDate' }}</td></tr>
            } @empty { <tr><td colspan="3" class="pa-muted">No shops yet.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>

    <div class="pa-card">
      <h2>Recent platform activity</h2>
      <table class="pa-table pa-table-compact">
        <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead>
        <tbody>
          @for (e of d.recentActivity; track e._id) {
            <tr><td>{{ e.createdAt | date:'short' }}</td><td>{{ e.adminEmail }}</td><td><code>{{ e.action }}</code></td><td>{{ e.targetLabel || e.targetId }}</td><td class="pa-muted">{{ e.reason }}</td></tr>
          } @empty { <tr><td colspan="5" class="pa-muted">No administrative actions recorded yet.</td></tr> }
        </tbody>
      </table>
      @if (auth.can('audit.view')) { <p><a routerLink="/platform-admin/audit-logs" class="pa-link">Full audit log →</a></p> }
    </div>
  } @else if (loading()) { <div class="pa-loading">Loading…</div> }
</section>`
})
export class PlatformDashboardComponent {
  auth = inject(PlatformAuthService);
  private api = inject(PlatformApiService);
  data = signal<Dashboard | null>(null);
  loading = signal(true);
  error = signal('');
  readonly colors: Record<string, string> = { ACTIVE: '#2f6f50', PENDING: '#b58a2a', SUSPENDED: '#c34b4b', DEACTIVATED: '#6b655c' };

  statusRows = computed(() => { const d = this.data(); return d ? (['ACTIVE', 'PENDING', 'SUSPENDED', 'DEACTIVATED'] as const).map(key => ({ key, value: d.shops[key], color: this.colors[key] })) : []; });
  planRows = computed(() => Object.entries(this.data()?.subscriptions.byPlan ?? {}).map(([key, value]) => ({ key, value })));
  maxHourly = computed(() => Math.max(1, ...(this.data()?.api.hourly.map(h => h.requests) ?? [1])));
  mrr = computed(() => money(this.data()?.subscriptions.mrrCents));

  constructor() { this.load(); }

  load() {
    this.loading.set(true); this.error.set('');
    this.api.dashboard().subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: err => { this.error.set(apiMessage(err, 'Unable to load the dashboard')); this.loading.set(false); }
    });
  }

  statusEntries(map: Record<string, number>) { return Object.entries(map).map(([key, value]) => ({ key, value })); }
  barWidth(value: number, total: number, max: number) { return total ? Math.max(value ? 2 : 0, Math.round((value / total) * max)) : 0; }
  barHeight(value: number, max: number, height: number) { return value ? Math.max(2, Math.round((value / max) * height)) : 0; }
  uptime(seconds: number) { const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; }
}
