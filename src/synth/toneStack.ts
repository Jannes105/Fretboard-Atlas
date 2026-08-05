/**
 * Bass, Mitten, Höhen — three biquads, and a deliberate decision about where they
 * do NOT go.
 *
 * A real amplifier's tone stack is the FMV/TMB network, and docs/verstaerker.md §2
 * is blunt about what it is: passive, so it can only cut and never boost; costing
 * 20–30 dB where it sits; and made of three controls that are not orthogonal,
 * because they share one node. The same section is equally blunt that three
 * biquads approximate its curve well enough for a trainer, and that anyone wanting
 * the real thing needs a third-order transfer function and a bilinear transform.
 * This file takes that offer.
 *
 * WHERE IT SITS, AND WHY NOT IN AmpSpec. The real network hangs in the middle of
 * the preamp, which means it decides not only what you hear but what the valve
 * distorts next — verstaerker.md §1 puts it exactly that way. Ours is after the
 * amplifier instead, on the finished sum, and that costs the second half of the
 * sentence: turning the bass down here makes the sound thinner without making the
 * amplifier behave as though it had less bass to chew on.
 *
 * That is the right half to give up, and the reason is AMP.makeup. Each amplifier
 * carries one measured loudness trim, and it is valid because it is a RATIO between
 * the clean path and the driven one. A tone stack inside the amplifier would change
 * that ratio every time a knob moved — the valve compresses, so more bass in is not
 * simply more bass out — and no single measured number could be right again. On the
 * sum, both paths are scaled by the identical factor and the ratio is untouched.
 * One measured number per amplifier survives, which is the property the whole
 * amp.ts measurement rests on.
 *
 * At NEUTRAL it is bit-exact silence-in-the-signal-path: A = 1 makes every RBJ
 * numerator equal its denominator, so all three filters are wires. toneStack.test.ts
 * asserts that to 1e-12, and that assertion is what lets the four measured makeup
 * values stay in the table unchanged.
 */

import { type AmpStage, biquad, makeBiquad } from './amp';

/** Where the three controls sit, in decibels. Zero is flat. */
export interface ToneGains {
  readonly bass: number;
  readonly mid: number;
  readonly treble: number;
}

export const NEUTRAL_TONE: ToneGains = { bass: 0, mid: 0, treble: 0 };

/** How far each control travels, either way. */
export const TONE_MAX_DB = 6;

/**
 * The three corners, from docs/verstaerker.md §2 — the measured 5F6-A figures
 * rather than round numbers.
 *
 * - **Bass, 160 Hz.** The corner AMP.body already uses, so the app has decided
 *   once where a note's weight lives rather than twice. It also stays clear of the
 *   cabinet's own 70–100 Hz resonance (§5), which a lower shelf would pump.
 * - **Mitten, 500 Hz.** The section's headline number: the Fender mid scoop sits
 *   at about 500 Hz with the controls centred, and it is what "Fender scooped,
 *   Marshall mid-forward" is a statement about. Q 0.7 spans roughly two octaves —
 *   the narrowest setting that still reads as "the mids" rather than as a honk at
 *   one frequency.
 * - **Höhen, 2400 Hz.** §2 gives the treble corner wandering between 2313 and
 *   2548 Hz as the control turns; 2400 is the middle of that walk.
 */
export const TONE_STACK = {
  bass: { frequency: 160, q: 0.707 },
  mid: { frequency: 500, q: 0.7 },
  treble: { frequency: 2400, q: 0.707 },
} as const;

/** The three stages for a setting, in the order they are chained. */
export function stackStages(gains: ToneGains): readonly [AmpStage, AmpStage, AmpStage] {
  return [
    { ...TONE_STACK.bass, gain: gains.bass },
    { ...TONE_STACK.mid, gain: gains.mid },
    { ...TONE_STACK.treble, gain: gains.treble },
  ];
}

/** The three kinds, aligned with `stackStages`. */
export const STACK_KINDS = ['lowshelf', 'peaking', 'highshelf'] as const;

/**
 * The tone stack as plain arithmetic — the reference the tests measure.
 *
 * Deliberately not a model of the Web Audio graph but the same coefficients: the
 * three filters are chained in the same order and computed by the same `biquad`
 * the amplifier's own reference uses.
 */
export function renderToneStack(
  input: Float64Array,
  sampleRate: number,
  gains: ToneGains = NEUTRAL_TONE,
): Float64Array {
  const stages = stackStages(gains);
  let signal = input;
  STACK_KINDS.forEach((kind, i) => {
    signal = biquad(kind, signal, sampleRate, stages[i]);
  });
  return signal;
}

/** The same chain, one sample at a time — for anything that needs it in a loop. */
export function makeToneStack(
  sampleRate: number,
  gains: ToneGains = NEUTRAL_TONE,
): (x: number) => number {
  const stages = stackStages(gains);
  const steps = STACK_KINDS.map((kind, i) => makeBiquad(kind, sampleRate, stages[i]));
  return (x) => steps.reduce((value, step) => step(value), x);
}
