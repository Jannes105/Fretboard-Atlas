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

export type StageKind = 'lowpass' | 'highpass' | 'peaking' | 'lowshelf' | 'highshelf';

/**
 * A textbook Q as the Web Audio API wants it for this filter type. Measured
 * against `getFrequencyResponse` in Chrome, and exact to 0.0000 dB:
 *
 * - `lowpass` / `highpass` — Q is in DECIBELS. `Q.value = 1` is a pole Q of
 *   1.122, not 1. This is the one that silently ruins a filter table.
 * - `peaking` — Q is a real Q, passed through.
 * - `lowshelf` / `highshelf` — Q is IGNORED entirely; the spec fixes the slope at
 *   S = 1. Returned unchanged so the caller need not special-case it.
 */
export function webAudioQ(kind: StageKind, q: number): number {
  return kind === 'lowpass' || kind === 'highpass' ? 20 * Math.log10(q) : q;
}

/**
 * Every number one amplifier is made of.
 *
 * The order they are applied in is the order of a real rig: tighten the bass,
 * drive the valve, block the DC it makes, then the speaker.
 *
 * The field comments below explain what each number DOES and what goes wrong when
 * it is set carelessly; they were written for the crunch amp, which is the one
 * that was tuned by measurement, and they hold for every entry in AMPS.
 */
export interface AmpSpec {
  readonly tight: AmpStage;
  readonly preGain: number;
  readonly drive: number;
  readonly bias: number;
  readonly block: AmpStage;
  readonly cab: readonly [AmpStage, AmpStage];
  readonly presence: AmpStage;
  readonly body: AmpStage;
  readonly makeup: number;
}

const BRITISH_CRUNCH = {
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
   * `drive`.
   *
   * How far past decides how long the dirt LASTS, which turned out to matter as
   * much as how much of it there is. A chord decays, and with it the drive into
   * the curve, so at 6 the sound was distorted at the pick and clean a second
   * later — measured as intermodulation off the chord's own harmonics, 4.1 %
   * falling to 0.8 %. At 16 it is 10.3 % falling to 4.4 %, and the note holds
   * 4.2 dB of its opening level instead of 8.5 dB below it. That sustain is the
   * amplifier, not the guitar.
   *
   * What stops it going further is not the bass — the shelf above keeps
   * intermodulation below the low E at 0.02 % of the signal even here — but that
   * a chord has to stay readable on a fretboard trainer. At 16, 91.6 % of the
   * energy still sits on a harmonic of a note actually being played.
   */
  preGain: 16,

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
   * dirtier, and here that is 26.4 dB of it. The reference below disagreed by
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
   *
   * Was 0.0478 until two things moved it — see the note on AMPS below, which is
   * where that story belongs because both of them moved all four numbers.
   */
  makeup: 0.0498,
} satisfies AmpSpec;

