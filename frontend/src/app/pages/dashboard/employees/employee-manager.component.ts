import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AccessRole, Employee, EmployeeInput, PermissionHistoryEntry, PermissionInfo, PermissionRegistry, PermissionView, ShopDataService } from '../../../core/shop-data.service';
import { PagedList, SortOption } from '../../../core/paged-list';
import { I18N_PIPES } from '../../../core/i18n/i18n.pipes';
import { I18nService, Msg, msg, tk } from '../../../core/i18n/i18n.service';
import { ConfirmService } from '../../../core/ui/confirm.service';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpErrorResponse ? error.error?.message || fallback : fallback;
}

type FormMode = 'create' | 'edit' | 'password' | 'permissions';
type TeamFilter = 'all' | 'managers';

/** English labels for the audit actions shown in the permission history. */
const HISTORY_LABEL: Record<string, string> = {
  EMPLOYEE_PROMOTED: tk('Promoted to manager'),
  MANAGER_DEMOTED: tk('Demoted to employee'),
  MANAGER_PERMISSIONS_CHANGED: tk('Permissions changed'),
  MANAGER_CREATED: tk('Created as manager'),
  EMPLOYEE_DEACTIVATED: tk('Deactivated'),
  EMPLOYEE_ACTIVATED: tk('Activated')
};

/**
 * Owner-side team management: employees and managers (create, edit, reset password, remove),
 * promotion and demotion, and the per-manager permission editor with its change history.
 * Self-contained so it can be embedded anywhere; currently shown on the Shop profile page.
 */
