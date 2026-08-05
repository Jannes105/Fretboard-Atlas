import { describe, expect, it } from 'vitest';
import { AMP, biquad, renderAmp, webAudioQ } from './amp';
import {
  NEUTRAL_TONE,
  renderToneStack,
  stackStages,
  TONE_MAX_DB,
  TONE_STACK,
  type ToneGains,
} from './toneStack';

const SAMPLE_RATE = 48000;

const dB = (ratio: number) => 20 * Math.log10(ratio);

function rms(signal: Float64Array): number {
  let sum = 0;
  for (const value of signal) sum += value * value;
  return Math.sqrt(sum / signal.length);
}

function sine(frequency: number, length = SAMPLE_RATE): Float64Array {
  return Float64Array.from({ length }, (_, n) =>
    Math.sin((2 * Math.PI * frequency * n) / SAMPLE_RATE),
  );
}

/**
 * What the stack does to one frequency, in dB. Settled first, then measured.
 *
 * By RMS and not by peak, which is not fussiness: at 8 kHz a sine has six samples
 * per cycle, so the largest SAMPLE can sit up to 1.2 dB below the largest value —
 * enough on its own to fail an assertion about a 6 dB shelf.
 */
function gainAt(frequency: number, gains: ToneGains): number {
  const input = sine(frequency);
  const out = renderToneStack(input, SAMPLE_RATE, gains);
  const settled = SAMPLE_RATE / 2;
  return dB(rms(out.subarray(settled)) / rms(input.subarray(settled)));
}

const FLAT = NEUTRAL_TONE;
const BASS_UP: ToneGains = { bass: TONE_MAX_DB, mid: 0, treble: 0 };
const MID_UP: ToneGains = { bass: 0, mid: TONE_MAX_DB, treble: 0 };
const TREBLE_UP: ToneGains = { bass: 0, mid: 0, treble: TONE_MAX_DB };

