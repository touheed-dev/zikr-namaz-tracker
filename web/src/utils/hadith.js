import { HADITH } from '../assets/hadith.js';
import { dayOfYear } from './dates.js';

/**
 * Deterministic pick for a given day: no flicker on re-render, same card all
 * day. With several categories it alternates the category day by day, then
 * rotates within that category.
 *   pickHadith(null, date)                  -> rotates through all 10
 *   pickHadith(['jamaat','consistency'], d) -> alternates daily
 */
export function pickHadith(categories, dateISO, list = HADITH) {
  const doy = dayOfYear(dateISO);
  if (!categories || categories.length === 0) {
    return list[(doy - 1) % list.length];
  }
  const cats = categories.filter((c) => list.some((h) => h.category === c));
  if (cats.length === 0) return null;
  const cat = cats[doy % cats.length];
  const pool = list.filter((h) => h.category === cat);
  return pool[Math.floor(doy / cats.length) % pool.length];
}

export const HADITH_SCREENS = {
  streak: { categories: null, label: 'Hadith of the day' },
  today: { categories: ['jamaat', 'consistency'], label: 'Hadith' },
  zikr: { categories: ['zikr'], label: 'On remembrance' },
  qaza: { categories: ['qaza'], label: 'A gentle reminder' },
  quran: { categories: ['quran'], label: 'On the Quran' },
  nafl: { categories: ['nafl', 'tahajjud'], label: 'On voluntary prayer' },
  ramadan: { categories: ['ramadan'], label: 'Ramadan' },
};

export function dismissKey(screen, dateISO) {
  return `zn_hadith_dismissed:${screen}:${dateISO}`;
}