@Component({
  selector: 'app-employee-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ...I18N_PIPES],
  template: `
    <section id="employees" class="employee-manager">
      <div class="section-heading-row">
        <div><h2>{{ 'Team' | t }}</h2><p>{{ 'Create employee accounts, promote managers and decide what each manager may do.' | t }}</p></div>
        <button type="button" class="btn btn-small record-add-button" (click)="openCreate()">{{ '＋ Add employee' | t }}</button>
      </div>

      <div *ngIf="error()" class="record-alert" role="alert">{{ error() | t }}</div>
      <div *ngIf="success()" class="record-success" role="status">{{ success() | t }}</div>

      <section *ngIf="mode() && mode() !== 'permissions'" class="surface-card record-form-card">
        <div class="record-form-heading">
          <div>
            <h2>{{ mode() === 'create' ? ('Add employee' | t) : mode() === 'edit' ? ('Edit employee' | t) : ('Reset password' | t) }}</h2>
            <p *ngIf="mode() === 'create'">{{ 'The employee signs in with their employee ID and this temporary password, then chooses their own.' | t }}</p>
            <p *ngIf="mode() === 'edit'">{{ 'Update {id}’s contact and role information.' | t:{ id: editing()?.employeeId } }}</p>
            <p *ngIf="mode() === 'password'">{{ 'Set a new temporary password for {name} ({id}). They’ll be signed out and must choose a new password at their next login.' | t:{ name: editing()?.name, id: editing()?.employeeId } }}</p>
          </div>
          <button type="button" class="record-close" [attr.aria-label]="'Close form' | t" (click)="closeForm()">×</button>
        </div>
        <form class="record-form-grid" (ngSubmit)="save()">
          <ng-container *ngIf="mode() !== 'password'">
            <label>{{ 'Full name' | t }}<input name="name" [(ngModel)]="draft.name" maxlength="120" required></label>
            <label>{{ 'Email address' | t }}<input name="email" type="email" [(ngModel)]="draft.email" maxlength="254" required></label>
            <label>{{ 'Phone number' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input name="phone" type="tel" [(ngModel)]="draft.phone" maxlength="40"></label>
            <label>{{ 'Role' | t }}
              <select name="role" [(ngModel)]="draft.role" required>
                <option value="" disabled>{{ (roles().length ? 'Choose a role' : 'Loading roles...') | t }}</option>
                <option *ngFor="let r of roleOptions()" [value]="r">{{ r | t }}</option>
              </select></label>
            <label>{{ 'Status' | t }}<select name="status" [(ngModel)]="draft.status"><option value="active">{{ 'Active — can sign in' | t }}</option><option value="inactive">{{ 'Inactive — cannot sign in' | t }}</option></select></label>
            <label *ngIf="mode() === 'create'">{{ 'Access' | t }}<select name="accessRole" [(ngModel)]="accessRole"><option value="employee">{{ 'Employee — own sales, inventory, customers' | t }}</option><option value="manager">{{ 'Manager — whole-shop operations, configurable' | t }}</option></select></label>
          </ng-container>
          <label *ngIf="mode() !== 'edit'">{{ 'Temporary password' | t }}<input name="password" type="text" dir="ltr" [(ngModel)]="password" minlength="8" maxlength="128" autocomplete="off" required [placeholder]="'At least 8 characters' | t"></label>
          <div class="record-form-actions">
            <button type="button" class="btn-outline record-cancel" (click)="closeForm()">{{ 'Cancel' | t }}</button>
            <button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Saving...' | t) : mode() === 'create' ? ('Create employee' | t) : mode() === 'edit' ? ('Save changes' | t) : ('Set temporary password' | t) }}</button>
          </div>
        </form>
      </section>

      <section *ngIf="mode() === 'permissions' && editing() as e" class="surface-card record-form-card">
        <div class="record-form-heading">
          <div>
            <h2>{{ 'Manager permissions · {name}' | t:{ name: e.name } }}</h2>
            <p>{{ 'Ticked items are what {name} can do right now. Items marked “default” come with the manager role; change any that are configurable. Team administration and shop settings always stay with you.' | t:{ name: e.name } }}</p>
          </div>
          <button type="button" class="record-close" [attr.aria-label]="'Close form' | t" (click)="closeForm()">×</button>
        </div>
        <div *ngIf="!permView()" class="record-loading" role="status">{{ 'Loading...' | t }}</div>
        <form *ngIf="permView() as view" (ngSubmit)="savePermissions(e)">
          <div class="permission-groups">
            <fieldset *ngFor="let group of groups()" class="permission-group">
              <legend>{{ group.name | t }}</legend>
              <label *ngFor="let p of group.permissions" class="permission-row" [class.is-fixed]="!p.grantable">
                <input type="checkbox" [name]="p.key" [checked]="checked[p.key]" [disabled]="!p.grantable" (change)="checked[p.key] = $any($event.target).checked">
                <span><strong>{{ p.label | t }}</strong>
                  <small class="record-secondary">
                    <ng-container *ngIf="view.defaults.includes(p.key)">{{ 'default for managers' | t }}</ng-container>
                    <ng-container *ngIf="!view.defaults.includes(p.key) && p.grantable">{{ 'off by default' | t }}</ng-container>
                    <ng-container *ngIf="!p.grantable && !view.defaults.includes(p.key)">{{ 'owner only' | t }}</ng-container>
                    <ng-container *ngIf="!p.grantable && view.defaults.includes(p.key)">{{ 'always on' | t }}</ng-container>
                  </small></span>
              </label>
            </fieldset>
          </div>
          <div class="record-form-grid">
            <label class="record-form-wide">{{ 'Reason for the change' | t }} <span class="optional-label">{{ 'Optional' | t }}</span><input name="reason" [(ngModel)]="reason" maxlength="500"></label>
          </div>
          <div class="record-form-actions">
            <button type="button" class="btn-outline record-cancel" (click)="closeForm()">{{ 'Cancel' | t }}</button>
            <button type="submit" class="btn btn-small" [disabled]="saving()">{{ saving() ? ('Saving...' | t) : ('Save permissions' | t) }}</button>
          </div>
        </form>
        <div *ngIf="history().length" class="permission-history">
          <h3>{{ 'Change history' | t }}</h3>
          <ul>
            <li *ngFor="let h of history()">
              <strong>{{ (historyLabel[h.action] || h.action) | t }}</strong>
              <small class="record-secondary">{{ h.createdAt | tDate:'medium' }} · {{ h.actor.type === 'owner' ? ('Shop owner' | t) : h.actor.name }}<ng-container *ngIf="h.reason"> · {{ h.reason }}</ng-container></small>
            </li>
          </ul>
        </div>
      </section>

      <section class="surface-card data-page-card">
        <div class="data-page-toolbar">
          <div><h2>{{ filter === 'managers' ? ('Managers' | t) : ('Your team' | t) }}</h2><p>{{ list.searchTerm()
            ? (list.total() === 1 ? ('1 employee matching “{search}”' | t:{ search: list.searchTerm() }) : ('{count} employees matching “{search}”' | t:{ count: list.total(), search: list.searchTerm() }))
            : (list.total() === 1 ? ('1 employee' | t) : ('{count} employees' | t:{ count: list.total() })) }}</p></div>
          <div class="list-controls">
            <div class="status-chips" role="group" [attr.aria-label]="'Show' | t">
              <button type="button" [class.active]="filter === 'all'" (click)="setFilter('all')">{{ 'Everyone' | t }}</button>
              <button type="button" [class.active]="filter === 'managers'" (click)="setFilter('managers')">{{ 'Managers' | t }}</button>
            </div>
            <label class="list-search"><span class="visually-hidden">{{ 'Search employees' | t }}</span><input type="search" [placeholder]="'Search name, ID, email, role' | t" maxlength="100" (input)="list.search($any($event.target).value)"></label>
            <label class="list-sort"><span class="visually-hidden">{{ 'Sort employees' | t }}</span><select [ngModel]="list.sort" (ngModelChange)="list.changeSort($event)"><option *ngFor="let option of sortOptions" [value]="option.value">{{ option.label | t }}</option></select></label>
          </div>
        </div>
        <div *ngIf="list.loading() && !list.loaded()" class="record-loading">{{ 'Loading employees...' | t }}</div>
        <div *ngIf="list.loaded() && list.records().length" class="table-wrap" [class.is-refreshing]="list.loading()">
          <table class="record-table"><thead><tr><th>{{ 'EMPLOYEE' | t }}</th><th>{{ 'EMPLOYEE ID' | t }}</th><th>{{ 'EMAIL' | t }}</th><th>{{ 'ROLE' | t }}</th><th>{{ 'ACCESS' | t }}</th><th>{{ 'STATUS' | t }}</th><th>{{ 'ACTIONS' | t }}</th></tr></thead>
            <tbody><tr *ngFor="let employee of list.records()">
              <td><span class="employee-cell"><span class="employee-avatar">{{ employee.name.charAt(0).toUpperCase() }}</span><span><strong>{{ employee.name }}</strong><small class="record-secondary" [attr.dir]="employee.phone ? 'ltr' : null">{{ employee.phone || ('No phone' | t) }}</small></span></span></td>
              <td><code class="employee-id">{{ employee.employeeId }}</code></td>
              <td dir="ltr">{{ employee.email }}</td>
              <td>{{ employee.role }}</td>
              <td><span class="sale-badge" [ngClass]="employee.accessRole === 'manager' ? 'sale-partial' : 'sale-due'">{{ (employee.accessRole === 'manager' ? 'Manager' : 'Employee') | t }}</span>
                <small *ngIf="employee.accessRole === 'manager' && hasOverrides(employee)" class="record-secondary">{{ 'custom permissions' | t }}</small></td>
              <td>
                <span class="employee-status" [class.employee-inactive]="employee.status === 'inactive'">{{ employee.status === 'active' ? ('Active' | t) : ('Inactive' | t) }}</span>
                <span *ngIf="employee.mustChangePassword && employee.status === 'active'" class="employee-status employee-pending" [title]="'Signs in with a temporary password' | t">{{ 'Temp password' | t }}</span>
              </td>
              <td><div class="record-actions">
                <button type="button" (click)="openEdit(employee)">{{ 'Edit' | t }}</button>
                <button *ngIf="employee.accessRole === 'manager'" type="button" (click)="openPermissions(employee)">{{ 'Permissions' | t }}</button>
                <button *ngIf="employee.accessRole !== 'manager'" type="button" (click)="promote(employee)">{{ 'Promote to manager' | t }}</button>
                <button *ngIf="employee.accessRole === 'manager'" type="button" (click)="demote(employee)">{{ 'Demote to employee' | t }}</button>
                <button type="button" (click)="openPassword(employee)">{{ 'Reset password' | t }}</button>
                <button type="button" class="record-delete" (click)="remove(employee)">{{ 'Remove' | t }}</button>
              </div></td>
            </tr></tbody>
          </table>
        </div>
        <nav *ngIf="list.loaded() && list.records().length" class="list-pager" [attr.aria-label]="'Employee pages' | t">
          <span>{{ 'Showing {start}–{end} of {total}' | t:{ start: list.rangeStart(), end: list.rangeEnd(), total: list.total() } }}</span>
          <div *ngIf="list.totalPages() > 1" class="list-pager-buttons">
            <button type="button" (click)="list.goTo(list.page() - 1)" [disabled]="list.page() <= 1 || list.loading()">{{ '← Previous' | t }}</button>
            <span>{{ 'Page {page} of {pages}' | t:{ page: list.page(), pages: list.totalPages() } }}</span>
            <button type="button" (click)="list.goTo(list.page() + 1)" [disabled]="list.page() >= list.totalPages() || list.loading()">{{ 'Next →' | t }}</button>
          </div>
        </nav>
        <div *ngIf="list.loaded() && !list.records().length && list.searchTerm()" class="table-empty"><span class="empty-icon">⌕</span><strong>{{ 'No matching employees' | t }}</strong><span>{{ 'Try a different name, ID, email, or role.' | t }}</span></div>
        <div *ngIf="list.loaded() && !list.records().length && !list.searchTerm() && filter === 'managers'" class="table-empty"><span class="empty-icon">♙</span><strong>{{ 'No managers yet' | t }}</strong><span>{{ 'Promote an employee, or add one with manager access.' | t }}</span></div>
        <div *ngIf="list.loaded() && !list.records().length && !list.searchTerm() && filter === 'all'" class="table-empty"><span class="empty-icon">♙</span><strong>{{ 'No employees yet' | t }}</strong><span>{{ 'Add an employee to give them their own sign-in for your shop.' | t }}</span><button type="button" class="text-link empty-add-link" (click)="openCreate()">{{ 'Add an employee' | t }} <span>→</span></button></div>
      </section>
    </section>
  `,
  styles: [`
    .permission-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px 24px; margin-bottom: 18px; }
    .permission-group { border: 1px solid #EFE9DF; border-radius: 12px; padding: 10px 14px 6px; margin: 0; min-width: 0; }
    .permission-group legend { font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #7A6240; padding: 0 6px; }
    .permission-row { display: flex; gap: 10px; align-items: flex-start; padding: 7px 0; font-size: 13.5px; }
    .permission-row input { margin-top: 3px; }
    .permission-row span { display: flex; flex-direction: column; gap: 1px; }
    .permission-row.is-fixed { opacity: .65; }
    .permission-history { margin-top: 20px; border-top: 1px solid #EFE9DF; padding-top: 14px; }
    .permission-history h3 { font-size: 14px; margin: 0 0 8px; }
    .permission-history ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .permission-history li { display: flex; flex-direction: column; font-size: 13px; }
  `]
})
export class EmployeeManagerComponent implements OnInit {
  private data = inject(ShopDataService);
  private i18n = inject(I18nService);
  private confirm = inject(ConfirmService);
  readonly historyLabel = HISTORY_LABEL;
  readonly sortOptions: SortOption[] = [
    { value: 'updatedAt:desc', label: tk('Recently updated') },
    { value: 'name:asc', label: tk('Name A–Z') },
    { value: 'name:desc', label: tk('Name Z–A') },
    { value: 'role:asc', label: tk('Role A–Z') }
  ];
  filter: TeamFilter = 'all';
  list = new PagedList<Employee>(
    query => this.filter === 'managers' ? this.data.managers(query) : this.data.employees(query),
    inject(DestroyRef),
    error => this.error.set(errorMessage(error, 'Unable to load employees. Please try again.')),
    'updatedAt:desc'
  );
  mode = signal<FormMode | null>(null);
  editing = signal<Employee | null>(null);
  saving = signal(false);
  error = signal<Msg>('');
  success = signal<Msg>('');
  draft: EmployeeInput = this.emptyDraft();
  accessRole: AccessRole = 'employee';
  password = '';
  reason = '';
  registry = signal<PermissionRegistry | null>(null);
  permView = signal<PermissionView | null>(null);
  history = signal<PermissionHistoryEntry[]>([]);
  /** Checkbox state of the permission editor, by permission key. */
  checked: Record<string, boolean> = {};

