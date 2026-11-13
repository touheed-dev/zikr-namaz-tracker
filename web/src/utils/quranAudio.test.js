import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCuratedReciters,
  getAudioUrl,
  formatListenDuration,
  formatPlaybackTime,
  CURATED_RECITERS,
  REWIND_SECONDS,
  rewindPosition,
  mapAcrossReciters,
  calculateKhatamProgress,
  formatKhatamPercent,
} from './quranAudio.js';

test('curated reciters list', () => {
  assert.equal(CURATED_RECITERS.length, 7, 'curated reciters has exactly 7 reciters');
  const defaultReciter = CURATED_RECITERS.find((r) => r.isDefault);
  assert.ok(defaultReciter, 'default reciter is specified');
  assert.equal(defaultReciter.id, 'yasser_dosari');
});

test('parseCuratedReciters matches curated reciters and ignores others', () => {
  const mockApiList = [
    {
      id: 92,
      name: 'Yasser Al-Dosari',
      moshaf: [
        {
          id: 1,
          name: 'Hafs A\'n Assem - Murattal',
          server: 'https://server11.mp3quran.net/yasser/',
          surah_total: 114,
          surah_list: '1,2,3,4,114',
        },
      ],
    },
    {
      id: 999,
      name: 'Unknown Reciter Not Curated',
      moshaf: [
        {
          id: 2,
          name: 'Murattal',
          server: 'https://server999.mp3quran.net/unknown/',
          surah_total: 114,
          surah_list: '1,2,3',
        },
      ],
    },
  ];

  const parsed = parseCuratedReciters(mockApiList);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'yasser_dosari');
  assert.equal(parsed[0].displayName, 'Yasser Al-Dosari');
  assert.equal(parsed[0].server, 'https://server11.mp3quran.net/yasser/');
  assert.ok(parsed[0].surahSet.has(1));
  assert.ok(parsed[0].surahSet.has(114));
  assert.ok(!parsed[0].surahSet.has(5));
});

test('getAudioUrl formats padded 3-digit filename', () => {
  assert.equal(
    getAudioUrl('https://server11.mp3quran.net/yasser/', 1),
    'https://server11.mp3quran.net/yasser/001.mp3',
  );
  assert.equal(
    getAudioUrl('https://server11.mp3quran.net/yasser', 18),
    'https://server11.mp3quran.net/yasser/018.mp3',
  );
  assert.equal(
    getAudioUrl('https://server11.mp3quran.net/yasser/', 114),
    'https://server11.mp3quran.net/yasser/114.mp3',
  );
  assert.equal(getAudioUrl(null, 1), null);
});

test('formatListenDuration handles seconds, minutes, hours', () => {
  assert.equal(formatListenDuration(0), '0s');
  assert.equal(formatListenDuration(45), '45s');
  assert.equal(formatListenDuration(60), '1 min');
  assert.equal(formatListenDuration(125), '2 min');
  assert.equal(formatListenDuration(3600), '1 h');
  assert.equal(formatListenDuration(3660), '1 h 1 min');
  assert.equal(formatListenDuration(7320), '2 h 2 min');
});

test('formatPlaybackTime formats mm:ss', () => {
  assert.equal(formatPlaybackTime(0), '0:00');
  assert.equal(formatPlaybackTime(9), '0:09');
  assert.equal(formatPlaybackTime(65), '1:05');
  assert.equal(formatPlaybackTime(720), '12:00');
});

test('rewind constants object', () => {
  assert.equal(REWIND_SECONDS.PAUSE, 3);
  assert.equal(REWIND_SECONDS.RESUME_SAVED, 5);
  assert.equal(REWIND_SECONDS.RECITER_CHANGE, 5);
});

test('rewindPosition rewinds and clamps at 0', () => {
  assert.equal(rewindPosition(10, 3), 7);
  assert.equal(rewindPosition(3, 3), 0);
  assert.equal(rewindPosition(2, 3), 0, 'clamped at 0 when position < rewind');
  assert.equal(rewindPosition(0, 5), 0, 'zero position clamped at 0');
  assert.equal(rewindPosition(-5, 5), 0, 'negative position clamped at 0');
  assert.equal(rewindPosition(20, REWIND_SECONDS.PAUSE), 17);
  assert.equal(rewindPosition(20, REWIND_SECONDS.RESUME_SAVED), 15);
});

test('mapAcrossReciters maps by fraction and clamps at 0', () => {
  // Proportional scaling: (60 / 120) * 180 - 5 = 90 - 5 = 85
  assert.equal(mapAcrossReciters(60, 120, 180, 5), 85);

  // Clamping at 0 when (oldPos / oldDuration) * newDuration - 5 < 0:
  // (2 / 120) * 180 - 5 = 3 - 5 = -2 -> clamped to 0
  assert.equal(mapAcrossReciters(2, 120, 180, 5), 0);
  assert.equal(mapAcrossReciters(0, 120, 180, 5), 0);

  // When oldDuration is unknown (0, null, undefined): uses oldPos - 5s clamped >= 0
  assert.equal(mapAcrossReciters(40, 0, 180, 5), 35);
  assert.equal(mapAcrossReciters(40, null, 180, 5), 35);
  assert.equal(mapAcrossReciters(4, null, 180, 5), 0, 'clamped at 0 when oldDuration unknown');

  // When newDuration is unknown: fallback to oldPos - 5s
  assert.equal(mapAcrossReciters(50, 120, 0, 5), 45);
  assert.equal(mapAcrossReciters(3, 120, 0, 5), 0);
});

test('khatam progress by ayahs and percentage formatting', () => {
  // 1. Start of surah 1 = 0%
  const startS1 = calculateKhatamProgress(1, 0, 100);
  assert.equal(startS1.percent, 0);
  assert.equal(startS1.formattedPercent, '0%');

  // 2. End of surah 114 = 100%
  const endS114 = calculateKhatamProgress(114, 100, 100);
  assert.equal(endS114.percent, 100);
  assert.equal(endS114.formattedPercent, '100%');

  // 3. Middle of Al-Baqara ~ 2.2% (ayahs: 7 in Fatihah + 143 in half-Baqara = 150 / 6236 = 2.405%)
  const midBaqara = calculateKhatamProgress(2, 50, 100);
  assert.ok(
    midBaqara.percent >= 2.2 && midBaqara.percent <= 2.5,
    `middle of Al-Baqara percent (${midBaqara.percent}%) is ~ 2.2%`,
  );
  // Shows 1 decimal under 10%
  assert.equal(midBaqara.formattedPercent, '2.4%');
  assert.match(midBaqara.formattedPercent, /^2\.[234]%$/);

  // Formatting under 10% has 1 decimal, >= 10% is whole number
  assert.equal(formatKhatamPercent(0), '0%');
  assert.equal(formatKhatamPercent(0.54), '0.5%');
  assert.equal(formatKhatamPercent(5.23), '5.2%');
  assert.equal(formatKhatamPercent(9.94), '9.9%');
  assert.equal(formatKhatamPercent(10.0), '10%');
  assert.equal(formatKhatamPercent(14.8), '15%');
  assert.equal(formatKhatamPercent(100), '100%');
});
