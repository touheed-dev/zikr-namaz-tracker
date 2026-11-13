import { useState, useEffect, useMemo } from 'react';
import { useAuth, useToday } from '../context/AuthContext.jsx';
import { useNow } from '../hooks/useNow.js';
import { useToast } from '../context/ToastContext.jsx';
import { Card, Icon } from '../components/ui/index.jsx';
import { PageHead } from '../components/layout/AppShell.jsx';
import { addDays, formatDay, formatShort, weekdayShort } from '../utils/dates.js';
import {
  calculatePrayerTimes,
  searchCities,
  getCurrentLocation,
  getCurrentAndNextPrayer,
  formatTime12,
  formatLiveCountdown,
  setCachedPrayerConfig,
  CALCULATION_METHODS,
  MADHABS,
  HIGH_LATITUDE_RULES,
  ISHA_ENDS,
  DEFAULT_COORDINATES,
} from '../utils/prayerTimes.js';

export default function Times() {
  const { user, saveSettings } = useAuth();
  const today = useToday();
  const now = useNow(1000);
  const toast = useToast();

  const s = user?.settings || {};
  const lat = s.lat ?? DEFAULT_COORDINATES.lat;
  const lng = s.lng ?? DEFAULT_COORDINATES.lng;
  const hasCustomLocation = s.lat != null && s.lng != null;
  const locationLabel = s.locationLabel || (hasCustomLocation ? `${lat}°, ${lng}°` : DEFAULT_COORDINATES.label);

  const method = s.method || 'karachi';
  const madhab = s.madhab || s.asr || 'hanafi';
  const highLat = s.highLat || 'none';
  const ishaEnd = s.ishaEnd || 'fajr';

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  // Debounced search for cities
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchCities(q, { signal: ctrl.signal })
        .then((res) => {
          setSearchResults(res);
          setSearching(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          setSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [searchQuery]);

  const saveConfig = async (patch) => {
    setSavingKey(Object.keys(patch)[0]);
    try {
      await saveSettings(patch);
      // update offline localStorage cache
      setCachedPrayerConfig({
        lat: patch.lat ?? lat,
        lng: patch.lng ?? lng,
        locationLabel: patch.locationLabel ?? locationLabel,
        method: patch.method ?? method,
        madhab: patch.madhab ?? madhab,
        highLat: patch.highLat ?? highLat,
        ishaEnd: patch.ishaEnd ?? ishaEnd,
      });
      toast.show('Settings saved');
    } catch (err) {
      toast.show(`Could not save: ${err.message}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleUseMyLocation = async () => {
    if (geoLoading) return;
    setGeoLoading(true);
    try {
      const loc = await getCurrentLocation();
      await saveConfig({
        lat: loc.lat,
        lng: loc.lng,
        locationLabel: loc.label,
      });
      toast.show(`Location set: ${loc.label}`);
    } catch (err) {
      toast.show(`Geolocation failed: ${err.message}`);
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSelectCity = async (city) => {
    setSearchQuery('');
    setSearchResults([]);
    await saveConfig({
      lat: city.lat,
      lng: city.lng,
      locationLabel: city.label,
      city: city.name,
      country: city.country || s.country || 'India',
      ...(city.timezone ? { timezone: city.timezone } : {}),
    });
    toast.show(`Location set: ${city.label}`);
  };

  // Calculate today's prayer times
  const todayTimes = useMemo(() => {
    return calculatePrayerTimes({
      dateISO: today,
      lat,
      lng,
      method,
      madhab,
      highLat,
      ishaEnd,
      timeZone: user?.timezone,
    });
  }, [today, lat, lng, method, madhab, highLat, ishaEnd, user?.timezone]);

  // Current & next prayer info
  const prayerInfo = useMemo(() => {
    return getCurrentAndNextPrayer(todayTimes, now);
  }, [todayTimes, now]);

  // Next 7 days timetable
  const weekTimetable = useMemo(() => {
    const list = [];
    for (let i = 0; i <= 7; i += 1) {
      const dateISO = addDays(today, i);
      const times = calculatePrayerTimes({
        dateISO,
        lat,
        lng,
        method,
        madhab,
        highLat,
        ishaEnd,
        timeZone: user?.timezone,
      });
      list.push({ dateISO, isToday: i === 0, times });
    }
    return list;
  }, [today, lat, lng, method, madhab, highLat, ishaEnd, user?.timezone]);

  const liveCountdown = prayerInfo ? formatLiveCountdown(prayerInfo.next.diffMs) : '';

  return (
    <>
      <PageHead title="Prayer times" />

      <header className="page-head">
        <div>
          <div className="small muted">Daily timetable & offline calculation</div>
          <h1>Prayer times</h1>
        </div>
        <div className="chip chip--light">
          <Icon name="compass" size={14} />
          <span>{locationLabel}</span>
        </div>
      </header>

      {!hasCustomLocation && (
        <div className="card card--deep mb-12">
          <div className="row row--between" style={{ gap: 12, alignItems: 'center' }}>
            <div className="row" style={{ gap: 10 }}>
              <Icon name="compass" size={20} className="accent-color" />
              <div className="small">
                <div className="strong">Set your location for accurate times</div>
                <div className="tiny muted">
                  Using default location ({DEFAULT_COORDINATES.label}). Tap below to detect or search your city.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={handleUseMyLocation}
              disabled={geoLoading}
              style={{ whiteSpace: 'nowrap' }}
            >
              {geoLoading ? 'Detecting…' : 'Use my location'}
            </button>
          </div>
        </div>
      )}

      <div className="layout-2col">
        {/* Left Column: Today & Next 7 Days Timetable */}
        <div className="layout-2col__left">
          {/* Today's Timetable Card */}
          <Card
            title="Today's timetable"
            aside={formatDay(today)}
          >
            {prayerInfo && (
              <div className="card card--deep mb-12" style={{ padding: '12px 14px' }}>
                <div className="row row--between" style={{ gap: 8 }}>
                  <div>
                    <span className="tiny muted uppercase">Current:</span>{' '}
                    <span className="strong">{prayerInfo.current.label}</span>
                  </div>
                  <div>
                    <span className="tiny muted uppercase">Next:</span>{' '}
                    <span className="strong accent-color">{prayerInfo.next.label}</span>
                    <span className="muted"> in </span>
                    <span className="strong" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {liveCountdown}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="today-prayer-grid">
              {[
                { id: 'fajr', label: 'Fajr', time: todayTimes.fajr },
                { id: 'sunrise', label: 'Sunrise', time: todayTimes.sunrise },
                { id: 'dhuhr', label: 'Dhuhr', time: todayTimes.dhuhr },
                { id: 'asr', label: 'Asr', time: todayTimes.asr },
                { id: 'maghrib', label: 'Maghrib', time: todayTimes.maghrib },
                { id: 'isha', label: 'Isha', time: todayTimes.isha },
              ].map((item) => {
                const isCurrent = prayerInfo?.current.id === item.id;
                const isNext = prayerInfo?.next.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`today-prayer-item ${isCurrent || isNext ? 'today-prayer-item--active' : ''}`}
                  >
                    <div className="row row--between">
                      <span className="today-prayer-item__name">{item.label}</span>
                      {isCurrent && <span className="chip chip--xs chip--light">Now</span>}
                      {isNext && <span className="chip chip--xs chip--green">Next</span>}
                    </div>
                    <div className="today-prayer-item__time">
                      {formatTime12(item.time)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="row row--between tiny muted mt-12 pt-8" style={{ borderTop: '1px solid var(--line-soft)' }}>
              <span>Islamic Midnight: <span className="strong">{formatTime12(todayTimes.midnight)}</span></span>
              <span>Isha ends: <span className="strong">{formatTime12(todayTimes.ishaEnd)}</span></span>
            </div>
          </Card>

          {/* Next 7 Days Timetable Card */}
          <Card title="7-Day timetable" aside="Upcoming schedule">
            <div className="timetable-wrap">
              <table className="timetable" aria-label="7 day prayer timetable">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Fajr</th>
                    <th>Sunrise</th>
                    <th>Dhuhr</th>
                    <th>Asr</th>
                    <th>Maghrib</th>
                    <th>Isha</th>
                  </tr>
                </thead>
                <tbody>
                  {weekTimetable.map((row) => (
                    <tr key={row.dateISO} className={row.isToday ? 'is-today' : ''}>
                      <td>
                        <div className="strong">
                          {row.isToday ? 'Today' : weekdayShort(row.dateISO)}
                        </div>
                        <div className="tiny muted">{formatShort(row.dateISO)}</div>
                      </td>
                      <td>{formatTime12(row.times.fajr)}</td>
                      <td className="muted">{formatTime12(row.times.sunrise)}</td>
                      <td>{formatTime12(row.times.dhuhr)}</td>
                      <td>{formatTime12(row.times.asr)}</td>
                      <td>{formatTime12(row.times.maghrib)}</td>
                      <td>{formatTime12(row.times.isha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tiny muted center mt-8">
              All prayer times are computed on-device and remain accessible completely offline.
            </div>
          </Card>
        </div>

        {/* Right Column: Location & Calculation Settings */}
        <div className="layout-2col__right">
          {/* Location Card */}
          <Card title="Location" aside="Privacy-friendly ~1km">
            <div className="stack stack--sm">
              <div className="row row--between" style={{ alignItems: 'baseline' }}>
                <span className="small muted">Current location:</span>
                <span className="strong small">{locationLabel}</span>
              </div>
              <div className="tiny muted">
                Coordinates: {lat}°, {lng}° (rounded to 2 decimals for privacy)
              </div>

              <div className="row mt-4" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--outline btn--block"
                  onClick={handleUseMyLocation}
                  disabled={geoLoading}
                >
                  <Icon name="compass" size={16} />
                  <span>{geoLoading ? 'Detecting…' : 'Use my location'}</span>
                </button>
              </div>

              {/* City search input */}
              <div className="field mt-8" style={{ position: 'relative' }}>
                <label className="field__label" htmlFor="city-search">
                  Search city or town
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="city-search"
                    type="search"
                    className="input"
                    placeholder="e.g. Hyderabad, London, Makkah…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {searching && (
                    <div style={{ position: 'absolute', right: 12, top: 12 }}>
                      <span className="small muted">Searching…</span>
                    </div>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div
                    className="card card--deep stack stack--xs mt-4"
                    style={{
                      maxHeight: 220,
                      overflowY: 'auto',
                      padding: 6,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    }}
                  >
                    {searchResults.map((city) => (
                      <button
                        key={`${city.id}-${city.lat}`}
                        type="button"
                        className="btn btn--ghost btn--block row row--between"
                        style={{ textAlign: 'left', padding: '8px 10px', height: 'auto' }}
                        onClick={() => handleSelectCity(city)}
                      >
                        <div>
                          <div className="strong small">{city.name}</div>
                          <div className="tiny muted">{city.label}</div>
                        </div>
                        <Icon name="check" size={14} className="muted" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Calculation Settings Card */}
          <Card title="Calculation settings" aside="Islamic conventions">
            <div className="stack">
              <div className="field">
                <label className="field__label" htmlFor="calc-method">
                  Calculation method
                </label>
                <select
                  id="calc-method"
                  className="select"
                  value={method}
                  disabled={savingKey === 'method'}
                  onChange={(e) => saveConfig({ method: e.target.value })}
                >
                  {CALCULATION_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="tiny muted mt-2">
                  Karachi is standard for India and Pakistan. MWL and ISNA are common in the West.
                </div>
              </div>

              <div>
                <div className="field__label" id="madhab-label">
                  Asr madhab (School of thought)
                </div>
                <div className="row" role="group" aria-labelledby="madhab-label" style={{ gap: 6 }}>
                  {MADHABS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="chip chip--btn"
                      aria-pressed={madhab === m.id}
                      disabled={savingKey === 'madhab'}
                      onClick={() => saveConfig({ madhab: m.id, asr: m.id === 'hanafi' ? 'hanafi' : 'standard' })}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="tiny muted mt-2">
                  Hanafi calculates Asr when shadows are twice the object length (later Asr).
                </div>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="high-lat">
                  High-latitude rule
                </label>
                <select
                  id="high-lat"
                  className="select"
                  value={highLat}
                  disabled={savingKey === 'highLat'}
                  onChange={(e) => saveConfig({ highLat: e.target.value })}
                >
                  {HIGH_LATITUDE_RULES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="tiny muted mt-2">
                  Adjusts Fajr and Isha for regions above 48° where twilight persists.
                </div>
              </div>

              <div>
                <div className="field__label" id="isha-end-label">
                  Isha end time
                </div>
                <div className="row" role="group" aria-labelledby="isha-end-label" style={{ gap: 6 }}>
                  {ISHA_ENDS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="chip chip--btn"
                      aria-pressed={ishaEnd === e.id}
                      disabled={savingKey === 'ishaEnd'}
                      onClick={() => saveConfig({ ishaEnd: e.id })}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                <div className="tiny muted mt-2">
                  According to authentic hadith, the preferred time of Isha extends to Islamic midnight (halfway between Maghrib and Fajr).
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

