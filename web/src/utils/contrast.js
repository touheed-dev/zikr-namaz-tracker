/**
 * WCAG 2.1 relative luminance and contrast ratio calculations.
 */

export function parseHex(hex) {
  if (!hex || typeof hex !== 'string') {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6 && clean.length !== 8) {
    throw new Error(`Invalid hex colour length: ${hex}`);
  }
  const num = parseInt(clean.slice(0, 6), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function relativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(colorA, colorB) {
  const l1 = relativeLuminance(colorA);
  const l2 = relativeLuminance(colorB);
  const top = Math.max(l1, l2);
  const bottom = Math.min(l1, l2);
  return (top + 0.05) / (bottom + 0.05);
}
