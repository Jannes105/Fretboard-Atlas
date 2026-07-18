import { describe, expect, it } from 'vitest';
import { pluck, type PluckOptions } from './pluck';

const SAMPLE_RATE = 48000;

/**
 * A seeded generator, so every run renders the same string. Without it these tests
 * would measure a different pluck each time and could only ever assert loose bounds.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — plenty for noise, and reproducible.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

const STEEL: PluckOptions = {
  damping: 0.25,
  pickPosition: 0.2,
  pickNoise: 0.06,
  sustainSeconds: 3.5,
  random: seeded(12345),
};

const options = (overrides: Partial<PluckOptions> = {}): PluckOptions => ({
  ...STEEL,
  random: seeded(12345),
  ...overrides,
});

/** A slice of the signal, in seconds. */
function window(signal: Float32Array, from: number, length: number): Float32Array {
  const start = Math.round(from * SAMPLE_RATE);
  return signal.subarray(start, start + Math.round(length * SAMPLE_RATE));
}

function energy(signal: Float32Array): number {
  let sum = 0;
  for (const sample of signal) sum += sample * sample;
  return sum;
}

/** Magnitude spectrum of a power-of-two frame — iterative radix-2, just for measuring. */
function spectrum(frame: Float64Array): Float64Array {
  const n = frame.length;
  const re = Float64Array.from(frame);
  const im = new Float64Array(n);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const step = (-2 * Math.PI) / length;
    for (let i = 0; i < n; i += length) {
      for (let k = 0; k < length / 2; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + length / 2] * wr - im[i + k + length / 2] * wi;
        const vi = re[i + k + length / 2] * wi + im[i + k + length / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + length / 2] = ur - vr;
        im[i + k + length / 2] = ui - vi;
      }
    }
  }

  const magnitude = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) magnitude[k] = Math.hypot(re[k], im[k]);
  return magnitude;
}

/** One Hann-windowed frame of the signal, starting at `from` seconds. */
function frameAt(signal: Float32Array, from: number, size: number): Float64Array {
  const start = Math.round(from * SAMPLE_RATE);
  const frame = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    frame[i] = (signal[start + i] ?? 0) * hann;
  }
  return frame;
}

/**
 * Spectral centroid in Hz — where the sound's energy sits on average, and the
 * closest single number to how bright something sounds.
 */
function centroid(signal: Float32Array, from: number): number {
  const magnitude = spectrum(frameAt(signal, from, 8192));
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < magnitude.length; k++) {
    weighted += ((k * SAMPLE_RATE) / 8192) * magnitude[k];
    total += magnitude[k];
  }
  return total === 0 ? 0 : weighted / total;
}

/** Level of each harmonic relative to the fundamental, in dB, shortly after the pluck. */
function harmonics(signal: Float32Array, fundamental: number, count: number): number[] {
  const size = 8192;
  const magnitude = spectrum(frameAt(signal, 0.02, size));

  // Take the tallest bin around each harmonic — the frame will not land exactly on it.
  const at = (hz: number) => {
    const bin = Math.round((hz * size) / SAMPLE_RATE);
    let loudest = 0;
    for (let k = bin - 3; k <= bin + 3; k++) loudest = Math.max(loudest, magnitude[k] ?? 0);
    return loudest;
  };

  const first = at(fundamental);
  return Array.from({ length: count }, (_, i) => 20 * Math.log10(at(fundamental * (i + 1)) / first));
}

/** Least-squares slope of the harmonic levels against octaves — dB per octave. */
function rolloffPerOctave(levels: readonly number[]): number {
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  let count = 0;
  levels.forEach((level, i) => {
    if (!Number.isFinite(level)) return;
    const x = Math.log2(i + 1);
    sx += x;
    sy += level;
    sxy += x * level;
    sxx += x * x;
    count++;
  });
  return (count * sxy - sx * sy) / (count * sxx - sx * sx);
}

/**
 * Estimates the fundamental from the spectrum, refining the peak with a parabola
 * through the log magnitudes of its neighbours.
 *
 * Autocorrelation was the obvious choice and is the wrong one here: on a note this
 * dominated by its fundamental the correlation peak is nearly a sinusoid, and fitting
 * a parabola to that is biased by over a cent — enough to accuse a correct delay line
 * of being out of tune.
 */
function estimateFrequency(signal: Float32Array, expected: number): number {
  const size = 16384;
  const magnitude = spectrum(frameAt(signal, 0.05, size));
  const binWidth = SAMPLE_RATE / size;

  const centre = Math.round(expected / binWidth);
  let peak = centre;
  for (let k = Math.max(1, centre - 4); k <= centre + 4; k++) {
    if (magnitude[k] > magnitude[peak]) peak = k;
  }

  const log = (k: number) => Math.log(Math.max(magnitude[k], 1e-30));
  const before = log(peak - 1);
  const here = log(peak);
  const after = log(peak + 1);
  const denominator = before - 2 * here + after;
  const shift = denominator === 0 ? 0 : (0.5 * (before - after)) / denominator;

  return (peak + shift) * binWidth;
}

const cents = (measured: number, expected: number) => 1200 * Math.log2(measured / expected);

