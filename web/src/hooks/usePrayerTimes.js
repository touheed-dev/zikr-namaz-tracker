import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getPrayerTimes,
  calculatePrayerTimes,
  getPrayerConfig,
} from '../utils/prayerTimes.js';

/**
 * On-device offline prayer times for a date using the user's location & calculation settings.
 */
export function usePrayerTimes(dateISO) {
  const { user } = useAuth();
  const config = useMemo(() => getPrayerConfig(user?.settings), [user?.settings]);

  const [state, setState] = useState(() => {
    if (!dateISO) return { times: null, error: null, loading: true };
    try {
      const times = calculatePrayerTimes({
        dateISO,
        ...config,
        timeZone: user?.timezone,
      });
      return { times, error: null, loading: false };
    } catch {
      return { times: null, error: null, loading: true };
    }
  });

  useEffect(() => {
    if (!dateISO) return undefined;
    const ctrl = new AbortController();

    getPrayerTimes(
      {
        dateISO,
        ...config,
        city: user?.settings?.city,
        country: user?.settings?.country,
        timeZone: user?.timezone,
      },
      { signal: ctrl.signal },
    )
      .then((times) => setState({ times, error: null, loading: false }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({ times: null, error, loading: false });
      });

    return () => ctrl.abort();
  }, [
    dateISO,
    config,
    user?.settings?.city,
    user?.settings?.country,
    user?.timezone,
  ]);

  return state;
}
