/**
 * Turns two CC0 sample libraries into the handful of small MP3s the app ships.
 *
 * Run once, by hand, after fetching the libraries into .samples-src/. Nothing here
 * runs in the browser or during the build — the output is committed.
 *
 *   node scripts/build-samples.mjs
 *
 * The note each sample belongs to is read out of each library's own .sfz programs
 * rather than guessed from filenames, so the mapping comes from the source.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import lame from '@breezystack/lamejs';

const ZIP = '.samples-src/shinyguitar.zip';
const WORK = '.samples-src/Shinyguitar';
const FREEPATS = '.samples-src/dist2/EGuitarFSBS-bridge-dist2-SFZ-20220911';
const OUT = 'public/samples';

/**
 * The two voices, each from its own recording.
 *
 * `electric` is Karoryfer's Shinyguitar (CC0-1.0), an archtop through its magnetic
 * pickup. `dist` is FreePats' EGuitarFSBS bridge dist2 (CC0-1.0), a Fender recorded
 * *through a real amplifier and effects rack*.
 *
 * That second one exists because simulating the overdrive kept failing. A WaveShaper
 * distorts each note on its own, where an amplifier distorts the sum of all six
 * strings — and there was no speaker cabinet, which is what tames the fizz above
 * 5 kHz. Both are baked into a recording and neither is worth rebuilding.
 */
const VOICES = [
  {
    id: 'electric',
    program: join(WORK, 'Programs', 'electric_one.sfz'),
    /** Velocity layer 3 of 4 — a firm pick, the way you strum a chord. */
    velocity: (lo) => lo === 65,
    /** Its wavs live in the zip and are pulled out on demand. */
    fromZip: true,
    root: join(WORK, 'Samples'),
  },
  {
    id: 'dist',
    program: join(FREEPATS, 'EGuitarFSBS-bridge-dist2-20220911.sfz'),
    // The hard layer where the library splits, and the single layer where it does not.
    velocity: (lo, hi) => lo >= 93 || (lo === 1 && hi === 127),
    fromZip: false,
    root: FREEPATS,
  },
];

/** The app needs low E (40) up to the top of a 24-fret high E (88). */
const RANGE = { lo: 40, hi: 88 };
/**
 * Above this, every second sample is dropped.
 *
 * All sixteen would be 562 KB, over budget. Rather than thin out evenly, the dense
 * spacing is kept where chords actually live — every voicing on the neck has its
 * notes below here — and the top, which only the highest frets ever reach, makes do
 * with a wider stretch.
 */
const DENSE_BELOW = 63;
/**
 * Seconds kept per note. The app never holds one longer: a strum rings for at most
 * 2.0 s (`strumRing` in audio.ts) and a single note for 1.0 s. Anything past that is
 * bytes nobody hears — and trimming it is what buys the denser note grid above.
 */
const SECONDS = 2;
const BITRATE = 64;

/** Reads pitch_keycenter -> sample for one velocity layer of an .sfz program. */
function parseProgram(path, wantsVelocity) {
  const text = readFileSync(path, 'utf8');
  const byKey = new Map();

  for (const group of text.split('<group>').slice(1)) {
    const head = group.split('<region>')[0];
    const read = (key) => {
      const match = head.match(new RegExp(`\\b${key}=([\\w.-]+)`));
      return match ? Number(match[1]) : null;
    };

    const lovel = read('lovel') ?? 1;
    const hivel = read('hivel') ?? 127;
    if (!wantsVelocity(lovel, hivel)) continue;

    const key = read('pitch_keycenter');
    if (!key || key < RANGE.lo - 6 || key > RANGE.hi) continue;

    // The first round robin is enough; the app has no use for variation here.
    const sample = group.match(/sample=(\S+)/)?.[1];
    if (sample && !byKey.has(key)) byKey.set(key, sample.replace(/\\/g, '/'));
  }

  return byKey;
}

