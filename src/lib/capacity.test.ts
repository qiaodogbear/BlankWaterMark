import { describe, expect, test } from 'vitest';
import { measureWatermarkUsage, formatBytes } from './capacity';
import type { RgbaImage } from './watermark';

function makeImage(width: number, height: number): RgbaImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

describe('watermark capacity usage', () => {
  test('measures frame usage against algorithm capacity', async () => {
    const usage = await measureWatermarkUsage(makeImage(1024, 768), 'dct', 3, {
      kind: 'text',
      text: 'hello',
      compress: false,
      encrypt: false,
    });

    expect(usage.ok).toBe(true);
    expect(usage.usedBytes).toBeGreaterThan(14);
    expect(usage.capacityBytes).toBeGreaterThan(usage.usedBytes);
    expect(usage.percent).toBeGreaterThan(0);
    expect(usage.percent).toBeLessThan(100);
    expect(usage.label).toMatch(/KB|B/);
  });

  test('formats byte counts for compact UI labels', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
