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
  pick: 0.2,
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

/**
 * How much of the signal's energy sits up high, without pulling in an FFT.
 *
 * Differencing a signal is a highpass, so the energy of the difference relative to
 * the energy of the signal rises with brightness. It is not a spectrum, but it is a
 * faithful ordering — which is all these tests need.
 */
function brightness(signal: Float32Array): number {
  let difference = 0;
  for (let i = 1; i < signal.length; i++) {
    const delta = signal[i] - signal[i - 1];
    difference += delta * delta;
  }
  return difference / (energy(signal) || 1);
}

/**
 * Estimates the fundamental by autocorrelation, refining the peak with a parabola
 * through its neighbours — whole-sample resolution alone would be ±24 cents up high,
 * far too coarse to catch a fractional-delay mistake.
 */
function estimateFrequency(signal: Float32Array, expected: number): number {
  const period = SAMPLE_RATE / expected;
  const lowest = Math.max(2, Math.floor(period * 0.7));
  const highest = Math.min(Math.floor(signal.length / 2), Math.ceil(period * 1.4));

  const correlate = (lag: number) => {
    let sum = 0;
    for (let i = 0; i + lag < signal.length; i++) sum += signal[i] * signal[i + lag];
    return sum;
  };

  let best = lowest;
  let bestValue = -Infinity;
  for (let lag = lowest; lag <= highest; lag++) {
    const value = correlate(lag);
    if (value > bestValue) {
      bestValue = value;
      best = lag;
    }
  }

  const before = correlate(best - 1);
  const after = correlate(best + 1);
  const denominator = before - 2 * bestValue + after;
  const shift = denominator === 0 ? 0 : (0.5 * (before - after)) / denominator;

  return SAMPLE_RATE / (best + shift);
}

const cents = (measured: number, expected: number) => 1200 * Math.log2(measured / expected);

describe('pluck', () => {
  it('sounds the pitch it was asked for, across the guitar range', () => {
    // Low E through the 12th fret of the high E — the whole neck.
    for (const frequency of [82.41, 110, 164.81, 246.94, 329.63, 659.26, 987.77]) {
      const signal = pluck(frequency, SAMPLE_RATE, 0.3, options());
      // Skip the pick itself; the string only settles once the noise has circulated.
      const measured = estimateFrequency(window(signal, 0.05, 0.2), frequency);

      // A whole-sample delay line would land tens of cents off up here; the measured
      // error is under a quarter of a cent, so one cent is a threshold that bites.
      expect(Math.abs(cents(measured, frequency)), `${frequency} Hz`).toBeLessThan(1);
    }
  });

  it('rounds off as it rings — the highs die before the fundamental', () => {
    // The reason this file exists. An oscillator with a volume envelope holds its
    // brightness to the last sample; a string loses it.
    const signal = pluck(196, SAMPLE_RATE, 2, options());

    const early = brightness(window(signal, 0.02, 0.1));
    const late = brightness(window(signal, 1, 0.1));

    expect(late).toBeLessThan(early * 0.5);
  });

  it('gets darker and shorter the more it is damped', () => {
    const bright = pluck(196, SAMPLE_RATE, 2, options({ damping: 0.1 }));
    const muted = pluck(196, SAMPLE_RATE, 2, options({ damping: 0.9 }));

    const later = (signal: Float32Array) => window(signal, 0.5, 0.1);

    expect(brightness(later(muted))).toBeLessThan(brightness(later(bright)));
    expect(energy(later(muted))).toBeLessThan(energy(later(bright)));
  });

  it('takes the pick from hard to soft', () => {
    const plectrum = pluck(196, SAMPLE_RATE, 0.5, options({ pick: 0 }));
    const thumb = pluck(196, SAMPLE_RATE, 0.5, options({ pick: 1 }));

    expect(brightness(window(thumb, 0, 0.02))).toBeLessThan(
      brightness(window(plectrum, 0, 0.02)),
    );
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
