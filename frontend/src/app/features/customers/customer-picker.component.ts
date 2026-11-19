import { Component, DestroyRef, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { PortalService } from '../../core/portal.service';
import { I18N_PIPES } from '../../core/i18n/i18n.pipes';
import { Customer } from './customer.models';
import { CustomersApiService } from './customers-api.service';

/**
 * "Existing customer?" box for the sale forms: type a name, phone or CNIC, pick a match, and the
 * sale is linked to that record (its details fill the form). Clearing goes back to typing details,
 * which creates or matches a record when the sale is saved.
 */
@Component({
  selector: 'app-customer-picker',
  standalone: true,
  imports: [CommonModule, RouterLink, ...I18N_PIPES],
  template: `
    <div class="customer-picker">
      <ng-container *ngIf="selected() as c; else search">
        <div class="customer-picker-selected">
          <span class="employee-avatar">{{ c.name.charAt(0).toUpperCase() }}</span>
          <span><strong>{{ c.name }}</strong><small class="record-secondary" dir="ltr">{{ c.customerCode }} · {{ c.phone }}<ng-container *ngIf="c.cnicFormatted"> · {{ c.cnicFormatted }}</ng-container></small></span>
          <a class="text-link" [routerLink]="portal.link('customers', c._id)" target="_blank">{{ 'View' | t }}</a>
          <button type="button" class="btn-outline record-cancel" (click)="clear()">{{ 'Change' | t }}</button>
        </div>
      </ng-container>
      <ng-template #search>
        <label class="list-search customer-picker-search"><span class="visually-hidden">{{ 'Find an existing customer' | t }}</span>
          <input type="search" [placeholder]="'Find an existing customer by name, phone or CNIC' | t" maxlength="100" autocomplete="off" (input)="query($any($event.target).value)" (focus)="query($any($event.target).value)">
        </label>
        <ul *ngIf="results().length" class="customer-picker-results" role="listbox">
          <li *ngFor="let c of results()"><button type="button" role="option" (click)="pick(c)"><strong>{{ c.name }}</strong> <small class="record-secondary" dir="ltr">{{ c.phone }}<ng-container *ngIf="c.cnicFormatted"> · {{ c.cnicFormatted }}</ng-container> · {{ c.customerCode }}</small></button></li>
        </ul>
        <p *ngIf="searched() && !results().length" class="record-secondary customer-picker-none">{{ 'No customer found; the details below will create one.' | t }}</p>
      </ng-template>
    </div>
  `,
  styles: [`
    .customer-picker { grid-column: 1 / -1; margin-bottom: 8px; }
    .customer-picker-selected { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #E5DDD0; border-radius: 10px; background: #F7F3EC; }
    .customer-picker-selected > span:nth-child(2) { flex: 1; display: flex; flex-direction: column; }
    .customer-picker-search input { width: 100%; }
    .customer-picker-results { list-style: none; margin: 6px 0 0; padding: 0; border: 1px solid #E5DDD0; border-radius: 10px; background: #fff; overflow: hidden; }
    .customer-picker-results button { width: 100%; text-align: start; background: none; border: 0; border-bottom: 1px solid #EFE9DF; padding: 10px 12px; font: inherit; cursor: pointer; }
    .customer-picker-results li:last-child button { border-bottom: 0; }
    .customer-picker-results button:hover { background: #F7F3EC; }
    .customer-picker-none { margin: 6px 0 0; font-size: 12.5px; }
  `]
})
export class CustomerPickerComponent {
  portal = inject(PortalService);
  private api = inject(CustomersApiService);
  @Input() set customer(value: Customer | null) { this.selected.set(value); }
  @Output() picked = new EventEmitter<Customer | null>();
  selected = signal<Customer | null>(null);
  results = signal<Customer[]>([]);
  searched = signal(false);
  private terms = new Subject<string>();

  constructor() {
    this.terms.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(term => term.length >= 2 ? this.api.search(term).pipe(catchError(() => of([]))) : of([])),
      takeUntilDestroyed(inject(DestroyRef))
    ).subscribe(list => { this.results.set(list); this.searched.set(true); });
  }

  query(term: string) { this.searched.set(false); this.terms.next(term.trim()); }
  pick(c: Customer) { this.selected.set(c); this.results.set([]); this.picked.emit(c); }
  clear() { this.selected.set(null); this.searched.set(false); this.picked.emit(null); }
}
