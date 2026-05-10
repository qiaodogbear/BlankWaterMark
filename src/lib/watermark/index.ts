import { gunzipSync, gzipSync } from 'fflate';
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './base64';
import { decryptBytes, encryptBytes, sha256Hex } from './crypto';
import { corruptByte, decodeFrame, encodeFrame } from './frame';
import { embedDctFrame, estimateDctCapacity, extractDctFrame } from './dct';
import { embedLsbFrame, estimateLsbCapacity, extractLsbFrame } from './lsb';
import type {
  CapacityInfo,
  ConcreteWatermarkAlgorithm,
  DecodedPayload,
  EmbedOptions,
  EmbedResult,
  ExtractOptions,
  ExtractResult,
  PayloadInput,
  RgbaImage,
} from './types';

export type {
  CapacityInfo,
  ConcreteWatermarkAlgorithm,
  DecodedPayload,
  EmbedOptions,
  EmbedResult,
  ExtractOptions,
  ExtractResult,
  PayloadInput,
  RgbaImage,
  WatermarkAlgorithm,
} from './types';
export { corruptByte, decodeFrame, encodeFrame };

interface PayloadEnvelope {
  v: 1;
  kind: PayloadInput['kind'];
  name?: string;
  mime?: string;
  compressed: boolean;
  encrypted: boolean;
  compression: 'gzip' | 'none';
  encryption: 'aes-gcm' | 'none';
  sha256: string;
  originalSize: number;
  data: string;
  salt?: string;
  iv?: string;
}

function cloneImage(image: RgbaImage): RgbaImage {
  if (!image.width || !image.height || image.data.byteLength !== image.width * image.height * 4) {
    throw new Error('图片数据无效或为空');
  }

  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}

function payloadSourceBytes(payload: PayloadInput): Uint8Array {
  if (payload.kind === 'file') {
    if (!payload.bytes?.byteLength) {
      throw new Error('文件 payload 为空或未读取成功');
    }
    return payload.bytes;
  }

  const text = payload.text ?? '';
  if (!text.trim()) {
    throw new Error('文本或 JSON payload 不能为空');
  }
  return utf8ToBytes(text);
}

export async function preparePayload(payload: PayloadInput): Promise<Uint8Array> {
  const original = payloadSourceBytes(payload);
  let working = original;
  const compressed = Boolean(payload.compress);
  const encrypted = Boolean(payload.encrypt);
  const envelope: PayloadEnvelope = {
    v: 1,
    kind: payload.kind,
    name: payload.fileName,
    mime: payload.mimeType,
    compressed,
    encrypted,
    compression: compressed ? 'gzip' : 'none',
    encryption: encrypted ? 'aes-gcm' : 'none',
    sha256: await sha256Hex(original),
    originalSize: original.byteLength,
    data: '',
  };

  if (compressed) {
    working = gzipSync(working);
  }

  if (encrypted) {
    const encryptedBytes = await encryptBytes(working, payload.password ?? '');
    working = encryptedBytes.cipher;
    envelope.salt = bytesToBase64(encryptedBytes.salt);
    envelope.iv = bytesToBase64(encryptedBytes.iv);
  }

  envelope.data = bytesToBase64(working);
  return utf8ToBytes(JSON.stringify(envelope));
}

export async function decodePayload(bytes: Uint8Array, password = ''): Promise<DecodedPayload> {
  let envelope: PayloadEnvelope;
  try {
    envelope = JSON.parse(bytesToUtf8(bytes)) as PayloadEnvelope;
  } catch {
    throw new Error('水印 payload 不是有效 JSON 包装格式');
  }

  if (envelope.v !== 1 || !envelope.data || !envelope.kind) {
    throw new Error('水印 payload 格式不受支持');
  }

  let working = base64ToBytes(envelope.data);
  if (envelope.encrypted) {
    if (!envelope.salt || !envelope.iv) {
      throw new Error('加密 payload 缺少 salt 或 iv');
    }
    working = await decryptBytes(working, password, base64ToBytes(envelope.salt), base64ToBytes(envelope.iv));
  }

  if (envelope.compressed) {
    try {
      working = gunzipSync(working);
    } catch {
      throw new Error('payload 解压失败，数据可能损坏');
    }
  }

  const actualSha = await sha256Hex(working);
  if (actualSha !== envelope.sha256) {
    throw new Error('payload SHA-256 完整性校验失败');
  }

  const text = envelope.kind === 'file' ? '' : bytesToUtf8(working);
  return {
    kind: envelope.kind,
    text,
    bytes: working,
    fileName: envelope.name,
    mimeType: envelope.mime,
    compressed: envelope.compressed,
    encrypted: envelope.encrypted,
    sha256: envelope.sha256,
    originalSize: envelope.originalSize,
  };
}

