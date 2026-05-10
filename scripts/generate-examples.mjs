import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'examples', 'sample-image.png');
mkdirSync(dirname(outputPath), { recursive: true });

const width = 960;
const height = 640;
const png = new PNG({ width, height });

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = (width * y + x) << 2;
    const stripe = Math.floor((x + y) / 48) % 2;
    png.data[index] = (x * 3 + y * 2 + stripe * 24) % 256;
    png.data[index + 1] = (x * 2 + y * 5 + 80) % 256;
    png.data[index + 2] = (x * 7 + y * 3 + 120) % 256;
    png.data[index + 3] = 255;
  }
}

writeFileSync(outputPath, PNG.sync.write(png));
console.log(`Generated ${outputPath}`);
