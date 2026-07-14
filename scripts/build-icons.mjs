/**
 * Renders scripts/icon.svg into the PNGs a phone needs on its home screen.
 * Run with: npm run icons
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

/** maskable needs padding: Android crops icons to a circle and would clip the neck. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, padding: 0 },
  { file: 'icon-512.png', size: 512, padding: 0 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0 },
];

const svg = await readFile(join(here, 'icon.svg'));
await mkdir(publicDir, { recursive: true });

for (const { file, size, padding } of TARGETS) {
  const inner = Math.round(size * (1 - 2 * padding));
  const margin = Math.round((size - inner) / 2);

  await sharp(svg, { density: 400 })
    .resize(inner, inner)
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: '#1b1a18',
    })
    .png()
    .toFile(join(publicDir, file));

  console.log(`${file}  ${size}x${size}`);
}
