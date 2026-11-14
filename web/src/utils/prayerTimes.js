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
    const map = { 1: 'karachi', 2: 'isna', 3: 'mwl', 4: 'umm_al_qura', 5: 'egyptian', 7: 'karachi' };
    return map[m] || 'karachi';
  }
  if (!m) return 'karachi';
  const str = String(m).toLowerCase().trim();
  const numMap = { '1': 'karachi', '2': 'isna', '3': 'mwl', '4': 'umm_al_qura', '5': 'egyptian', '7': 'karachi' };
  if (numMap[str]) return numMap[str];
  if (str === 'ummalqura') return 'umm_al_qura';
  const validMethods = ['karachi', 'mwl', 'isna', 'umm_al_qura', 'egyptian', 'dubai', 'singapore'];
  if (validMethods.includes(str)) return str;
  return 'karachi';
}

export function normalizeMadhab(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    return val === 1 ? 'hanafi' : (val === 0 ? 'shafi' : null);
  }
  const str = String(val).toLowerCase().trim();
  if (str === 'shafi' || str === 'standard' || str === '0') return 'shafi';
  if (str === 'hanafi' || str === '1') return 'hanafi';
  return null;
}

export function normalizeIshaEnd(val) {
  if (val == null || val === '') return null;
  const str = String(val).toLowerCase().trim();
  if (str === 'midnight') return 'midnight';
  if (str === 'fajr') return 'fajr';
  return null;
}

export function normalizeHighLat(val) {
  if (!val) return null;
  const str = String(val).toLowerCase().trim();
  if (str === 'middleofthenight' || str === 'middle_of_the_night') return 'middleofthenight';
  if (str === 'seventhofthenight' || str === 'seventh_of_the_night') return 'seventhofthenight';
  if (str === 'twilightangle' || str === 'twilight_angle') return 'twilightangle';
  if (str === 'none') return 'none';
  return null;
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
  const norm = normalizeMadhab(madhab) || normalizeMadhab(asr) || 'hanafi';
  return norm === 'shafi' ? Madhab.Shafi : Madhab.Hanafi;
}

export function getHighLatitudeRule(rule) {
  const norm = normalizeHighLat(rule);
  switch (norm) {
    case 'middleofthenight':
      return HighLatitudeRule.MiddleOfTheNight;
    case 'seventhofthenight':
      return HighLatitudeRule.SeventhOfTheNight;
    case 'twilightangle':
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

/**
 * Safely parse an input into a valid Date object.
 * Accepts Date object, ISO string, HH:MM, or timestamp.
 */
export function toDate(input, refDate = new Date()) {
  if (input == null || input === '' || input === '--:--') return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s || s === '--:--') return null;
    const matchHHMM = s.match(/^(\d{1,2}):(\d{2})$/);
    if (matchHHMM) {
      const h = Number(matchHHMM[1]);
      const m = Number(matchHHMM[2]);
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        const base = refDate instanceof Date && !isNaN(refDate.getTime()) ? refDate : new Date();
        return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
      }
      return null;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function dateToHHMM(date, timeZone) {
  if (date == null || date === '') return '--:--';

  let d = date;
  if (typeof d === 'string') {
    const match = d.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
    }
    d = new Date(d);
  }

  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return '--:--';
  }

  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const h = parts.find((p) => p.type === 'hour')?.value || '00';
      const m = parts.find((p) => p.type === 'minute')?.value || '00';
      return `${h}:${m}`;
    } catch {
      /* fallback to local time */
    }
  }
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function getCachedPrayerConfig() {
  try {
    const val = getJSON(CONFIG_CACHE_KEY, null);
    if (!val || typeof val !== 'object') return null;
    if (val.lat != null && isNaN(Number(val.lat))) return null;
    if (val.lng != null && isNaN(Number(val.lng))) return null;
    return val;
  } catch {
    return null;
  }
}

