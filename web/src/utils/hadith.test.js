import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HADITH } from '../assets/hadith.js';
import { pickHadith } from './hadith.js';
import { addDays } from './dates.js';

// Fingerprints of the exact entries in section 3.15 of the build spec
// (SHA-256 of the Arabic and English text, first 16 hex chars). If anyone
// edits, shortens or "improves" a hadith, this test fails.
const EXPECTED = [
  { id: "jamaat-1", category: "jamaat", ar: "ebdbbaa0918d73d6", en: "d8d46514cc3f96bb", src: "Sahih al-Bukhari 645, Sahih Muslim 650" },
  { id: "jamaat-2", category: "jamaat", ar: "f575b330e9abfc72", en: "f5fffa2795282d7c", src: "Sahih Muslim 656" },
  { id: "zikr-1", category: "zikr", ar: "db742e2de1079cdb", en: "72b79fead6095b21", src: "Sahih al-Bukhari 6407" },
  { id: "consistency-1", category: "consistency", ar: "7df8ee126c542dc2", en: "2ef843bb399cc7d7", src: "Sahih al-Bukhari 6464, Sahih Muslim 783" },
  { id: "nafl-1", category: "nafl", ar: "ff81548b4abe197b", en: "14522ca6823eb52e", src: "Sahih Muslim 728" },
  { id: "tahajjud-1", category: "tahajjud", ar: "58a859eafbfc9bac", en: "ebb697fc53b43584", src: "Sahih Muslim 1163" },
  { id: "tahajjud-2", category: "tahajjud", ar: "b3ee25134a9056b0", en: "d58d5d4b4bc072af", src: "Sahih al-Bukhari 1145, Sahih Muslim 758" },
  { id: "quran-1", category: "quran", ar: "133762754ce86755", en: "12c8ac9134192490", src: "Sahih al-Bukhari 5027" },
  { id: "qaza-1", category: "qaza", ar: "1e5f58e1f3e24ba5", en: "3d621653727d7230", src: "Sahih al-Bukhari 597, Sahih Muslim 684" },
  { id: "ramadan-1", category: "ramadan", ar: "6c2f7f9e27b2e126", en: "4e1ab2cbb6abc51d", src: "Sahih al-Bukhari 38, Sahih Muslim 760" },
];

const fp = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

test('hadith.js has exactly the 10 entries from the spec', () => {
  assert.equal(HADITH.length, 10);
  HADITH.forEach((h, i) => {
    const want = EXPECTED[i];
    assert.equal(h.id, want.id);
    assert.equal(h.category, want.category);
    assert.equal(fp(h.ar), want.ar, `Arabic changed in ${h.id}`);
    assert.equal(fp(h.en), want.en, `English changed in ${h.id}`);
    assert.equal(h.src, want.src, `source changed in ${h.id}`);
    assert.deepEqual(Object.keys(h).sort(), ['ar', 'category', 'en', 'id', 'src']);
  });
});

test('pickHadith is deterministic per day', () => {
  const a = pickHadith(['jamaat', 'consistency'], '2026-11-02');
  const b = pickHadith(['jamaat', 'consistency'], '2026-11-02');
  assert.equal(a, b);
});

test('pickHadith filters by category', () => {
  for (let i = 0; i < 40; i += 1) {
    const d = addDays('2026-01-01', i);
    assert.equal(pickHadith(['qaza'], d).category, 'qaza');
    assert.ok(['jamaat', 'consistency'].includes(pickHadith(['jamaat', 'consistency'], d).category));
  }
});

test('nafl / tahajjud alternate daily', () => {
  const c1 = pickHadith(['nafl', 'tahajjud'], '2026-11-02').category;
  const c2 = pickHadith(['nafl', 'tahajjud'], '2026-11-03').category;
  assert.notEqual(c1, c2);
});

test('hadith of the day rotates through all 10', () => {
  const seen = new Set();
  for (let i = 0; i < 10; i += 1) seen.add(pickHadith(null, addDays('2026-03-01', i)).id);
  assert.equal(seen.size, 10);
});

test('unknown category returns null instead of crashing', () => {
  assert.equal(pickHadith(['nope'], '2026-11-02'), null);
});
