import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { relativeLuminance, contrastRatio, parseHex } from './contrast.js';
import { PALETTES, THEME_KEYS, DEFAULT_THEME } from './themes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('contrast utility', () => {
  it('parses 3-digit and 6-digit hex colours', () => {
    assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(parseHex('#000000'), { r: 0, g: 0, b: 0 });
    assert.deepEqual(parseHex('#1A7F45'), { r: 26, g: 127, b: 69 });
  });

  it('calculates relative luminance correctly', () => {
    assert.equal(relativeLuminance('#ffffff'), 1.0);
    assert.equal(relativeLuminance('#000000'), 0.0);
  });

  it('calculates contrast ratio correctly', () => {
    assert.equal(contrastRatio('#ffffff', '#000000'), 21);
    assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
    assert.ok(contrastRatio('#1A7F45', '#ffffff') >= 5.0);
  });
});

describe('palette contrast compliance (WCAG AA >= 4.5:1)', () => {
  const requiredPalettes = ['forest', 'sage', 'coffee', 'slate', 'plum', 'terracotta', 'sand'];

  it('contains all 7 required calm, muted palettes', () => {
    for (const name of requiredPalettes) {
      assert.ok(PALETTES[name], `Missing palette: ${name}`);
      assert.equal(PALETTES[name].id, name);
    }
    assert.equal(DEFAULT_THEME, 'forest');
  });

  for (const name of requiredPalettes) {
    describe(`palette: ${name}`, () => {
      const p = PALETTES[name];
      const c = p.colors;

      it('text on bg >= 4.5:1', () => {
        const ratio = contrastRatio(c.text, c.bg);
        assert.ok(
          ratio >= 4.5,
          `${name}: text (${c.text}) on bg (${c.bg}) is ${ratio.toFixed(2)}:1, expected >= 4.5:1`,
        );
      });

      it('text on card >= 4.5:1', () => {
        const ratio = contrastRatio(c.text, c.card);
        assert.ok(
          ratio >= 4.5,
          `${name}: text (${c.text}) on card (${c.card}) is ${ratio.toFixed(2)}:1, expected >= 4.5:1`,
        );
      });

      it('muted on card >= 4.5:1', () => {
        const ratio = contrastRatio(c.muted, c.card);
        assert.ok(
          ratio >= 4.5,
          `${name}: muted (${c.muted}) on card (${c.card}) is ${ratio.toFixed(2)}:1, expected >= 4.5:1`,
        );
      });

      it('accent-text on accent >= 4.5:1', () => {
        const ratio = contrastRatio(c.accentText, c.accent);
        assert.ok(
          ratio >= 4.5,
          `${name}: accentText (${c.accentText}) on accent (${c.accent}) is ${ratio.toFixed(2)}:1, expected >= 4.5:1`,
        );
      });

      it('light-text on light >= 4.5:1', () => {
        const ratio = contrastRatio(c.lightText, c.light);
        assert.ok(
          ratio >= 4.5,
          `${name}: lightText (${c.lightText}) on light (${c.light}) is ${ratio.toFixed(2)}:1, expected >= 4.5:1`,
        );
      });
    });
  }
});

describe('tokens.css synchronization', () => {
  const cssPath = join(__dirname, '../styles/tokens.css');
  const css = readFileSync(cssPath, 'utf8');

  it('tokens.css contains rules for all 7 palettes with data-palette', () => {
    for (const key of THEME_KEYS) {
      assert.ok(
        css.includes(`:root[data-palette='${key}']`),
        `tokens.css missing :root[data-palette='${key}']`,
      );
    }
  });

  it('tokens.css retains identical heatmap colours across all themes', () => {
    assert.ok(css.includes('--heat-jamaat: #1A7F45;'));
    assert.ok(css.includes('--heat-alone: #8FD3A8;'));
    assert.ok(css.includes('--heat-qaza: #E9C46A;'));
    assert.ok(css.includes('--heat-dot: #1B1405;'));
  });

  it('tokens.css matches source of truth colors in themes.js', () => {
    for (const [key, p] of Object.entries(PALETTES)) {
      const c = p.colors;
      const blockRegex = new RegExp(`:root\\[data-palette='${key}'\\]\\s*{([^}]+)}`, 'm');
      const match = css.match(blockRegex);
      assert.ok(match, `Could not find CSS block for palette ${key}`);
      const block = match[1];

      assert.ok(block.includes(`--bg: ${c.bg};`), `${key} --bg mismatch`);
      assert.ok(block.includes(`--card: ${c.card};`), `${key} --card mismatch`);
      assert.ok(block.includes(`--card-deep: ${c.cardDeep};`), `${key} --card-deep mismatch`);
      assert.ok(block.includes(`--text: ${c.text};`), `${key} --text mismatch`);
      assert.ok(block.includes(`--muted: ${c.muted};`), `${key} --muted mismatch`);
      assert.ok(block.includes(`--accent: ${c.accent};`), `${key} --accent mismatch`);
      assert.ok(block.includes(`--accent-text: ${c.accentText};`), `${key} --accent-text mismatch`);
      assert.ok(block.includes(`--light: ${c.light};`), `${key} --light mismatch`);
      assert.ok(block.includes(`--light-text: ${c.lightText};`), `${key} --light-text mismatch`);
      assert.ok(block.includes(`color-scheme: ${p.colorScheme};`), `${key} color-scheme mismatch`);
    }
  });
});
