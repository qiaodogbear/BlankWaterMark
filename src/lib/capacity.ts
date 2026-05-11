import { encodeFrame, estimateCapacity, preparePayload } from './watermark';
import type { ConcreteWatermarkAlgorithm, PayloadInput, RgbaImage } from './watermark';

export interface WatermarkUsage {
  ok: boolean;
  usedBytes: number;
  capacityBytes: number;
  availablePayloadBytes: number;
  percent: number;
  label: string;
  reason?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function measureWatermarkUsage(
  image: RgbaImage | null,
  algorithm: ConcreteWatermarkAlgorithm,
  repetition: number,
  payload: PayloadInput | null,
): Promise<WatermarkUsage> {
  if (!image) {
    return {
      ok: false,
      usedBytes: 0,
      capacityBytes: 0,
      availablePayloadBytes: 0,
      percent: 0,
      label: '未加载图片',
      reason: '请先选择图片',
    };
  }

  const capacity = estimateCapacity(image, algorithm, repetition);
  if (!payload) {
    return {
      ok: false,
      usedBytes: 0,
      capacityBytes: capacity.capacityBytes,
      availablePayloadBytes: capacity.maxPayloadBytes,
      percent: 0,
      label: `0 B / ${formatBytes(capacity.capacityBytes)}`,
      reason: '请输入或选择 payload',
    };
  }

  try {
    const payloadBytes = await preparePayload(payload);
    const frame = encodeFrame(payloadBytes, algorithm);
    const percent = capacity.capacityBytes > 0 ? Math.min(100, (frame.byteLength / capacity.capacityBytes) * 100) : 0;

    return {
      ok: frame.byteLength <= capacity.capacityBytes,
      usedBytes: frame.byteLength,
      capacityBytes: capacity.capacityBytes,
      availablePayloadBytes: capacity.maxPayloadBytes,
      percent,
      label: `${formatBytes(frame.byteLength)} / ${formatBytes(capacity.capacityBytes)}`,
      reason:
        frame.byteLength <= capacity.capacityBytes
          ? undefined
          : `容量不足，当前帧 ${formatBytes(frame.byteLength)}，容量 ${formatBytes(capacity.capacityBytes)}`,
    };
  } catch (error) {
    return {
      ok: false,
      usedBytes: 0,
      capacityBytes: capacity.capacityBytes,
      availablePayloadBytes: capacity.maxPayloadBytes,
      percent: 0,
      label: `0 B / ${formatBytes(capacity.capacityBytes)}`,
      reason: error instanceof Error ? error.message : '无法计算 payload 占用',
    };
  }
}
