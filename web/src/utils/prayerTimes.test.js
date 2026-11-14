import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrayerTimes,
  getPrayerConfig,
  formatTimeCompact,
  CALCULATION_METHODS,
  MADHABS,
  HIGH_LATITUDE_RULES,
  ISHA_ENDS,
  formatLiveCountdown,
  getCurrentAndNextPrayer,
  normalizeMethod,
  formatTime12,
  dateToHHMM,
  minutesUntil,
  formatCountdown,
  hydratePrayerTimes,
  toDate,
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

test('Mumbai 2026-11-14 Karachi Asr ranges and default Hanafi', () => {
  const baseOpts = {
    dateISO: '2026-11-14',
    lat: 19.08,
    lng: 72.88,
    method: 'karachi',
    timeZone: 'Asia/Kolkata',
  };

  const hanafi = calculatePrayerTimes({ ...baseOpts, madhab: 'hanafi' });
  const shafi = calculatePrayerTimes({ ...baseOpts, madhab: 'shafi' });
  const def = calculatePrayerTimes(baseOpts);

  // Hanafi Asr between 16:20 and 16:35 local (Asia/Kolkata)
  const [hH, hM] = hanafi.asr.split(':').map(Number);
  const hanafiMins = hH * 60 + hM;
  assert.ok(
    hanafiMins >= 16 * 60 + 20 && hanafiMins <= 16 * 60 + 35,
    `Hanafi Asr ${hanafi.asr} must be between 16:20 and 16:35`,
  );

  // Shafi Asr between 15:30 and 15:45 local (Asia/Kolkata)
  const [sH, sM] = shafi.asr.split(':').map(Number);
  const shafiMins = sH * 60 + sM;
  assert.ok(
    shafiMins >= 15 * 60 + 30 && shafiMins <= 15 * 60 + 45,
    `Shafi Asr ${shafi.asr} must be between 15:30 and 15:45`,
  );

  // Default config gives Hanafi
  assert.equal(def.asr, hanafi.asr, 'Default config gives Hanafi Asr');
  assert.ok(
    hanafiMins > shafiMins,
    'Hanafi Asr is strictly later than Shafi Asr',
  );
});

test('getPrayerConfig resolves precedence and maps legacy values', () => {
  // Empty / undefined settings defaults to Hanafi, Karachi, Fajr, none
  const empty = getPrayerConfig({}, {});
  assert.equal(empty.madhab, 'hanafi');
  assert.equal(empty.method, 'karachi');
  assert.equal(empty.ishaEnd, 'fajr');
  assert.equal(empty.highLat, 'none');
  assert.equal(empty.lat, 19.08);
  assert.equal(empty.lng, 72.88);

  // Legacy asr: 'standard' maps to 'shafi'
  const legacyStandard = getPrayerConfig({ asr: 'standard' }, {});
  assert.equal(legacyStandard.madhab, 'shafi');

  // Legacy asr: 0 maps to 'shafi'
  const legacyZero = getPrayerConfig({ asr: 0 }, {});
  assert.equal(legacyZero.madhab, 'shafi');

  // Legacy asr: 1 maps to 'hanafi'
  const legacyOne = getPrayerConfig({ asr: 1 }, {});
  assert.equal(legacyOne.madhab, 'hanafi');

  // settings.madhab takes precedence over legacy settings.asr
  const precedence = getPrayerConfig({ madhab: 'hanafi', asr: 'standard' }, {});
  assert.equal(precedence.madhab, 'hanafi');

  const precedenceShafi = getPrayerConfig({ madhab: 'shafi', asr: 'hanafi' }, {});
  assert.equal(precedenceShafi.madhab, 'shafi');

  // Legacy numeric method IDs
  assert.equal(getPrayerConfig({ method: 1 }, {}).method, 'karachi');
  assert.equal(getPrayerConfig({ method: 2 }, {}).method, 'isna');
  assert.equal(getPrayerConfig({ method: 3 }, {}).method, 'mwl');
  assert.equal(getPrayerConfig({ method: 4 }, {}).method, 'umm_al_qura');
  assert.equal(getPrayerConfig({ method: 5 }, {}).method, 'egyptian');
  assert.equal(getPrayerConfig({ method: '1' }, {}).method, 'karachi');

  // ishaEnd
  assert.equal(getPrayerConfig({ ishaEnd: 'midnight' }, {}).ishaEnd, 'midnight');
  assert.equal(getPrayerConfig({ ishaEnd: 'fajr' }, {}).ishaEnd, 'fajr');
  assert.equal(getPrayerConfig({ ishaEnd: 'invalid' }, {}).ishaEnd, 'fajr');

  // cachedConfig fallback
  const cachedFallback = getPrayerConfig({}, { madhab: 'shafi', method: 'isna' });
  assert.equal(cachedFallback.madhab, 'shafi');
  assert.equal(cachedFallback.method, 'isna');
});

