import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Health, Plan, PlatformApiService, PlatformSettings, apiMessage } from './platform-api.service';
import { PlatformAuthService } from './platform-auth.service';

/** Platform-wide settings and the API health check. */
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
<section class="pa-page pa-narrow">
  <header class="pa-page-head"><div><div class="pa-eyebrow">PLATFORM</div><h1>Settings</h1></div></header>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  @if (message()) { <div class="pa-success" role="status">{{ message() }}</div> }
  @if (settings(); as s) {
    <div class="pa-card">
      <h2>Registration and plans</h2>
      <form class="pa-form" (ngSubmit)="save()">
        <label>New shop registrations
          <select [(ngModel)]="s.registrationApproval" name="registrationApproval" [disabled]="!auth.can('settings.manage')">
            <option value="automatic">Automatic: new shops are active at once</option>
            <option value="manual">Manual: new shops wait for approval here</option>
          </select>
        </label>
        <label>Default plan for shops without a subscription
          <select [(ngModel)]="s.defaultPlanKey" name="defaultPlanKey" [disabled]="!auth.can('settings.manage')">@for (p of plans(); track p.key) { <option [value]="p.key">{{ p.name }} ({{ p.key }})</option> }</select>
        </label>
        <label>Message shown to a suspended shop's users<textarea rows="3" maxlength="300" [(ngModel)]="s.suspensionMessage" name="suspensionMessage" [disabled]="!auth.can('settings.manage')"></textarea></label>
        <label>Support email (shown to shops in messages)<input type="email" maxlength="254" [(ngModel)]="s.supportEmail" name="supportEmail" [disabled]="!auth.can('settings.manage')"></label>
        @if (auth.can('settings.manage')) { <button class="pa-btn" type="submit" [disabled]="busy()">Save settings</button> }
      </form>
    </div>
  }
  @if (auth.can('health.view')) {
    <div class="pa-card">
      <div class="pa-card-head"><h2>API health</h2><button type="button" class="pa-btn-outline pa-btn-sm" (click)="checkHealth()">Check again</button></div>
      @if (health(); as h) {
        <dl class="pa-dl">
          <dt>Status</dt><dd><span class="pa-badge" [attr.data-status]="h.status === 'ok' ? 'ACTIVE' : 'SUSPENDED'">{{ h.status }}</span></dd>
          <dt>Database</dt><dd>{{ h.database }} (connection state {{ h.mongooseState }})</dd>
          <dt>Node</dt><dd>{{ h.node }}</dd>
          <dt>Uptime</dt><dd>{{ uptime(h.uptimeSeconds) }}</dd>
          <dt>Memory</dt><dd>{{ h.memoryMb.rss }} MB resident, {{ h.memoryMb.heapUsed }} MB heap</dd>
          <dt>Server time</dt><dd>{{ h.now | date:'medium' }}</dd>
        </dl>
      } @else { <p class="pa-muted">Checking…</p> }
    </div>
  }
  <div class="pa-card">
    <h2>Security configuration</h2>
    <p class="pa-muted pa-small">Set on the server (environment variables), not here: platform session limits (<code>PLATFORM_ADMIN_IDLE_MINUTES</code>, <code>PLATFORM_ADMIN_MAX_HOURS</code>) and whether MFA is mandatory for every administrator (<code>PLATFORM_ADMIN_REQUIRE_MFA=1</code>, recommended before production). MFA mandatory right now: <strong>{{ auth.mfaRequired() ? 'yes' : 'no' }}</strong>.</p>
  </div>
</section>`
})
export class PlatformSettingsComponent {
  auth = inject(PlatformAuthService);
  private api = inject(PlatformApiService);
  settings = signal<PlatformSettings | null>(null);
  plans = signal<Plan[]>([]);
  health = signal<Health | null>(null);
  busy = signal(false);
  error = signal('');
  message = signal('');

  constructor() {
    this.api.settings().subscribe({ next: r => this.settings.set(r.settings), error: err => this.error.set(apiMessage(err, 'Unable to load settings')) });
    if (this.auth.can('plans.view')) this.api.plans().subscribe({ next: r => this.plans.set(r.plans), error: () => undefined });
    if (this.auth.can('health.view')) this.checkHealth();
  }

  save() {
    const s = this.settings();
    if (!s) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.updateSettings(s).subscribe({
      next: r => { this.busy.set(false); this.settings.set(r.settings); this.message.set('Settings saved.'); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to save settings')); }
    });
  }

  checkHealth() {
    this.health.set(null);
    this.api.health().subscribe({ next: h => this.health.set(h), error: err => this.error.set(apiMessage(err, 'Health check failed')) });
  }

  uptime(seconds: number) { const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; }
}
