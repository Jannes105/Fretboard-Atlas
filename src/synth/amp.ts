/**
 * The amplifier: a valve stage and a speaker cabinet, as numbers.
 *
 * This exists because of a mistake that took three rounds to understand. The
 * overdrive was once a WaveShaper on every note, and it never sounded like an
 * amplifier for two structural reasons — a shaper per note distorts each string
 * separately where an amplifier distorts the sum of all six, and there was no
 * speaker to tame the fizz above 5 kHz. Replacing it with a pre-distorted
 * recording fixed the speaker and NOT the sum: six separately distorted
 * recordings added together are still six separately distorted strings. What
 * makes a chord read as one thick voice rather than six fuzzy notes is the
 * intermodulation between the strings, and that can only happen if one
 * nonlinearity sees all of them at once. amp.test.ts measures exactly that.
 *
 * Everything lives here rather than in audio.ts because audio.ts cannot be
 * tested — there is no AudioContext in node and none in jsdom. So the chain is
 * written twice: once as Web Audio nodes over in audio.ts, and once here as
 * plain arithmetic that the tests can measure. The two are held together by
 * AMP, which both read, and by biquad() being the transfer function the Web
 * Audio spec *mandates* for BiquadFilterNode — a faithful reference rather than
 * an approximation.
 */

/** One biquad's settings, in the terms a BiquadFilterNode takes them. */
export interface AmpStage {
  readonly frequency: number;
  /**
   * The textbook Q — the resonance of the pole pair.
   *
   * NOT what you hand a BiquadFilterNode for every type: run it through
   * `webAudioQ` first. Kept textbook here because these numbers are chosen from
   * filter tables, and a table value bent for one API's convention is a number
   * nobody can check.
   */
  readonly q: number;
  /** Decibels, for peaking and shelving stages only. */
  readonly gain?: number;
}

export type StageKind = 'lowpass' | 'highpass' | 'peaking' | 'lowshelf';

/**
 * A textbook Q as the Web Audio API wants it for this filter type. Measured
 * against `getFrequencyResponse` in Chrome, and exact to 0.0000 dB:
 *
 * - `lowpass` / `highpass` — Q is in DECIBELS. `Q.value = 1` is a pole Q of
 *   1.122, not 1. This is the one that silently ruins a filter table.
 * - `peaking` — Q is a real Q, passed through.
 * - `lowshelf` — Q is IGNORED entirely; the spec fixes the slope at S = 1.
 *   Returned unchanged so the caller need not special-case it.
 */
export function webAudioQ(kind: StageKind, q: number): number {
  return kind === 'lowpass' || kind === 'highpass' ? 20 * Math.log10(q) : q;
}

/**
 * Every number the amplifier is made of.
 *
 * The order they are applied in is the order of a real rig: tighten the bass,
 * drive the valve, block the DC it makes, then the speaker.
 */
