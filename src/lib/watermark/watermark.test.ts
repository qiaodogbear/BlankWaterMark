import { describe, expect, test } from 'vitest';
import {
  corruptByte,
  decodeFrame,
  embedWatermark,
  encodeFrame,
  extractWatermark,
  type RgbaImage,
} from './index';
import { validateImageFileMeta } from '../image';

function makeImage(width = 768, height = 512): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = (x * 3 + y * 5) % 256;
      data[i + 1] = (x * 7 + y * 2) % 256;
      data[i + 2] = (x * 11 + y * 13) % 256;
      data[i + 3] = 255;
    }
  }

  return { width, height, data };
}

describe('blind watermark core', () => {
  test('DCT embeds and extracts the original text payload', async () => {
    const source = makeImage();
    const embedded = await embedWatermark(source, {
      algorithm: 'dct',
      key: 'case-alpha',
      strength: 28,
      repetition: 3,
      payload: {
        kind: 'text',
        text: 'blind watermark payload',
        compress: false,
        encrypt: false,
      },
    });

    const extracted = await extractWatermark(embedded.image, {
      algorithm: 'dct',
      key: 'case-alpha',
      password: '',
    });

    expect(extracted.ok).toBe(true);
    expect(extracted.payload?.kind).toBe('text');
    expect(extracted.payload?.text).toBe('blind watermark payload');
    expect(extracted.confidence).toBeGreaterThan(0.65);
    expect(extracted.checksumValid).toBe(true);
  });

  test('DCT extraction with the wrong key fails checksum validation', async () => {
    const embedded = await embedWatermark(makeImage(1024, 768), {
      algorithm: 'dct',
      key: 'right-key',
      strength: 28,
      repetition: 3,
      payload: {
        kind: 'json',
        text: '{"owner":"Alice","asset":"demo"}',
        compress: false,
        encrypt: false,
      },
    });

    const extracted = await extractWatermark(embedded.image, {
      algorithm: 'dct',
      key: 'wrong-key',
      password: '',
    });

    expect(extracted.ok).toBe(false);
    expect(extracted.reason).toMatch(/key|checksum|watermark/i);
  });

  test('LSB mode round-trips a payload', async () => {
    const embedded = await embedWatermark(makeImage(160, 120), {
      algorithm: 'lsb',
      key: 'lsb-key',
      strength: 1,
      repetition: 3,
      payload: {
        kind: 'text',
        text: 'compact lsb payload',
        compress: false,
        encrypt: false,
      },
    });

    const extracted = await extractWatermark(embedded.image, {
      algorithm: 'lsb',
      key: 'lsb-key',
      password: '',
    });

    expect(extracted.ok).toBe(true);
    expect(extracted.payload?.text).toBe('compact lsb payload');
  });

  test('corrupt frames are rejected', () => {
    const frame = encodeFrame(new TextEncoder().encode('payload'), 'dct');
    const corrupted = corruptByte(frame, 8);
    const decoded = decodeFrame(corrupted);

    expect(decoded.ok).toBe(false);
    expect(decoded.reason).toMatch(/checksum|magic|length/i);
  });

  test('empty image files return a readable validation error', () => {
    const result = validateImageFileMeta({ name: 'empty.png', size: 0, type: 'image/png' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('为空');
  });

  test('non-image files return a readable validation error', () => {
    const result = validateImageFileMeta({ name: 'notes.txt', size: 32, type: 'text/plain' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('不是支持的图片');
  });
});