  /** Job titles from the server; the Role field is a dropdown, never free text. */
  roles = signal<string[]>([]);

  ngOnInit() {
    this.list.reload();
    this.data.jobRoles().subscribe({ next: roles => this.roles.set(roles), error: () => undefined });
  }

  /** The list, plus the employee's current title when it predates the list (so editing doesn't blank it). */
  roleOptions(): string[] {
    const current = this.draft.role;
    return current && !this.roles().includes(current) ? [current, ...this.roles()] : this.roles();
  }

  setFilter(filter: TeamFilter) {
    this.filter = filter;
    this.list.goTo(1);
  }

  hasOverrides(employee: Employee) {
    return Boolean(employee.permissionOverrides && (employee.permissionOverrides.allow.length || employee.permissionOverrides.deny.length));
  }

  /** Registry entries grouped for the editor, in registry order. */
  groups(): { name: string; permissions: PermissionInfo[] }[] {
    const registry = this.registry();
    if (!registry) return [];
    const out: { name: string; permissions: PermissionInfo[] }[] = [];
    for (const p of registry.permissions) {
      if (p.roles.includes('employee') && !p.grantable && p.roles.includes('manager') && p.key === 'dashboard.employee') continue;
      let group = out.find(g => g.name === p.group);
      if (!group) { group = { name: p.group, permissions: [] }; out.push(group); }
      group.permissions.push(p);
    }
    return out;
  }