export function setCachedPrayerConfig(config) {
  if (!config || typeof config !== 'object') return;
  try {
    setJSON(CONFIG_CACHE_KEY, config);
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Derives the single effective prayer calculation configuration.
 * Precedence: settings.madhab -> legacy settings.asr (mapped) -> cachedConfig -> default 'hanafi'.
 * Same pattern for method (legacy numeric IDs) and ishaEnd.
 */
export function getPrayerConfig(settings, cached) {
  const s = settings || {};
  const c = cached !== undefined ? (cached || {}) : (getCachedPrayerConfig() || {});

  // madhab: settings.madhab -> legacy settings.asr -> cached.madhab -> legacy cached.asr -> default 'hanafi'
  const madhab =
    normalizeMadhab(s.madhab) ??
    normalizeMadhab(s.asr) ??
    normalizeMadhab(c?.madhab) ??
    normalizeMadhab(c?.asr) ??
    'hanafi';

  // method: settings.method -> cached.method -> default 'karachi'
  const method =
    (s.method != null ? normalizeMethod(s.method) : null) ??
    (c?.method != null ? normalizeMethod(c.method) : null) ??
    'karachi';

  // ishaEnd: settings.ishaEnd -> cached.ishaEnd -> default 'fajr'
  const ishaEnd =
    normalizeIshaEnd(s.ishaEnd) ??
    normalizeIshaEnd(c?.ishaEnd) ??
    'fajr';

  // highLat: settings.highLat -> cached.highLat -> default 'none'
  const highLat =
    normalizeHighLat(s.highLat) ??
    normalizeHighLat(c?.highLat) ??
    'none';

  // lat & lng
  let rawLat = s.lat ?? c?.lat;
  if (rawLat == null || isNaN(Number(rawLat))) rawLat = DEFAULT_COORDINATES.lat;
  const lat = Number(rawLat);

  let rawLng = s.lng ?? c?.lng;
  if (rawLng == null || isNaN(Number(rawLng))) rawLng = DEFAULT_COORDINATES.lng;
  const lng = Number(rawLng);

  const hasCustomLocation = (s.lat != null && s.lng != null) || (c?.lat != null && c?.lng != null);

  let locationLabel = s.locationLabel || c?.locationLabel;
  if (!locationLabel) {
    locationLabel = hasCustomLocation ? `${lat}°, ${lng}°` : DEFAULT_COORDINATES.label;
  }

  return {
    lat,
    lng,
    locationLabel,
    hasCustomLocation,
    method,
    madhab,
    highLat,
    ishaEnd,
  };
}

export function calculatePrayerTimes(opts = {}) {
  const config = getPrayerConfig(opts);
  const dateISO = opts.dateISO || new Date().toISOString().slice(0, 10);
  const timeZone = opts.timeZone;

  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const coords = new Coordinates(config.lat, config.lng);
  const params = getMethodParams(config.method);

  params.madhab = getMadhab(config.madhab);

  const highLatRule = getHighLatitudeRule(config.highLat);
  if (highLatRule) {
    params.highLatitudeRule = highLatRule;
  }

  const pt = new PrayerTimes(coords, date, params);
  const sunnah = new SunnahTimes(pt);

  const fajrStr = dateToHHMM(pt.fajr, timeZone);
  const midnightStr = dateToHHMM(sunnah.middleOfTheNight, timeZone);
  const ishaEndStr = config.ishaEnd === 'midnight' ? midnightStr : fajrStr;

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

function cacheKey(opts = {}) {
  const config = getPrayerConfig(opts);
  const dateISO = opts.dateISO || '';
  return `${CACHE_PREFIX}${dateISO}:${config.lat}:${config.lng}:${config.method}:${config.madhab}:${config.highLat}:${config.ishaEnd}`;
}

/**
 * Validates and hydrates cached prayer times so raw contains real Date objects.
 * Safely handles and converts legacy Aladhan string-only caches or JSON-stringified Dates.
 */
export function hydratePrayerTimes(data, dateISO) {
  if (!data || typeof data !== 'object') return null;
  const prayers = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (const p of prayers) {
    if (typeof data[p] !== 'string' || !/^\d{1,2}:\d{2}$/.test(data[p])) {
      return null;
    }
  }

  let refDate = new Date();
  if (dateISO) {
    const [y, m, d] = String(dateISO).split('-').map(Number);
    if (y && m && d) refDate = new Date(y, m - 1, d);
  }

  const raw = {};
  for (const p of [...prayers, 'midnight']) {
    const rawVal = data.raw?.[p];
    const parsed = toDate(rawVal, refDate) || toDate(data[p], refDate);
    if (parsed) {
      raw[p] = parsed;
    }
  }

  return {
    ...data,
    midnight: data.midnight || (raw.midnight ? dateToHHMM(raw.midnight) : '--:--'),
    ishaEnd: data.ishaEnd || data.fajr,
    raw,
  };
}

/**
 * On-device offline prayer times with localStorage caching.
 * Maintains identical exported API so Today page keeps working.
 */
export async function getPrayerTimes(opts = {}, _extra) {
  const key = cacheKey(opts);
  try {
    const cached = getJSON(key);
    if (cached) {
      const hydrated = hydratePrayerTimes(cached, opts.dateISO);
      if (hydrated) return hydrated;
      removeItem(key);
    }
  } catch {
    removeItem(key);
  }

  const times = calculatePrayerTimes(opts);

  try {
    // keep only today's entries to stop the cache growing forever
    for (const k of keysWithPrefix(CACHE_PREFIX)) {
      if (!k.startsWith(`${CACHE_PREFIX}${opts.dateISO}:`)) removeItem(k);
    }
    setJSON(key, times);
  } catch {
    /* ignore storage errors */
  }
  return times;
}

/**
 * Formats a time into 12-hour format e.g. "5:20 am", "12:20 pm".
 * Accepts Date object, ISO string, or "HH:MM".
 * Returns "--:--" for invalid or missing input.
 */
export function formatTime12(input) {
  if (input == null || input === '' || input === '--:--') return '--:--';

  let h = null;
  let m = null;

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return '--:--';
    h = input.getHours();
    m = input.getMinutes();
  } else if (typeof input === 'string') {
    const s = input.trim();
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      h = Number(match[1]);
      m = Number(match[2]);
    } else {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        h = d.getHours();
        m = d.getMinutes();
      }
    }
  }

  if (h == null || m == null || isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return '--:--';
  }

  const suffix = h >= 12 ? 'pm' : 'am';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Compact 12-hour time format without am/pm suffix, e.g. "5:29", "12:24", "4:24".
 * Returns "--:--" for invalid or missing input.
 */
export function formatTimeCompact(input) {
  if (input == null || input === '' || input === '--:--') return '--:--';
  const str = formatTime12(input);
  if (str === '--:--') return '--:--';
  return str.replace(/\s*(am|pm)$/i, '');
}

/** Minutes from `now` (a Date) until hh:mm or target time today. Negative if past. */
export function minutesUntil(hhmm, now = new Date()) {
  if (hhmm == null || hhmm === '' || hhmm === '--:--') return null;

  const nowDate = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();

  if (hhmm instanceof Date) {
    if (isNaN(hhmm.getTime())) return null;
    return Math.round((hhmm.getTime() - nowDate.getTime()) / 60000);
  }

  if (typeof hhmm === 'string') {
    const s = hhmm.trim();
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        const target = new Date(nowDate);
        target.setHours(h, m, 0, 0);
        return Math.round((target.getTime() - nowDate.getTime()) / 60000);
      }
      return null;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Math.round((d.getTime() - nowDate.getTime()) / 60000);
    }
  }

  return null;
}

