/**
 * A tiny data-loading hook: runs `load` when the dependencies change, ignores
 * answers that arrive after the inputs changed, and exposes `reload`.
 */
import { useCallback, useEffect, useState, type DependencyList } from 'react';

/** What the hook returns. */
export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload(): void;
}

/** Load data with an AbortSignal; `deps` decide when to load again. */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal).then(
      (value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setError(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setData(undefined);
        setError(err);
        setLoading(false);
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload };
}