  openCreate() {
    this.open('create', null);
    this.draft = this.emptyDraft();
    this.accessRole = 'employee';
  }

  openEdit(employee: Employee) {
    this.open('edit', employee);
    this.draft = { name: employee.name, email: employee.email, phone: employee.phone, role: employee.role, status: employee.status };
  }

  openPassword(employee: Employee) {
    this.open('password', employee);
  }

  openPermissions(employee: Employee) {
    this.open('permissions', employee);
    this.permView.set(null);
    this.history.set([]);
    this.reason = '';
    if (!this.registry()) this.data.permissionRegistry().subscribe({ next: r => this.registry.set(r), error: e => this.error.set(errorMessage(e, 'Unable to load permissions. Please try again.')) });
    this.data.employeePermissions(employee._id).subscribe({
      next: ({ permissions, history }) => {
        this.permView.set(permissions);
        this.history.set(history);
        this.checked = Object.fromEntries(permissions.effective.map(p => [p, true]));
      },
      error: e => this.error.set(errorMessage(e, 'Unable to load permissions. Please try again.'))
    });
  }

  closeForm() {
    this.mode.set(null);
    this.editing.set(null);
    this.password = '';
  }

  save() {
    const mode = this.mode();
    if (!mode || mode === 'permissions' || this.saving()) return;
    this.resetMessages();
    if (mode !== 'edit' && this.password.length < 8) {
      this.error.set(tk('Temporary password must be at least 8 characters.'));
      return;
    }
    const id = this.editing()?._id ?? '';
    const request = mode === 'create'
      ? this.data.createEmployee({ ...this.draft, password: this.password, accessRole: this.accessRole })
      : mode === 'edit'
        ? this.data.updateEmployee(id, { ...this.draft })
        : this.data.resetEmployeePassword(id, this.password);
    this.saving.set(true);
    request.subscribe({
      next: ({ employee }) => {
        this.saving.set(false);
        this.closeForm();
        if (mode === 'create') {
          this.list.goTo(1);
          this.success.set(employee.accessRole === 'manager'
            ? msg('{name} was added as a manager with employee ID {id}. Share the employee login link above, their ID, and the temporary password with them.', { name: employee.name, id: employee.employeeId })
            : msg('{name} was added with employee ID {id}. Share the employee login link above, their ID, and the temporary password with them.', { name: employee.name, id: employee.employeeId }));
        } else {
          this.list.reload();
          this.success.set(mode === 'edit'
            ? tk('Employee updated.')
            : msg('Temporary password set for {id}. They’ve been signed out.', { id: employee.employeeId }));
        }
      },
      error: error => {
        this.error.set(errorMessage(error, 'Unable to save employee. Please try again.'));
        this.saving.set(false);
      }
    });
  }

