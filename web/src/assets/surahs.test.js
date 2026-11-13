import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SURAHS } from './surahs.js';

describe('surahs.js asset', () => {
  it('contains exactly 114 entries', () => {
    assert.equal(SURAHS.length, 114);
  });

  it('has n = 1..114 in sequential order', () => {
    SURAHS.forEach((s, idx) => {
      assert.equal(s.n, idx + 1);
      assert.ok(s.ar && typeof s.ar === 'string');
      assert.ok(s.en && typeof s.en === 'string');
      assert.ok(s.ayahs > 0);
      assert.ok(s.type === 'makki' || s.type === 'madani');
    });
  });

  it('sums to exactly 6236 total ayahs', () => {
    const totalAyahs = SURAHS.reduce((sum, s) => sum + s.ayahs, 0);
    assert.equal(totalAyahs, 6236);
  });

  it('has valid juzStart for all surahs and matches key milestone surahs', () => {
    SURAHS.forEach((s) => {
      assert.ok(
        Number.isInteger(s.juzStart) && s.juzStart >= 1 && s.juzStart <= 30,
        `Surah ${s.n} has valid juzStart between 1 and 30`,
      );
    });

    const fatiha = SURAHS.find((s) => s.n === 1);
    const baqara = SURAHS.find((s) => s.n === 2);
    const imran = SURAHS.find((s) => s.n === 3);
    const naba = SURAHS.find((s) => s.n === 78);
    const nas = SURAHS.find((s) => s.n === 114);

    assert.equal(fatiha.juzStart, 1, 'Al-Fatiha=1');
    assert.equal(baqara.juzStart, 1, 'Al-Baqara=1');
    assert.equal(imran.juzStart, 3, 'Al-Imran=3');
    assert.equal(naba.juzStart, 30, 'An-Naba=30');
    assert.equal(nas.juzStart, 30, 'An-Nas=30');
  });
});
