import {
  Coordinates,
  CalculationMethod,
  PrayerTimes,
  SunnahTimes,
  Madhab,
  HighLatitudeRule,
} from 'adhan';
import { getJSON, setJSON, keysWithPrefix, removeItem } from './storage.js';

const CACHE_PREFIX = 'zn_pt:';
const CONFIG_CACHE_KEY = 'zn_prayer_config';

export const DEFAULT_COORDINATES = {
  lat: 19.08,
  lng: 72.88,
  label: 'Mumbai, India',
};

export const CALCULATION_METHODS = [
  { id: 'karachi', label: 'Karachi (India / Pakistan)' },
  { id: 'mwl', label: 'Muslim World League (MWL)' },
  { id: 'isna', label: 'ISNA (North America)' },
  { id: 'umm_al_qura', label: 'Umm al-Qura (Makkah)' },
  { id: 'egyptian', label: 'Egyptian General Authority' },
  { id: 'dubai', label: 'Dubai' },
  { id: 'singapore', label: 'Singapore (MUIS)' },
];

export const METHODS = CALCULATION_METHODS; // backwards compatibility

export const MADHABS = [
  { id: 'hanafi', label: 'Hanafi (Later Asr)' },
  { id: 'shafi', label: 'Shafi / Standard' },
];

export const HIGH_LATITUDE_RULES = [
  { id: 'none', label: 'None' },
  { id: 'middleofthenight', label: 'Middle of the night' },
  { id: 'seventhofthenight', label: 'Seventh of the night' },
  { id: 'twilightangle', label: 'Angle-based rule' },
];

export const ISHA_ENDS = [
  { id: 'fajr', label: 'Until Fajr (default)' },
  { id: 'midnight', label: 'Until Islamic Midnight' },
];

export function normalizeMethod(m) {
  if (typeof m === 'number') {
    const map = { 1: 'karachi', 2: 'isna', 3: 'mwl', 4: 'umm_al_qura', 5: 'egyptian' };
    return map[m] || 'karachi';
  }
  if (!m) return 'karachi';
  const str = String(m).toLowerCase().trim();
  if (str === 'ummalqura') return 'umm_al_qura';
  return str;
}

export function getMethodParams(methodId) {
  const norm = normalizeMethod(methodId);
  switch (norm) {
    case 'mwl':
      return CalculationMethod.MuslimWorldLeague();
    case 'isna':
      return CalculationMethod.NorthAmerica();
    case 'umm_al_qura':
      return CalculationMethod.UmmAlQura();
    case 'egyptian':
      return CalculationMethod.Egyptian();
    case 'dubai':
      return CalculationMethod.Dubai();
    case 'singapore':
      return CalculationMethod.Singapore();
    case 'karachi':
    default:
      return CalculationMethod.Karachi();
  }
}

export function getMadhab(madhab, asr) {
  const norm = String(madhab || asr || '').toLowerCase().trim();
  if (norm === 'shafi' || norm === 'standard') {
    return Madhab.Shafi;
  }
  return Madhab.Hanafi; // default Hanafi
}

export function getHighLatitudeRule(rule) {
  const norm = String(rule || '').toLowerCase().trim();
  switch (norm) {
    case 'middleofthenight':
    case 'middle_of_the_night':
      return HighLatitudeRule.MiddleOfTheNight;
    case 'seventhofthenight':
    case 'seventh_of_the_night':
      return HighLatitudeRule.SeventhOfTheNight;
    case 'twilightangle':
    case 'twilight_angle':
      return HighLatitudeRule.TwilightAngle;
    default:
      return null;
  }
}

/** "2026-11-02" -> "02-11-2026" (Aladhan legacy test compatibility) */
export function toAladhanDate(iso) {
  const [y, m, d] = (iso || '').split('-');
  return `${d}-${m}-${y}`;
}

export function buildAladhanUrl({ dateISO, city, country, method, asr }) {
  const q = new URLSearchParams({
    city: city || 'Mumbai',
    country: country || 'India',
    method: String(method || 1),
    school: asr === 'hanafi' ? '1' : '0',
  });
  return `https://api.aladhan.com/v1/timingsByCity/${toAladhanDate(dateISO)}?${q}`;
}

const clean = (t) => (t || '').slice(0, 5);