export const AMP = {
  /**
   * The tight-bass filter every high-gain amplifier has in front of its gain
   * stage, and the single biggest reason chords used to turn to mush: without
   * it the low E swings the valve on its own and everything above it
   * intermodulates with that swing rather than with the chord.
   *
   * A shelf and not a highpass. A 12 dB/oct highpass at 150 Hz is already 14 dB
   * down at the low E's 82 Hz — that does not tighten the bass string, it
   * deletes it. A shelf takes the weight out and leaves the note.
   */
  tight: { frequency: 180, q: 0.707, gain: -8 } satisfies AmpStage,

  /**
   * Level into the shaper, and the number that decides whether this is an
   * amplifier at all.
   *
   * It was 1.75 first, sized so the loudest PEAK of a chord landed near the top
   * of the shaper's domain. That was the wrong question, and the answer was
   * inaudible: a strummed chord measures 20 dB of crest factor, so peak-aligned
   * meant the sustained part of it sat at an RMS of 0.053, where this curve
   * still has 96 % of its small-signal slope. Only the pick attacks bent at all,
   * for a few milliseconds each. Clean and overdrive sounded the same because
   * they very nearly were the same.
   *
   * An amplifier is driven so its SUSTAIN saturates and its peaks get flattened;
   * that flattening is what overdrive is. So this is sized from the RMS, and the
   * peaks now run past the shaper's edge — where the curve is already flat, see
   * `drive`. Measured on the real recordings: a six-string chord goes from 7 %
   * nonlinear content to 48 %, and its crest factor from 20 dB to about 7 dB.
   */
  preGain: 6,

  /**
   * Steepness of the valve's curve — where the saturation comes from, rather
   * than from running out of domain.
   *
   * A WaveShaperNode clamps its input to [-1, 1] *before* it looks anything up
   * in the curve, so a signal outside that is hard-clipped at the last entry of
   * the table rather than shaped. The overdrive removed in 0662993 ran at 2.4
   * and was, for most of every note, exactly that: a hard clipper wearing a
   * tanh's name, with a discontinuous derivative. It is the third reason it
   * failed that nobody wrote down.
   *
   * Driving this hard makes the curve dead flat well before the edge — at 0.999
   * its slope is a few hundred-thousandths of the small-signal slope — so the
   * clamp lands on a part that was already horizontal and adds no corner. The
   * fix for clipping was never less level; it was a curve that has finished
   * bending by the time the level gets there. amp.test.ts measures that slope.
   */
  drive: 6,
  /**
   * How far the curve sits off centre. A valve is biased, so it compresses one
   * half of the wave harder than the other, and that asymmetry is where the
   * even harmonics — the warmth — come from. `bias: 0` is a clean symmetric
   * tanh with no second harmonic at all; amp.test.ts asserts both.
   *
   * It has to be read against `drive`, because what matters is the offset in the
   * curve's own steepness. It was 0.05 when the drive was 2.2 and the two ends
   * of the curve then sat 1.9 dB apart. Left there at a drive of 6 they would
   * sit 5.2 dB apart, which is not warmth but a lopsided, gated-sounding wave.
   */
  bias: 0.02,

  /**
   * Mandatory, not decorative. An asymmetric curve has a non-zero mean for a
   * zero-mean input, so every note onset would push a DC step at the output:
   * an audible thump and stolen headroom at the ceiling. It also removes the
   * difference tones *below* the lowest fundamental — 330 Hz against 247 Hz
   * makes 83 Hz, which is mud no speaker filter reaches — and doubles as the
   * low end of a closed-back cabinet.
   */
  block: { frequency: 85, q: 0.707 } satisfies AmpStage,

  /**
   * The speaker. Two poles of a 4th-order Butterworth, so together they are
   * -24 dB/oct with a flat passband — what a 12" guitar speaker does, and what
   * the single 12 dB/oct lowpass of the old overdrive could not do.
   *
   * These are the textbook Butterworth pole Qs, NOT 0.707 twice: two sections
   * at 0.707 land 6 dB down at the corner and sag through the top octave.
   */
  cab: [
    { frequency: 4200, q: 0.54120 },
    { frequency: 4200, q: 1.30656 },
  ] as const satisfies readonly [AmpStage, AmpStage],

  /** The presence hump that lets an overdriven guitar cut without fizzing. */
  presence: { frequency: 2800, q: 1.1, gain: 4.5 } satisfies AmpStage,
  /** Gives back after the distortion some of the weight `tight` took before it. */
  body: { frequency: 160, q: 0.707, gain: 3.5 } satisfies AmpStage,

  /**
   * Loudness trim, so switching to the overdrive changes the sound and not the
   * volume. Measured, not set by ear — but measured in a browser, on the real
   * recordings, and that distinction turned out to matter.
   *
   * An OfflineAudioContext rendering an open E major from the actual mp3s
   * through the actual graph is what set it, and it has to be re-measured after
   * any change to preGain or drive — an amplifier turned up is louder as well as
   * dirtier, and here that is 13.3 dB of it. The reference below disagreed by
   * 2.3 dB even before that, and the reason is worth keeping:
   *
   * The gap is not the reference being sloppy, and it is worth knowing because
   * it will reappear for anyone who retunes this: pluck() and a recorded guitar
   * do not drive a curve the same way. Over the same stretch of sustain, at the
   * same peak level, the model's crest factor is 7.95 dB and the recording's is
   * 13.02 dB. Five decibels quieter for the same peak means the recording spends
   * far more of its time in the straight part of the curve and is compressed
   * much less — so it comes out louder, from the same amplifier. Saturation
   * widens that gap rather than narrowing it: at the drive above the two now
   * disagree by 6.6 dB, where at a drive of 2.2 they disagreed by 2.3.
   *
   * Which makes the reference the right tool for shape and the wrong one for
   * level: it can show that the curve intermodulates, that the cabinet slopes at
   * 24 dB per octave and that the signal stays inside the shaper, and it cannot
   * set this. amp.test.ts asserts only a sane range for it, and says so.
   */
  makeup: 0.067,
};

