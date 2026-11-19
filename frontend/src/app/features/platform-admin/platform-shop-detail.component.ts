import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ConfirmService } from '../../core/ui/confirm.service';
import { Entitlements, Plan, PlatformApiService, ShopDiagnostics, ShopSummary, SubscriptionStatus, apiMessage, money } from './platform-api.service';
import { PlatformAuthService } from './platform-auth.service';

/**
 * One shop: business details, lifecycle actions (with a reason, audited), subscription and
 * feature entitlements, diagnostics for support, and the platform's history with the shop.
 * Deliberately no customer, sales or inventory records.
 */
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, JsonPipe],
  template: `
<section class="pa-page">
  <p><a routerLink="/platform-admin/shops" class="pa-link">← All shops</a></p>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  @if (message()) { <div class="pa-success" role="status">{{ message() }}</div> }
  @if (data(); as d) {
    <header class="pa-page-head">
      <div>
        <div class="pa-eyebrow">SHOP · {{ d.shop.shopCode ?? 'no code' }}</div>
        <h1>{{ d.shop.shopName }} <span class="pa-badge pa-badge-lg" [attr.data-status]="d.shop.status">{{ d.shop.status }}</span></h1>
        <p class="pa-muted">{{ d.shop.ownerName }} · {{ d.shop.email }} · {{ d.shop.phone }} · {{ d.shop.address }} · {{ d.shop.timezone }}</p>
        @if (d.shop.status !== 'ACTIVE') { <p class="pa-notice-inline"><strong>{{ d.shop.status }}</strong> since {{ d.shop.statusChangedAt | date:'medium' }} by {{ d.shop.statusChangedBy }}: {{ d.shop.statusReason }}</p> }
      </div>
      @if (auth.can('shops.manage')) {
        <div class="pa-actions">
          @if (d.shop.status === 'PENDING') { <button type="button" class="pa-btn" (click)="transition('approve')" [disabled]="busy()">Approve</button> }
          @if (d.shop.status === 'ACTIVE' || d.shop.status === 'PENDING') { <button type="button" class="pa-btn-danger" (click)="transition('suspend')" [disabled]="busy()">Suspend</button> }
          @if (d.shop.status === 'SUSPENDED' || d.shop.status === 'DEACTIVATED') { <button type="button" class="pa-btn" (click)="transition('reactivate')" [disabled]="busy()">Reactivate</button> }
          @if (d.shop.status !== 'DEACTIVATED') { <button type="button" class="pa-btn-outline" (click)="transition('deactivate')" [disabled]="busy()">Deactivate</button> }
        </div>
      }
    </header>

    <div class="pa-stats pa-stats-7">
      <div class="pa-stat"><span>Employees</span><strong>{{ d.counts.employees }}</strong><small>{{ d.counts.managers }} managers</small></div>
      <div class="pa-stat"><span>Products</span><strong>{{ d.counts.products }}</strong></div>
      <div class="pa-stat"><span>Units</span><strong>{{ d.counts.units }}</strong></div>
      <div class="pa-stat"><span>Completed sales</span><strong>{{ d.counts.completedSales }}</strong></div>
      <div class="pa-stat"><span>Active agreements</span><strong>{{ d.counts.activeAgreements }}</strong></div>
      <div class="pa-stat"><span>Customers</span><strong>{{ d.counts.customers }}</strong><small>count only</small></div>
      <div class="pa-stat"><span>Registered</span><strong class="pa-stat-date">{{ d.shop.createdAt | date:'mediumDate' }}</strong><small>last activity {{ d.shop.lastActivityAt ? (d.shop.lastActivityAt | date:'short') : '—' }}</small></div>
    </div>

    <div class="pa-grid-2">
      <div class="pa-card">
        <h2>Subscription</h2>
        <p class="pa-muted">Plan <strong>{{ d.entitlements.planName }}</strong> ({{ d.entitlements.planKey }}){{ d.entitlements.usingDefaultPlan ? ' — the platform default, no subscription record yet' : '' }}.
          Status <strong>{{ d.entitlements.subscriptionStatus }}</strong>@if (d.entitlements.lapsed) { <span class="pa-badge" data-status="SUSPENDED">lapsed: plan features off, records readable</span> }.
          @if (d.entitlements.trialEndsAt) { Trial ends {{ d.entitlements.trialEndsAt | date:'mediumDate' }}. } @if (d.entitlements.endsAt) { Ends {{ d.entitlements.endsAt | date:'mediumDate' }}. }</p>
        <p class="pa-small pa-muted">Limits: {{ limit(d.entitlements.limits.maxEmployees) }} employees · {{ limit(d.entitlements.limits.maxInventoryUnits) }} units · {{ limit(d.entitlements.limits.maxBranches) }} branches</p>
        @if (auth.can('subscriptions.manage')) {
          <form class="pa-form pa-form-grid" (ngSubmit)="saveSubscription()">
            <label>Plan<select [(ngModel)]="subForm.planKey" name="planKey" required>@for (p of plans(); track p.key) { <option [value]="p.key">{{ p.name }} ({{ p.key }}) · {{ price(p) }}</option> }</select></label>
            <label>Status<select [(ngModel)]="subForm.status" name="status">@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select></label>
            <label>Starts<input type="date" [(ngModel)]="subForm.startsAt" name="startsAt"></label>
            <label>Ends<input type="date" [(ngModel)]="subForm.endsAt" name="endsAt"></label>
            <label>Billing reference<input [(ngModel)]="subForm.billingReference" name="billingReference" maxlength="120" placeholder="Invoice or contract number"></label>
            <label>Notes<input [(ngModel)]="subForm.notes" name="notes" maxlength="500"></label>
            <label class="pa-span-2">Reason (audit log)<input [(ngModel)]="subForm.reason" name="reason" maxlength="500" placeholder="Why this change"></label>
            <div class="pa-span-2"><button class="pa-btn" type="submit" [disabled]="busy() || !subForm.planKey">Save subscription</button> <span class="pa-small pa-muted">No payment is taken: this records what the business agreed.</span></div>
          </form>
        }
      </div>
      <div class="pa-card">
        <h2>Features</h2>
        <p class="pa-muted pa-small">A feature works only when the plan (or an override) includes it AND the user has the shop permission.</p>
        <table class="pa-table pa-table-compact">
          <thead><tr><th>Feature</th><th>Available</th><th>Override</th>@if (auth.can('features.manage')) { <th></th> }</tr></thead>
          <tbody>
            @for (f of d.entitlements.catalog; track f.key) {
              <tr>
                <td>{{ f.label }}@if (!f.deployed) { <span class="pa-small pa-muted"> (planned)</span> }</td>
                <td><span class="pa-badge" [attr.data-status]="f.enabled ? 'ACTIVE' : 'DEACTIVATED'">{{ f.enabled ? 'Yes' : 'No' }}</span></td>
                <td class="pa-small pa-muted">@if (override(d.entitlements, f.key); as o) { {{ o.enabled ? 'forced on' : 'forced off' }}: {{ o.reason }} } @else { — }</td>
                @if (auth.can('features.manage')) {
                  <td class="pa-row-actions">
                    @if (override(d.entitlements, f.key)) { <button type="button" class="pa-link" (click)="clearFeature(f.key)" [disabled]="busy()">Remove override</button> }
                    @else { <button type="button" class="pa-link" (click)="setFeature(f.key, !f.enabled)" [disabled]="busy()">{{ f.enabled ? 'Force off' : 'Force on' }}</button> }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (auth.can('shops.diagnostics')) {
      <div class="pa-card">
        <h2>Support diagnostics</h2>
        @if (d.restrictions.length) {
          <ul class="pa-restrictions">@for (r of d.restrictions; track $index) { <li [attr.data-kind]="r.kind">{{ r.message }}</li> }</ul>
        } @else { <p class="pa-success">No restrictions: the shop can use everything its plan includes.</p> }
        <div class="pa-grid-3">
          <div><h3>Activity</h3><dl class="pa-dl"><dt>Last sign-in / renewal</dt><dd>{{ d.activity.lastActivityAt ? (d.activity.lastActivityAt | date:'short') : '—' }}</dd><dt>Last sale</dt><dd>{{ d.activity.lastSaleAt ? (d.activity.lastSaleAt | date:'short') : '—' }}</dd><dt>Last stock added</dt><dd>{{ d.activity.lastStockAddedAt ? (d.activity.lastStockAddedAt | date:'short') : '—' }}</dd></dl></div>
          <div><h3>Staff accounts</h3><dl class="pa-dl">@for (s of entries(d.staff); track s.key) { <dt>{{ s.key }}</dt><dd>{{ s.value }}</dd> } @empty { <dd class="pa-muted">No employees.</dd> }</dl></div>
          <div><h3>Recent shop activity</h3><ul class="pa-list pa-small">@for (a of d.recentShopAudit; track $index) { <li>{{ a.at | date:'short' }} · {{ a.action }} ({{ a.entityType }}) by {{ a.by }}</li> } @empty { <li class="pa-muted">Nothing recorded.</li> }</ul></div>
        </div>
      </div>
    }

    <div class="pa-card">
      <h2>Platform history with this shop</h2>
      <table class="pa-table pa-table-compact">
        <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Reason</th><th>Change</th></tr></thead>
        <tbody>
          @for (e of d.platformHistory; track e._id) {
            <tr><td>{{ e.createdAt | date:'short' }}</td><td>{{ e.adminEmail }}</td><td><code>{{ e.action }}</code></td><td>{{ e.reason }}</td><td class="pa-small pa-muted">@if (e.before || e.after) { {{ e.before | json }} → {{ e.after | json }} }</td></tr>
          } @empty { <tr><td colspan="5" class="pa-muted">No platform actions on this shop yet.</td></tr> }
        </tbody>
      </table>
    </div>
  } @else if (loading()) { <div class="pa-loading">Loading…</div> }
</section>`
})
export class PlatformShopDetailComponent {
  auth = inject(PlatformAuthService);
  private api = inject(PlatformApiService);
  private confirm = inject(ConfirmService);
  private id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  data = signal<ShopDiagnostics | null>(null);
  plans = signal<Plan[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  message = signal('');
  readonly statuses: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'];
  subForm = { planKey: '', status: 'ACTIVE' as SubscriptionStatus, startsAt: '', endsAt: '', billingReference: '', notes: '', reason: '' };

  constructor() {
    this.load();
    if (this.auth.can('plans.view')) this.api.plans().subscribe({ next: r => this.plans.set(r.plans.filter(p => p.active)), error: () => undefined });
  }

  load() {
    this.loading.set(true); this.error.set('');
    const request = this.auth.can('shops.diagnostics') ? this.api.diagnostics(this.id) : this.api.shop(this.id);
    request.subscribe({
      next: d => {
        const full = { restrictions: [], activity: { lastSaleAt: null, lastStockAddedAt: null, lastActivityAt: d.shop.lastActivityAt }, staff: {}, recentShopAudit: [], ...d } as ShopDiagnostics;
        this.data.set(full);
        const s = full.subscription;
        this.subForm = { planKey: s?.planKey ?? full.entitlements.planKey, status: s?.status ?? 'ACTIVE', startsAt: s?.startsAt?.slice(0, 10) ?? '', endsAt: s?.endsAt?.slice(0, 10) ?? '', billingReference: s?.billingReference ?? '', notes: s?.notes ?? '', reason: '' };
        this.loading.set(false);
      },
      error: err => { this.error.set(apiMessage(err, 'Unable to load the shop')); this.loading.set(false); }
    });
  }

  async transition(action: 'approve' | 'suspend' | 'reactivate' | 'deactivate') {
    const shop = this.data()?.shop as ShopSummary;
    const copy = {
      approve: { title: 'Approve this shop?', message: `${shop.shopName} will be able to sign in and start working.`, confirmLabel: 'Approve', danger: false },
      suspend: { title: 'Suspend this shop?', message: `Nobody from ${shop.shopName} will be able to sign in or use the apps until it is reactivated. Its records are kept.`, confirmLabel: 'Suspend', danger: true },
      reactivate: { title: 'Reactivate this shop?', message: `${shop.shopName} regains access immediately.`, confirmLabel: 'Reactivate', danger: false },
      deactivate: { title: 'Deactivate this shop?', message: `${shop.shopName} is closed on the platform. Records are kept and it can be reactivated later.`, confirmLabel: 'Deactivate', danger: true }
    }[action];
    const result = await this.confirm.ask({ ...copy, reasonLabel: 'Reason (required, kept in the audit log)' });
    if (!result.confirmed) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.transition(this.id, action, result.reason).subscribe({
      next: () => { this.busy.set(false); this.message.set(`Shop ${action}d.`); this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'The change was not applied')); this.load(); }
    });
  }

  saveSubscription() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    const f = this.subForm;
    this.api.setSubscription(this.id, { planKey: f.planKey, status: f.status, startsAt: f.startsAt || undefined, endsAt: f.endsAt || null, billingReference: f.billingReference, notes: f.notes, reason: f.reason }).subscribe({
      next: () => { this.busy.set(false); this.message.set('Subscription saved.'); this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to save the subscription')); }
    });
  }

  async setFeature(key: string, enabled: boolean) {
    const result = await this.confirm.ask({ title: `${enabled ? 'Force on' : 'Force off'}: ${key}`, message: 'This overrides the plan for this shop only and is recorded in the audit log.', confirmLabel: 'Apply', reasonLabel: 'Reason', reasonOptional: true });
    if (!result.confirmed) return;
    this.busy.set(true); this.error.set('');
    this.api.setFeature(this.id, key, enabled, result.reason).subscribe({
      next: () => { this.busy.set(false); this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to change the feature')); }
    });
  }

  clearFeature(key: string) {
    this.busy.set(true); this.error.set('');
    this.api.clearFeature(this.id, key).subscribe({
      next: () => { this.busy.set(false); this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to remove the override')); }
    });
  }

  override(e: Entitlements, key: string) { return e.overrides.find(o => o.featureKey === key); }
  entries(map: Record<string, number>) { return Object.entries(map).map(([key, value]) => ({ key, value })); }
  limit(value: number | null) { return value === null ? 'unlimited' : String(value); }
  price(p: Plan) { return p.priceCents ? `${money(p.priceCents)}/${p.billingPeriod === 'YEAR' ? 'year' : 'month'}` : 'no price set'; }
}