export function parseAladhan(json) {
  const t = json?.data?.timings;
  if (!t) throw new Error('No prayer times in response');
  return {
    fajr: clean(t.Fajr),
    sunrise: clean(t.Sunrise),
    dhuhr: clean(t.Dhuhr),
    asr: clean(t.Asr),
    maghrib: clean(t.Maghrib),
    isha: clean(t.Isha),
  };
}

export function dateToHHMM(date, timeZone) {
  if (!date || isNaN(date.getTime())) return '';
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(date);
      const h = parts.find((p) => p.type === 'hour')?.value || '00';
      const m = parts.find((p) => p.type === 'minute')?.value || '00';
      return `${h}:${m}`;
    } catch {
      /* fallback to local time */
    }
  }
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function calculatePrayerTimes(opts = {}) {
  const cachedConfig = getCachedPrayerConfig();
  const dateISO = opts.dateISO || new Date().toISOString().slice(0, 10);
  const lat = opts.lat ?? cachedConfig?.lat ?? DEFAULT_COORDINATES.lat;
  const lng = opts.lng ?? cachedConfig?.lng ?? DEFAULT_COORDINATES.lng;
  const method = opts.method ?? cachedConfig?.method ?? 'karachi';
  const madhab = opts.madhab ?? cachedConfig?.madhab ?? opts.asr ?? 'hanafi';
  const highLat = opts.highLat ?? cachedConfig?.highLat ?? 'none';
  const ishaEnd = opts.ishaEnd ?? cachedConfig?.ishaEnd ?? 'fajr';
  const timeZone = opts.timeZone;

  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const coords = new Coordinates(lat, lng);
  const params = getMethodParams(method);

  params.madhab = getMadhab(madhab, opts.asr);

  const highLatRule = getHighLatitudeRule(highLat);
  if (highLatRule) {
    params.highLatitudeRule = highLatRule;
  }

  const pt = new PrayerTimes(coords, date, params);
  const sunnah = new SunnahTimes(pt);

  const fajrStr = dateToHHMM(pt.fajr, timeZone);
  const midnightStr = dateToHHMM(sunnah.middleOfTheNight, timeZone);
  const ishaEndStr = ishaEnd === 'midnight' ? midnightStr : fajrStr;

  return {
    fajr: fajrStr,
    sunrise: dateToHHMM(pt.sunrise, timeZone),
    dhuhr: dateToHHMM(pt.dhuhr, timeZone),
    asr: dateToHHMM(pt.asr, timeZone),
    maghrib: dateToHHMM(pt.maghrib, timeZone),
    isha: dateToHHMM(pt.isha, timeZone),
    midnight: midnightStr,
    ishaEnd: ishaEndStr,
    raw: {
      fajr: pt.fajr,
      sunrise: pt.sunrise,
      dhuhr: pt.dhuhr,
      asr: pt.asr,
      maghrib: pt.maghrib,
      isha: pt.isha,
      midnight: sunnah.middleOfTheNight,
    },
  };
}

function cacheKey(opts) {
  const normMethod = normalizeMethod(opts.method);
  return `${CACHE_PREFIX}${opts.dateISO}:${opts.lat}:${opts.lng}:${normMethod}:${opts.madhab || opts.asr}:${opts.highLat}:${opts.ishaEnd}`;
}

export function getCachedPrayerConfig() {
  return getJSON(CONFIG_CACHE_KEY, null);
}

export function setCachedPrayerConfig(config) {
  setJSON(CONFIG_CACHE_KEY, config);
}

/**
 * On-device offline prayer times with localStorage caching.
 * Maintains identical exported API so Today page keeps working.
 */
export async function getPrayerTimes(opts, _extra) {
  const key = cacheKey(opts);
  const cached = getJSON(key);
  if (cached) return cached;

  const times = calculatePrayerTimes(opts);

  // keep only today's entries to stop the cache growing forever
  for (const k of keysWithPrefix(CACHE_PREFIX)) {
    if (!k.startsWith(`${CACHE_PREFIX}${opts.dateISO}:`)) removeItem(k);
  }
  setJSON(key, times);
  return times;
}