/**
 * The valve's transfer curve. Zero in gives exactly zero out, and the larger
 * excursion of the two reaches exactly 1 — the smaller one stops short, and
 * that shortfall IS the asymmetry.
 */
export function ampShape(x: number, drive = AMP.drive, bias = AMP.bias): number {
  const offset = Math.tanh(drive * bias);
  const raw = (v: number) => Math.tanh(drive * (v + bias)) - offset;
  // Normalising by the larger end keeps the curve inside [-1, 1] whichever way
  // the bias leans, and keeps f(0) = 0 exactly, which is what stops the amp
  // emitting DC into silence.
  const span = Math.max(Math.abs(raw(1)), Math.abs(raw(-1)));
  return raw(x) / span;
}

/** The five normalised coefficients of one RBJ biquad: b0, b1, b2, a1, a2. */
function coefficients(
  kind: StageKind,
  sampleRate: number,
  stage: AmpStage,
): [number, number, number, number, number] {
  const w0 = (2 * Math.PI * stage.frequency) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, (stage.gain ?? 0) / 40);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  if (kind === 'lowshelf') {
    // The spec fixes the shelf slope at S = 1 and ignores Q, which works out to
    // exactly this alpha. Verified against getFrequencyResponse.
    const alpha = (sin / 2) * Math.SQRT2;
    const shelf = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cos + shelf);
    b1 = 2 * A * (A - 1 - (A + 1) * cos);
    b2 = A * (A + 1 - (A - 1) * cos - shelf);
    a0 = A + 1 + (A - 1) * cos + shelf;
    a1 = -2 * (A - 1 + (A + 1) * cos);
    a2 = A + 1 + (A - 1) * cos - shelf;
  } else {
    const alpha = sin / (2 * stage.q);
    if (kind === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else if (kind === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else {
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
    }
  }

  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/**
 * One biquad, direct form I.
 *
 * The Web Audio spec prescribes the RBJ cookbook coefficients for
 * BiquadFilterNode, so this is not a model of that node — it is the same
 * arithmetic, and a measurement here holds for the browser.
 */
export function biquad(
  kind: StageKind,
  input: Float64Array,
  sampleRate: number,
  stage: AmpStage,
): Float64Array {
  const [b0, b1, b2, a1, a2] = coefficients(kind, sampleRate, stage);
  const out = new Float64Array(input.length);

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return out;
}

/** Everything before the valve — what the shaper's clamped domain actually sees. */
export function ampInput(input: Float64Array, sampleRate: number): Float64Array {
  const tightened = biquad('lowshelf', input, sampleRate, AMP.tight);
  const out = new Float64Array(tightened.length);
  for (let i = 0; i < tightened.length; i++) out[i] = tightened[i] * AMP.preGain;
  return out;
}

/** Everything after the valve: the DC block, the speaker, and the level trim. */
export function ampOutput(input: Float64Array, sampleRate: number): Float64Array {
  let signal = biquad('highpass', input, sampleRate, AMP.block);
  signal = biquad('lowpass', signal, sampleRate, AMP.cab[0]);
  signal = biquad('lowpass', signal, sampleRate, AMP.cab[1]);
  signal = biquad('peaking', signal, sampleRate, AMP.presence);
  signal = biquad('lowshelf', signal, sampleRate, AMP.body);

  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] * AMP.makeup;
  return out;
}

/**
 * The whole amplifier as plain arithmetic — the reference the tests measure and
 * the makeup gain is derived from.
 *
 * One thing it deliberately does not model: the real shaper runs at `4x`
 * oversampling, which suppresses the aliasing this straight per-sample pass
 * produces. That makes this reference slightly HARSHER than the browser, never
 * gentler, so a level measured here is a safe one.
 */
export function renderAmp(input: Float64Array, sampleRate: number): Float64Array {
  const driven = ampInput(input, sampleRate);
  const shaped = new Float64Array(driven.length);
  // The clamp is the WaveShaper's own behaviour, not a safety measure: outside
  // [-1, 1] it repeats the end of the curve. Modelling it is what makes the
  // "under 2 % of samples reach the edge" test meaningful.
  for (let i = 0; i < driven.length; i++) {
    shaped[i] = ampShape(Math.max(-1, Math.min(1, driven[i])));
  }
  return ampOutput(shaped, sampleRate);
}
