import { bitsToBytes, bytesToBits, decodeFrame, FRAME_HEADER_BYTES, parseFrameHeader } from './frame';
import { normalizeKey, shuffledIndices } from './prng';
import type { CapacityInfo, ExtractResult, RgbaImage } from './types';

const BLOCK = 8;
const COEFF_A = 2 * BLOCK + 3;
const COEFF_B = 3 * BLOCK + 2;
const COS = new Float64Array(BLOCK * BLOCK);

for (let u = 0; u < BLOCK; u += 1) {
  for (let x = 0; x < BLOCK; x += 1) {
    COS[u * BLOCK + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

function alpha(index: number): number {
  return index === 0 ? 1 / Math.sqrt(2) : 1;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function dct8(block: Float64Array): Float64Array {
  const out = new Float64Array(64);
  for (let u = 0; u < BLOCK; u += 1) {
    for (let v = 0; v < BLOCK; v += 1) {
      let sum = 0;
      for (let x = 0; x < BLOCK; x += 1) {
        for (let y = 0; y < BLOCK; y += 1) {
          sum += block[x * BLOCK + y] * COS[u * BLOCK + x] * COS[v * BLOCK + y];
        }
      }
      out[u * BLOCK + v] = 0.25 * alpha(u) * alpha(v) * sum;
    }
  }
  return out;
}

function idct8(coeff: Float64Array): Float64Array {
  const out = new Float64Array(64);
  for (let x = 0; x < BLOCK; x += 1) {
    for (let y = 0; y < BLOCK; y += 1) {
      let sum = 0;
      for (let u = 0; u < BLOCK; u += 1) {
        for (let v = 0; v < BLOCK; v += 1) {
          sum += alpha(u) * alpha(v) * coeff[u * BLOCK + v] * COS[u * BLOCK + x] * COS[v * BLOCK + y];
        }
      }
      out[x * BLOCK + y] = 0.25 * sum;
    }
  }
  return out;
}

function blockCount(image: RgbaImage): { blocksX: number; blocksY: number; blocks: number } {
  const blocksX = Math.floor(image.width / BLOCK);
  const blocksY = Math.floor(image.height / BLOCK);
  return { blocksX, blocksY, blocks: blocksX * blocksY };
}

function readBlockLuma(image: RgbaImage, blockIndex: number, blocksX: number): Float64Array {
  const block = new Float64Array(64);
  const blockX = blockIndex % blocksX;
  const blockY = Math.floor(blockIndex / blocksX);

  for (let y = 0; y < BLOCK; y += 1) {
    for (let x = 0; x < BLOCK; x += 1) {
      const px = blockX * BLOCK + x;
      const py = blockY * BLOCK + y;
      const offset = (py * image.width + px) * 4;
      block[y * BLOCK + x] = luma(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    }
  }

  return block;
}

function writeBlockLuma(image: RgbaImage, blockIndex: number, blocksX: number, original: Float64Array, changed: Float64Array): void {
  const blockX = blockIndex % blocksX;
  const blockY = Math.floor(blockIndex / blocksX);

  for (let y = 0; y < BLOCK; y += 1) {
    for (let x = 0; x < BLOCK; x += 1) {
      const px = blockX * BLOCK + x;
      const py = blockY * BLOCK + y;
      const offset = (py * image.width + px) * 4;
      const delta = changed[y * BLOCK + x] - original[y * BLOCK + x];
      image.data[offset] = clampByte(image.data[offset] + delta);
      image.data[offset + 1] = clampByte(image.data[offset + 1] + delta);
      image.data[offset + 2] = clampByte(image.data[offset + 2] + delta);
    }
  }
}

function coeffSign(value: number): number {
  return value < 0 ? -1 : 1;
}

function embedBit(coeff: Float64Array, bit: number, strength: number): void {
  const a = Math.abs(coeff[COEFF_A]);
  const b = Math.abs(coeff[COEFF_B]);
  const center = Math.max(strength, (a + b) / 2);
  const high = center + strength / 2;
  const low = Math.max(1, center - strength / 2);

  if (bit === 1) {
    coeff[COEFF_A] = coeffSign(coeff[COEFF_A]) * high;
    coeff[COEFF_B] = coeffSign(coeff[COEFF_B]) * low;
  } else {
    coeff[COEFF_A] = coeffSign(coeff[COEFF_A]) * low;
    coeff[COEFF_B] = coeffSign(coeff[COEFF_B]) * high;
  }
}

function readBit(coeff: Float64Array, strength: number): { bit: number; confidence: number } {
  const diff = Math.abs(coeff[COEFF_A]) - Math.abs(coeff[COEFF_B]);
  return {
    bit: diff >= 0 ? 1 : 0,
    confidence: Math.min(1, Math.abs(diff) / Math.max(1, strength)),
  };
}

export function estimateDctCapacity(image: RgbaImage, repetition = 3): CapacityInfo {
  const { blocks } = blockCount(image);
  const capacityBits = Math.floor(blocks / Math.max(1, repetition));
  const capacityBytes = Math.floor(capacityBits / 8);
  return {
    capacityBits,
    capacityBytes,
    maxPayloadBytes: Math.max(0, capacityBytes - FRAME_HEADER_BYTES),
    blocksOrSlots: blocks,
  };
}

export function embedDctFrame(
  image: RgbaImage,
  frame: Uint8Array,
  key?: string,
  strength = 28,
  repetition = 3,
): RgbaImage {
  const { blocksX, blocks } = blockCount(image);
  if (blocks <= 0) {
    throw new Error('图片尺寸过小，无法进行 8x8 DCT 分块');
  }

  const bits = bytesToBits(frame);
  const slotsNeeded = bits.length * repetition;
  if (slotsNeeded > blocks) {
    const capacity = estimateDctCapacity(image, repetition);
    throw new Error(`图片容量不足：最多约 ${capacity.maxPayloadBytes} 字节 payload，本次需要 ${frame.byteLength} 字节帧`);
  }

  const output: RgbaImage = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
  const order = shuffledIndices(blocks, `${normalizeKey(key)}|dct|${image.width}x${image.height}`);

  let slot = 0;
  for (const bit of bits) {
    for (let r = 0; r < repetition; r += 1) {
      const blockIndex = order[slot];
      const original = readBlockLuma(output, blockIndex, blocksX);
      const coeff = dct8(original);
      embedBit(coeff, bit, strength);
      const changed = idct8(coeff);
      writeBlockLuma(output, blockIndex, blocksX, original, changed);
      slot += 1;
    }
  }

  return output;
}

function extractBits(
  image: RgbaImage,
  order: Uint32Array,
  bitCount: number,
  repetition: number,
  strength: number,
): { bits: number[]; confidence: number } {
  const { blocksX } = blockCount(image);
  const bits: number[] = [];
  let confidenceTotal = 0;

  for (let i = 0; i < bitCount; i += 1) {
    let ones = 0;
    let zeros = 0;
    let bitConfidence = 0;
    for (let r = 0; r < repetition; r += 1) {
      const blockIndex = order[i * repetition + r];
      const coeff = dct8(readBlockLuma(image, blockIndex, blocksX));
      const read = readBit(coeff, strength);
      if (read.bit) ones += 1;
      else zeros += 1;
      bitConfidence += read.confidence;
    }
    bits.push(ones >= zeros ? 1 : 0);
    confidenceTotal += (Math.max(ones, zeros) / repetition) * (bitConfidence / repetition);
  }

  return {
    bits,
    confidence: bitCount > 0 ? confidenceTotal / bitCount : 0,
  };
}

export function extractDctFrame(
  image: RgbaImage,
  key?: string,
  strength = 28,
  repetition = 3,
): { result: ExtractResult; frame?: Uint8Array } {
  const { blocks } = blockCount(image);
  const order = shuffledIndices(blocks, `${normalizeKey(key)}|dct|${image.width}x${image.height}`);
  const headerBits = FRAME_HEADER_BYTES * 8;

  if (headerBits * repetition > blocks) {
    return {
      result: {
        ok: false,
        algorithm: 'dct',
        confidence: 0,
        checksumValid: false,
        dataLength: 0,
        reason: '图片容量不足，无法读取 DCT watermark header',
      },
    };
  }

  const headerRead = extractBits(image, order, headerBits, repetition, strength);
  const headerBytes = bitsToBytes(headerRead.bits);
  const header = parseFrameHeader(headerBytes);
  if (!header.ok || !header.header) {
    return {
      result: {
        ok: false,
        algorithm: 'dct',
        confidence: headerRead.confidence,
        checksumValid: false,
        dataLength: 0,
        reason: header.reason,
      },
    };
  }

  const totalBytes = FRAME_HEADER_BYTES + header.header.payloadLength;
  const totalBits = totalBytes * 8;
  if (totalBits * repetition > blocks) {
    return {
      result: {
        ok: false,
        algorithm: 'dct',
        confidence: headerRead.confidence,
        checksumValid: false,
        dataLength: header.header.payloadLength,
        reason: '水印声明的数据长度超过当前图片容量，可能图片被裁剪或密钥错误',
      },
    };
  }

  const fullRead = extractBits(image, order, totalBits, repetition, strength);
  const frame = bitsToBytes(fullRead.bits).slice(0, totalBytes);
  const decoded = decodeFrame(frame);
  if (!decoded.ok || !decoded.payload) {
    return {
      result: {
        ok: false,
        algorithm: 'dct',
        confidence: fullRead.confidence,
        checksumValid: false,
        dataLength: header.header.payloadLength,
        reason: decoded.reason,
      },
      frame,
    };
  }

  return {
    result: {
      ok: true,
      algorithm: 'dct',
      confidence: fullRead.confidence,
      checksumValid: true,
      dataLength: decoded.payload.byteLength,
      rawPayload: decoded.payload,
    },
    frame,
  };
}
