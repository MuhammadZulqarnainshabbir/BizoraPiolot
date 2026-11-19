import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FeatureInfo, Plan, PlatformApiService, PlatformPage, Subscription, SubscriptionStatus, apiMessage, money } from './platform-api.service';
import { PlatformAuthService } from './platform-auth.service';

interface PlanForm { key: string; name: string; description: string; price: string; billingPeriod: 'MONTH' | 'YEAR'; trialDays: number; maxEmployees: string; maxInventoryUnits: string; maxBranches: string; features: Record<string, boolean>; active: boolean; sortOrder: number; reason: string; }

/** Subscription plans (editable, no payment provider) and the list of shop subscriptions. */
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
<section class="pa-page">
  <header class="pa-page-head">
    <div><div class="pa-eyebrow">SAAS</div><h1>Plans & subscriptions</h1><p class="pa-muted">Plans define features and limits. Prices are recorded for reporting only; no payment provider is connected.</p></div>
  </header>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  @if (message()) { <div class="pa-success" role="status">{{ message() }}</div> }

  <div class="pa-card pa-card-table">
    <table class="pa-table">
      <thead><tr><th>Plan</th><th>Price</th><th>Trial</th><th>Limits</th><th>Features</th><th>Active</th>@if (auth.can('plans.manage')) { <th></th> }</tr></thead>
      <tbody>
        @for (p of plans(); track p.key) {
          <tr>
            <td><strong>{{ p.name }}</strong> <code class="pa-small">{{ p.key }}</code><br><span class="pa-small pa-muted">{{ p.description }}</span></td>
            <td>{{ p.priceCents ? money(p.priceCents) + ' / ' + (p.billingPeriod === 'YEAR' ? 'year' : 'month') : 'not set' }}</td>
            <td>{{ p.trialDays ? p.trialDays + ' days' : '—' }}</td>
            <td class="pa-small">{{ limit(p.limits.maxEmployees) }} employees<br>{{ limit(p.limits.maxInventoryUnits) }} units<br>{{ limit(p.limits.maxBranches) }} branches</td>
            <td class="pa-small">{{ featureLabels(p.features) }}</td>
            <td>{{ p.active ? 'Yes' : 'No' }}</td>
            @if (auth.can('plans.manage')) { <td class="pa-row-actions"><button type="button" class="pa-link" (click)="edit(p)">Edit</button></td> }
          </tr>
        } @empty { <tr><td colspan="7" class="pa-empty">{{ loading() ? 'Loading…' : 'No plans.' }}</td></tr> }
      </tbody>
    </table>
  </div>

  @if (auth.can('plans.manage')) {
    <div class="pa-card">
      <h2>{{ editing() ? 'Edit plan ' + editing() : 'New plan' }}</h2>
      <form class="pa-form pa-form-grid" (ngSubmit)="save()">
        @if (!editing()) { <label>Key<input [(ngModel)]="form.key" name="key" required maxlength="40" placeholder="e.g. STARTER" pattern="[A-Za-z][A-Za-z0-9_]*"></label> }
        <label>Name<input [(ngModel)]="form.name" name="name" required maxlength="80"></label>
        <label class="pa-span-2">Description<input [(ngModel)]="form.description" name="description" maxlength="300"></label>
        <label>Price (Rs)<input type="number" min="0" step="0.01" [(ngModel)]="form.price" name="price"></label>
        <label>Billing period<select [(ngModel)]="form.billingPeriod" name="billingPeriod"><option value="MONTH">Monthly</option><option value="YEAR">Yearly</option></select></label>
        <label>Trial days<input type="number" min="0" max="365" [(ngModel)]="form.trialDays" name="trialDays"></label>
        <label>Sort order<input type="number" [(ngModel)]="form.sortOrder" name="sortOrder"></label>
        <label>Max employees<input type="number" min="0" [(ngModel)]="form.maxEmployees" name="maxEmployees" placeholder="empty = unlimited"></label>
        <label>Inventory capacity (units)<input type="number" min="0" [(ngModel)]="form.maxInventoryUnits" name="maxInventoryUnits" placeholder="empty = unlimited"></label>
        <label>Max branches<input type="number" min="0" [(ngModel)]="form.maxBranches" name="maxBranches" placeholder="empty = unlimited"></label>
        <label class="pa-check"><input type="checkbox" [(ngModel)]="form.active" name="active"> Active (can be assigned)</label>
        <fieldset class="pa-span-2 pa-fieldset"><legend>Features</legend>
          @for (f of features(); track f.key) { <label class="pa-check"><input type="checkbox" [(ngModel)]="form.features[f.key]" [name]="'f-' + f.key"> {{ f.label }}@if (!f.deployed) { <span class="pa-muted pa-small"> (planned)</span> }</label> }
        </fieldset>
        @if (editing()) { <label class="pa-span-2">Reason (audit log)<input [(ngModel)]="form.reason" name="reason" maxlength="500"></label> }
        <div class="pa-span-2"><button class="pa-btn" type="submit" [disabled]="busy() || !form.name || (!editing() && !form.key)">{{ editing() ? 'Save changes' : 'Create plan' }}</button> @if (editing()) { <button type="button" class="pa-btn-outline" (click)="reset()">Cancel</button> }</div>
      </form>
    </div>
  }

  <div class="pa-card pa-card-table">
    <div class="pa-card-head"><h2>Shop subscriptions</h2>
      <form class="pa-filters pa-filters-inline" (ngSubmit)="loadSubscriptions(1)">
        <label>Plan<input [(ngModel)]="subQuery.planKey" name="planKey" placeholder="e.g. BASIC" (change)="loadSubscriptions(1)"></label>
        <label>Status<select [(ngModel)]="subQuery.status" name="status" (change)="loadSubscriptions(1)"><option value="">Any</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select></label>
      </form>
    </div>
    <table class="pa-table">
      <thead><tr><th>Shop</th><th>Plan</th><th>Status</th><th>Starts</th><th>Ends / trial ends</th><th>Reference</th><th>Updated</th></tr></thead>
      <tbody>
        @for (s of subscriptions()?.items ?? []; track s.shopId) {
          <tr><td><a [routerLink]="['/platform-admin/shops', s.shopId]" class="pa-link">{{ s.shop?.shopName ?? s.shopId }}</a><br><span class="pa-small pa-muted">{{ s.shop?.shopCode }} · {{ s.shop?.status }}</span></td><td>{{ s.planKey }}</td><td>{{ s.status }}</td><td>{{ s.startsAt | date:'mediumDate' }}</td><td>{{ s.endsAt ? (s.endsAt | date:'mediumDate') : (s.trialEndsAt ? ('trial ' + (s.trialEndsAt | date:'mediumDate')) : '—') }}</td><td>{{ s.billingReference || '—' }}</td><td>{{ s.updatedAt | date:'short' }}</td></tr>
        } @empty { <tr><td colspan="7" class="pa-empty">No subscription records: shops without one use the default plan.</td></tr> }
      </tbody>
    </table>
    @if (subscriptions(); as p) {
      <nav class="pa-pager" aria-label="Subscription pages"><span>{{ p.total }} record{{ p.total === 1 ? '' : 's' }}</span>@if (p.totalPages > 1) { <div><button type="button" class="pa-btn-outline pa-btn-sm" (click)="loadSubscriptions(p.page - 1)" [disabled]="p.page <= 1">← Previous</button><span>Page {{ p.page }} of {{ p.totalPages }}</span><button type="button" class="pa-btn-outline pa-btn-sm" (click)="loadSubscriptions(p.page + 1)" [disabled]="p.page >= p.totalPages">Next →</button></div> }</nav>
    }
  </div>
