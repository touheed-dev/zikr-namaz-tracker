import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCuratedReciters,
  getAudioUrl,
  formatListenDuration,
  formatPlaybackTime,
  CURATED_RECITERS,
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