/** Minimal RIFF/PCM reader — 16 or 24 bit, any channel count, returns mono. */
function decodeWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('kein RIFF');

  let offset = 12;
  let format = null;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ') {
      format = {
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buffer.subarray(body, body + size);
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (!format || !data) throw new Error('fmt oder data fehlt');

  const bytes = format.bits / 8;
  const frames = Math.floor(data.length / (bytes * format.channels));
  const mono = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < format.channels; c++) {
      const at = (i * format.channels + c) * bytes;
      // 24-bit has no readInt24, so build it from the three bytes and sign-extend.
      const value =
        bytes === 3
          ? ((data[at] | (data[at + 1] << 8) | (data[at + 2] << 16)) << 8) >> 8
          : data.readInt16LE(at);
      sum += value / (bytes === 3 ? 8388608 : 32768);
    }
    mono[i] = sum / format.channels;
  }

  return { samples: mono, sampleRate: format.sampleRate };
}

/** Trims to length, fades the cut end out, and normalises to just under full scale. */
function shape(samples, sampleRate) {
  const wanted = Math.min(samples.length, Math.round(SECONDS * sampleRate));
  const out = samples.slice(0, wanted);

  // Without this the note would be chopped off mid-swing and click.
  const fade = Math.min(Math.round(0.08 * sampleRate), out.length);
  for (let i = 0; i < fade; i++) {
    out[out.length - fade + i] *= 1 - i / fade;
  }

  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) {
    const gain = 0.97 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= gain;
  }

  return out;
}

function encodeMp3(samples, sampleRate) {
  const encoder = new lame.Mp3Encoder(1, sampleRate, BITRATE);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  }

  const chunks = [];
  const block = 1152;
  for (let i = 0; i < pcm.length; i += block) {
    const part = encoder.encodeBuffer(pcm.subarray(i, i + block));
    if (part.length > 0) chunks.push(Buffer.from(part));
  }
  const rest = encoder.flush();
  if (rest.length > 0) chunks.push(Buffer.from(rest));

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------

for (const voice of VOICES) {
  const missing = voice.fromZip ? ZIP : voice.program;
  if (!existsSync(missing)) {
    console.error(`${missing} fehlt. Bibliothek zuerst herunterladen und entpacken.`);
    process.exit(1);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const manifest = {};
let totalBytes = 0;

for (const voice of VOICES) {
  // Entry names are relative to the archive root; -d says where to put them.
  const extract = (...entries) => execFileSync('unzip', ['-o', '-q', ZIP, ...entries, '-d', '.samples-src']);

  if (voice.fromZip && !existsSync(voice.program)) {
    extract(voice.program.split(/[/\\]/).slice(1).join('/'));
  }

  const byKey = parseProgram(voice.program, voice.velocity);
  const all = [...byKey.keys()].sort((a, b) => a - b);

  const inRange = all.filter((key) => key >= RANGE.lo); // below the guitar's low E
  const highest = inRange[inRange.length - 1];

  let sparse = 0;
  const keys = inRange.filter((key, i) => {
    // The top of the library always stays. Dropping it would leave the highest frets
    // stretching six semitones off the nearest recording, which is a different
    // instrument rather than the same one played higher.
    if (key === highest) return true;
    // A neighbour a semitone away is covered by the one before it at no real cost.
    if (i > 0 && key - inRange[i - 1] <= 1) return false;
    if (key <= DENSE_BELOW) return true;
    return sparse++ % 2 === 0;
  });

  // Pull only the wavs actually needed out of the 352 MB archive.
  if (voice.fromZip) extract(...keys.map((key) => `Shinyguitar/Samples/${byKey.get(key)}`));

  const notes = [];
  for (const key of keys) {
    const source = join(voice.root, byKey.get(key));
    const { samples, sampleRate } = decodeWav(readFileSync(source));
    const mp3 = encodeMp3(shape(samples, sampleRate), sampleRate);

    const name = `${voice.id}-${key}.mp3`;
    writeFileSync(join(OUT, name), mp3);
    totalBytes += mp3.length;
    notes.push({ midi: key, file: name, bytes: mp3.length });

    console.log(`  MIDI ${String(key).padStart(2)}  ${basename(source).padEnd(24)} ${(mp3.length / 1024).toFixed(1)} KB`);
  }

  manifest[voice.id] = notes.map(({ midi, file }) => ({ midi, file }));
  console.log(`${voice.id}: ${notes.length} Töne, ${(notes.reduce((s, n) => s + n.bytes, 0) / 1024).toFixed(0)} KB\n`);
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Gesamt: ${(totalBytes / 1024).toFixed(0)} KB`);
