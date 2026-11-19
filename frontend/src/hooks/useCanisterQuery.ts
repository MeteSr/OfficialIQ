import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export type CanisterQuery<T> = {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** Runs the fetch again (e.g. from a "Try again" button). */
  reload: () => void;
};

/**
 * Loads data from a canister with explicit loading and error state, in place
 * of a bare `useEffect` + `.catch(() => {})` that turns an outage into an
 * empty screen. Re-fetches when `deps` change; a response that arrives after
 * a newer request started (or after unmount) is ignored. Pair it with
 * <LoadError> to show the failure and a retry.
 */
export function useCanisterQuery<T>(fetch: () => Promise<T>, deps: DependencyList): CanisterQuery<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    fetch().then(
      (v) => { if (latest.current === id) { setData(v); setLoading(false); } },
      (e: unknown) => {
        if (latest.current !== id) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      },
    );
    return () => { latest.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, loading, reload };
}
