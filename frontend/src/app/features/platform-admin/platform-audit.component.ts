import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditEntry, PlatformApiService, PlatformPage, apiMessage } from './platform-api.service';

/** Every platform action and sign-in attempt, filterable; never mixed with shop audit logs. */
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, JsonPipe],
  template: `
<section class="pa-page">
  <header class="pa-page-head"><div><div class="pa-eyebrow">COMPLIANCE</div><h1>Audit log</h1><p class="pa-muted">Who did what on the platform, when, from where, and why.</p></div></header>
  <form class="pa-filters" (ngSubmit)="load(1)">
    <label>Action<select [(ngModel)]="query.action" name="action" (change)="load(1)"><option value="">Any</option>@for (a of actions(); track a) { <option [value]="a">{{ a }}</option> }</select></label>
    <label>Target id<input [(ngModel)]="query.targetId" name="targetId" placeholder="Shop or admin id" (change)="load(1)"></label>
    <label>From<input type="date" [(ngModel)]="query.from" name="from" (change)="load(1)"></label>
    <label>To<input type="date" [(ngModel)]="query.to" name="to" (change)="load(1)"></label>
    <button type="submit" class="pa-btn-outline">Apply</button>
  </form>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  <div class="pa-card pa-card-table">
    <table class="pa-table">
      <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Target</th><th>Reason</th><th>Outcome</th><th>IP</th><th></th></tr></thead>
      <tbody>
        @for (e of page()?.items ?? []; track e._id) {
          <tr>
            <td>{{ e.createdAt | date:'short' }}</td><td>{{ e.adminEmail || '—' }}</td><td><code>{{ e.action }}</code></td>
            <td>{{ e.targetLabel || e.targetId }}@if (e.targetType) { <br><span class="pa-small pa-muted">{{ e.targetType }} {{ e.targetId }}</span> }</td>
            <td>{{ e.reason }}</td><td><span class="pa-badge" [attr.data-status]="e.outcome === 'success' ? 'ACTIVE' : 'SUSPENDED'">{{ e.outcome }}</span></td><td class="pa-small pa-muted">{{ e.ip }}</td>
            <td class="pa-row-actions">@if (e.before || e.after) { <button type="button" class="pa-link" (click)="toggle(e._id)">{{ open() === e._id ? 'Hide' : 'Details' }}</button> }</td>
          </tr>
          @if (open() === e._id) { <tr class="pa-details-row"><td colspan="8"><strong>Before</strong> <pre>{{ e.before | json }}</pre><strong>After</strong> <pre>{{ e.after | json }}</pre></td></tr> }
        } @empty { <tr><td colspan="8" class="pa-empty">{{ loading() ? 'Loading…' : 'No entries match.' }}</td></tr> }
      </tbody>
    </table>
    @if (page(); as p) {
      <nav class="pa-pager" aria-label="Audit pages"><span>{{ p.total }} entr{{ p.total === 1 ? 'y' : 'ies' }}</span>@if (p.totalPages > 1) { <div><button type="button" class="pa-btn-outline pa-btn-sm" (click)="load(p.page - 1)" [disabled]="p.page <= 1">← Previous</button><span>Page {{ p.page }} of {{ p.totalPages }}</span><button type="button" class="pa-btn-outline pa-btn-sm" (click)="load(p.page + 1)" [disabled]="p.page >= p.totalPages">Next →</button></div> }</nav>
    }
  </div>
</section>`
})
export class PlatformAuditComponent {
  private api = inject(PlatformApiService);
  query = { action: '', targetId: '', from: '', to: '' };
  page = signal<PlatformPage<AuditEntry> | null>(null);
  actions = signal<string[]>([]);
  open = signal<string | null>(null);
  loading = signal(true);
  error = signal('');

  constructor() { this.load(1); }

  load(page: number) {
    this.loading.set(true); this.error.set('');
    this.api.auditLogs({ ...this.query, page, limit: 50 }).subscribe({
      next: r => { this.page.set(r); this.actions.set(r.actions); this.loading.set(false); },
      error: err => { this.error.set(apiMessage(err, 'Unable to load the audit log')); this.loading.set(false); }
    });
  }

  toggle(id: string) { this.open.set(this.open() === id ? null : id); }
}
