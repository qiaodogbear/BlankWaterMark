export type WatermarkAlgorithm = 'dct' | 'lsb' | 'auto';
export type ConcreteWatermarkAlgorithm = Exclude<WatermarkAlgorithm, 'auto'>;
export type PayloadKind = 'text' | 'json' | 'file';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PayloadInput {
  kind: PayloadKind;
  text?: string;
  bytes?: Uint8Array;
  fileName?: string;
  mimeType?: string;
  compress?: boolean;
  encrypt?: boolean;
  password?: string;
}

export interface DecodedPayload {
  kind: PayloadKind;
  text: string;
  bytes: Uint8Array;
  fileName?: string;
  mimeType?: string;
  compressed: boolean;
  encrypted: boolean;
  sha256: string;
  originalSize: number;
}

export interface EmbedOptions {
  algorithm: ConcreteWatermarkAlgorithm;
  payload: PayloadInput;
  key?: string;
  strength?: number;
  repetition?: number;
}

export interface ExtractOptions {
  algorithm: WatermarkAlgorithm;
  key?: string;
  password?: string;
  strength?: number;
  repetition?: number;
}

export interface EmbedResult {
  image: RgbaImage;
  algorithm: ConcreteWatermarkAlgorithm;
  capacityBits: number;
  usedBits: number;
  frameBytes: number;
  message: string;
}

export interface ExtractResult {
  ok: boolean;
  algorithm: WatermarkAlgorithm;
  confidence: number;
  checksumValid: boolean;
  dataLength: number;
  payload?: DecodedPayload;
  rawPayload?: Uint8Array;
  reason?: string;
}

export interface FrameHeader {
  algorithm: ConcreteWatermarkAlgorithm;
  payloadLength: number;
  crc32: number;
}

export interface FrameDecodeResult {
  ok: boolean;
  algorithm?: ConcreteWatermarkAlgorithm;
  payload?: Uint8Array;
  header?: FrameHeader;
  reason?: string;
}

export interface CapacityInfo {
  capacityBits: number;
  capacityBytes: number;
  maxPayloadBytes: number;
  blocksOrSlots: number;
}
