import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/api/client';

interface LoadState<T> {
  data: T | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
}

type Mode = 'initial' | 'refresh' | 'silent';

/**
 * Loads one resource. Reloads when `deps` change, quietly re-fetches whenever the screen
 * regains focus (so changes made elsewhere show up), and supports pull-to-refresh.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[], fallback = 'Unable to load. Please try again.') {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: '', loading: true, refreshing: false });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const requestId = useRef(0);
  const loadedOnce = useRef(false);

  const load = useCallback(async (mode: Mode) => {
    const id = ++requestId.current;
    setState(s => ({ ...s, loading: mode === 'initial', refreshing: mode === 'refresh', error: mode === 'silent' ? s.error : '' }));
    try {
      const data = await loaderRef.current();
      if (id !== requestId.current) return;
      loadedOnce.current = true;
      setState({ data, error: '', loading: false, refreshing: false });
    } catch (error) {
      if (id !== requestId.current) return;
      setState(s => ({ ...s, loading: false, refreshing: false, error: mode === 'silent' && s.data ? s.error : errorMessage(error, fallback) }));
    }
  }, [fallback]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load('initial'); }, deps);

  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) void load('silent');
  }, [load]));

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setState(s => ({ ...s, data: typeof updater === 'function' ? (updater as (c: T | null) => T | null)(s.data) : updater }));
  }, []);

  return {
    ...state,
    reload: () => load('initial'),
    refresh: () => load('refresh'),
    silentReload: () => load('silent'),
    setData
  };
}