  /** Overrides from the checkboxes: allow what's ticked but off by default, deny what's unticked but on by default. */
  savePermissions(employee: Employee) {
    const view = this.permView();
    if (!view || this.saving()) return;
    const allow = view.grantable.filter(p => this.checked[p] && !view.defaults.includes(p));
    const deny = view.grantable.filter(p => !this.checked[p] && view.defaults.includes(p));
    this.resetMessages();
    this.saving.set(true);
    this.data.updatePermissions(employee._id, { allow, deny }, this.reason.trim()).subscribe({
      next: ({ permissions }) => {
        this.saving.set(false);
        this.permView.set(permissions);
        this.closeForm();
        this.list.reload();
        this.success.set(msg('Permissions saved for {name}. They apply to their next request.', { name: employee.name }));
      },
      error: error => { this.saving.set(false); this.error.set(errorMessage(error, 'Unable to save permissions. Please try again.')); }
    });
  }

  async promote(employee: Employee) {
    const answer = await this.confirm.ask({
      title: msg('Promote {name} to manager?', { name: employee.name }),
      message: tk('Managers see the whole shop: every sale, the dashboard and the team’s performance, and can edit product details. They still can’t see purchase costs, record installment payments, cancel sales or manage the team unless you allow it afterwards under Permissions.'),
      confirmLabel: tk('Promote'), reasonLabel: tk('Reason (optional)'), reasonOptional: true
    });
    if (!answer.confirmed) return;
    this.resetMessages();
    this.data.promoteManager(employee._id, answer.reason).subscribe({
      next: ({ employee: updated }) => {
        this.list.reload();
        // Open the editor first: opening a form clears messages, and this one should stay.
        this.openPermissions(updated);
        this.success.set(msg('{name} is now a manager. Review their permissions below.', { name: updated.name }));
      },
      error: error => this.error.set(errorMessage(error, 'Unable to promote. Please try again.'))
    });
  }

