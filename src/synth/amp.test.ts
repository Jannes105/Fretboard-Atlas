import { describe, expect, it } from 'vitest';
import { spectrum } from '../test/spectrum';
import { voicePeak } from '../audio';
import { midiToFrequency, STANDARD_STRUM_GAP } from '../theory';
import { AMP, ampInput, ampShape, biquad, renderAmp, webAudioQ } from './amp';
import { pluck, type PluckOptions } from './pluck';

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

/** A seeded generator, so every run renders the same strings. */
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

/** The `electric` voice's string, as audio.ts sets it up. */
const STRING: Omit<PluckOptions, 'random'> = {
  damping: 0.02,
  pickPosition: 0.1,
  pickNoise: 0.05,
  sustainSeconds: 8,
};

/**
 * A six-string E major, built the way audio.ts builds one: each string at the
 * level `voicePeak` allows for six voices, scaled by the 0.97 the recordings are
 * normalised to, and brushed 10 ms apart.
 *
 * Synthesised rather than recorded because a test cannot decode an mp3 — but it
 * is the app's own string model at the app's own levels, which is what the
 * measurement needs it to be.
 */
function chord(midiNotes: readonly number[], seconds = 2): Float64Array {
  const out = new Float64Array(Math.round(seconds * SAMPLE_RATE));
  const level = voicePeak(midiNotes.length) * 0.97;

  midiNotes.forEach((midi, i) => {
    const string = pluck(midiToFrequency(midi), SAMPLE_RATE, seconds, {
      ...STRING,
      random: seeded(12345 + i),
    });
    const offset = Math.round(i * STANDARD_STRUM_GAP * SAMPLE_RATE);
    for (let n = 0; n + offset < out.length && n < string.length; n++) {
      out[n + offset] += string[n] * level;
    }
  });

  return out;
}

/** Open E major, as it lies on the neck. */
const E_MAJOR = [40, 47, 52, 56, 59, 64];

/** A frame whose partials land exactly on bin centres — no window, no leakage. */
const N = 16384;
const sine = (bin: number, amplitude: number) =>
  Float64Array.from({ length: N }, (_, n) => amplitude * Math.sin((2 * Math.PI * bin * n) / N));

