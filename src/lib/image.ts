import type { RgbaImage } from './watermark';

export interface ImageFileMeta {
  name: string;
  type: string;
  size: number;
}

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
}

export const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export function validateImageFileMeta(file: ImageFileMeta): ImageValidationResult {
  if (!file.size) {
    return { ok: false, error: `图片文件 ${file.name || ''} 为空，无法读取` };
  }

  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const extensionSupported = /\.(png|jpe?g|webp)$/.test(name);
  if (!SUPPORTED_IMAGE_TYPES.has(type) && !extensionSupported) {
    return { ok: false, error: `${file.name || '所选文件'} 不是支持的图片格式，请使用 PNG、JPG、JPEG 或 WEBP` };
  }

  return { ok: true };
}

export async function fileToImageData(file: File): Promise<RgbaImage> {
  const validation = validateImageFileMeta(file);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('浏览器无法创建图片处理画布');
  }

  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return {
    width: data.width,
    height: data.height,
    data: new Uint8ClampedArray(data.data),
  };
}

export function imageDataToCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('浏览器无法创建图片输出画布');
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
}

export function imageDataToDataUrl(image: RgbaImage, type = 'image/png', quality = 0.95): string {
  return imageDataToCanvas(image).toDataURL(type, quality);
}

export function imageDataToBlob(image: RgbaImage, type = 'image/png', quality = 0.95): Promise<Blob> {
  const canvas = imageDataToCanvas(image);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片导出失败'));
      },
      type,
      quality,
    );
  });
}

export function collectImageMetadata(file: File | null, image: RgbaImage | null): Record<string, string> {
  return {
    文件名: file?.name ?? '-',
    类型: file?.type || '-',
    大小: file ? `${(file.size / 1024).toFixed(1)} KB` : '-',
    宽度: image ? `${image.width}px` : '-',
    高度: image ? `${image.height}px` : '-',
    像素: image ? `${(image.width * image.height).toLocaleString()}` : '-',
  };
}
