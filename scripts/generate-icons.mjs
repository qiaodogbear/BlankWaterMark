import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = resolve(root, 'src-tauri', 'icons');
mkdirSync(iconDir, { recursive: true });

function makePng(size) {
  const png = new PNG({ width: size, height: size });
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) << 2;
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const inMark = Math.abs(dx - dy) < 0.18 || Math.abs(dx + dy) < 0.18;
      png.data[index] = radius < 0.88 ? 23 : 247;
      png.data[index + 1] = radius < 0.88 ? 32 : 243;
      png.data[index + 2] = radius < 0.88 ? 27 : 234;
      if (inMark && radius < 0.72) {
        png.data[index] = 182;
        png.data[index + 1] = 107;
        png.data[index + 2] = 69;
      }
      png.data[index + 3] = radius < 0.94 ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
}

function pngToIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const directory = Buffer.alloc(16);
  directory[0] = size >= 256 ? 0 : size;
  directory[1] = size >= 256 ? 0 : size;
  directory[2] = 0;
  directory[3] = 0;
  directory.writeUInt16LE(1, 4);
  directory.writeUInt16LE(32, 6);
  directory.writeUInt32LE(pngBuffer.length, 8);
  directory.writeUInt32LE(22, 12);

  return Buffer.concat([header, directory, pngBuffer]);
}

const png32 = makePng(32);
const png128 = makePng(128);
const png256 = makePng(256);

writeFileSync(resolve(iconDir, '32x32.png'), png32);
writeFileSync(resolve(iconDir, '128x128.png'), png128);
writeFileSync(resolve(iconDir, '128x128@2x.png'), png256);
writeFileSync(resolve(iconDir, 'icon.png'), png256);
writeFileSync(resolve(iconDir, 'icon.ico'), pngToIco(png256, 256));

console.log(`Generated Tauri icons in ${iconDir}`);
