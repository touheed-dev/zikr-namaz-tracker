import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getPrayerTimes } from '../utils/prayerTimes.js';

/** Aladhan times for a date using the user's location settings (cached daily). */
export function usePrayerTimes(dateISO) {
  const { user } = useAuth();
  const s = user?.settings || {};
  const [state, setState] = useState({ times: null, error: null, loading: true });

  useEffect(() => {
    if (!dateISO) return undefined;
    const ctrl = new AbortController();
    setState((p) => ({ ...p, loading: true, error: null }));
    getPrayerTimes({ dateISO, city: s.city, country: s.country, method: s.method, asr: s.asr }, { signal: ctrl.signal })
      .then((times) => setState({ times, error: null, loading: false }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({ times: null, error, loading: false });
      });
    return () => ctrl.abort();
  }, [dateISO, s.city, s.country, s.method, s.asr]);

  return state;
}
