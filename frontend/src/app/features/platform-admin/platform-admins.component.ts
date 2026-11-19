import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../../core/ui/confirm.service';
import { PermissionInfo, PlatformApiService, apiMessage } from './platform-api.service';
import { PlatformAdmin, PlatformAuthService } from './platform-auth.service';

/** Bizora staff accounts: create (temporary password shown once), change role, deactivate, revoke sessions, reset password. */
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
<section class="pa-page">
  <header class="pa-page-head">
    <div><div class="pa-eyebrow">ACCESS</div><h1>Administrators</h1><p class="pa-muted">Platform staff only. Shop owners, managers and employees are managed inside their shops.</p></div>
  </header>
  @if (error()) { <div class="pa-error" role="alert">{{ error() }}</div> }
  @if (message()) { <div class="pa-success" role="status">{{ message() }}</div> }
  @if (secret(); as s) {
    <div class="pa-notice pa-secret-box" role="status">
      <strong>Temporary password for {{ s.email }}</strong>
      <p>Share it with them over a secure channel. It is shown once and they must change it at first sign-in.</p>
      <code class="pa-secret">{{ s.password }}</code> <button type="button" class="pa-link" (click)="copy(s.password)">Copy</button> <button type="button" class="pa-link" (click)="secret.set(null)">Dismiss</button>
    </div>
  }

  @if (auth.can('admins.manage')) {
    <div class="pa-card">
      <h2>Add an administrator</h2>
      <form class="pa-form pa-form-grid" (ngSubmit)="create()">
        <label>Name<input [(ngModel)]="form.name" name="name" required maxlength="120"></label>
        <label>Email<input type="email" [(ngModel)]="form.email" name="email" required maxlength="254"></label>
        <label>Role<select [(ngModel)]="form.role" name="role">@for (r of roles(); track r) { <option [value]="r">{{ r }}</option> }</select></label>
        <div><button class="pa-btn" type="submit" [disabled]="busy() || !form.name || !form.email">Create</button></div>
      </form>
    </div>
  }

  <div class="pa-card pa-card-table">
    <table class="pa-table">
      <thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>MFA</th><th>Last sign-in</th>@if (auth.can('admins.manage')) { <th>Actions</th> }</tr></thead>
      <tbody>
        @for (a of admins(); track a.id) {
          <tr>
            <td><strong>{{ a.name }}</strong><br><span class="pa-small pa-muted">{{ a.email }}</span>@if (a.id === auth.admin()?.id) { <span class="pa-badge" data-status="ACTIVE">you</span> }</td>
            <td>
              @if (auth.can('admins.manage') && a.id !== auth.admin()?.id) {
                <select [ngModel]="a.role" (ngModelChange)="changeRole(a, $event)" [attr.aria-label]="'Role of ' + a.email" [disabled]="busy()">@for (r of roles(); track r) { <option [value]="r">{{ r }}</option> }</select>
              } @else { {{ a.role }} }
            </td>
            <td><span class="pa-badge" [attr.data-status]="a.status === 'active' ? 'ACTIVE' : 'DEACTIVATED'">{{ a.status }}</span>@if (a.mustChangePassword) { <br><span class="pa-small pa-muted">must change password</span> }</td>
            <td>{{ a.mfaEnabled ? 'Enabled' : 'Not enrolled' }}</td>
            <td>{{ a.lastLoginAt ? (a.lastLoginAt | date:'short') : '—' }}</td>
            @if (auth.can('admins.manage')) {
              <td class="pa-row-actions">
                @if (a.id !== auth.admin()?.id) {
                  <button type="button" class="pa-link" (click)="toggleStatus(a)" [disabled]="busy()">{{ a.status === 'active' ? 'Deactivate' : 'Reactivate' }}</button>
                  <button type="button" class="pa-link" (click)="revoke(a)" [disabled]="busy()">Revoke sessions</button>
                  <button type="button" class="pa-link" (click)="resetPassword(a)" [disabled]="busy()">Reset password</button>
                }
              </td>
            }
          </tr>
        } @empty { <tr><td colspan="6" class="pa-empty">{{ loading() ? 'Loading…' : 'No administrators.' }}</td></tr> }
      </tbody>
    </table>
  </div>

  <div class="pa-card">
    <h2>What each role may do</h2>
    <table class="pa-table pa-table-compact">
      <thead><tr><th>Permission</th><th>Super admin</th><th>Support admin</th><th>Finance admin</th></tr></thead>
      <tbody>@for (p of permissions(); track p.key) { <tr><td>{{ p.label }}<br><code class="pa-small">{{ p.key }}</code></td><td>{{ p.roles.includes('SUPER_ADMIN') ? '✓' : '' }}</td><td>{{ p.roles.includes('SUPPORT_ADMIN') ? '✓' : '' }}</td><td>{{ p.roles.includes('FINANCE_ADMIN') ? '✓' : '' }}</td></tr> }</tbody>
    </table>
  </div>