describe('ampShape', () => {
  it('turns silence into silence', () => {
    // Not cosmetic: an asymmetric curve with f(0) != 0 pushes a constant DC
    // offset at the output for as long as the amplifier exists.
    expect(ampShape(0)).toBe(0);
  });

  it('uses its whole domain and no more', () => {
    for (let i = 0; i <= 4096; i++) {
      const x = (i / 4096) * 2 - 1;
      expect(Math.abs(ampShape(x))).toBeLessThanOrEqual(1);
    }
    // One end reaches full scale — anything less would be headroom thrown away.
    expect(Math.max(Math.abs(ampShape(1)), Math.abs(ampShape(-1)))).toBeCloseTo(1, 12);
  });

  it('leans to one side, which is where the warmth comes from', () => {
    // A biased valve compresses one half of the wave harder than the other.
    expect(Math.abs(ampShape(1))).not.toBeCloseTo(Math.abs(ampShape(-1)), 3);
    // Symmetric when the bias is taken away, so the asymmetry is the bias and
    // not an accident of the normalisation.
    expect(ampShape(0.7, AMP.drive, 0)).toBeCloseTo(-ampShape(-0.7, AMP.drive, 0), 12);
  });

  it('rises without ever turning back', () => {
    let previous = ampShape(-1);
    for (let i = 1; i <= 4096; i++) {
      const value = ampShape((i / 4096) * 2 - 1);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('leaves a quiet note alone and squashes a loud one', () => {
    // Near-linear at the bottom: a single quiet note must not be pre-squashed,
    // or the amplifier stops responding to how hard you dig in.
    const quiet = ampShape(0.02) / 0.02;
    const soft = ampShape(0.05) / 0.05;
    expect(Math.abs(soft / quiet - 1)).toBeLessThan(0.1);

    // Compressing at the top: the second half of the domain buys less output
    // than the first.
    expect(ampShape(1) - ampShape(0.5)).toBeLessThan(ampShape(0.5) - ampShape(0));
  });

  it('makes even harmonics only because of the bias', () => {
    const input = sine(100, 0.6);
    const biased = spectrum(input.map((x) => ampShape(x)));
    const symmetric = spectrum(input.map((x) => ampShape(x, AMP.drive, 0)));

    expect(dB(biased[200] / biased[100])).toBeGreaterThan(-40);
    expect(dB(symmetric[200] / symmetric[100])).toBeLessThan(-80);
  });

  /**
   * The measurement this whole file exists for.
   *
   * Two partials a major third apart — the interval that actually turns to mush.
   * Run through ONE curve together, the way an amplifier sees a chord, and
   * through one curve EACH, the way six separately distorted recordings add up.
   * Harmonics appear either way; the sum and difference products appear only
   * when a single nonlinearity sees both strings, and that is the whole
   * difference between a chord reading as one voice and as six.
   */
  it('makes strings intermodulate only when one stage sees them all', () => {
    const a = sine(100, 0.45);
    const b = sine(126, 0.45); // 126/100 = 1.26, a just major third

    const together = a.map((x, i) => ampShape(x + b[i]));
    const apart = a.map((x, i) => ampShape(x) + ampShape(b[i]));

    const one = spectrum(together);
    const six = spectrum(apart);

    // |f2-f1|, 2f1-f2, f1+f2, 2f2-f1 — every one of them on a bin centre.
    for (const bin of [26, 74, 226, 152]) {
      expect(dB(one[bin] / one[100])).toBeGreaterThan(-45);
      expect(dB(six[bin] / six[100])).toBeLessThan(-100);
    }

    // And the control: BOTH are distorted. Without this the test above would
    // only be saying "one of these went through a nonlinearity".
    expect(dB(one[300] / one[100])).toBeGreaterThan(-40);
    expect(dB(six[300] / six[100])).toBeGreaterThan(-40);
  });
});

describe('biquad', () => {
  /** Steady-state amplitude of a sine at `frequency` after one stage. */
  function response(kind: Parameters<typeof biquad>[0], stage: Parameters<typeof biquad>[3], frequency: number) {
    const length = SAMPLE_RATE;
    const input = Float64Array.from(
      { length },
      (_, n) => Math.sin((2 * Math.PI * frequency * n) / SAMPLE_RATE),
    );
    // Skip the first half second so the filter has settled.
    return peak(biquad(kind, input, SAMPLE_RATE, stage).subarray(length / 2));
  }

  /** The cabinet pair, optionally moved to another corner frequency. */
  const cabinetAt = (corner: number, frequency: number) => {
    const input = Float64Array.from({ length: SAMPLE_RATE }, (_, n) =>
      Math.sin((2 * Math.PI * frequency * n) / SAMPLE_RATE),
    );
    const scale = corner / AMP.cab[0].frequency;
    const first = biquad('lowpass', input, SAMPLE_RATE, {
      ...AMP.cab[0],
      frequency: AMP.cab[0].frequency * scale,
    });
    const second = biquad('lowpass', first, SAMPLE_RATE, {
      ...AMP.cab[1],
      frequency: AMP.cab[1].frequency * scale,
    });
    return peak(second.subarray(SAMPLE_RATE / 2));
  };

  it('puts the cabinet corner exactly 3 dB down', () => {
    // The Butterworth property, and the reason the two Qs are 0.5412 and 1.3066
    // rather than 0.707 twice: two sections at 0.707 land 6 dB down here.
    const corner = AMP.cab[0].frequency;
    expect(dB(cabinetAt(corner, corner))).toBeCloseTo(-3, 1);
  });

  it('gives the cabinet a 24 dB per octave slope', () => {
    /*
     * Measured with the same pair moved down to 800 Hz. At the real 4200 Hz the
     * stopband runs into Nyquist — 16.8 kHz is already inside the bilinear
     * transform's own rolloff, and what that measures is the sample rate, not
     * the filter.
     */
    const octave = dB(cabinetAt(800, 3200)) - dB(cabinetAt(800, 1600));
    expect(octave).toBeLessThan(-22);
    expect(octave).toBeGreaterThan(-26);
  });

  it('takes the weight out of the bass without deleting it', () => {
    // The point of a shelf over a highpass: the low E still arrives.
    expect(dB(response('lowshelf', AMP.tight, 82))).toBeGreaterThan(-9);
    expect(dB(response('lowshelf', AMP.tight, 82))).toBeLessThan(-6);
    // ...while everything the chord is built from passes untouched.
    expect(dB(response('lowshelf', AMP.tight, 1000))).toBeCloseTo(0, 1);
  });
});

describe('webAudioQ', () => {
  /*
   * Measured against getFrequencyResponse in Chrome. A filter table value handed
   * straight to a BiquadFilterNode is wrong for two of these four types, and
   * silently so — the filter still works, it is just not the filter you chose.
   */
  it('hands a lowpass its Q in decibels', () => {
    expect(webAudioQ('lowpass', 1)).toBeCloseTo(0, 9);
    expect(webAudioQ('lowpass', AMP.cab[0].q)).toBeCloseTo(-5.3328, 3);
    expect(webAudioQ('highpass', AMP.cab[1].q)).toBeCloseTo(2.3229, 3);
  });

  it('hands a peaking or shelving stage its Q unchanged', () => {
    expect(webAudioQ('peaking', 1.1)).toBe(1.1);
    expect(webAudioQ('lowshelf', 0.707)).toBe(0.707);
  });
});

describe('renderAmp', () => {
  it('blocks the DC its own curve makes', () => {
    const input = sine(100, 0.8);
    // Skipping the filter's startup, and by exactly 25 of the signal's periods,
    // so the window still holds a whole number of them and the mean of a clean
    // sine over it is zero on its own.
    const settled = (signal: Float64Array) => signal.subarray(4096);
    const mean = (signal: Float64Array) =>
      settled(signal).reduce((sum, value) => sum + value, 0) / settled(signal).length;

    // The bare curve leans, so its output has an offset...
    expect(Math.abs(mean(input.map((x) => ampShape(x))))).toBeGreaterThan(0.01);
    // ...and by the output of the amplifier it is gone.
    expect(Math.abs(mean(renderAmp(input, SAMPLE_RATE)))).toBeLessThan(1e-4);
  });

  it('stays inside the shaper it is driving', () => {
    /*
     * The regression guard for the bug that killed the old overdrive: a
     * WaveShaper clamps its input to [-1, 1] before it indexes the curve, so a
     * signal that lives outside that is not being shaped at all — it is being
     * hard-clipped at the last entry of the table. The removed version ran at
     * 2.4 and spent most of every note there.
     */
    const driven = ampInput(chord(E_MAJOR), SAMPLE_RATE);
    const over = driven.reduce((count, value) => count + (Math.abs(value) >= 1 ? 1 : 0), 0);

    expect(over / driven.length).toBeLessThan(0.02);
    // And it does reach the bend — an amplifier that never leaves the linear
    // part is a wire.
    expect(peak(driven)).toBeGreaterThan(0.6);
  });

  it('lands in the same range as the clean path', () => {
    /*
     * A range and not a figure, deliberately. The trim in AMP.makeup was set from
     * a browser rendering the real recordings, because a synthesised string and a
     * recorded one drive a curve differently enough to move the level by 2.3 dB —
     * the reasoning is written out where the number lives. What this test is for
     * is catching a change that puts the amplifier in a different league
     * altogether, which is the failure worth having a test for.
     */
    const clean = chord(E_MAJOR);
    const driven = renderAmp(clean, SAMPLE_RATE);

    expect(Math.abs(dB(rms(driven) / rms(clean)))).toBeLessThan(4);
  });

  it('keeps a single note and a whole chord in the same room', () => {
    const single = renderAmp(chord([52]), SAMPLE_RATE);
    const full = renderAmp(chord(E_MAJOR), SAMPLE_RATE);

    // A chord sits a shade below a single note by design — see voicePeak — but
    // no voicing may be crushed or lost.
    const difference = dB(rms(full) / rms(single));
    expect(difference).toBeLessThan(3);
    expect(difference).toBeGreaterThan(-6);
  });

  it('rolls the fizz off above the speaker', () => {
    const driven = renderAmp(chord(E_MAJOR), SAMPLE_RATE);
    const frame = driven.subarray(SAMPLE_RATE / 4, SAMPLE_RATE / 4 + N);
    const magnitude = spectrum(Float64Array.from(frame));

    const band = (from: number, to: number) => {
      let sum = 0;
      const first = Math.round((from * N) / SAMPLE_RATE);
      const last = Math.round((to * N) / SAMPLE_RATE);
      for (let k = first; k < last; k++) sum += magnitude[k] * magnitude[k];
      return sum;
    };

    // The speaker the old per-note overdrive never had: what is left above
    // 8 kHz is a rounding error next to the band the guitar lives in.
    expect(band(8000, 20000) / band(80, 8000)).toBeLessThan(0.001);
  });
});