export function estimateCapacity(
  image: RgbaImage,
  algorithm: ConcreteWatermarkAlgorithm,
  repetition = 3,
): CapacityInfo {
  return algorithm === 'dct' ? estimateDctCapacity(image, repetition) : estimateLsbCapacity(image, repetition);
}

export async function embedWatermark(image: RgbaImage, options: EmbedOptions): Promise<EmbedResult> {
  const source = cloneImage(image);
  const repetition = Math.max(1, Math.floor(options.repetition ?? 3));
  const strength = Math.max(4, options.strength ?? 28);
  const payloadBytes = await preparePayload(options.payload);
  const frame = encodeFrame(payloadBytes, options.algorithm);
  const capacity = estimateCapacity(source, options.algorithm, repetition);
  const usedBits = frame.byteLength * 8;

  if (usedBits > capacity.capacityBits) {
    throw new Error(`图片容量不足：最多约 ${capacity.maxPayloadBytes} 字节 payload，本次帧大小 ${frame.byteLength} 字节`);
  }

  const watermarked =
    options.algorithm === 'dct'
      ? embedDctFrame(source, frame, options.key, strength, repetition)
      : embedLsbFrame(source, frame, options.key, repetition);

  return {
    image: watermarked,
    algorithm: options.algorithm,
    capacityBits: capacity.capacityBits,
    usedBits,
    frameBytes: frame.byteLength,
    message: `已嵌入 ${payloadBytes.byteLength} 字节 payload，算法 ${options.algorithm.toUpperCase()}`,
  };
}

async function extractConcrete(
  image: RgbaImage,
  algorithm: ConcreteWatermarkAlgorithm,
  options: ExtractOptions,
): Promise<ExtractResult> {
  const repetition = Math.max(1, Math.floor(options.repetition ?? 3));
  const strength = Math.max(4, options.strength ?? 28);
  const extracted =
    algorithm === 'dct'
      ? extractDctFrame(image, options.key, strength, repetition)
      : extractLsbFrame(image, options.key, repetition);

  if (!extracted.result.ok || !extracted.result.rawPayload) {
    return extracted.result;
  }

  try {
    const payload = await decodePayload(extracted.result.rawPayload, options.password ?? '');
    return {
      ...extracted.result,
      payload,
    };
  } catch (error) {
    return {
      ...extracted.result,
      ok: false,
      checksumValid: extracted.result.checksumValid,
      reason: error instanceof Error ? error.message : 'payload 解析失败',
    };
  }
}

export async function extractWatermark(image: RgbaImage, options: ExtractOptions): Promise<ExtractResult> {
  const source = cloneImage(image);
  if (options.algorithm === 'auto') {
    const dct = await extractConcrete(source, 'dct', { ...options, algorithm: 'dct' });
    if (dct.ok) return dct;
    const lsb = await extractConcrete(source, 'lsb', { ...options, algorithm: 'lsb' });
    if (lsb.ok) return lsb;
    return {
      ok: false,
      algorithm: 'auto',
      confidence: Math.max(dct.confidence, lsb.confidence),
      checksumValid: false,
      dataLength: 0,
      reason: `未检测到可解析水印。DCT: ${dct.reason ?? '失败'}；LSB: ${lsb.reason ?? '失败'}`,
    };
  }

  return extractConcrete(source, options.algorithm, options);
}
