import { getJSON, setJSON } from './storage.js';
import { SURAHS } from '../assets/surahs.js';

export const RECITERS_CACHE_KEY = 'zn_mp3quran_reciters_v1';
export const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_RECITER_ID = 'yasser_dosari';

export const REWIND_SECONDS = {
  PAUSE: 3,
  RESUME_SAVED: 5,
  RECITER_CHANGE: 5,
};

export const TOTAL_AYAH_COUNT = 6236;

/**
 * Rewinds a playback position by a fixed amount of seconds, clamped to >= 0.
 */
export function rewindPosition(position, seconds = 0) {
  const pos = Math.max(0, Number(position) || 0);
  const sec = Math.max(0, Number(seconds) || 0);
  return Math.max(0, pos - sec);
}

/**
 * Maps playback position across different reciters based on relative duration.
 * newPos = (oldPos / oldDuration) * newDuration - 5s, clamped >= 0.
 * If oldDuration unknown or <= 0, uses oldPos - 5s, clamped >= 0.
 */
export function mapAcrossReciters(
  oldPos,
  oldDuration,
  newDuration,
  rewindSec = REWIND_SECONDS.RECITER_CHANGE,
) {
  const pos = Math.max(0, Number(oldPos) || 0);
  const oldDur = Number(oldDuration) || 0;
  const newDur = Number(newDuration) || 0;
  const rewind = Math.max(0, Number(rewindSec) || 0);

  if (oldDur > 0 && newDur > 0) {
    const fraction = pos / oldDur;
    return Math.max(0, fraction * newDur - rewind);
  }

  return Math.max(0, pos - rewind);
}

/**
 * Formats Khatam percentage: shows 1 decimal place under 10%, whole number otherwise.
 * Clamped 0% to 100%.
 */
export function formatKhatamPercent(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  if (p === 0) return '0%';
  if (p >= 100) return '100%';
  if (p < 10) {
    const formatted = p.toFixed(1);
    if (formatted === '10.0') return '10%';
    if (formatted === '0.0') return '0%';
    return `${formatted}%`;
  }
  return `${Math.round(p)}%`;
}

/**
 * Computes Khatam listening progress percentage based on ayahs completed.
 * Formula: (ayahs of completed surahs + ayahs of current surah * (position / duration)) / 6236
 */
export function calculateKhatamProgress(surahNumber = 1, positionSeconds = 0, durationSeconds = 0) {
  const surah = Math.max(1, Math.min(114, Math.floor(Number(surahNumber) || 1)));
  const pos = Math.max(0, Number(positionSeconds) || 0);
  const dur = Math.max(0, Number(durationSeconds) || 0);

  let completedAyahs = 0;
  for (let i = 0; i < surah - 1; i++) {
    completedAyahs += SURAHS[i]?.ayahs || 0;
  }

  const currentSurahObj = SURAHS[surah - 1];
  const currentAyahs = currentSurahObj?.ayahs || 0;

  const currentSurahFraction = dur > 0 ? Math.min(1, pos / dur) : 0;
  const currentAyahsDone = currentAyahs * currentSurahFraction;
  const totalAyahsDone = completedAyahs + currentAyahsDone;

  const fraction = Math.min(1, Math.max(0, totalAyahsDone / TOTAL_AYAH_COUNT));
  const percent = fraction * 100;

  return {
    fraction,
    percent,
    completedAyahs: Math.round(totalAyahsDone),
    formattedPercent: formatKhatamPercent(percent),
  };
}

export const CURATED_RECITERS = [
  {
    id: 'yasser_dosari',
    displayName: 'Yasser Al-Dosari',
    aliases: ['yasser al-dosari', 'yasser al dosari', 'yasser aldossary', 'yasser dosari'],
    isDefault: true,
  },
  {
    id: 'mishary_alafasy',
    displayName: 'Mishary Rashid Alafasy',
    aliases: ['mishary alafasi', 'mishary rashid alafasy', 'mishary al-afasi', 'mishary alafasy'],
  },
  {
    id: 'abdul_rahman_sudais',
    displayName: 'Abdul Rahman Al-Sudais',
    aliases: ['abdulrahman alsudaes', 'abdul rahman al-sudais', 'abdulrahman sudais'],
  },
  {
    id: 'maher_al_muaiqly',
    displayName: 'Maher Al-Muaiqly',
    aliases: ['maher al meaqli', 'maher al-muaiqly', 'maher muaiqly'],
  },
  {
    id: 'saad_al_ghamdi',
    displayName: 'Saad Al-Ghamdi',
    aliases: ['saad al-ghamdi', 'saad al ghamdi', 'saad ghamdi'],
  },
  {
    id: 'mahmoud_al_husary',
    displayName: 'Mahmoud Khalil Al-Husary',
    aliases: ['mahmoud khalil al-hussary', 'mahmoud khalil al-husary', 'al-hussary', 'al-husary'],
  },
  {
    id: 'abdul_basit_murattal',
    displayName: 'Abdul Basit Abdul Samad (Murattal)',
    aliases: ['abdulbasit abdulsamad', 'abdul basit'],
  },
];

export function parseCuratedReciters(rawList) {
  if (!Array.isArray(rawList)) return [];

  const matched = [];

  for (const c of CURATED_RECITERS) {
    const raw = rawList.find((r) => {
      const name = (r.name || '').toLowerCase();
      return c.aliases.some((alias) => name.includes(alias));
    });

    if (!raw || !Array.isArray(raw.moshaf) || raw.moshaf.length === 0) {
      continue;
    }

    // Match Hafs 'an 'Asim, Murattal moshaf
    let chosen = raw.moshaf.find((m) => {
      const mn = (m.name || '').toLowerCase();
      return mn.includes('hafs') && mn.includes('murattal');
    });

    if (!chosen) {
      chosen = raw.moshaf.find((m) => (m.name || '').toLowerCase().includes('murattal'));
    }

    if (!chosen) {
      chosen = raw.moshaf[0];
    }

    if (!chosen || !chosen.server) {
      continue;
    }

    const surahListStr = String(chosen.surah_list || '');
    const surahSet = new Set(
      surahListStr
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 114),
    );

    matched.push({
      id: c.id,
      displayName: c.displayName,
      server: chosen.server.endsWith('/') ? chosen.server : `${chosen.server}/`,
      surahTotal: chosen.surah_total || surahSet.size,
      surahSet,
      moshafName: chosen.name,
      isDefault: Boolean(c.isDefault),
    });
  }

  return matched;
}

export async function fetchReciters() {
  const cached = getJSON(RECITERS_CACHE_KEY);
  if (
    cached &&
    cached.timestamp &&
    Date.now() - cached.timestamp < CACHE_DURATION_MS &&
    Array.isArray(cached.data)
  ) {
    return parseCuratedReciters(cached.data);
  }

  const res = await fetch('https://mp3quran.net/api/v3/reciters?language=eng');
  if (!res.ok) {
    throw new Error(`Failed to fetch reciters: HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawList = json.reciters || [];
  setJSON(RECITERS_CACHE_KEY, {
    timestamp: Date.now(),
    data: rawList,
  });

  return parseCuratedReciters(rawList);
}

export function getAudioUrl(server, surahNumber) {
  if (!server || !surahNumber) return null;
  const numStr = String(surahNumber).padStart(3, '0');
  const base = server.endsWith('/') ? server : `${server}/`;
  return `${base}${numStr}.mp3`;
}

export function formatListenDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

export function formatPlaybackTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
