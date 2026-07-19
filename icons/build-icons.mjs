/**
 * Generates the app icons from one source motif.
 *
 * Run with:  node icons/build-icons.mjs
 * (sharp comes from the build toolchain; this is a dev utility, not part of the app.)
 *
 * The motif is the app's own fretboard: a dark rosewood board, light frets and
 * strings, neutral scale tones and the warm amber root — the same palette as
 * src/App.css, so the icon and the app read as one thing.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// --- The palette, copied from src/App.css ---
const BG = '#1b1a18'; // page background, dark theme
const BOARD = '#2c2825';
const BOARD_TOP = '#363029';
const NUT = '#e9e2d5';
const FRET = '#9c948a';
const STRING = '#b4aca1';
const NOTE = '#8b95a0';
const NOTE_STROKE = '#aab3bc';
const ROOT = '#e0a33f';
const ROOT_STROKE = '#f4c777';

// --- Geometry (512 canvas) ---
const STRINGS = [126, 178, 230, 282, 334, 386]; // high e at top, low E at bottom
const FRETS = [166, 252, 338, 424];
const NUT_X = 90;
const BOARD_X = 76;
const BOARD_W = 360;
const BOARD_Y = 98;
const BOARD_H = 316;
const R = 26; // note radius

/** Low strings are visibly thicker, the way a real set is. */
const stringWidth = (i) => 2 + i * 0.36;

/**
 * The dots: a column at the nut plus a second shape further up, with the root
 * picked out in amber — the one thing you always look for on the neck.
 */
const DOTS = [
  // open column
  { x: 128, y: STRINGS[0], root: true },
  { x: 128, y: STRINGS[1] },
  { x: 128, y: STRINGS[2] },
  { x: 128, y: STRINGS[3] },
  { x: 128, y: STRINGS[4] },
  { x: 128, y: STRINGS[5], root: true },
  // the shape up the neck
  { x: 295, y: STRINGS[0] },
  { x: 295, y: STRINGS[1] },
  { x: 209, y: STRINGS[2] },
  { x: 209, y: STRINGS[3], root: true },
  { x: 209, y: STRINGS[4] },
  { x: 295, y: STRINGS[5] },
];

const motif = () => `
  <rect x="${BOARD_X}" y="${BOARD_Y}" width="${BOARD_W}" height="${BOARD_H}" rx="14" fill="${BOARD}"/>
  <rect x="${BOARD_X}" y="${BOARD_Y}" width="${BOARD_W}" height="10" rx="5" fill="${BOARD_TOP}"/>
  ${FRETS.map(
    (x) =>
      `<line x1="${x}" y1="${BOARD_Y + 10}" x2="${x}" y2="${BOARD_Y + BOARD_H - 10}" stroke="${FRET}" stroke-width="3" stroke-linecap="round"/>`,
  ).join('')}
  ${STRINGS.map(
    (y, i) =>
      `<line x1="${NUT_X}" y1="${y}" x2="${BOARD_X + BOARD_W}" y2="${y}" stroke="${STRING}" stroke-width="${stringWidth(i)}" stroke-linecap="round"/>`,
  ).join('')}
  <line x1="${NUT_X}" y1="${BOARD_Y + 8}" x2="${NUT_X}" y2="${BOARD_Y + BOARD_H - 8}" stroke="${NUT}" stroke-width="15" stroke-linecap="round"/>
  ${DOTS.map(
    (d) =>
      `<circle cx="${d.x}" cy="${d.y}" r="${R}" fill="${d.root ? ROOT : NOTE}" stroke="${d.root ? ROOT_STROKE : NOTE_STROKE}" stroke-width="3"/>`,
  ).join('')}`;

/**
 * `rounded` draws the app's own rounded square (for the plain icons).
 * `scale` shrinks the motif — a maskable icon is cropped to the platform's shape,
 * so its content has to sit well inside the canvas.
 */
function svg({ rounded, scale }) {
  const background = rounded
    ? `<rect width="512" height="512" rx="112" fill="${BG}"/>`
    : // Full bleed: the platform crops this, so every pixel must be filled —
      // transparent corners are exactly what a maskable icon must not have.
      `<rect width="512" height="512" fill="${BG}"/>`;

  const inner =
    scale === 1
      ? motif()
      : `<g transform="translate(256,256) scale(${scale}) translate(-256,-256)">${motif()}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${background}${inner}</svg>`;
}

/**
 * The favicon is a different drawing, not the same one shrunk.
 *
 * A browser tab renders this at 16–32 px. The app icon has twelve dots, six strings
 * and four frets; at 16 px that is roughly two pixels per string and it collapses
 * into a grey smear with a hint of orange. Detail that cannot survive the size is
 * not detail, it is noise.
 *
 * So this keeps only what identifies the app: a piece of fretboard, and the amber
 * root note you are always looking for. Three strings and two frets, all of them
 * thick enough to still be a line at 16 px — under about 32 units on this 512 canvas
 * a stroke is thinner than one device pixel and turns to grey mush.
 */
function faviconSvg() {
  const strings = [168, 256, 344];
  const frets = [188, 356];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="${BOARD}"/>
  ${frets
    .map(
      (x) =>
        `<line x1="${x}" y1="96" x2="${x}" y2="416" stroke="${FRET}" stroke-width="26" stroke-linecap="round"/>`,
    )
    .join('')}
  ${strings
    .map(
      (y, i) =>
        `<line x1="64" y1="${y}" x2="448" y2="${y}" stroke="${STRING}" stroke-width="${24 + i * 8}" stroke-linecap="round"/>`,
    )
    .join('')}
  <circle cx="272" cy="256" r="104" fill="${ROOT}" stroke="${ROOT_STROKE}" stroke-width="14"/>
</svg>
`;
}

const targets = [
  { file: 'icon-192.png', size: 192, svg: svg({ rounded: true, scale: 1 }) },
  { file: 'icon-512.png', size: 512, svg: svg({ rounded: true, scale: 1 }) },
  // Android crops to its own shape: full bleed, motif inside the safe zone.
  { file: 'icon-maskable-512.png', size: 512, svg: svg({ rounded: false, scale: 0.72 }) },
  // iOS applies its own rounding, so the source is a full square.
  { file: 'apple-touch-icon.png', size: 180, svg: svg({ rounded: false, scale: 0.92 }) },
];

for (const target of targets) {
  const png = await sharp(Buffer.from(target.svg)).resize(target.size, target.size).png().toBuffer();
  await writeFile(join(OUT, target.file), png);
  console.log(`${target.file}  ${target.size}x${target.size}  ${png.length} B`);
}

// Shipped as SVG: a tab may ask for 16, 32 or 48 px depending on the platform and
// the display, and one vector answers all of them.
const favicon = faviconSvg();
await writeFile(join(OUT, 'favicon.svg'), favicon);
console.log(`favicon.svg  vector  ${Buffer.byteLength(favicon)} B`);