/**
 * The four amplifiers, as the four axes that actually tell them apart: how hard
 * the valve is driven, how much weight is taken out before it, where the speaker
 * stops, and how much presence is given back. docs/verstaerker.md §6 has the
 * reasoning and the sources.
 *
 * `british-crunch` is the amp this app has always had. Every number that shapes it
 * is unchanged down to the last decimal — so switching to it is still switching to
 * nothing in tone. Only its `makeup` moved, and only because the rig that had set
 * it was measuring at the wrong level; see the note below.
 *
 * EVERY `makeup` HERE IS MEASURED, NOT ESTIMATED, and the note on the field above
 * says why it cannot be otherwise: model and recording drive the curve differently
 * enough that the arithmetic reference is the right tool for shape and the wrong
 * one for level. scripts/measure-makeup.html renders each of these through the
 * real graph in an OfflineAudioContext with the real recordings and prints what
 * belongs here. Re-run it after touching preGain, drive, bias or any filter — an
 * amplifier turned up is louder as well as dirtier, and a table that changes the
 * volume when you audition it teaches the wrong thing.
 *
 * Estimating them first and measuring afterwards showed what the guessing was
 * worth: 6.2 dB out on the clean amp, 4.4 on the chime, 2.1 on the high gain.
 *
 * ALL FOUR MOVED ONCE MORE, AND THE REASON IS THE ONE WARNING WORTH READING HERE.
 * The page used to re-declare audio.ts's `voicePeak` "in spirit", with an exponent
 * of 0.7 against the 0.65 the app actually uses. At six voices that is 0.82 dB, so
 * the rig had been auditioning every amplifier at a level the app never plays at.
 * A level trim measured at the wrong level is simply wrong, and not by a constant:
 * the valve compresses, so the error grew with the drive — 0.20 dB on the clean
 * amp, 0.43 on the chime, 0.57 on the crunch, 0.66 on the high gain. The page now
 * imports voicePeak instead of restating it, which is the only fix that cannot
 * drift again.
 *
 * This also retires a claim that used to stand here: that the rig was validated by
 * returning 0.0477 for the crunch amp's independently measured 0.0478. It was not.
 * Both of those numbers came from the same wrong level, and two errors agreeing is
 * not a measurement agreeing. What validates the rig now is that it is built from
 * the app's own exports rather than from copies of them.
 *
 * The second move was smaller and is worth separating from the first: the clean
 * voice, which is the REFERENCE all four are ratios against, lost the +2 dB it
 * used to carry at 2600 Hz. That lift was a pickup's, and it now lives in
 * src/synth/pickup.ts where it can be chosen instead of being wired in — so the
 * default guitar is the recording, unshaped. It made the reference 0.22 dB
 * quieter and every makeup the same 0.22 dB with it.
 *
 * What did NOT move is the useful part of that measurement: the raw output of all
 * four amplifiers came back identical to the last digit with the pickup and the
 * tone stack in the graph. Both blocks really are wires at their defaults, in a
 * browser and not only in the arithmetic — which is the whole reason those two
 * features cost no re-measurement of their own.
 */
export const AMPS = {
  /**
   * A blackface Fender: a lot of headroom, a speaker that stays bright, and only
   * as much bass tightening as a 6V6 needs — which is very little. It is the one
   * that has to still be clean under a full chord.
   */
  'american-clean': {
    tight: { frequency: 180, q: 0.707, gain: -3 },
    preGain: 3,
    drive: 3.5,
    bias: 0.02,
    block: { frequency: 80, q: 0.707 },
    cab: [
      { frequency: 5000, q: 0.5412 },
      { frequency: 5000, q: 1.30656 },
    ],
    presence: { frequency: 3000, q: 1.0, gain: 2 },
    body: { frequency: 160, q: 0.707, gain: 2.5 },
    makeup: 0.1296,
  },

  /**
   * An AC30: cathode-biased EL84s and no negative feedback at all, which is the
   * source of both its chime and its early, soft breakup. The higher bias is that
   * missing feedback — nothing is straightening the curve out, so more of the
   * even-harmonic warmth survives.
   */
  'british-chime': {
    tight: { frequency: 180, q: 0.707, gain: -5 },
    preGain: 7,
    drive: 5,
    bias: 0.03,
    block: { frequency: 90, q: 0.707 },
    cab: [
      { frequency: 4500, q: 0.5412 },
      { frequency: 4500, q: 1.30656 },
    ],
    presence: { frequency: 2600, q: 1.2, gain: 5.5 },
    body: { frequency: 170, q: 0.707, gain: 2 },
    makeup: 0.0701,
  },

  'british-crunch': BRITISH_CRUNCH,

  /**
   * A rectifier: the bass shelf does the work here. Twenty-six into the curve
   * would be mush without taking eleven decibels out below 190 Hz first — that
   * shelf is not a tone control at this gain, it is what keeps the low string from
   * swinging the valve on its own.
   */
  'modern-high-gain': {
    tight: { frequency: 190, q: 0.707, gain: -11 },
    preGain: 26,
    drive: 7,
    bias: 0.015,
    block: { frequency: 90, q: 0.707 },
    cab: [
      { frequency: 3800, q: 0.5412 },
      { frequency: 3800, q: 1.30656 },
    ],
    presence: { frequency: 2900, q: 1.2, gain: 5 },
    body: { frequency: 150, q: 0.707, gain: 4 },
    makeup: 0.0445,
  },
} as const satisfies Record<string, AmpSpec>;

export type AmpId = keyof typeof AMPS;

export const AMP_IDS = Object.keys(AMPS) as readonly AmpId[];

/** What plays when no amplifier is named — the sound the app has always made. */
export const DEFAULT_AMP: AmpId = 'british-crunch';

