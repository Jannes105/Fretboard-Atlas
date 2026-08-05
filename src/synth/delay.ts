/**
 * Delay, tied to the transport rather than to a knob in milliseconds.
 *
 * docs/effektpedale.md §6 gives both halves. The times: "rhythmisch an die BPM
 * gebunden (Viertel = 60000/BPM ms, punktierte Achtel = 45000/BPM ms — der
 * U2-Sound)", and a warning that feedback above about 0.95 runs away. The
 * character: a digital delay is a plain line plus feedback, while an analog BBD
 * makes "jede Wiederholung dunkler und schmutziger" — modelled as a lowpass in the
 * feedback path. That lowpass is the whole difference, and it is one filter.
 *
 * WHAT IS DELIBERATELY MISSING. The same table also credits a BBD with "leichte
 * Sättigung". It is not here. A saturation inside a feedback loop is a
 * nonlinearity that sees its own output, which is the least predictable kind
 * there is, and this project's standing rule (src/synth/amp.ts, and
 * effektpedale.md §7) is that nonlinearities belong on the bus where one of them
 * sees the whole chord. The lowpass carries the character on its own.
 *
 * WHY THE TIME COMES FROM App AND NOT FROM startProgression. A single chord
 * clicked on the fretboard never passes through the transport, and it should still
 * echo in time. So audio.ts is told the tempo directly and keeps it, the same way
 * it keeps the current amplifier.
 */

import { type AmpStage, makeBiquad } from './amp';

/** Which note the echo falls on. */
export type DelayDivision = 'quarter' | 'dotted8';
export type DelayId = 'off' | DelayDivision;

export const DELAY_IDS: readonly DelayId[] = ['off', 'quarter', 'dotted8'];
export const DEFAULT_DELAY: DelayId = 'off';

/**
 * Seconds per repeat, from effektpedale.md §6: a quarter is 60000/BPM ms and a
 * dotted eighth 45000/BPM ms — which is to say three sixteenths, exactly three
 * quarters of a beat.
 *
 * Measured against the BEAT and not against the rhythm grid. A shuffle displaces
 * the offbeat (see slotTime in src/theory/rhythm.ts) and that is the strumming
 * hand's business; an echo is a fixed distance behind whatever it repeats.
 */
export function delaySeconds(bpm: number, division: DelayDivision): number {
  return (division === 'quarter' ? 60 : 45) / bpm;
}

/**
 * How long a line the DelayNode gets.
 *
 * At MIN_BPM a quarter is 1.5 s, so two seconds covers the transport with room
 * over. This is not a comfort margin: `delayTime` is CLAMPED to `maxDelayTime`
 * without a warning of any kind, so a slower minimum tempo would quietly detune
 * the echo from the music instead of failing. delay.test.ts checks the two limits
 * against each other for exactly that reason.
 */
export const MAX_DELAY_SECONDS = 2;

/** Three audible repeats — 0.35³ is −27 dB — and nowhere near the 0.95 runaway. */
export const DELAY_FEEDBACK = 0.35;

/** The lowpass in the feedback path: what makes this an analog delay and not a digital one. */
export const DELAY_DAMPING: AmpStage = { frequency: 3000, q: 0.707 };

/** Send level when the delay is on. */
export const DELAY_MIX = 0.3;

/**
 * The wet signal only, as plain arithmetic — the reference the tests measure.
 *
 * Wet only, because that is what the graph does: the echoes are a send, and the
 * dry path never passes through here. "Off is transparent" is therefore a fact
 * about the wiring (a send at gain 0 emits zeros, and adding zero is exact), not
 * something a renderer could show.
 *
 * One thing it does not model: Web Audio inserts a 128-sample render quantum into
 * any cycle, so each lap in the browser runs 2.7 ms late at 48 kHz. That is below
 * the ear and above zero — if someone one day measures the browser against this
 * and finds three milliseconds, this is the reason and not a bug.
 */
export function renderDelay(
  input: Float64Array,
  sampleRate: number,
  seconds: number,
  feedback: number = DELAY_FEEDBACK,
  damping: AmpStage = DELAY_DAMPING,
): Float64Array {
  const taps = Math.max(1, Math.round(seconds * sampleRate));
  const line = new Float64Array(taps);
  const damp = makeBiquad('lowpass', sampleRate, damping);
  const out = new Float64Array(input.length);

  let write = 0;
  for (let n = 0; n < input.length; n++) {
    // Read the oldest sample, darken it, and that is both the output and what goes
    // round again — one filter in the loop, so repeat n has been through it n times.
    const heard = damp(line[write]);
    out[n] = heard;
    line[write] = input[n] + heard * feedback;
    write = (write + 1) % taps;
  }

  return out;
}