</section>`
})
export class PlatformPlansComponent {
  auth = inject(PlatformAuthService);
  private api = inject(PlatformApiService);
  readonly money = money;
  readonly statuses: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'];
  plans = signal<Plan[]>([]);
  features = signal<FeatureInfo[]>([]);
  subscriptions = signal<PlatformPage<Subscription> | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  message = signal('');
  editing = signal<string | null>(null);
  form: PlanForm = this.blank();
  subQuery = { planKey: '', status: '' };

  constructor() { this.load(); this.loadSubscriptions(1); }

  load() {
    this.loading.set(true);
    this.api.plans().subscribe({
      next: r => { this.plans.set(r.plans); this.features.set(r.features); this.loading.set(false); },
      error: err => { this.error.set(apiMessage(err, 'Unable to load plans')); this.loading.set(false); }
    });
  }

  loadSubscriptions(page: number) {
    this.api.subscriptions({ ...this.subQuery, page, limit: 20 }).subscribe({ next: p => this.subscriptions.set(p), error: err => this.error.set(apiMessage(err, 'Unable to load subscriptions')) });
  }

  edit(p: Plan) {
    this.editing.set(p.key);
    this.form = { key: p.key, name: p.name, description: p.description, price: (p.priceCents / 100).toString(), billingPeriod: p.billingPeriod, trialDays: p.trialDays, maxEmployees: p.limits.maxEmployees === null ? '' : String(p.limits.maxEmployees), maxInventoryUnits: p.limits.maxInventoryUnits === null ? '' : String(p.limits.maxInventoryUnits), maxBranches: p.limits.maxBranches === null ? '' : String(p.limits.maxBranches), features: Object.fromEntries(this.features().map(f => [f.key, p.features.includes(f.key)])), active: p.active, sortOrder: p.sortOrder, reason: '' };
  }

  reset() { this.editing.set(null); this.form = this.blank(); }

  save() {
    const f = this.form;
    const limit = (v: string) => (v === '' || v === null || v === undefined ? null : Number(v));
    const body: Partial<Plan> & { reason?: string } = {
      name: f.name, description: f.description, priceCents: Math.round(Number(f.price || 0) * 100), billingPeriod: f.billingPeriod, trialDays: Number(f.trialDays || 0), sortOrder: Number(f.sortOrder || 0), active: f.active,
      limits: { maxEmployees: limit(f.maxEmployees), maxInventoryUnits: limit(f.maxInventoryUnits), maxBranches: limit(f.maxBranches) },
      features: Object.entries(f.features).filter(([, on]) => on).map(([key]) => key)
    };
    this.busy.set(true); this.error.set(''); this.message.set('');
    const request = this.editing() ? this.api.updatePlan(this.editing()!, { ...body, reason: f.reason }) : this.api.createPlan({ ...body, key: f.key });
    request.subscribe({
      next: r => { this.busy.set(false); this.message.set(`Plan ${r.plan.key} saved.`); this.reset(); this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to save the plan')); }
    });
  }

  limit(value: number | null) { return value === null ? 'Unlimited' : String(value); }
  featureLabels(keys: string[]) { const byKey = Object.fromEntries(this.features().map(f => [f.key, f.label])); return keys.map(k => byKey[k] ?? k).join(', ') || '—'; }
  private blank(): PlanForm { return { key: '', name: '', description: '', price: '0', billingPeriod: 'MONTH', trialDays: 0, maxEmployees: '', maxInventoryUnits: '', maxBranches: '', features: {}, active: true, sortOrder: 10, reason: '' }; }
}
