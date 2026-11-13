import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrayerTimes,
  CALCULATION_METHODS,
  MADHABS,
  HIGH_LATITUDE_RULES,
  ISHA_ENDS,
  formatLiveCountdown,
  getCurrentAndNextPrayer,
  normalizeMethod,
} from './prayerTimes.js';

test('prayer time order: Fajr < Sunrise < Dhuhr < Asr < Maghrib < Isha across multiple cities & dates', () => {
  const cities = [
    { name: 'Mumbai', lat: 19.08, lng: 72.88 },
    { name: 'London', lat: 51.51, lng: -0.13 },
    { name: 'New York', lat: 40.71, lng: -74.01 },
    { name: 'Tokyo', lat: 35.68, lng: 139.69 },
    { name: 'Cairo', lat: 30.04, lng: 31.24 },
  ];

  const dates = [
    '2026-01-15', // Winter
    '2026-04-20', // Spring
    '2026-07-10', // Summer
    '2026-10-25', // Autumn
  ];

  for (const city of cities) {
    for (const dateISO of dates) {
      const times = calculatePrayerTimes({
        dateISO,
        lat: city.lat,
        lng: city.lng,
        method: 'karachi',
        madhab: 'hanafi',
      });

      const { fajr, sunrise, dhuhr, asr, maghrib, isha } = times.raw;

      assert.ok(fajr < sunrise, `Fajr < Sunrise for ${city.name} on ${dateISO}`);
      assert.ok(sunrise < dhuhr, `Sunrise < Dhuhr for ${city.name} on ${dateISO}`);
      assert.ok(dhuhr < asr, `Dhuhr < Asr for ${city.name} on ${dateISO}`);
      assert.ok(asr < maghrib, `Asr < Maghrib for ${city.name} on ${dateISO}`);
      assert.ok(maghrib < isha, `Maghrib < Isha for ${city.name} on ${dateISO}`);

      // Also assert that HH:MM string representations are non-empty and well-formed
      assert.match(times.fajr, /^\d{2}:\d{2}$/);
      assert.match(times.sunrise, /^\d{2}:\d{2}$/);
      assert.match(times.dhuhr, /^\d{2}:\d{2}$/);
      assert.match(times.asr, /^\d{2}:\d{2}$/);
      assert.match(times.maghrib, /^\d{2}:\d{2}$/);
      assert.match(times.isha, /^\d{2}:\d{2}$/);
      assert.match(times.midnight, /^\d{2}:\d{2}$/);
      assert.match(times.ishaEnd, /^\d{2}:\d{2}$/);
    }
  }
});

test('Hanafi Asr is strictly later than Shafi Asr', () => {
  const testCases = [
    { lat: 19.08, lng: 72.88, dateISO: '2026-11-14' },
    { lat: 51.51, lng: -0.13, dateISO: '2026-06-21' },
    { lat: 40.71, lng: -74.01, dateISO: '2026-03-21' },
  ];

  for (const tc of testCases) {
    const shafiTimes = calculatePrayerTimes({
      ...tc,
      madhab: 'shafi',
    });
    const hanafiTimes = calculatePrayerTimes({
      ...tc,
      madhab: 'hanafi',
    });

    assert.ok(
      hanafiTimes.raw.asr > shafiTimes.raw.asr,
      `Hanafi Asr should be later than Shafi Asr at lat ${tc.lat}, lng ${tc.lng}`,
    );

    // Hanafi Asr minutes difference should be positive
    const [shafiH, shafiM] = shafiTimes.asr.split(':').map(Number);
    const [hanafiH, hanafiM] = hanafiTimes.asr.split(':').map(Number);
    const shafiTotal = shafiH * 60 + shafiM;
    const hanafiTotal = hanafiH * 60 + hanafiM;
    assert.ok(hanafiTotal > shafiTotal, 'Hanafi Asr HH:mm is later than Shafi Asr');
  }
});

