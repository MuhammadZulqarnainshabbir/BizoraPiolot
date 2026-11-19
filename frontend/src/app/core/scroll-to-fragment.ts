import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

/**
 * Scrolls to the element named in the URL fragment (e.g. /partnerdashboard#shop-management).
 * The router's own anchor scrolling runs before pages that load data have rendered, so pages
 * that are nav targets call this once their view exists.
 */
export function scrollToFragment(route: ActivatedRoute, destroyRef: DestroyRef) {
  route.fragment.pipe(takeUntilDestroyed(destroyRef)).subscribe(id => {
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
}
