import { describe, expect, it } from 'vitest';
import { spectrum } from '../test/spectrum';
import { voicePeak } from '../audio';
import { midiToFrequency, STANDARD_STRUM_GAP } from '../theory';
import { AMP, AMP_IDS, AMPS, ampInput, ampShape, biquad, renderAmp, webAudioQ } from './amp';
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

  it('bends where the chord actually sits, not only on its attacks', () => {
    /*
     * The test that should have existed first. The amplifier was once set up so
     * that the loudest PEAK of a chord reached the top of the curve — and it was
     * inaudible, because a strummed chord has 20 dB of crest factor, so
     * everything except the pick attacks sat where the curve is still a straight
     * line. Clean and overdrive measured 0.4 dB apart and sounded identical.
     *
     * So the level that matters is the RMS, and what it has to do is bend: at
     * the level the chord SUSTAINS at, the curve must have visibly given up
     * slope. A peak-based check cannot see this failure at all.
     */
    const driven = ampInput(chord(E_MAJOR), SAMPLE_RATE);

    let sum = 0;
    for (const value of driven) sum += value * value;
    const level = Math.sqrt(sum / driven.length);

    const slope = (x: number) => (ampShape(x + 1e-4) - ampShape(x - 1e-4)) / 2e-4;
    expect(slope(level) / slope(0)).toBeLessThan(0.75);
  });

  it('still bends once the chord has decayed', () => {
    /*
     * The other half of "it sounds distorted", and the less obvious half. A
     * chord dies away, and the drive into the curve dies with it, so an
     * amplifier set just barely into saturation is dirty at the pick and clean a
     * second later — measured on the recordings at a drive of 6, intermodulation
     * fell from 4.1 % to 0.8 % within a second, and the ear reads that as a
     * clean guitar with a scratchy attack.
     *
     * So the curve has to still be bending well BELOW the level the chord
     * arrives at. Twelve decibels down is about where a strummed chord sits a
     * second later; the slope there must still have visibly given way.
     *
     * A statement about the curve and its operating point, which is exactly what
     * this reference can speak to — unlike absolute level, see AMP.makeup.
     */
    const driven = ampInput(chord(E_MAJOR), SAMPLE_RATE);
    let sum = 0;
    for (const value of driven) sum += value * value;
    const decayed = Math.sqrt(sum / driven.length) / 4; // -12 dB

    const slope = (x: number) => (ampShape(x + 1e-4) - ampShape(x - 1e-4)) / 2e-4;
    expect(slope(decayed) / slope(0)).toBeLessThan(0.85);
  });

  it('has finished bending before the shaper runs out of domain', () => {
    /*
     * What makes it safe to drive that hard. A WaveShaper clamps its input to
     * [-1, 1] before it indexes the curve, so anything past the edge is
     * hard-clipped at the last entry of the table — that is what the overdrive
     * removed in 0662993 was doing, with a curve still steep at the edge and a
     * corner in the waveform to show for it.
     *
     * A curve that is already flat there has nothing left to clip: the clamp
     * lands on a horizontal stretch and the join is smooth. That is the property
     * that has to hold, not some ceiling on the level going in.
     */
    const slope = (x: number) => (ampShape(x) - ampShape(x - 2e-3)) / 2e-3;
    expect(slope(0.999) / slope(1e-4)).toBeLessThan(0.001);
  });

  it('is neither silent nor off the scale', () => {
    /*
     * A very coarse bound, and deliberately so: this test cannot set the level
     * and should not pretend to. AMP.makeup comes from a browser rendering the
     * real recordings, because a synthesised string saturates differently from a
     * recorded one — the two disagree by 6.6 dB here, and the reason is written
     * out where the number lives.
     *
     * What is worth catching is a makeup that lost a decimal point, which is a
     * real way to break this and one the ear would meet as silence or as a wall
     * of noise. Everything else this file measures is shape, which the reference
     * IS entitled to speak about.
     */
    const clean = chord(E_MAJOR);
    const driven = renderAmp(clean, SAMPLE_RATE);

    expect(Math.abs(dB(rms(driven) / rms(clean)))).toBeLessThan(12);
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

/**
 * The properties above are written against the crunch amp because that is the one
 * that was tuned by measurement. They are not private to it: an entry in AMPS that
 * emitted DC, clipped on a corner or fizzed above the speaker would be a broken
 * amplifier whichever make it is named after. So the same assertions run over the
 * whole table — that is what stops a new archetype from being added by eye.
 */
describe('every amplifier in AMPS', () => {
  const clean = chord(E_MAJOR);

  for (const id of AMP_IDS) {
    const spec = AMPS[id];

    describe(id, () => {
      it('emits no DC into silence', () => {
        expect(ampShape(0, spec.drive, spec.bias)).toBe(0);
      });

      it('has finished bending before the shaper runs out of domain', () => {
        const slope = (x: number) =>
          (ampShape(x, spec.drive, spec.bias) - ampShape(x - 2e-3, spec.drive, spec.bias)) / 2e-3;
        // A gentler amp bends less far by the edge than the crunch one does, so
        // this bound is looser than the 0.001 above — what matters is that the
        // curve is flattening, not that every amp is a brick wall.
        expect(slope(0.999) / slope(1e-4)).toBeLessThan(0.2);
      });

      it('leans to one side, which is where the warmth comes from', () => {
        const up = ampShape(0.5, spec.drive, spec.bias);
        const down = -ampShape(-0.5, spec.drive, spec.bias);
        expect(up).not.toBeCloseTo(down, 6);
      });

      it('keeps its level within reach of the clean voice', () => {
        /*
         * The coarse bound from the single-amp test, applied to all four — it
         * catches a makeup that lost a decimal point, which is the way this table
         * actually breaks. It cannot check the makeup is RIGHT: that comes from
         * scripts/measure-makeup.html and the browser, for the reason written out
         * where the numbers live.
         */
        const driven = renderAmp(clean, SAMPLE_RATE, spec);
        expect(Math.abs(dB(rms(driven) / rms(clean))), id).toBeLessThan(12);
      });

      it('rolls the fizz off above its own speaker', () => {
        const driven = renderAmp(clean, SAMPLE_RATE, spec);
        const frame = driven.subarray(SAMPLE_RATE / 4, SAMPLE_RATE / 4 + N);
        const magnitude = spectrum(Float64Array.from(frame));

        const band = (from: number, to: number) => {
          let sum = 0;
          const first = Math.round((from * N) / SAMPLE_RATE);
          const last = Math.round((to * N) / SAMPLE_RATE);
          for (let k = first; k < last; k++) sum += magnitude[k] * magnitude[k];
          return sum;
        };

        expect(band(8000, 20000) / band(80, 8000), id).toBeLessThan(0.001);
      });

      it('blocks the DC its own curve makes', () => {
        const driven = renderAmp(clean, SAMPLE_RATE, spec);
        let sum = 0;
        for (const sample of driven) sum += sample;
        // The mean of the output, against its own RMS: an unblocked asymmetric
        // curve would push a step here on every note onset.
        expect(Math.abs(sum / driven.length) / rms(driven), id).toBeLessThan(0.01);
      });
    });
  }
});
