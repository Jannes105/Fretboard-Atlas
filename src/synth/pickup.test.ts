import { describe, expect, it } from 'vitest';
import { spectrum } from '../test/spectrum';
import { voicePeak } from '../audio';
import { midiToFrequency, STANDARD_STRUM_GAP } from '../theory';
import { ampInput, ampShape, renderAmp } from './amp';
import { DEFAULT_PICKUP, PICKUP_IDS, PICKUPS, type PickupId, renderPickup } from './pickup';
import { pluck, type PluckOptions } from './pluck';

const SAMPLE_RATE = 48000;

const dB = (ratio: number) => 20 * Math.log10(ratio);

function rms(signal: Float64Array): number {
  let sum = 0;
  for (const value of signal) sum += value * value;
  return Math.sqrt(sum / signal.length);
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

/** What one pickup setting does to one frequency, in dB. */
function gainAt(frequency: number, id: PickupId): number {
  const length = SAMPLE_RATE;
  const input = Float64Array.from({ length }, (_, n) =>
    Math.sin((2 * Math.PI * frequency * n) / SAMPLE_RATE),
  );
  const settled = renderPickup(input, SAMPLE_RATE, id).subarray(length / 2);
  return dB(rms(settled) * Math.SQRT2);
}

/** The `electric` voice's string, as audio.ts sets it up. */
const STRING: Omit<PluckOptions, 'random'> = {
  damping: 0.02,
  pickPosition: 0.1,
  pickNoise: 0.05,
  sustainSeconds: 8,
};

/** Open E major, built the way audio.ts builds one. */
function chord(seconds = 2): Float64Array {
  const midiNotes = [40, 47, 52, 56, 59, 64];
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

describe('the pickup as a table', () => {
  it('puts the two resonances where the measurements put them', () => {
    /*
     * A data test, and worth its four lines: docs/e-gitarre.md §1 gives measured
     * bands — humbucker 2–4 kHz, single coil 5–8 kHz — and the numbers here are
     * the geometric centres of them, not preferences. This is what stops the next
     * person typing a frequency the document does not support.
     */
    expect(PICKUPS.neck.resonance.frequency).toBeGreaterThanOrEqual(2000);
    expect(PICKUPS.neck.resonance.frequency).toBeLessThanOrEqual(4000);
    expect(PICKUPS.bridge.resonance.frequency).toBeGreaterThanOrEqual(5000);
    expect(PICKUPS.bridge.resonance.frequency).toBeLessThanOrEqual(8000);
  });

  it('keeps them more than an octave apart', () => {
    // §1's central claim, and it is physics rather than taste: a humbucker has
    // about twice the inductance, and f = 1/(2*pi*sqrt(LC)) turns that into
    // roughly an octave.
    const ratio = PICKUPS.bridge.resonance.frequency / PICKUPS.neck.resonance.frequency;
    expect(ratio).toBeGreaterThan(2);
  });

  it('damps the single coil peak more than the humbucker one', () => {
    // §2: 250 kOhm against 500 kOhm, and the section says outright that this is a
    // Q difference at the resonance rather than a shift of it.
    expect(PICKUPS.bridge.resonance.q).toBeLessThan(PICKUPS.neck.resonance.q);
  });

  it('offers a setting that admits the recording already has a pickup in it', () => {
    // The default is flat on both stages on purpose — see the file header. If a
    // later edit gives it a gain, the amplifier's four measured makeup values
    // stop being valid and nothing else in the suite would say so.
    expect(DEFAULT_PICKUP).toBe('recorded');
    expect(PICKUPS.recorded.resonance.gain).toBe(0);
    expect(PICKUPS.recorded.level.gain).toBe(0);
    expect(PICKUP_IDS).toContain('recorded');
  });
});

describe('renderPickup', () => {
  it('is a wire at the default', () => {
    // The assertion the makeup table leans on: at 0 dB both RBJ numerators equal
    // their denominators, so the amplifier sees exactly the input its loudness
    // trims were measured against.
    const input = chord(0.2);
    const out = renderPickup(input, SAMPLE_RATE, 'recorded');
    for (let i = 0; i < input.length; i++) expect(out[i]).toBeCloseTo(input[i], 12);
  });

  it('makes the bridge brighter and the neck fatter', () => {
    // docs/e-gitarre.md §1's position table, as two numbers: the bridge is "hell,
    // aggressiv, weniger Pegel", the neck "rund, warm, viel Grundton".
    const atResonance = gainAt(PICKUPS.bridge.resonance.frequency, 'bridge');
    expect(atResonance - gainAt(PICKUPS.bridge.resonance.frequency, 'neck')).toBeGreaterThan(3);
    expect(gainAt(100, 'neck') - gainAt(100, 'bridge')).toBeGreaterThan(4);
  });

  it('changes what the valve sees, not only what the ear does', () => {
    /*
     * The one test that justifies putting this block BEFORE the amplifier rather
     * than after it. The neck setting adds low-mid weight, so more signal arrives
     * at the shaper — and because the shaper compresses, the extra drive is also
     * a shade less slope. A pickup after the amp could not do either.
     */
    const source = chord();
    // ampInput already carries preGain, so this is the level AT the shaper.
    const level = (id: PickupId) => rms(ampInput(renderPickup(source, SAMPLE_RATE, id), SAMPLE_RATE));

    expect(level('neck')).toBeGreaterThan(level('bridge'));

    const slope = (at: number) => (ampShape(at + 1e-4) - ampShape(at - 1e-4)) / 2e-4;
    expect(slope(level('neck'))).toBeLessThan(slope(level('bridge')));
  });

  it('offers the amplifier a level difference that the amplifier then swallows', () => {
    /*
     * A bridge pickup really is quieter (§1), so nothing here undoes that — the
     * difference IS the feature, and on the clean voice you hear all of it.
     *
     * Through the amplifier you hear almost none of it, and the measurement says
     * how little: 3.5 dB arrives at the valve and 0.3 dB leaves it. That is the
     * amplifier doing what an amplifier does, and it is the reason there is no
     * per-pickup makeup gain in PICKUPS. Adding one would be correcting a level
     * that has already corrected itself.
     */
    const source = chord();
    const before = (id: PickupId) => rms(renderPickup(source, SAMPLE_RATE, id));
    const after = (id: PickupId) =>
      rms(renderAmp(renderPickup(source, SAMPLE_RATE, id), SAMPLE_RATE));

    expect(dB(before('neck') / before('bridge'))).toBeGreaterThan(3);
    expect(dB(after('neck') / after('bridge'))).toBeLessThan(0.6);
  });

  it('adds no fizz for the cabinet to have to remove', () => {
    // The bridge resonance sits at 6.3 kHz, above the speaker's corner. Before
    // the amp that is fine — it intermodulates back down into the band rather
    // than arriving at the output as hiss — but only if it is not enormous.
    const frame = renderPickup(chord(1), SAMPLE_RATE, 'bridge').subarray(0, 16384);
    const bins = spectrum(Float64Array.from(frame));
    const band = (low: number, high: number) => {
      let energy = 0;
      for (let k = 0; k < bins.length; k++) {
        const frequency = (k * SAMPLE_RATE) / 16384;
        if (frequency >= low && frequency < high) energy += bins[k] * bins[k];
      }
      return energy;
    };
    expect(band(8000, 20000) / band(80, 8000)).toBeLessThan(0.01);
  });
});