test('switching calculation method changes Fajr and Isha times', () => {
  const coords = { lat: 19.08, lng: 72.88, dateISO: '2026-11-14' };

  const karachiTimes = calculatePrayerTimes({
    ...coords,
    method: 'karachi',
  });

  const isnaTimes = calculatePrayerTimes({
    ...coords,
    method: 'isna',
  });

  const ummAlQuraTimes = calculatePrayerTimes({
    ...coords,
    method: 'umm_al_qura',
  });

  // Karachi (18° Fajr, 18° Isha) vs ISNA (15° Fajr, 15° Isha)
  assert.notEqual(
    karachiTimes.raw.fajr.getTime(),
    isnaTimes.raw.fajr.getTime(),
    'Karachi and ISNA produce different Fajr times',
  );
  assert.notEqual(
    karachiTimes.raw.isha.getTime(),
    isnaTimes.raw.isha.getTime(),
    'Karachi and ISNA produce different Isha times',
  );

  // Umm al-Qura has fixed 90 min after Maghrib for Isha
  assert.notEqual(
    karachiTimes.raw.isha.getTime(),
    ummAlQuraTimes.raw.isha.getTime(),
    'Karachi and Umm al-Qura produce different Isha times',
  );
});

test('ishaEnd option properly toggles between Fajr and Islamic Midnight', () => {
  const coords = { lat: 19.08, lng: 72.88, dateISO: '2026-11-14' };

  const timesFajr = calculatePrayerTimes({ ...coords, ishaEnd: 'fajr' });
  const timesMidnight = calculatePrayerTimes({ ...coords, ishaEnd: 'midnight' });

  assert.equal(timesFajr.ishaEnd, timesFajr.fajr, 'ishaEnd="fajr" shows fajr time');
  assert.equal(timesMidnight.ishaEnd, timesMidnight.midnight, 'ishaEnd="midnight" shows midnight time');
  assert.notEqual(timesFajr.ishaEnd, timesMidnight.ishaEnd);
});

test('calculation methods, madhabs, and rules constants', () => {
  assert.equal(CALCULATION_METHODS.length, 7);
  assert.ok(CALCULATION_METHODS.some((m) => m.id === 'karachi'));
  assert.ok(CALCULATION_METHODS.some((m) => m.id === 'mwl'));
  assert.ok(CALCULATION_METHODS.some((m) => m.id === 'isna'));
  assert.ok(CALCULATION_METHODS.some((m) => m.id === 'umm_al_qura'));
  assert.ok(CALCULATION_METHODS.some((m) => m.id === 'egyptian'));
  assert.ok(CALCULATION_METHODS.some((m) => m.id === 'dubai'));
  assert.ok(CALCULATION_METHODS.some((m) => m.id === 'singapore'));

  assert.equal(MADHABS.length, 2);
  assert.equal(HIGH_LATITUDE_RULES.length, 4);
  assert.equal(ISHA_ENDS.length, 2);

  assert.equal(normalizeMethod(1), 'karachi');
  assert.equal(normalizeMethod(2), 'isna');
  assert.equal(normalizeMethod(3), 'mwl');
  assert.equal(normalizeMethod(4), 'umm_al_qura');
  assert.equal(normalizeMethod(5), 'egyptian');
  assert.equal(normalizeMethod('Karachi'), 'karachi');
  assert.equal(normalizeMethod('UmmAlQura'), 'umm_al_qura');
});

test('formatLiveCountdown formats ms into human readable countdown', () => {
  assert.equal(formatLiveCountdown(null), 'now');
  assert.equal(formatLiveCountdown(-100), 'now');
  assert.equal(formatLiveCountdown(0), 'now');
  assert.equal(formatLiveCountdown(45000), '0m 45s');
  assert.equal(formatLiveCountdown(125000), '2m 05s');
  assert.equal(formatLiveCountdown(3665000), '1h 1m 05s');
});

test('getCurrentAndNextPrayer correctly identifies current and upcoming prayer', () => {
  const times = {
    fajr: '05:30',
    sunrise: '06:45',
    dhuhr: '12:20',
    asr: '15:40',
    maghrib: '18:00',
    isha: '19:15',
  };

  const midday = new Date(2026, 10, 14, 13, 0); // 1:00 PM
  const res = getCurrentAndNextPrayer(times, midday);
  assert.equal(res.current.id, 'dhuhr');
  assert.equal(res.next.id, 'asr');
  assert.equal(res.next.time, '15:40');
  assert.ok(res.next.diffMins > 0);
});

