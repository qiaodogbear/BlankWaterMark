import { bitsToBytes, bytesToBits, decodeFrame, FRAME_HEADER_BYTES, parseFrameHeader } from './frame';
import { normalizeKey, shuffledIndices } from './prng';
import type { CapacityInfo, ExtractResult, RgbaImage } from './types';

function slotCount(image: RgbaImage): number {
  return image.width * image.height * 3;
}

function slotToOffset(slot: number): number {
  const pixel = Math.floor(slot / 3);
  const channel = slot % 3;
  return pixel * 4 + channel;
}

export function estimateLsbCapacity(image: RgbaImage, repetition = 3): CapacityInfo {
  const slots = slotCount(image);
  const capacityBits = Math.floor(slots / Math.max(1, repetition));
  const capacityBytes = Math.floor(capacityBits / 8);
  return {
    capacityBits,
    capacityBytes,
    maxPayloadBytes: Math.max(0, capacityBytes - FRAME_HEADER_BYTES),
    blocksOrSlots: slots,
  };
}

export function embedLsbFrame(image: RgbaImage, frame: Uint8Array, key?: string, repetition = 3): RgbaImage {
  const bits = bytesToBits(frame);
  const slots = slotCount(image);
  const slotsNeeded = bits.length * repetition;
  if (slotsNeeded > slots) {
    const capacity = estimateLsbCapacity(image, repetition);
    throw new Error(`图片容量不足：LSB 最多约 ${capacity.maxPayloadBytes} 字节 payload，本次需要 ${frame.byteLength} 字节帧`);
  }

  const output: RgbaImage = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
  const order = shuffledIndices(slots, `${normalizeKey(key)}|lsb|${image.width}x${image.height}`);
  let slotIndex = 0;

  for (const bit of bits) {
    for (let r = 0; r < repetition; r += 1) {
      const offset = slotToOffset(order[slotIndex]);
      output.data[offset] = (output.data[offset] & 0xfe) | bit;
      slotIndex += 1;
    }
  }

  return output;
}

function extractBits(
  image: RgbaImage,
  order: Uint32Array,
  bitCount: number,
  repetition: number,
): { bits: number[]; confidence: number } {
  const bits: number[] = [];
  let confidenceTotal = 0;

  for (let i = 0; i < bitCount; i += 1) {
    let ones = 0;
    let zeros = 0;
    for (let r = 0; r < repetition; r += 1) {
      const value = image.data[slotToOffset(order[i * repetition + r])] & 1;
      if (value) ones += 1;
      else zeros += 1;
    }
    bits.push(ones >= zeros ? 1 : 0);
    confidenceTotal += Math.max(ones, zeros) / repetition;
  }

  return { bits, confidence: bitCount ? confidenceTotal / bitCount : 0 };
}

export function extractLsbFrame(
  image: RgbaImage,
  key?: string,
  repetition = 3,
): { result: ExtractResult; frame?: Uint8Array } {
  const slots = slotCount(image);
  const order = shuffledIndices(slots, `${normalizeKey(key)}|lsb|${image.width}x${image.height}`);
  const headerBits = FRAME_HEADER_BYTES * 8;

  if (headerBits * repetition > slots) {
    return {
      result: {
        ok: false,
        algorithm: 'lsb',
        confidence: 0,
        checksumValid: false,
        dataLength: 0,
        reason: '图片容量不足，无法读取 LSB watermark header',
      },
    };
  }

  const headerRead = extractBits(image, order, headerBits, repetition);
  const headerBytes = bitsToBytes(headerRead.bits);
  const header = parseFrameHeader(headerBytes);
  if (!header.ok || !header.header) {
    return {
      result: {
        ok: false,
        algorithm: 'lsb',
        confidence: headerRead.confidence,
        checksumValid: false,
        dataLength: 0,
        reason: header.reason,
      },
    };
  }

  const totalBytes = FRAME_HEADER_BYTES + header.header.payloadLength;
  const totalBits = totalBytes * 8;
  if (totalBits * repetition > slots) {
    return {
      result: {
        ok: false,
        algorithm: 'lsb',
        confidence: headerRead.confidence,
        checksumValid: false,
        dataLength: header.header.payloadLength,
        reason: '水印声明的数据长度超过当前图片容量，可能图片被裁剪或密钥错误',
      },
    };
  }

  const fullRead = extractBits(image, order, totalBits, repetition);
  const frame = bitsToBytes(fullRead.bits).slice(0, totalBytes);
  const decoded = decodeFrame(frame);
  if (!decoded.ok || !decoded.payload) {
    return {
      result: {
        ok: false,
        algorithm: 'lsb',
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
      algorithm: 'lsb',
      confidence: fullRead.confidence,
      checksumValid: true,
      dataLength: decoded.payload.byteLength,
      rawPayload: decoded.payload,
    },
    frame,
  };
}
