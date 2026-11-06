"use client";

import { useCallback, useEffect, useState, type DependencyList } from "react";

type AsyncState<T> = { data: T | undefined; error: unknown; loading: boolean };

/**
 * Load data into component state. Re-runs when `deps` change or on reload(); a result that
 * arrives after a newer load or after unmount is dropped. With `enabled` false it waits
 * (e.g. until a run id is known) and reports not loading.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList, enabled = true) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: null, loading: enabled });
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ data: undefined, error: null, loading: false });
      return;
    }
    let current = true;
    setState({ data: undefined, error: null, loading: true });
    load().then(
      (data) => current && setState({ data, error: null, loading: false }),
      (error: unknown) => current && setState({ data: undefined, error, loading: false })
    );
    return () => {
      current = false;
    };
    // `load` is a new closure every render; the caller's deps say when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  /** Replace the loaded value, e.g. with the result of a mutation. */
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);
  return { ...state, reload, setData };
}
