/**
 * Hals oder Steg — the pickup, as the one thing that actually distinguishes them.
 *
 * docs/e-gitarre.md §1 states the physics and, more usefully, says which part of it
 * is worth modelling: a pickup is an LCR circuit with a resonant peak at
 * f = 1/(2π√(LC)), and the difference between a single coil and a humbucker is not
 * "two coils" but roughly double the inductance — so the peak sits about an octave
 * lower. Humbuckers land at 2–4 kHz, single coils at 5–8 kHz, and a P-90 was
 * measured at 6.4 kHz. §2 adds the second axis and names the right tool for it: a
 * 500 kΩ pot damps the resonance less than a 250 kΩ one, and "der Unterschied ist
 * ein Q-Unterschied an der Resonanz, keine Grenzfrequenzverschiebung. Ein Q-Wert am
 * Peaking-Filter ist genau die richtige Modellierung."
 *
 * THE HONEST PART, WHICH IS ALSO THE DEFAULT. You cannot un-record a pickup. The
 * archtop in public/samples was captured through one, and whatever it was is already
 * in every note the app plays. So the default here is `recorded` — flat on both
 * stages, bit-exact wire — and `neck`/`bridge` are a few decibels of LEAN toward one
 * character or the other, not pickup models replacing a pickup that is not there to
 * replace. Anything else would be dressing a guess up as physics.
 *
 * It also buys something concrete: at the default this block is arithmetically
 * absent, so the amplifier sees exactly the input its four measured makeup values
 * were measured against, and none of them had to move for this feature.
 *
 * WHERE IT SITS. Before the amplifier, which src/audio.ts already fixes as a rule —
 * the tone filters are "the guitar and its pickup, and the amplifier comes after the
 * guitar". The consequence is deliberate and audible: choosing the neck pickup feeds
 * the valve more low-mid weight, so the amp breaks up a shade earlier. That is not a
 * side effect to be trimmed away, it is what picking up the neck pickup does.
 */

import { type AmpStage, biquad } from './amp';

export type PickupId = 'recorded' | 'neck' | 'bridge';

export interface PickupSpec {
  /** The LCR circuit's peak — peaking, because §2 says the difference is a Q. */
  readonly resonance: AmpStage;
  /**
   * The output difference between the positions — lowshelf.
   *
   * 320 Hz because the open strings' fundamentals run 82–330 Hz, so the shelf
   * covers the whole fundamental range and stops short of both AMP.tight (180 Hz)
   * and the cabinet resonance (70–100 Hz, docs/verstaerker.md §5). §1's position
   * table is what signs it: the neck pickup sits near an antinode and is "rund,
   * warm, viel Grundton"; the bridge is where "die Saite sich am wenigsten bewegt",
   * hence "hell, aggressiv, weniger Pegel".
   */
  readonly level: AmpStage;
}

const SHELF = { frequency: 320, q: 0.707 } as const;

/**
 * The three settings.
 *
 * The two frequencies are read off e-gitarre.md §1's measured bands rather than
 * chosen: 2828 Hz is the geometric centre of the humbucker's 2–4 kHz and 6325 Hz
 * that of the single coil's 5–8 kHz, rounded to two figures. The Q ordering comes
 * from §2's pot table — 500 kΩ for a humbucker against 250 kΩ for a single coil,
 * so the humbucker's peak is the less damped of the two.
 *
 * `recorded` keeps the humbucker's corner and Q at 0 dB rather than parking them
 * somewhere neutral, so switching to `neck` moves a gain and nothing else. A filter
 * corner sliding from one value to another is a sweep, and applyAmpSpec's comment in
 * audio.ts already explains why this codebase does not ship those by accident.
 */
export const PICKUPS: Record<PickupId, PickupSpec> = {
  recorded: {
    resonance: { frequency: 2800, q: 1.2, gain: 0 },
    level: { ...SHELF, gain: 0 },
  },
  neck: {
    resonance: { frequency: 2800, q: 1.2, gain: 3 },
    level: { ...SHELF, gain: 2.5 },
  },
  bridge: {
    resonance: { frequency: 6300, q: 1.0, gain: 4 },
    level: { ...SHELF, gain: -2.5 },
  },
};

export const PICKUP_IDS = Object.keys(PICKUPS) as readonly PickupId[];
export const DEFAULT_PICKUP: PickupId = 'recorded';

/** The pickup as plain arithmetic — the reference the tests measure. */
export function renderPickup(
  input: Float64Array,
  sampleRate: number,
  id: PickupId = DEFAULT_PICKUP,
): Float64Array {
  const spec = PICKUPS[id];
  return biquad('lowshelf', biquad('peaking', input, sampleRate, spec.resonance), sampleRate, spec.level);
}