test('formatTimeCompact produces 12-hour string without am/pm', () => {
  assert.equal(formatTimeCompact('05:29'), '5:29');
  assert.equal(formatTimeCompact('16:24'), '4:24');
  assert.equal(formatTimeCompact('12:24'), '12:24');
  assert.equal(formatTimeCompact('00:15'), '12:15');
  assert.equal(formatTimeCompact('--:--'), '--:--');
  assert.equal(formatTimeCompact(null), '--:--');
  assert.equal(formatTimeCompact(undefined), '--:--');
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

test('new user with no location (default config) produces valid times and prayer info', () => {
  // Brand new user has null/undefined lat and lng, no cached config
  const configs = [
    {},
    { lat: null, lng: null },
    { lat: undefined, lng: undefined, locationLabel: null },
    { lat: null, lng: null, method: null, madhab: null },
  ];

  for (const cfg of configs) {
    const times = calculatePrayerTimes({ ...cfg, dateISO: '2026-11-14' });
    assert.ok(times, 'times object is returned');
    assert.match(times.fajr, /^\d{2}:\d{2}$/);
    assert.match(times.sunrise, /^\d{2}:\d{2}$/);
    assert.match(times.dhuhr, /^\d{2}:\d{2}$/);
    assert.match(times.asr, /^\d{2}:\d{2}$/);
    assert.match(times.maghrib, /^\d{2}:\d{2}$/);
    assert.match(times.isha, /^\d{2}:\d{2}$/);
    assert.match(times.midnight, /^\d{2}:\d{2}$/);
    assert.match(times.ishaEnd, /^\d{2}:\d{2}$/);

    // Raw fields must be genuine Date objects
    assert.ok(times.raw.fajr instanceof Date);
    assert.ok(!isNaN(times.raw.fajr.getTime()));
    assert.ok(times.raw.isha instanceof Date);
    assert.ok(!isNaN(times.raw.isha.getTime()));

    // getCurrentAndNextPrayer must execute without throwing (e.g. dateObj.getTime is not a function)
    const info = getCurrentAndNextPrayer(times, new Date(2026, 10, 14, 12, 0));
    assert.ok(info.current);
    assert.ok(info.next);
    assert.ok(typeof info.next.diffMs === 'number');
  }
});

test('formatters handle Date, ISO string, HH:MM, undefined, and invalid input defensively', () => {
  // formatTime12
  assert.equal(formatTime12('05:20'), '5:20 am');
  assert.equal(formatTime12('12:20'), '12:20 pm');
  assert.equal(formatTime12('00:05'), '12:05 am');
  assert.equal(formatTime12('19:10'), '7:10 pm');
  assert.equal(formatTime12('7:05'), '7:05 am');
  assert.equal(formatTime12(new Date(2026, 10, 14, 15, 45)), '3:45 pm');
  assert.equal(formatTime12('2026-11-14T05:20:00.000Z').includes(':'), true);

  // invalid / missing returns '--:--' instead of throwing
  assert.equal(formatTime12(undefined), '--:--');
  assert.equal(formatTime12(null), '--:--');
  assert.equal(formatTime12(''), '--:--');
  assert.equal(formatTime12('--:--'), '--:--');
  assert.equal(formatTime12('invalid'), '--:--');
  assert.equal(formatTime12({}), '--:--');

  // dateToHHMM
  assert.equal(dateToHHMM(new Date(2026, 10, 14, 5, 20)), '05:20');
  assert.equal(dateToHHMM('05:20'), '05:20');
  assert.equal(dateToHHMM('5:20'), '05:20');
  assert.equal(dateToHHMM(undefined), '--:--');
  assert.equal(dateToHHMM(null), '--:--');
  assert.equal(dateToHHMM(''), '--:--');
  assert.equal(dateToHHMM('invalid'), '--:--');

  // minutesUntil
  const now = new Date(2026, 10, 14, 12, 0);
  assert.equal(minutesUntil('12:30', now), 30);
  assert.equal(minutesUntil(new Date(2026, 10, 14, 12, 30), now), 30);
  assert.equal(minutesUntil(undefined, now), null);
  assert.equal(minutesUntil(null, now), null);
  assert.equal(minutesUntil('--:--', now), null);
  assert.equal(minutesUntil('invalid', now), null);

  // formatCountdown
  assert.equal(formatCountdown(null), '');
  assert.equal(formatCountdown(undefined), '');
  assert.equal(formatCountdown('invalid'), '');
  assert.equal(formatCountdown(0), 'now');
  assert.equal(formatCountdown(-10), 'now');
  assert.equal(formatCountdown(45), '45m');
  assert.equal(formatCountdown(150), '2h 30m');

  // formatLiveCountdown
  assert.equal(formatLiveCountdown(null), 'now');
  assert.equal(formatLiveCountdown(undefined), 'now');
  assert.equal(formatLiveCountdown('invalid'), 'now');
  assert.equal(formatLiveCountdown(-100), 'now');

  // toDate
  assert.ok(toDate(new Date()) instanceof Date);
  assert.ok(toDate('05:20') instanceof Date);
  assert.ok(toDate('2026-11-14T05:20:00.000Z') instanceof Date);
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate('--:--'), null);
  assert.equal(toDate('invalid'), null);
});

test('old cache shapes are migrated or ignored safely', () => {
  // 1. Legacy Aladhan cache (no raw property at all, just string times)
  const legacyAladhan = {
    fajr: '05:12',
    sunrise: '06:30',
    dhuhr: '12:24',
    asr: '15:44',
    maghrib: '18:04',
    isha: '19:18',
  };

  const hydratedLegacy = hydratePrayerTimes(legacyAladhan, '2026-11-14');
  assert.ok(hydratedLegacy, 'legacy cache is hydrated');
  assert.ok(hydratedLegacy.raw.fajr instanceof Date);
  assert.ok(!isNaN(hydratedLegacy.raw.fajr.getTime()));
  assert.ok(hydratedLegacy.raw.isha instanceof Date);

  // getCurrentAndNextPrayer works on hydrated legacy cache without throwing
  const infoLegacy = getCurrentAndNextPrayer(hydratedLegacy, new Date(2026, 10, 14, 13, 0));
  assert.equal(infoLegacy.current.id, 'dhuhr');
  assert.equal(infoLegacy.next.id, 'asr');

  // 2. Cache with JSON-serialized string raw dates (e.g. from JSON.stringify of Date)
  const stringifiedRawCache = {
    fajr: '05:12',
    sunrise: '06:30',
    dhuhr: '12:24',
    asr: '15:44',
    maghrib: '18:04',
    isha: '19:18',
    midnight: '00:15',
    ishaEnd: '05:12',
    raw: {
      fajr: '2026-11-14T00:12:00.000Z',
      sunrise: '2026-11-14T01:30:00.000Z',
      dhuhr: '2026-11-14T07:24:00.000Z',
      asr: '2026-11-14T10:44:00.000Z',
      maghrib: '2026-11-14T13:04:00.000Z',
      isha: '2026-11-14T14:18:00.000Z',
      midnight: '2026-11-14T19:15:00.000Z',
    },
  };

  // Even if passed directly into getCurrentAndNextPrayer without hydration
  const infoDirect = getCurrentAndNextPrayer(stringifiedRawCache, new Date('2026-11-14T08:00:00.000Z'));
  assert.ok(infoDirect.current);
  assert.ok(infoDirect.next);
  assert.equal(infoDirect.current.id, 'dhuhr');
  assert.equal(infoDirect.next.id, 'asr');

  // And hydrated version has proper Date objects
  const hydratedStringified = hydratePrayerTimes(stringifiedRawCache, '2026-11-14');
  assert.ok(hydratedStringified.raw.fajr instanceof Date);
  assert.ok(!isNaN(hydratedStringified.raw.fajr.getTime()));

  // 3. Corrupted cache is safely rejected / ignored
  assert.equal(hydratePrayerTimes(null), null);
  assert.equal(hydratePrayerTimes('string'), null);
  assert.equal(hydratePrayerTimes({ random: 123 }), null);
  assert.equal(hydratePrayerTimes({ fajr: 'bad' }), null);
});