  async demote(employee: Employee) {
    const answer = await this.confirm.ask({
      title: msg('Demote {name} to employee?', { name: employee.name }),
      message: tk('They keep their employee ID, password and history, and from their next request see only their own sales, like any employee. Any custom permissions are removed.'),
      confirmLabel: tk('Demote'), danger: true, reasonLabel: tk('Reason (optional)'), reasonOptional: true
    });
    if (!answer.confirmed) return;
    this.resetMessages();
    this.data.demoteManager(employee._id, answer.reason).subscribe({
      next: ({ employee: updated }) => {
        this.list.reload();
        if (this.editing()?._id === updated._id) this.closeForm();
        this.success.set(msg('{name} is an employee again.', { name: updated.name }));
      },
      error: error => this.error.set(errorMessage(error, 'Unable to demote. Please try again.'))
    });
  }

  remove(employee: Employee) {
    const question = msg('Remove {name} ({id}) from your team? They will no longer be able to sign in.', { name: employee.name, id: employee.employeeId });
    if (!window.confirm(this.i18n.t(question))) return;
    this.resetMessages();
    this.data.deleteEmployee(employee._id).subscribe({
      next: () => {
        this.list.reload();
        this.success.set(tk('Employee removed from your team.'));
      },
      error: error => this.error.set(errorMessage(error, 'Unable to remove employee. Please try again.'))
    });
  }

  private open(mode: FormMode, employee: Employee | null) {
    this.resetMessages();
    this.mode.set(mode);
    this.editing.set(employee);
    this.password = '';
  }

  private resetMessages() {
    this.error.set('');
    this.success.set('');
  }

  private emptyDraft(): EmployeeInput {
    return { name: '', email: '', phone: '', role: '', status: 'active' };
  }
}
