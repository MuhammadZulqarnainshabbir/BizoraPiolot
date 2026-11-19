import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../i18n/i18n.pipes';
import { tk } from '../i18n/i18n.service';
import { PagedList } from '../paged-list';

/** "Showing 1–20 of 95" + Previous / Next for any PagedList. */
@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <nav *ngIf="list.loaded() && list.records().length" class="list-pager" [attr.aria-label]="label | t">
      <span>{{ 'Showing {start}–{end} of {total}' | t:{ start: list.rangeStart(), end: list.rangeEnd(), total: list.total() } }}</span>
      <div *ngIf="list.totalPages() > 1" class="list-pager-buttons">
        <button type="button" (click)="list.goTo(list.page() - 1)" [disabled]="list.page() <= 1 || list.loading()">{{ '← Previous' | t }}</button>
        <span>{{ 'Page {page} of {pages}' | t:{ page: list.page(), pages: list.totalPages() } }}</span>
        <button type="button" (click)="list.goTo(list.page() + 1)" [disabled]="list.page() >= list.totalPages() || list.loading()">{{ 'Next →' | t }}</button>
      </div>
    </nav>
  `
})
export class PagerComponent {
  @Input({ required: true }) list!: PagedList<unknown>;
  readonly label = tk('Pages');
}
