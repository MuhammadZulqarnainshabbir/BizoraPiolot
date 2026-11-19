import { DestroyRef, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, catchError, debounceTime, distinctUntilChanged, filter, finalize, fromEvent, interval, map, merge, switchMap, throttleTime } from 'rxjs';
import { ListQuery, Page } from './shop-data.service';

export interface SortOption {
  /** "field:asc" or "field:desc" */
  value: string;
  label: string;
}

/**
 * Server-side paginated list state: page, search and sort, with stale
 * responses discarded when the user moves on before a request finishes.
 */
export class PagedList<T> {
  readonly records = signal<T[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly searchTerm = signal('');
  readonly rangeStart = computed(() => this.total() ? (this.page() - 1) * this.pageSize + 1 : 0);
  readonly rangeEnd = computed(() => (this.page() - 1) * this.pageSize + this.records().length);

  sort: string;
  /** The search typed by the user; `searchTerm` is the search the current results are for. */
  private requestedSearch = '';

  /** Emits true for background refreshes, which update the table without the loading state. */
  private readonly reload$ = new Subject<boolean>();
  private readonly search$ = new Subject<string>();

  constructor(
    fetch: (query: ListQuery) => Observable<Page<T>>,
    private readonly destroyRef: DestroyRef,
    onError: (error: unknown) => void,
    defaultSort: string,
    private readonly pageSize = 20
  ) {
    this.sort = defaultSort;

    this.search$.pipe(
      debounceTime(300),
      map(value => value.trim()),
      distinctUntilChanged(),
      takeUntilDestroyed(destroyRef)
    ).subscribe(value => {
      this.requestedSearch = value;
      this.goTo(1);
    });

    this.reload$.pipe(
      switchMap(silent => {
        if (!silent) this.loading.set(true);
        const query = this.query();
        return fetch(query).pipe(
          // Remember which search these results answer, so the "N matching X" label never
          // pairs a new search term with the previous result's count.
          map(result => ({ ...result, search: query.search })),
          catchError(error => {
            // A failed background refresh keeps the current rows rather than showing an error.
            if (!silent) onError(error);
            return EMPTY;
          }),
          finalize(() => { if (!silent) this.loading.set(false); })
        );
      }),
      takeUntilDestroyed(destroyRef)
    ).subscribe(result => {
      // The current page no longer exists (e.g. its last record was deleted): step back.
      if (!result.records.length && result.total > 0 && result.page > result.totalPages) {
        this.page.set(result.totalPages);
        this.reload();
        return;
      }
      this.records.set(result.records);
      this.page.set(result.page);
      this.total.set(result.total);
      this.totalPages.set(result.totalPages);
      this.searchTerm.set(result.search);
      this.loaded.set(true);
    });
  }

  reload() {
    this.reload$.next(false);
  }

  /**
   * Quietly re-fetches the current page when the browser tab becomes visible again and
   * every `intervalMs` while it's visible, so changes made elsewhere (e.g. an employee's
   * sale reducing stock) show up without a manual reload.
   */
  autoRefresh(intervalMs = 20000) {
    merge(
      fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible')),
      interval(intervalMs).pipe(filter(() => document.visibilityState === 'visible'))
    ).pipe(
      filter(() => this.loaded() && !this.loading()),
      throttleTime(2000),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.reload$.next(true));
  }

  goTo(page: number) {
    this.page.set(Math.max(1, page));
    this.reload();
  }

  search(value: string) {
    this.search$.next(value);
  }

  changeSort(value: string) {
    this.sort = value;
    this.goTo(1);
  }

  private query(): ListQuery {
    const [sort, order] = this.sort.split(':');
    return {
      page: this.page(),
      limit: this.pageSize,
      search: this.requestedSearch,
      sort,
      order: order === 'asc' ? 'asc' : 'desc'
    };
  }
}
