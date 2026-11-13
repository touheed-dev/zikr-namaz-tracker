import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getPrayerTimes,
  calculatePrayerTimes,
  getCachedPrayerConfig,
} from '../utils/prayerTimes.js';

/**
 * On-device offline prayer times for a date using the user's location & calculation settings.
 */
export function usePrayerTimes(dateISO) {
  const { user } = useAuth();
  const s = user?.settings || {};

  const [state, setState] = useState(() => {
    if (!dateISO) return { times: null, error: null, loading: true };
    try {
      const cached = getCachedPrayerConfig();
      const times = calculatePrayerTimes({
        dateISO,
        lat: s.lat ?? cached?.lat,
        lng: s.lng ?? cached?.lng,
        locationLabel: s.locationLabel ?? cached?.locationLabel,
        method: s.method ?? cached?.method,
        madhab: s.madhab ?? cached?.madhab ?? s.asr,
        highLat: s.highLat ?? cached?.highLat,
        ishaEnd: s.ishaEnd ?? cached?.ishaEnd,
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
    const cached = getCachedPrayerConfig();

    getPrayerTimes(
      {
        dateISO,
        lat: s.lat ?? cached?.lat,
        lng: s.lng ?? cached?.lng,
        locationLabel: s.locationLabel ?? cached?.locationLabel,
        city: s.city,
        country: s.country,
        method: s.method ?? cached?.method,
        madhab: s.madhab ?? cached?.madhab ?? s.asr,
        highLat: s.highLat ?? cached?.highLat,
        ishaEnd: s.ishaEnd ?? cached?.ishaEnd,
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
    s.lat,
    s.lng,
    s.locationLabel,
    s.city,
    s.country,
    s.method,
    s.madhab,
    s.asr,
    s.highLat,
    s.ishaEnd,
    user?.timezone,
  ]);

  return state;
}
