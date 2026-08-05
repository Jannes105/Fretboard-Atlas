/**
 * Reverb, as a generated impulse response — no file, no download, no loss of the
 * offline-first property the app has.
 *
 * docs/feature-ideen.md C3 fixes both the method and the length: noise under an
 * exponentially falling envelope, 0.8–2 s. docs/effektpedale.md §6 fixes the
 * parameter set a room is actually described by — pre-delay 0–100 ms, decay/RT60
 * 0.3–10 s, damping, mix — and notes that a ConvolverNode with a generated IR is
 * the simplest thing that works in Web Audio.
 *
 * THE THREE ARITHMETIC POINTS THAT MAKE IT A ROOM RATHER THAN A BURST OF NOISE:
 *
 * 1. The envelope is scaled so it reaches exactly −60 dB at `rt60`. That makes the
 *    number in the table the reverberation time by definition, and reverb.test.ts
 *    measures it back out rather than trusting the label.
 * 2. The damping corner SLIDES down across the tail instead of sitting still. A
 *    fixed lowpass is a dark reverb; a falling one is a room, because a room loses
 *    its highs long before it runs out of energy. It slides geometrically, so the
 *    fall sounds proportional at every pitch — the same reasoning HOLD_TONE_FLOOR
 *    uses in src/audio.ts.
 * 3. The result carries UNIT ENERGY, and the ConvolverNode is therefore set to
 *    `normalize = false`. That pairing is what makes the send gain mean the wet
 *    level: switching Raum for Halle then changes the room and not the volume,
 *    even though one tail is twice as long as the other. It is the same discipline
 *    AMP.makeup enforces for the amplifier, and the same failure it prevents.
 *
 * Two channels, from two seeds. It is the largest perceptual gain in the file and
 * it costs one more call: the same room heard by two ears is not the same signal
 * twice, and a mono reverb on a stereo output is a reverb in the middle of your
 * head. The dry path stays mono.
 */

/** One room, in the terms effektpedale.md §6 describes rooms in. */
export interface RoomSpec {
  /** Time to −60 dB, in seconds. */
  readonly rt60: number;
  /** Seconds of silence before the tail — how far away the walls are. */
  readonly predelay: number;
  /** Where the tail's lowpass starts and where it ends up, in Hz. */
  readonly damping: readonly [number, number];
  /** Send level when this room is chosen. */
  readonly mix: number;
}

export type ReverbId = 'off' | 'room' | 'hall';

export const REVERBS: Record<Exclude<ReverbId, 'off'>, RoomSpec> = {
  room: { rt60: 0.9, predelay: 0.012, damping: [9000, 1800], mix: 0.25 },
  hall: { rt60: 1.8, predelay: 0.03, damping: [7000, 900], mix: 0.25 },
};

export const REVERB_IDS: readonly ReverbId[] = ['off', 'room', 'hall'];
export const DEFAULT_REVERB: ReverbId = 'off';

/**
 * How far past RT60 the tail is actually rendered.
 *
 * At 1.2 the last sample is 72 dB down, which is below anything the ceiling will
 * ever let through — so the response ends rather than being cut off, and a cut-off
 * impulse response is a click on every note.
 */
const TAIL_MARGIN = 1.2;

/**
 * A seeded generator, so the room is the same in every session and the tests can
 * assert exact numbers. Same xorshift the amplifier's tests use.
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** The two seeds the two channels are built from. */
export const CHANNEL_SEEDS = [0x5eed_1a7e, 0x5eed_2b8f] as const;

export function impulseResponse(
  room: RoomSpec,
  sampleRate: number,
  random: () => number,
): Float64Array {
  const pre = Math.round(room.predelay * sampleRate);
  const span = room.rt60 * TAIL_MARGIN;
  const tail = Math.round(span * sampleRate);
  const out = new Float64Array(pre + tail);

  // exp(-t/tau) = 1e-3 at t = rt60, so rt60 IS the time to -60 dB.
  const tau = room.rt60 / (3 * Math.LN10);
  const [from, to] = room.damping;

  let first = 0;
  let second = 0;
  for (let n = 0; n < tail; n++) {
    const t = n / sampleRate;
    const corner = from * Math.pow(to / from, t / span);
    const a = 1 - Math.exp((-2 * Math.PI * corner) / sampleRate);
    /*
     * TWO poles and not one, which is not a detail. A single 6 dB/oct pole at
     * 2.5 kHz still leaves the octave above 8 kHz barely 10 dB down, and there are
     * a great many more bins up there than below — measured, a one-pole version of
     * this moved the tail's spectral centroid from 10.3 to 9.5 kHz over half the
     * decay, which is not a room losing its highs, it is noise with an opinion.
     * Twelve decibels an octave is also the better physics: a room absorbs treble
     * at its surfaces AND loses it to the air on the way.
     */
    first += a * (random() * 2 - 1 - first);
    second += a * (first - second);
    /*
     * A cascade of two of these poles fed white noise comes out with
     * a(1+(1-a)^2)/(2-a)^3 of its variance, and that factor is a function of the
     * corner — which is moving. Left alone it would steepen the decay as the
     * filter closed, and rt60 would quietly stop meaning rt60. Undoing it here
     * leaves the envelope as the only thing setting the tail.
     */
    const variance = (a * (1 + (1 - a) * (1 - a))) / Math.pow(2 - a, 3);
    out[pre + n] = (second / Math.sqrt(variance)) * Math.exp(-t / tau);
  }

  let energy = 0;
  for (const value of out) energy += value * value;
  const scale = 1 / Math.sqrt(energy);
  for (let i = 0; i < out.length; i++) out[i] *= scale;

  return out;
}
