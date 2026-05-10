import type { ConcreteWatermarkAlgorithm, FrameDecodeResult, FrameHeader } from './types';

export const FRAME_MAGIC = new Uint8Array([0x42, 0x57, 0x4d, 0x32]);
export const FRAME_VERSION = 1;
export const FRAME_HEADER_BYTES = 14;

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function algorithmToId(algorithm: ConcreteWatermarkAlgorithm): number {
  return algorithm === 'dct' ? 1 : 2;
}

export function idToAlgorithm(id: number): ConcreteWatermarkAlgorithm | undefined {
  if (id === 1) return 'dct';
  if (id === 2) return 'lsb';
  return undefined;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

export function encodeFrame(payload: Uint8Array, algorithm: ConcreteWatermarkAlgorithm): Uint8Array {
  if (payload.byteLength > 0xffff_ffff) {
    throw new Error('payload 过大，无法编码到水印帧');
  }

  const frame = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
  frame.set(FRAME_MAGIC, 0);
  frame[4] = FRAME_VERSION;
  frame[5] = algorithmToId(algorithm);
  writeU32(frame, 6, payload.byteLength);
  writeU32(frame, 10, crc32(payload));
  frame.set(payload, FRAME_HEADER_BYTES);
  return frame;
}

export function parseFrameHeader(bytes: Uint8Array): FrameDecodeResult {
  if (bytes.byteLength < FRAME_HEADER_BYTES) {
    return { ok: false, reason: '水印帧长度不足，未检测到 watermark header' };
  }

  for (let i = 0; i < FRAME_MAGIC.length; i += 1) {
    if (bytes[i] !== FRAME_MAGIC[i]) {
      return { ok: false, reason: '未检测到 watermark，可能 key 错误或图片已被严重压缩' };
    }
  }

  if (bytes[4] !== FRAME_VERSION) {
    return { ok: false, reason: `不支持的水印版本: ${bytes[4]}` };
  }

  const algorithm = idToAlgorithm(bytes[5]);
  if (!algorithm) {
    return { ok: false, reason: `不支持的水印算法标识: ${bytes[5]}` };
  }

  const header: FrameHeader = {
    algorithm,
    payloadLength: readU32(bytes, 6),
    crc32: readU32(bytes, 10),
  };

  return { ok: true, algorithm, header };
}

export function decodeFrame(bytes: Uint8Array): FrameDecodeResult {
  const headerResult = parseFrameHeader(bytes);
  if (!headerResult.ok || !headerResult.header) return headerResult;

  const expectedLength = FRAME_HEADER_BYTES + headerResult.header.payloadLength;
  if (expectedLength > bytes.byteLength) {
    return {
      ok: false,
      reason: `水印数据 length 不完整: 需要 ${expectedLength} 字节，实际 ${bytes.byteLength} 字节`,
    };
  }

  const payload = bytes.slice(FRAME_HEADER_BYTES, expectedLength);
  const actualCrc = crc32(payload);
  if (actualCrc !== headerResult.header.crc32) {
    return {
      ok: false,
      algorithm: headerResult.algorithm,
      header: headerResult.header,
      reason: '水印 checksum 校验失败，可能 key 错误或图片被压缩/裁剪',
    };
  }

  return {
    ok: true,
    algorithm: headerResult.algorithm,
    header: headerResult.header,
    payload,
  };
}

export function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bits.push((byte >> bit) & 1);
    }
  }
  return bits;
}

export function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i]) {
      bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
    }
  }
  return bytes;
}

export function corruptByte(bytes: Uint8Array, offset: number): Uint8Array {
  const next = new Uint8Array(bytes);
  if (offset >= 0 && offset < next.byteLength) {
    next[offset] ^= 0xff;
  }
  return next;
}
