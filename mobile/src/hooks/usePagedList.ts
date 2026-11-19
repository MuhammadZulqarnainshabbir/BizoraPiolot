import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/api/client';
import type { ListQuery, Page } from '@/api/models';

interface Options {
  /** "field:asc" or "field:desc" */
  sort: string;
  limit?: number;
  fallback?: string;
}

interface State<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  loaded: boolean;
  error: string;
  /** The search the current results answer. */
  searchTerm: string;
}

/**
 * Server-side paginated list for a FlatList: debounced search, sort, pull-to-refresh and
 * "load more" (infinite scroll). Pass filters through `deps`; the list restarts from page 1
 * when any of them change. Stale responses are discarded.
 */
export function usePagedList<T>(fetcher: (query: ListQuery) => Promise<Page<T>>, options: Options, deps: unknown[]) {
  const limit = options.limit ?? 20;
  const fallback = options.fallback ?? 'Unable to load. Please try again.';
  const [state, setState] = useState<State<T>>({ items: [], total: 0, page: 1, totalPages: 1, loading: true, refreshing: false, loadingMore: false, loaded: false, error: '', searchTerm: '' });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(options.sort);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Debounce typing.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async (page: number, mode: 'initial' | 'refresh' | 'silent' | 'more') => {
    const id = ++requestId.current;
    setState(s => ({ ...s, loading: mode === 'initial', refreshing: mode === 'refresh', loadingMore: mode === 'more', error: mode === 'silent' ? s.error : '' }));
    const [field, order] = sort.split(':');
    try {
      const result = await fetcherRef.current({ page, limit, search, sort: field, order: order === 'asc' ? 'asc' : 'desc' });
      if (id !== requestId.current) return;
      // The page no longer exists (e.g. its last record was deleted): step back.
      if (!result.records.length && result.total > 0 && result.page > result.totalPages && mode !== 'more') { void load(result.totalPages, mode); return; }
      setState(s => ({
        items: mode === 'more' ? [...s.items, ...result.records] : result.records,
        total: result.total, page: result.page, totalPages: result.totalPages,
        loading: false, refreshing: false, loadingMore: false, loaded: true, error: '', searchTerm: search
      }));
    } catch (error) {
      if (id !== requestId.current) return;
      setState(s => ({ ...s, loading: false, refreshing: false, loadingMore: false, error: mode === 'silent' && s.loaded ? s.error : errorMessage(error, fallback) }));
    }
  }, [fallback, limit, search, sort]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(1, 'initial'); }, [load, ...deps]);

  useFocusEffect(useCallback(() => {
    if (stateRef.current.loaded) void load(1, 'silent');
  }, [load]));

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.loading || s.loadingMore || s.refreshing || s.page >= s.totalPages) return;
    void load(s.page + 1, 'more');
  }, [load]);

  return {
    ...state,
    searchInput,
    setSearchInput,
    sort,
    setSort,
    reload: () => load(1, 'initial'),
    refresh: () => load(1, 'refresh'),
    silentReload: () => load(1, 'silent'),
    loadMore
  };
}

export type PagedList<T> = ReturnType<typeof usePagedList<T>>;
