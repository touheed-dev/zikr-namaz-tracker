import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fn` when deps change. Ignores stale responses (only the latest call
 * may set state) and never sets state after unmount.
 */
export function useAsync(fn, deps, { skip = false } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: !skip });
  const callId = useRef(0);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++callId.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (mounted.current && id === callId.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (mounted.current && id === callId.current) setState((s) => ({ ...s, error, loading: false }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!skip) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, skip]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: run, setData };
}