</section>`
})
export class PlatformAdminsComponent {
  auth = inject(PlatformAuthService);
  private api = inject(PlatformApiService);
  private confirm = inject(ConfirmService);
  admins = signal<PlatformAdmin[]>([]);
  roles = signal<string[]>(['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']);
  permissions = signal<PermissionInfo[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  message = signal('');
  secret = signal<{ email: string; password: string } | null>(null);
  form = { name: '', email: '', role: 'SUPPORT_ADMIN' };

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.admins({ limit: 100 }).subscribe({
      next: r => { this.admins.set(r.items); this.roles.set(r.roles); this.permissions.set(r.permissions); this.loading.set(false); },
      error: err => { this.error.set(apiMessage(err, 'Unable to load administrators')); this.loading.set(false); }
    });
  }

  create() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.createAdmin(this.form).subscribe({
      next: r => { this.busy.set(false); this.secret.set({ email: r.admin.email, password: r.temporaryPassword }); this.form = { name: '', email: '', role: 'SUPPORT_ADMIN' }; this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to create the administrator')); }
    });
  }

  async changeRole(admin: PlatformAdmin, role: string) {
    if (role === admin.role) return;
    const result = await this.confirm.ask({ title: `Change ${admin.name}'s role to ${role}?`, message: 'Their open sessions are signed out; the new role applies at next sign-in.', confirmLabel: 'Change role', reasonLabel: 'Reason', reasonOptional: true });
    if (!result.confirmed) { this.load(); return; }
    this.update(admin, { role, reason: result.reason }, `Role of ${admin.email} changed to ${role}.`);
  }

  async toggleStatus(admin: PlatformAdmin) {
    const deactivating = admin.status === 'active';
    const result = await this.confirm.ask({ title: `${deactivating ? 'Deactivate' : 'Reactivate'} ${admin.name}?`, message: deactivating ? 'They are signed out everywhere and cannot sign in until reactivated.' : 'They can sign in again.', confirmLabel: deactivating ? 'Deactivate' : 'Reactivate', danger: deactivating, reasonLabel: 'Reason', reasonOptional: !deactivating });
    if (!result.confirmed) return;
    this.update(admin, { status: deactivating ? 'inactive' : 'active', reason: result.reason }, `${admin.email} ${deactivating ? 'deactivated' : 'reactivated'}.`);
  }

  async revoke(admin: PlatformAdmin) {
    const result = await this.confirm.ask({ title: `Sign ${admin.name} out everywhere?`, message: 'Every session of this account ends now. They can sign in again with their password.', confirmLabel: 'Revoke sessions', danger: true, reasonLabel: 'Reason', reasonOptional: true });
    if (!result.confirmed) return;
    this.busy.set(true); this.error.set('');
    this.api.revokeSessions(admin.id, result.reason).subscribe({
      next: () => { this.busy.set(false); this.message.set(`Sessions of ${admin.email} revoked.`); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to revoke sessions')); }
    });
  }

  async resetPassword(admin: PlatformAdmin) {
    const result = await this.confirm.ask({ title: `Reset ${admin.name}'s password?`, message: 'A new temporary password is generated and shown to you once. Their sessions end.', confirmLabel: 'Reset password', danger: true, reasonLabel: 'Reason', reasonOptional: true });
    if (!result.confirmed) return;
    this.busy.set(true); this.error.set('');
    this.api.resetPassword(admin.id, result.reason).subscribe({
      next: r => { this.busy.set(false); this.secret.set({ email: admin.email, password: r.temporaryPassword }); this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to reset the password')); }
    });
  }

  private update(admin: PlatformAdmin, body: { role?: string; status?: string; reason?: string }, done: string) {
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.updateAdmin(admin.id, body).subscribe({
      next: () => { this.busy.set(false); this.message.set(done); this.load(); },
      error: err => { this.busy.set(false); this.error.set(apiMessage(err, 'Unable to update the administrator')); this.load(); }
    });
  }

  copy(text: string) { void navigator.clipboard?.writeText(text); }
}
