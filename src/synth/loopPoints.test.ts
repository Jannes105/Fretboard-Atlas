import { describe, expect, it } from 'vitest';
import { findLoop, renderSustain } from './loopPoints';
import { pluck, type PluckOptions } from './pluck';

const SAMPLE_RATE = 48000;

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

const STRING: Omit<PluckOptions, 'random'> = {
  damping: 0.02,
  pickPosition: 0.1,
  pickNoise: 0.05,
  sustainSeconds: 8,
};

/** A recording, shaped the way scripts/build-samples.mjs shapes one. */
function recorded(frequency: number, seconds = 2): Float32Array {
  const samples = pluck(frequency, SAMPLE_RATE, seconds, { ...STRING, random: seeded(4242) });

  const fade = Math.round(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    samples[samples.length - fade + i] *= 1 - i / fade;
  }

  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  for (let i = 0; i < samples.length; i++) samples[i] *= 0.97 / peak;

  return samples;
}

/** Every pitch the electric set is recorded at. */
const RECORDED_MIDI = [40, 42, 45, 48, 51, 54, 57, 63, 66, 72, 78, 84];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const rms = (samples: Float32Array, from: number, seconds: number) => {
  const first = Math.round(from * SAMPLE_RATE);
  const count = Math.round(seconds * SAMPLE_RATE);
  let sum = 0;
  for (let i = first; i < first + count; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / count);
};

describe('findLoop', () => {
  it('finds a loop for every recorded pitch', () => {
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      expect(findLoop(recorded(frequency), SAMPLE_RATE, frequency)).not.toBeNull();
    }
  });

  it('ends on a stretch that matches the one running into it', () => {
    /*
     * What renderSustain then blends together. Matched over the whole crossfade
     * window and not at a single point: one sample lining up says nothing about
     * the phase around it, and two stretches half a period out of step cancel
     * each other instead of reinforcing.
     */
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      const samples = recorded(frequency);
      const loop = findLoop(samples, SAMPLE_RATE, frequency)!;

      const window = Math.round(0.03 * SAMPLE_RATE);
      const start = Math.round(loop.start * SAMPLE_RATE);
      const end = Math.round(loop.end * SAMPLE_RATE);

      // Levelled first. The end of a loop is quieter than its start simply
      // because the string is decaying, and renderSustain takes that out before
      // it crossfades — what findLoop is responsible for is the phase.
      const trim =
        rms(samples, loop.start - 0.03, 0.03) / rms(samples, loop.end - 0.03, 0.03);

      let mismatch = 0;
      let signal = 0;
      for (let k = 0; k < window; k++) {
        const there = samples[start - window + k];
        const difference = samples[end - window + k] * trim - there;
        mismatch += difference * difference;
        signal += there * there;
      }

      // At least 6 dB down on the signal itself: the two are recognisably the
      // same piece of waveform, not merely both quiet.
      expect(10 * Math.log10(mismatch / signal)).toBeLessThan(-6);
    }
  });

  it('runs a whole number of the string periods', () => {
    // Anything else restarts the wave mid-swing and bends the pitch once a lap.
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      const loop = findLoop(recorded(frequency), SAMPLE_RATE, frequency)!;

      const laps = (loop.end - loop.start) * frequency;
      expect(Math.abs(laps - Math.round(laps))).toBeLessThan(0.5);
    }
  });

  it('stays clear of the fade already on the end of the recording', () => {
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      const samples = recorded(frequency);
      const loop = findLoop(samples, SAMPLE_RATE, frequency)!;

      expect(loop.end).toBeLessThanOrEqual(samples.length / SAMPLE_RATE - 0.08);
      // ...and clear of the attack at the other end. Not much further, though:
      // whatever the loop is cut from is what a held note sounds like forever, and
      // a string that has been decaying for a second has no harmonics left to give.
      expect(loop.start).toBeGreaterThanOrEqual(0.5);
      expect(loop.start).toBeLessThan(0.7);
      expect(loop.end).toBeGreaterThan(loop.start);
    }
  });

  it('loops long enough not to pulse', () => {
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      const loop = findLoop(recorded(frequency), SAMPLE_RATE, frequency)!;
      expect(loop.end - loop.start).toBeGreaterThan(0.2);
    }
  });

  it('gives up rather than loop something too short', () => {
    const frequency = hz(52);
    // A buffer that is all attack and fade, with no sustain to take a loop from:
    // the window runs from 0.5 s to 0.08 s before the end, and what is left of this
    // one is under the shortest loop worth having.
    expect(findLoop(recorded(frequency, 0.6), SAMPLE_RATE, frequency)).toBeNull();
    expect(findLoop(new Float32Array(0), SAMPLE_RATE, frequency)).toBeNull();
    expect(findLoop(recorded(frequency), SAMPLE_RATE, 0)).toBeNull();
  });

  it('finds nothing in silence', () => {
    // No rising crossing anywhere, so nothing to anchor a loop to.
    expect(findLoop(new Float32Array(2 * SAMPLE_RATE), SAMPLE_RATE, hz(52))).toBeNull();
  });
});

