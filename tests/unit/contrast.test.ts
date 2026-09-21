/**
 * Colour-contrast tests for the palette.
 *
 * These exist because a safety product is read one-handed, outdoors, in poor
 * light, often by someone who is stressed. A button that is merely "readable
 * enough" on a designer's monitor is not good enough for the control someone
 * taps to say they are safe.
 *
 * Tokens are parsed out of styles/globals.css so the test fails if the palette
 * drifts, not just if a component changes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'styles', 'globals.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!match?.[1]) throw new Error(`Token --color-${name} not found in globals.css`);
  return match[1];
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const WHITE = '#ffffff';
const AA_NORMAL = 4.5;

describe('white text on a filled button', () => {
  // Every one of these is a real button background carrying white label text.
  const filled: Array<[string, string]> = [
    ['brand-600', token('brand-600')],
    ['brand-700', token('brand-700')],
    ['alert-600', token('alert-600')],
    ['alert-700', token('alert-700')],
    ['safe-600', token('safe-600')],
  ];

  it.each(filled)('%s meets AA for normal text', (_name, hex) => {
    expect(contrast(hex, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('safe-600 is used for the "I\'M SAFE" button, not safe-500', () => {
    const button = readFileSync(join(process.cwd(), 'components', 'ui', 'Button.tsx'), 'utf8');
    expect(button).toMatch(/safe:\s*'bg-safe-600 text-white/);
    expect(button).not.toMatch(/safe:\s*'bg-safe-500/);
  });

  it('records why safe-500 may not carry white text', () => {
    // Kept as a fill for dots and tinted panels; it fails AA under text.
    expect(contrast(token('safe-500'), WHITE)).toBeLessThan(AA_NORMAL);
    expect(css).toMatch(/safe-500 is a FILL only/);
  });
});

describe('body and secondary text', () => {
  const surfaces: Array<[string, string]> = [
    ['white', WHITE],
    ['ink-50 (page background)', token('ink-50')],
    ['brand-50 (info notice)', token('brand-50')],
    ['caution-50 (caution notice)', token('caution-50')],
    ['alert-50 (error notice)', token('alert-50')],
    ['safe-50 (success notice)', token('safe-50')],
  ];

  it.each(surfaces)('secondary text is legible on %s', (_name, background) => {
    expect(contrast(token('ink-600'), background)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(surfaces)('primary text is legible on %s', (_name, background) => {
    expect(contrast(token('ink-900'), background)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('coloured text on its own tinted background', () => {
  it('alert text on the alert notice is legible', () => {
    expect(contrast(token('alert-700'), token('alert-50'))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('brand text on the brand notice is legible', () => {
    expect(contrast(token('brand-800'), token('brand-50'))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('safe text on the safe notice is legible', () => {
    expect(contrast(token('safe-600'), token('safe-50'))).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