describe('renderToneStack', () => {
  it('is a wire when every control is at zero', () => {
    /*
     * The single most load-bearing assertion in this file. With A = 1 an RBJ
     * numerator is its own denominator, so all three filters are exactly unity —
     * and because they are, the four MEASURED makeup values in AMPS did not have
     * to move when this feature landed. If this test ever fails, those four
     * numbers are stale and scripts/measure-makeup.html has to be re-run.
     */
    const input = Float64Array.from({ length: 4096 }, (_, n) => Math.sin(n * 0.03) * 0.4);
    const out = renderToneStack(input, SAMPLE_RATE, FLAT);
    for (let i = 0; i < input.length; i++) {
      expect(out[i]).toBeCloseTo(input[i], 12);
    }
  });

  it('gives each control the band it is named after', () => {
    // Bass at the top: the low end moves, and a note in the middle does not.
    expect(gainAt(80, BASS_UP)).toBeGreaterThan(5.5);
    expect(Math.abs(gainAt(2000, BASS_UP))).toBeLessThan(0.5);

    // Treble at the top: the same, from the other end.
    expect(gainAt(8000, TREBLE_UP)).toBeGreaterThan(5.5);
    expect(Math.abs(gainAt(200, TREBLE_UP))).toBeLessThan(0.5);

    // The mid control is a peak, so it hits its number exactly on the corner.
    expect(gainAt(TONE_STACK.mid.frequency, MID_UP)).toBeCloseTo(TONE_MAX_DB, 1);
  });

  it('cuts by exactly as much as it boosts', () => {
    // An RBJ property, and the quickest way to catch a wrong highshelf branch:
    // the +g and -g responses are reciprocal at the corner, to a hundredth of a dB.
    for (const [key, corner] of [
      ['bass', TONE_STACK.bass.frequency],
      ['mid', TONE_STACK.mid.frequency],
      ['treble', TONE_STACK.treble.frequency],
    ] as const) {
      const up = gainAt(corner, { ...FLAT, [key]: TONE_MAX_DB });
      const down = gainAt(corner, { ...FLAT, [key]: -TONE_MAX_DB });
      expect(up + down).toBeCloseTo(0, 2);
    }
  });

  it('keeps the controls apart enough that each one still means something', () => {
    /*
     * docs/verstaerker.md §2 says the real FMV network's controls are NOT
     * orthogonal — every one changes what the others do, because they share a
     * node. Three separate biquads are orthogonal, which is the simplification
     * this file makes; what this pins down is the other side of it, that the
     * simplification does not leak. Bass at full does not smear into the mids.
     */
    expect(Math.abs(gainAt(TONE_STACK.mid.frequency, BASS_UP))).toBeLessThan(1.5);
    expect(Math.abs(gainAt(TONE_STACK.mid.frequency, TREBLE_UP))).toBeLessThan(1.5);
  });

  it('does not hand the amplifier its fizz back', () => {
    /*
     * The cabinet exists to stop everything above 5 kHz, and amp.test.ts holds it
     * to under 0.1 % of the band. The treble control sits after the cabinet, so
     * asking it for +6 dB is asking for four times the power in exactly the range
     * the speaker was there to remove. It has to stay a tone control and not
     * become an undo button for the cabinet.
     */
    const chord = Float64Array.from({ length: SAMPLE_RATE }, (_, n) => {
      const t = n / SAMPLE_RATE;
      return (
        0.14 * Math.sin(2 * Math.PI * 82.4 * t) +
        0.14 * Math.sin(2 * Math.PI * 123.5 * t) +
        0.14 * Math.sin(2 * Math.PI * 164.8 * t) +
        0.14 * Math.sin(2 * Math.PI * 207.7 * t)
      );
    });
    const out = renderToneStack(renderAmp(chord, SAMPLE_RATE), SAMPLE_RATE, TREBLE_UP);

    const band = (low: number, high: number) => {
      let energy = 0;
      const kept = biquad(
        'lowpass',
        biquad('highpass', out, SAMPLE_RATE, { frequency: low, q: 0.707 }),
        SAMPLE_RATE,
        { frequency: high, q: 0.707 },
      );
      for (const value of kept) energy += value * value;
      return energy;
    };

    expect(band(8000, 20000) / band(80, 8000)).toBeLessThan(0.01);
  });
});

describe('the stack as the graph builds it', () => {
  it('agrees with a hand-chained pair of biquads', () => {
    // renderToneStack is the thing the tests measure; audio.ts chains three nodes
    // in the same order from the same table. This holds the two descriptions of
    // that chain against each other.
    const gains: ToneGains = { bass: 4, mid: -3, treble: 2 };
    const stages = stackStages(gains);
    const input = Float64Array.from({ length: 2048 }, (_, n) => Math.sin(n * 0.11) * 0.3);

    const byHand = biquad(
      'highshelf',
      biquad('peaking', biquad('lowshelf', input, SAMPLE_RATE, stages[0]), SAMPLE_RATE, stages[1]),
      SAMPLE_RATE,
      stages[2],
    );
    const rendered = renderToneStack(input, SAMPLE_RATE, gains);

    for (let i = 0; i < input.length; i++) expect(rendered[i]).toBeCloseTo(byHand[i], 12);
  });

  it('hands the shelves a Q the browser will ignore, unchanged', () => {
    // Both shelf types have their slope fixed at S = 1 by the spec, so there is
    // nothing to convert — but only because webAudioQ knows that. A dB conversion
    // leaking in here would be silent and wrong.
    expect(webAudioQ('highshelf', TONE_STACK.treble.q)).toBe(TONE_STACK.treble.q);
    expect(webAudioQ('lowshelf', TONE_STACK.bass.q)).toBe(TONE_STACK.bass.q);
  });

  it('sits where the amplifier already decided a note keeps its weight', () => {
    // Not a coincidence worth re-deriving later: the bass shelf shares its corner
    // with AMP.body, so the app has one answer to "where is the body of a note".
    expect(TONE_STACK.bass.frequency).toBe(AMP.body.frequency);
  });
});