describe('renderSustain', () => {
  it('takes the decay out of the loop, so a lap does not restart louder', () => {
    /*
     * The whole reason this function exists. Unflattened the step was 2.3 dB
     * every third of a second, which is a tremolo at the rate the ear notices
     * most. The decay is not lost — audio.ts puts it back on the gain, where it
     * can be shaped.
     */
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      const samples = recorded(frequency);
      const loop = findLoop(samples, SAMPLE_RATE, frequency)!;
      const sustained = renderSustain(samples, SAMPLE_RATE, loop);

      const before = rms(samples, loop.start, 0.05) / rms(samples, loop.end - 0.05, 0.05);
      const after = rms(sustained, loop.start, 0.05) / rms(sustained, loop.end - 0.05, 0.05);

      expect(20 * Math.log10(before)).toBeGreaterThan(1);
      expect(Math.abs(20 * Math.log10(after))).toBeLessThan(0.5);
    }
  });

  it('joins as if the waveform had simply carried on', () => {
    /*
     * The strongest statement there is about a seam. By the end of the crossfade
     * the loop is already playing what precedes its own start, so jumping back
     * moves the signal by exactly one ordinary sample step of the waveform at
     * that point — the same step it would have taken had nothing happened. There
     * is no discontinuity left to hear, only the waveform's own slope.
     */
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      const samples = recorded(frequency);
      const loop = findLoop(samples, SAMPLE_RATE, frequency)!;
      const sustained = renderSustain(samples, SAMPLE_RATE, loop);

      const start = Math.round(loop.start * SAMPLE_RATE);
      const end = Math.round(loop.end * SAMPLE_RATE);

      // What the playhead actually does: the last sample of the loop, then the
      // first one again.
      const seam = sustained[start] - sustained[end - 1];
      const carriedOn = sustained[start] - sustained[start - 1];

      expect(Math.abs(seam - carriedOn)).toBeLessThan(Math.abs(carriedOn) / 2);
    }
  });

  it('does not sag where it crossfades', () => {
    /*
     * The failure mode a crossfade has all to itself: blending two stretches
     * that are half a period out of step subtracts them instead of adding, and
     * the seam comes out with a hole in it. The level through the crossfade has
     * to sit where the level either side of it sits.
     */
    for (const midi of RECORDED_MIDI) {
      const frequency = hz(midi);
      const samples = recorded(frequency);
      const loop = findLoop(samples, SAMPLE_RATE, frequency)!;
      const sustained = renderSustain(samples, SAMPLE_RATE, loop);

      const across = rms(sustained, loop.end - 0.03, 0.03);
      const before = rms(sustained, loop.end - 0.09, 0.03);

      expect(Math.abs(20 * Math.log10(across / before))).toBeLessThan(1.5);
    }
  });

  it('leaves the attack exactly as it was recorded', () => {
    const frequency = hz(52);
    const samples = recorded(frequency);
    const loop = findLoop(samples, SAMPLE_RATE, frequency)!;
    const sustained = renderSustain(samples, SAMPLE_RATE, loop);

    const start = Math.round(loop.start * SAMPLE_RATE);
    // Up to the crossfade that runs into the loop, every sample is untouched.
    for (let i = 0; i < start - Math.round(0.03 * SAMPLE_RATE); i++) {
      expect(sustained[i]).toBe(samples[i]);
    }
  });

  it('ends where the loop ends, so nothing dangles past it', () => {
    const frequency = hz(52);
    const samples = recorded(frequency);
    const loop = findLoop(samples, SAMPLE_RATE, frequency)!;

    expect(renderSustain(samples, SAMPLE_RATE, loop)).toHaveLength(
      Math.round(loop.end * SAMPLE_RATE),
    );
  });
});