/** "2h 48m", "35m", "now" */
export function formatCountdown(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return '';
  if (mins <= 0) return 'now';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Live countdown with seconds: "1h 24m 10s", "35m 12s", "now" */
export function formatLiveCountdown(diffMs) {
  if (diffMs == null || isNaN(diffMs) || diffMs <= 0) return 'now';
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
  if (!times || typeof times !== 'object') return null;
  const list = [
    { id: 'fajr', label: 'Fajr', isPrayer: true },
    { id: 'sunrise', label: 'Sunrise', isPrayer: false },
    { id: 'dhuhr', label: 'Dhuhr', isPrayer: true },
    { id: 'asr', label: 'Asr', isPrayer: true },
    { id: 'maghrib', label: 'Maghrib', isPrayer: true },
    { id: 'isha', label: 'Isha', isPrayer: true },
  ];

  const nowDate = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  const nowMs = nowDate.getTime();
  const todayEntries = list.map((item) => {
    const rawVal = times.raw?.[item.id];
    const dateObj = toDate(rawVal, nowDate) || toDate(times[item.id], nowDate);
    const ms = dateObj && !isNaN(dateObj.getTime()) ? dateObj.getTime() : 0;
    return { ...item, time: times[item.id] || '--:--', date: dateObj, ms };
  });

  // Find next upcoming prayer
  const nextPrayer = todayEntries.find((e) => e.isPrayer && e.ms > nowMs);
  let next = null;
  if (nextPrayer) {
    next = {
      id: nextPrayer.id,
      label: nextPrayer.label,
      time: nextPrayer.time,
      diffMs: Math.max(0, nextPrayer.ms - nowMs),
      diffMins: Math.max(0, Math.round((nextPrayer.ms - nowMs) / 60000)),
    };
  } else {
    // Tomorrow Fajr
    const fajrBaseMs = todayEntries[0].ms > 0 ? todayEntries[0].ms : nowMs;
    const tomorrowFajrMs = fajrBaseMs + 24 * 60 * 60 * 1000;
    next = {
      id: 'fajr',
      label: 'Fajr',
      time: times.fajr || '--:--',
      diffMs: Math.max(0, tomorrowFajrMs - nowMs),
      diffMins: Math.max(0, Math.round((tomorrowFajrMs - nowMs) / 60000)),
      isTomorrow: true,
    };
  }

  // Determine current period
  let current = null;
  if (todayEntries[0].ms > 0 && nowMs < todayEntries[0].ms) {
    current = { id: 'isha', label: 'Isha / Night', time: times.isha || '--:--' };
  } else if (todayEntries[1].ms > 0 && nowMs < todayEntries[1].ms) {
    current = { id: 'fajr', label: 'Fajr', time: times.fajr || '--:--' };
  } else if (todayEntries[2].ms > 0 && nowMs < todayEntries[2].ms) {
    current = { id: 'sunrise', label: 'Ishraq / Duha', time: times.sunrise || '--:--' };
  } else if (todayEntries[3].ms > 0 && nowMs < todayEntries[3].ms) {
    current = { id: 'dhuhr', label: 'Dhuhr', time: times.dhuhr || '--:--' };
  } else if (todayEntries[4].ms > 0 && nowMs < todayEntries[4].ms) {
    current = { id: 'asr', label: 'Asr', time: times.asr || '--:--' };
  } else if (todayEntries[5].ms > 0 && nowMs < todayEntries[5].ms) {
    current = { id: 'maghrib', label: 'Maghrib', time: times.maghrib || '--:--' };
  } else {
    current = { id: 'isha', label: 'Isha', time: times.isha || '--:--' };
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