describe('pluck', () => {
  it('sounds the pitch it was asked for, across the guitar range', () => {
    // Low E through the 12th fret of the high E — the whole neck.
    for (const frequency of [82.41, 110, 164.81, 246.94, 329.63, 659.26, 987.77]) {
      const signal = pluck(frequency, SAMPLE_RATE, 0.5, options());
      const measured = estimateFrequency(signal, frequency);

      // A whole-sample delay line would land tens of cents off up here, so a
      // threshold of one cent is one that actually bites.
      expect(Math.abs(cents(measured, frequency)), `${frequency} Hz`).toBeLessThan(1);
    }
  });

  // The tests that were missing. Everything below them passed while the string
  // sounded buzzy and koto-like, because "gets darker over time" says nothing about
  // whether the note had a sensible shape to begin with. Filling the loop with noise
  // excites every harmonic equally: measured, the 3rd partial sat 8.7 dB ABOVE the
  // fundamental and nothing rolled off at all out to the 20th.
  describe('has the shape of a string, not a noise burst', () => {
    it('carries the fundamental as its strongest partial', () => {
      for (const frequency of [82.41, 196, 440]) {
        const levels = harmonics(pluck(frequency, SAMPLE_RATE, 1, options()), frequency, 16);
        const loudestHarmonic = Math.max(...levels.slice(1));

        expect(loudestHarmonic, `${frequency} Hz: lautester Oberton in dB`).toBeLessThan(0);
      }
    });

    it('rolls off like a plucked string', () => {
      for (const frequency of [82.41, 196, 440]) {
        const levels = harmonics(pluck(frequency, SAMPLE_RATE, 1, options()), frequency, 16);
        const slope = rolloffPerOctave(levels);

        // A real guitar falls somewhere around -6 to -12 dB per octave. Noise
        // excitation measured essentially flat, which is what this guards against.
        expect(slope, `${frequency} Hz: dB/Oktave`).toBeLessThan(-6);
        expect(slope, `${frequency} Hz: dB/Oktave`).toBeGreaterThan(-16);
      }
    });
  });

  it('rounds off as it rings — the highs die before the fundamental', () => {
    // The other half of sounding like a string. An oscillator with a volume envelope
    // holds its brightness to the last sample; a string loses it.
    const signal = pluck(196, SAMPLE_RATE, 2, options());

    expect(centroid(signal, 1)).toBeLessThan(centroid(signal, 0.02) * 0.6);
  });

  it('gets darker and shorter the more it is damped', () => {
    const bright = pluck(196, SAMPLE_RATE, 2, options({ damping: 0.1 }));
    const muted = pluck(196, SAMPLE_RATE, 2, options({ damping: 0.9 }));

    expect(centroid(muted, 0.5)).toBeLessThan(centroid(bright, 0.5));
    expect(energy(window(muted, 0.5, 0.1))).toBeLessThan(energy(window(bright, 0.5, 0.1)));
  });

  it('moves the pick along the string', () => {
    // Picking near the bridge leaves the low partials little to push against, so what
    // is left is thin and bright; over the sound hole it is round.
    const bridge = pluck(196, SAMPLE_RATE, 0.5, options({ pickPosition: 0.06 }));
    const soundHole = pluck(196, SAMPLE_RATE, 0.5, options({ pickPosition: 0.45 }));

    expect(centroid(soundHole, 0.02)).toBeLessThan(centroid(bridge, 0.02));
  });

  it('holds a longer sustain longer', () => {
    const short = pluck(196, SAMPLE_RATE, 3, options({ sustainSeconds: 0.5 }));
    const long = pluck(196, SAMPLE_RATE, 3, options({ sustainSeconds: 6 }));

    expect(energy(window(long, 2, 0.2))).toBeGreaterThan(energy(window(short, 2, 0.2)) * 10);
  });

  it('fades away rather than droning', () => {
    const signal = pluck(196, SAMPLE_RATE, 3, options());

    // Every tenth of a second is quieter than the one before — no DC offset stuck in
    // the loop, no build-up.
    let previous = Infinity;
    for (let at = 0; at < 2.8; at += 0.1) {
      const current = energy(window(signal, at, 0.1));
      expect(current, `bei ${at.toFixed(1)}s`).toBeLessThan(previous);
      previous = current;
    }
  });

  it('stays inside the rails', () => {
    for (const frequency of [82.41, 440, 1318.51]) {
      const signal = pluck(frequency, SAMPLE_RATE, 1, options());

      // Scanned in plain code and asserted once — an expect() per sample would be
      // 48000 assertions per pitch, and slower than rendering the note.
      let loudest = 0;
      let finite = true;
      for (const sample of signal) {
        if (!Number.isFinite(sample)) finite = false;
        else loudest = Math.max(loudest, Math.abs(sample));
      }

      expect(finite, `${frequency} Hz`).toBe(true);
      expect(loudest, `${frequency} Hz`).toBeLessThanOrEqual(1);
    }
  });

  it('returns silence rather than throwing on nonsense', () => {
    expect(pluck(0, SAMPLE_RATE, 1, options())).toHaveLength(SAMPLE_RATE);
    expect(energy(pluck(0, SAMPLE_RATE, 1, options()))).toBe(0);
    expect(pluck(440, SAMPLE_RATE, 0, options())).toHaveLength(0);
    // Above the Nyquist limit there is no string left to model.
    expect(energy(pluck(30000, SAMPLE_RATE, 0.5, options()))).toBe(0);
  });
});
