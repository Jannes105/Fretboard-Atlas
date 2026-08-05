import { describe, expect, it } from 'vitest';
import { spectrum } from '../test/spectrum';
import {
  CHANNEL_SEEDS,
  DEFAULT_REVERB,
  impulseResponse,
  REVERB_IDS,
  REVERBS,
  type RoomSpec,
  seeded,
} from './reverb';

const SAMPLE_RATE = 48000;

const dB = (ratio: number) => 20 * Math.log10(ratio);

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

/**
 * How much of a frame's energy sits above 4 kHz — one number for "how bright".
 *
 * A band ratio and not a spectral centroid. Centroid is weighted by frequency, so
 * with a gentle rolloff the top octave dominates it and it barely moves however
 * dark the tail actually gets. This measures the thing the damping is for.
 */
function brightness(frame: Float64Array): number {
  const bins = spectrum(frame);
  let high = 0;
  let total = 0;
  for (let k = 1; k < bins.length; k++) {
    const energy = bins[k] * bins[k];
    if ((k * SAMPLE_RATE) / frame.length >= 4000) high += energy;
    total += energy;
  }
  return high / total;
}

const build = (room: RoomSpec, seed: number = CHANNEL_SEEDS[0]) =>
  impulseResponse(room, SAMPLE_RATE, seeded(seed));

const ROOM_LIST = Object.entries(REVERBS) as readonly (readonly [string, RoomSpec])[];