/** "05:20" -> "5:20 am" */
export function formatTime12(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  let [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Minutes from `now` (a Date) until hh:mm today. Negative if past. */
export function minutesUntil(hhmm, now = new Date()) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return Math.round((target - now) / 60000);
}

/** "2h 48m", "35m", "now" */
export function formatCountdown(mins) {
  if (mins === null || mins === undefined) return '';
  if (mins <= 0) return 'now';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Live countdown with seconds: "1h 24m 10s", "35m 12s", "now" */
export function formatLiveCountdown(diffMs) {
  if (diffMs == null || diffMs <= 0) return 'now';
  const totalSecs = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) {
    return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function getCurrentAndNextPrayer(times, now = new Date()) {
  if (!times) return null;
  const list = [
    { id: 'fajr', label: 'Fajr', isPrayer: true },
    { id: 'sunrise', label: 'Sunrise', isPrayer: false },
    { id: 'dhuhr', label: 'Dhuhr', isPrayer: true },
    { id: 'asr', label: 'Asr', isPrayer: true },
    { id: 'maghrib', label: 'Maghrib', isPrayer: true },
    { id: 'isha', label: 'Isha', isPrayer: true },
  ];

  const nowMs = now.getTime();
  const todayEntries = list.map((item) => {
    let dateObj = times.raw?.[item.id];
    if (!dateObj && times[item.id]) {
      const [h, m] = times[item.id].split(':').map(Number);
      dateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    }
    return { ...item, time: times[item.id], date: dateObj, ms: dateObj ? dateObj.getTime() : 0 };
  });

  // Find next upcoming prayer
  const nextPrayer = todayEntries.find((e) => e.isPrayer && e.ms > nowMs);
  let next = null;
  if (nextPrayer) {
    next = {
      id: nextPrayer.id,
      label: nextPrayer.label,
      time: nextPrayer.time,
      diffMs: nextPrayer.ms - nowMs,
      diffMins: Math.round((nextPrayer.ms - nowMs) / 60000),
    };
  } else {
    // Tomorrow Fajr
    const tomorrowFajrMs = todayEntries[0].ms + 24 * 60 * 60 * 1000;
    next = {
      id: 'fajr',
      label: 'Fajr',
      time: times.fajr,
      diffMs: tomorrowFajrMs - nowMs,
      diffMins: Math.round((tomorrowFajrMs - nowMs) / 60000),
      isTomorrow: true,
    };
  }

  // Determine current period
  let current = null;
  if (nowMs < todayEntries[0].ms) {
    current = { id: 'isha', label: 'Isha / Night', time: times.isha };
  } else if (nowMs < todayEntries[1].ms) {
    current = { id: 'fajr', label: 'Fajr', time: times.fajr };
  } else if (nowMs < todayEntries[2].ms) {
    current = { id: 'sunrise', label: 'Ishraq / Duha', time: times.sunrise };
  } else if (nowMs < todayEntries[3].ms) {
    current = { id: 'dhuhr', label: 'Dhuhr', time: times.dhuhr };
  } else if (nowMs < todayEntries[4].ms) {
    current = { id: 'asr', label: 'Asr', time: times.asr };
  } else if (nowMs < todayEntries[5].ms) {
    current = { id: 'maghrib', label: 'Maghrib', time: times.maghrib };
  } else {
    current = { id: 'isha', label: 'Isha', time: times.isha };
  }

  return { current, next };
}

/**
 * City search using Open-Meteo geocoding (no key required).
 * Returns lat/lng rounded to 2 decimals (~1km) for privacy.
 */
export async function searchCities(query, { signal } = {}) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`City search failed (${res.status})`);
  const data = await res.json();
  if (!data?.results) return [];
  return data.results.map((r) => {
    const lat = Math.round(r.latitude * 100) / 100;
    const lng = Math.round(r.longitude * 100) / 100;
    const parts = [r.name, r.admin1, r.country].filter(Boolean);
    const label = parts.join(', ').slice(0, 80);
    return {
      id: r.id,
      name: r.name,
      country: r.country,
      lat,
      lng,
      label,
      timezone: r.timezone,
    };
  });
}

/**
 * "Use my location" helper (navigator.geolocation).
 * Only invoked on explicit user tap.
 */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject(new Error('Geolocation is not supported by your browser'));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lng = Math.round(pos.coords.longitude * 100) / 100;
        const label = `${lat}°, ${lng}°`;
        resolve({ lat, lng, label });
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}
