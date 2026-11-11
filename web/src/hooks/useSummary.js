import { useCallback, useEffect, useRef } from 'react';
import { profile } from '../api/index.js';
import { useAsync } from './useAsync.js';

/** Points, rank and streaks. `refresh()` is debounced so rapid taps cause one call. */
export function useSummary() {
  const s = useAsync(() => profile.summary(), []);
  const t = useRef(null);
  const reload = s.reload;
  const refresh = useCallback(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => reload({ silent: true }), 600);
  }, [reload]);
  useEffect(() => () => clearTimeout(t.current), []);
  return { ...s, refresh };
}