/**
 * The default amplifier's numbers.
 *
 * Kept as a name of its own because most of this file and its tests are about one
 * amplifier at a time, and `AMPS[DEFAULT_AMP]` at every call site would say less.
 */
export const AMP: AmpSpec = AMPS[DEFAULT_AMP];

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

  if (kind === 'lowshelf' || kind === 'highshelf') {
    // The spec fixes the shelf slope at S = 1 and ignores Q, which works out to
    // exactly this alpha. Verified against getFrequencyResponse.
    const alpha = (sin / 2) * Math.SQRT2;
    const shelf = 2 * Math.sqrt(A) * alpha;
    // The two shelves are the same six expressions with the sign of the cosine
    // term flipped — which is the algebra of reflecting the response about
    // Nyquist, and the reason this is one branch and not two. `lowshelf` was
    // checked against getFrequencyResponse by hand; `highshelf` inherits that
    // check through the sign, and amp.test.ts pins it down independently with
    // the property that a shelf is at exactly half its dB gain on the corner.
    const lean = kind === 'lowshelf' ? 1 : -1;
    b0 = A * (A + 1 - lean * (A - 1) * cos + shelf);
    b1 = 2 * lean * A * (A - 1 - lean * (A + 1) * cos);
    b2 = A * (A + 1 - lean * (A - 1) * cos - shelf);
    a0 = A + 1 + lean * (A - 1) * cos + shelf;
    a1 = -2 * lean * (A - 1 + lean * (A + 1) * cos);
    a2 = A + 1 + lean * (A - 1) * cos - shelf;
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
 * One biquad, direct form I, as a running function of one sample at a time.
 *
 * The Web Audio spec prescribes the RBJ cookbook coefficients for
 * BiquadFilterNode, so this is not a model of that node — it is the same
 * arithmetic, and a measurement here holds for the browser.
 *
 * Sample by sample rather than array in, array out, because a feedback loop
 * cannot be written the other way: the delay in src/synth/delay.ts has to filter
 * a sample it is about to compute from. `biquad` below is the array form, and it
 * is this function, so the two cannot drift.
 */
export function makeBiquad(
  kind: StageKind,
  sampleRate: number,
  stage: AmpStage,
): (x: number) => number {
  const [b0, b1, b2, a1, a2] = coefficients(kind, sampleRate, stage);

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  return (x0) => {
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    return y0;
  };
}

/** One biquad over a whole signal. */
export function biquad(
  kind: StageKind,
  input: Float64Array,
  sampleRate: number,
  stage: AmpStage,
): Float64Array {
  const step = makeBiquad(kind, sampleRate, stage);
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = step(input[i]);
  return out;
}

/** Everything before the valve — what the shaper's clamped domain actually sees. */
export function ampInput(
  input: Float64Array,
  sampleRate: number,
  spec: AmpSpec = AMP,
): Float64Array {
  const tightened = biquad('lowshelf', input, sampleRate, spec.tight);
  const out = new Float64Array(tightened.length);
  for (let i = 0; i < tightened.length; i++) out[i] = tightened[i] * spec.preGain;
  return out;
}

/** Everything after the valve: the DC block, the speaker, and the level trim. */
export function ampOutput(
  input: Float64Array,
  sampleRate: number,
  spec: AmpSpec = AMP,
): Float64Array {
  let signal = biquad('highpass', input, sampleRate, spec.block);
  signal = biquad('lowpass', signal, sampleRate, spec.cab[0]);
  signal = biquad('lowpass', signal, sampleRate, spec.cab[1]);
  signal = biquad('peaking', signal, sampleRate, spec.presence);
  signal = biquad('lowshelf', signal, sampleRate, spec.body);

  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] * spec.makeup;
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
export function renderAmp(
  input: Float64Array,
  sampleRate: number,
  spec: AmpSpec = AMP,
): Float64Array {
  const driven = ampInput(input, sampleRate, spec);
  const shaped = new Float64Array(driven.length);
  // The clamp is the WaveShaper's own behaviour, not a safety measure: outside
  // [-1, 1] it repeats the end of the curve. Modelling it is what makes the
  // "under 2 % of samples reach the edge" test meaningful.
  for (let i = 0; i < driven.length; i++) {
    shaped[i] = ampShape(Math.max(-1, Math.min(1, driven[i])), spec.drive, spec.bias);
  }
  return ampOutput(shaped, sampleRate, spec);
}