describe('the rooms as a table', () => {
  it('stays inside the length the feature note allows', () => {
    // docs/feature-ideen.md C3 asks for 0.8-2 s, and there is a reason to respect
    // the top of it beyond obedience: a ConvolverNode's cost is the length of its
    // buffer, and this app has to keep a looping progression going on a phone.
    for (const [, room] of ROOM_LIST) {
      expect(room.rt60).toBeGreaterThanOrEqual(0.8);
      expect(room.rt60).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the pre-delay inside what a room can be', () => {
    // docs/effektpedale.md §6: 0-100 ms. Longer stops being a wall and becomes a
    // slapback echo, which is the other feature.
    for (const [, room] of ROOM_LIST) {
      expect(room.predelay).toBeGreaterThan(0);
      expect(room.predelay).toBeLessThanOrEqual(0.1);
    }
  });

  it('gives the bigger room the longer tail and the darker one', () => {
    // The one relationship that makes the two settings two ROOMS rather than two
    // amounts of the same room: a hall is longer AND loses its highs sooner.
    expect(REVERBS.hall.rt60).toBeGreaterThan(REVERBS.room.rt60);
    expect(REVERBS.hall.damping[1]).toBeLessThan(REVERBS.room.damping[1]);
    expect(REVERBS.hall.predelay).toBeGreaterThan(REVERBS.room.predelay);
  });

  it('offers off as a setting, and starts there', () => {
    expect(DEFAULT_REVERB).toBe('off');
    expect(REVERB_IDS).toContain('off');
  });
});

describe('impulseResponse', () => {
  it('starts with exactly the pre-delay in silence', () => {
    for (const [, room] of ROOM_LIST) {
      const ir = build(room);
      const pre = Math.round(room.predelay * SAMPLE_RATE);
      for (let n = 0; n < pre; n++) expect(ir[n]).toBe(0);
      expect(ir[pre]).not.toBe(0);
    }
  });

  it('is 60 dB down after exactly its RT60', () => {
    /*
     * What makes the number in the table a promise rather than a label.
     *
     * A decibel either way, for two reasons that both belong here. The 20 ms
     * windows are noise, so their own RMS spreads by about 0.2 dB; and the
     * damping's corner MOVES, so the variance the generator divides out is only
     * exactly right for a corner that is standing still. Measured, the pair of
     * them costs about 0.6 dB over a whole decay. Tighten this and the test starts
     * measuring the compensation rather than the envelope.
     */
    const window = Math.round(0.02 * SAMPLE_RATE);
    for (const [, room] of ROOM_LIST) {
      const ir = build(room);
      const pre = Math.round(room.predelay * SAMPLE_RATE);
      const at = (seconds: number) => {
        const start = pre + Math.round(seconds * SAMPLE_RATE);
        return rms(ir.subarray(start, start + window));
      };
      expect(dB(at(room.rt60) / at(0))).toBeGreaterThan(-61);
      expect(dB(at(room.rt60) / at(0))).toBeLessThan(-59);
    }
  });

  it('carries exactly unit energy', () => {
    /*
     * The pairing that makes the send gain mean the wet level: this, plus
     * `convolver.normalize = false` in audio.ts. Without both, switching Raum for
     * Halle would change the volume rather than the room — the convolver would
     * apply its own scaling, and a 1.8 s tail carries twice the energy of a 0.9 s
     * one. It is the same discipline AMP.makeup enforces for the amplifier.
     */
    for (const [, room] of ROOM_LIST) {
      const ir = build(room);
      let energy = 0;
      for (const value of ir) energy += value * value;
      expect(energy).toBeCloseTo(1, 9);
    }
  });

  it('loses its highs long before it runs out of energy', () => {
    /*
     * Without the sliding corner a generated impulse response is a burst of white
     * noise, not a room: real walls absorb treble far faster than bass, and it is
     * that difference the ear reads as a space rather than as hiss.
     *
     * Measured, the share of energy above 4 kHz goes from 51 % at the start of the
     * tail to 27 % at half the decay — so the bound below has about a tenth of
     * room in it, and tightening it further would be pinning noise.
     */
    for (const [, room] of ROOM_LIST) {
      const ir = build(room);
      const pre = Math.round(room.predelay * SAMPLE_RATE);
      const frame = (seconds: number) => {
        const start = pre + Math.round(seconds * SAMPLE_RATE);
        return Float64Array.from(ir.subarray(start, start + 4096));
      };
      expect(brightness(frame(room.rt60 / 2))).toBeLessThan(brightness(frame(0)) * 0.6);
    }
  });

  it('has no DC in it', () => {
    // A step in an impulse response is a thump on every single note — the same
    // failure AMP.block exists to prevent, arriving by a different door.
    for (const [, room] of ROOM_LIST) {
      const ir = build(room);
      let sum = 0;
      for (const value of ir) sum += value;
      expect(Math.abs(sum / ir.length)).toBeLessThan(rms(ir) * 1e-2);
    }
  });

  it('is noise and not a resonance', () => {
    /*
     * The way a generated impulse response goes wrong audibly is that it rings —
     * the "boing" of a bad spring reverb — and a ring is one bin standing far
     * above its neighbours. Every note played would then be pulled toward that
     * one pitch, which in a fretboard trainer is worse than having no reverb.
     */
    const ir = build(REVERBS.hall);
    const bins = spectrum(Float64Array.from(ir.subarray(0, 16384)));
    let total = 0;
    for (let k = 1; k < bins.length; k++) total += bins[k];
    const mean = total / (bins.length - 1);
    let loudest = 0;
    for (let k = 1; k < bins.length; k++) loudest = Math.max(loudest, bins[k]);
    expect(dB(loudest / mean)).toBeLessThan(20);
  });

  it('ends rather than being cut off', () => {
    // A truncated tail is a step, and a step in an impulse response is a click on
    // every note. TAIL_MARGIN is what buys the room to fade out properly.
    for (const [, room] of ROOM_LIST) {
      const ir = build(room);
      expect(dB(peak(ir.subarray(ir.length - 100)) / peak(ir))).toBeLessThan(-70);
    }
  });

  it('is the same room every session, and two rooms across the two ears', () => {
    // Seeded so the tests can assert exact numbers and so the app does not sound
    // subtly different on every reload...
    expect(Array.from(build(REVERBS.room))).toEqual(Array.from(build(REVERBS.room)));

    // ...and decorrelated across the channels, which is the entire width of it.
    // The same noise twice is a reverb in the middle of your head.
    const left = build(REVERBS.room, CHANNEL_SEEDS[0]);
    const right = build(REVERBS.room, CHANNEL_SEEDS[1]);
    let dot = 0;
    for (let i = 0; i < left.length; i++) dot += left[i] * right[i];
    expect(Math.abs(dot)).toBeLessThan(0.05);
  });
});
