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
});
