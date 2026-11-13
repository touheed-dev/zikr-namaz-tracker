import { getJSON, setJSON } from './storage.js';

export const RECITERS_CACHE_KEY = 'zn_mp3quran_reciters_v1';
export const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_RECITER_ID = 'yasser_dosari';

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
