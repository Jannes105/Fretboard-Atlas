import { describe, expect, it } from 'vitest';
import { spectrum } from '../test/spectrum';
import { MAX_BPM, MIN_BPM } from '../urlState';
import {
  DELAY_DAMPING,
  DELAY_FEEDBACK,
  DELAY_IDS,
  delaySeconds,
  MAX_DELAY_SECONDS,
  renderDelay,
} from './delay';

const SAMPLE_RATE = 48000;

function rms(signal: Float64Array): number {
  let sum = 0;
  for (const value of signal) sum += value * value;
  return Math.sqrt(sum / signal.length);
}

function peak(signal: Float64Array): number {
  let most = 0;
  for (const value of signal) most = Math.max(most, Math.abs(value));
  return most;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** Where the energy of a frame sits, in Hz — one number for "how bright". */
function centroid(frame: Float64Array): number {
  const bins = spectrum(frame);
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < bins.length; k++) {
    weighted += ((k * SAMPLE_RATE) / frame.length) * bins[k];
    total += bins[k];
  }
  return weighted / total;
}

/** A short burst at the front of an otherwise silent buffer. */
function burst(seconds: number, make: (n: number) => number, length: number): Float64Array {
  const out = new Float64Array(length);
  const samples = Math.round(seconds * SAMPLE_RATE);
  for (let n = 0; n < samples; n++) out[n] = make(n);
  return out;
}

describe('delaySeconds', () => {
  it('is the two divisions the pedal book defines', () => {
    // docs/effektpedale.md §6: Viertel = 60000/BPM ms, punktierte Achtel = 45000/BPM ms.
    expect(delaySeconds(120, 'quarter')).toBeCloseTo(0.5, 12);
    expect(delaySeconds(120, 'dotted8')).toBeCloseTo(0.375, 12);
  });

  it('keeps a dotted eighth three quarters of a beat, at every tempo', () => {
    // Not a coincidence of the two constants: a dotted eighth IS three sixteenths.
    // Written as a relationship so a typo in either number cannot survive.
    for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm++) {
      expect(delaySeconds(bpm, 'dotted8')).toBeCloseTo(0.75 * delaySeconds(bpm, 'quarter'), 12);
    }
  });

  it('never asks for a longer line than the node has', () => {
    /*
     * The one assertion standing between a future lower MIN_BPM and an echo that
     * silently stops following the music: DelayNode CLAMPS delayTime to
     * maxDelayTime without complaining, so the failure would be a delay that is
     * simply in the wrong place and no error anywhere.
     */
    expect(delaySeconds(MIN_BPM, 'quarter')).toBeLessThanOrEqual(MAX_DELAY_SECONDS);
  });

  it('offers off as a setting rather than as an absence', () => {
    expect(DELAY_IDS).toContain('off');
    expect(DELAY_IDS).toHaveLength(3);
  });
});

describe('renderDelay', () => {
  const TIME = 0.25;
  const taps = Math.round(TIME * SAMPLE_RATE);

  it('puts each repeat exactly one delay time later', () => {
    const input = new Float64Array(SAMPLE_RATE);
    input[0] = 1;
    const out = renderDelay(input, SAMPLE_RATE, TIME);

    const loudestNear = (centre: number) => {
      let best = centre;
      for (let n = centre - 40; n <= centre + 40; n++) {
        if (Math.abs(out[n]) > Math.abs(out[best])) best = n;
      }
      return best;
    };

    // The lowpass smears the impulse a little, so the peak is looked for in a
    // window rather than demanded on one sample — but the window is under a
    // millisecond wide, which is far tighter than a musician could hear.
    expect(Math.abs(loudestNear(taps) - taps)).toBeLessThan(40);
    expect(Math.abs(loudestNear(2 * taps) - 2 * taps)).toBeLessThan(40);
  });

  it('makes every repeat quieter by the feedback amount', () => {
    // A sine well below the damping corner, so the lowpass takes nothing and the
    // fall is the feedback alone.
    const input = burst(0.05, (n) => Math.sin((2 * Math.PI * 220 * n) / SAMPLE_RATE), SAMPLE_RATE);
    const out = renderDelay(input, SAMPLE_RATE, TIME);

    const echo = (index: number) => peak(out.subarray(index * taps, index * taps + taps));
    expect(echo(2) / echo(1)).toBeCloseTo(DELAY_FEEDBACK, 1);
    expect(echo(3) / echo(2)).toBeCloseTo(DELAY_FEEDBACK, 1);
  });

  it('makes every repeat darker, which is the analog part of it', () => {
    /*
     * docs/effektpedale.md §6 distinguishes a digital delay from an analog BBD by
     * exactly this: "jede Wiederholung dunkler und schmutziger". Without it the
     * block is a digital delay wearing an analog delay's name — and this is also
     * the assertion that fails if the lowpass ends up outside the loop, where it
     * would darken every repeat by the same amount instead of compounding.
     */
    const noise = seeded(4242);
    const input = burst(0.1, () => noise() * 2 - 1, SAMPLE_RATE);
    const out = renderDelay(input, SAMPLE_RATE, TIME);

    const frame = (index: number) => Float64Array.from(out.subarray(index * taps, index * taps + 4096));
    expect(centroid(frame(2))).toBeLessThan(centroid(frame(1)) * 0.8);
  });

  it('dies away instead of building up', () => {
    // Feedback above about 0.95 runs away (§6). This is the standing proof that
    // the number in the table is on the right side of that line.
    expect(DELAY_FEEDBACK).toBeLessThan(0.95);

    const noise = seeded(99);
    const input = burst(0.1, () => noise() * 2 - 1, 4 * SAMPLE_RATE);
    const out = renderDelay(input, SAMPLE_RATE, TIME);

    let previous = Infinity;
    for (let second = 0; second < 4; second++) {
      const level = rms(out.subarray(second * SAMPLE_RATE, (second + 1) * SAMPLE_RATE));
      expect(level).toBeLessThan(previous);
      previous = level;
    }
    expect(previous).toBeLessThan(rms(input) * 1e-3);
  });

  it('is silent for silence', () => {
    // A feedback loop that hums on its own is the classic way to get this wrong.
    const out = renderDelay(new Float64Array(SAMPLE_RATE), SAMPLE_RATE, TIME);
    expect(peak(out)).toBe(0);
  });

  it('damps at a corner the guitar actually reaches', () => {
    // A lowpass above the signal's own content would be inaudible; one below the
    // fundamentals would swallow the repeat instead of darkening it. The open
    // strings run 82-330 Hz and their harmonics to a few kHz.
    expect(DELAY_DAMPING.frequency).toBeGreaterThan(1000);
    expect(DELAY_DAMPING.frequency).toBeLessThan(6000);
  });
});
