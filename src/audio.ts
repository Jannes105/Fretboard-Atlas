import {
  AMP,
  type AmpId,
  AMPS,
  type AmpStage,
  ampShape,
  DEFAULT_AMP,
  type StageKind,
  webAudioQ,
} from './synth/amp';
import {
  DEFAULT_DELAY,
  DELAY_DAMPING,
  DELAY_FEEDBACK,
  type DelayId,
  DELAY_MIX,
  delaySeconds,
  MAX_DELAY_SECONDS,
} from './synth/delay';
import { findLoop, type LoopRegion, renderSustain } from './synth/loopPoints';
import { DEFAULT_PICKUP, type PickupId, PICKUPS } from './synth/pickup';
import { pluck, type PluckOptions } from './synth/pluck';
import {
  CHANNEL_SEEDS,
  DEFAULT_REVERB,
  impulseResponse,
  type ReverbId,
  REVERBS,
  seeded,
} from './synth/reverb';
import { sampleFor, type SampleSet } from './synth/sampleSet';
import {
  NEUTRAL_TONE,
  STACK_KINDS,
  stackStages,
  type ToneGains,
} from './synth/toneStack';
import {
  arpeggioStringCount,
  type ClickMode,
  clickTimes,
  countInBars,
  dropHighest,
  holdDecaySeconds,
  midiToFrequency,
  slotTime,
  type SwingFeel,
  STANDARD_STRUM_GAP,
  type StrumSlot,
  strumOffsets,
  noteSeconds,
  type NoteLength,
  SOFT_RELEASE,
  type StrumStyle,
} from './theory';

/**
 * A thin wrapper over the Web Audio API — the one place in the app that makes
 * sound. Which notes to play is computed in src/theory/pitch.ts and which recording
 * carries a note in src/synth/sampleSet.ts; this file only wires those together and
 * handles timing.
 *
 * The notes themselves are recordings of a real guitar (public/samples, built by
 * scripts/build-samples.mjs from the CC0 Karoryfer Shinyguitar library). Three
 * attempts at synthesising them came first, and each one measured better than the
 * last while still not sounding like a guitar. src/synth/pluck.ts is what survives
 * of that, kept as the fallback for when the recordings have not arrived.
 *
 * Web Audio is built into the browser. If it is somehow missing, every method is a
 * harmless no-op.
 */

export type PlayMode = 'sequence' | 'strum';

/**
 * The instrument's voice.
 *
 * - `clean` — Karoryfer Shinyguitar, an archtop through its magnetic pickup.
 * - `electric` — the same recording through the amplifier in src/synth/amp.ts.
 *
 * The overdrive has been rebuilt twice, and the two failures are the reason it is
 * shaped the way it is now.
 *
 * It began as a WaveShaper on every note, and three rounds of tuning never made it
 * sound like an amplifier. Two structural reasons: a shaper per note distorts each
 * string separately where an amplifier distorts the sum of all six, and there was no
 * speaker cabinet to tame the fizz above 5 kHz. (A third, found only later: it drove
 * the shaper to 2.4 on a domain that clamps at 1, so it was a hard clipper wearing a
 * tanh's name. See AMP.preGain.)
 *
 * Moving the distortion into a recording (FreePats EGuitarFSBS, a Fender recorded
 * through a real amplifier and effects rack) fixed the cabinet and NOT the sum — six
 * separately distorted recordings added together are still six separately distorted
 * strings, which is why chords stayed muddy. So the distortion is back in the graph,
 * but now on the BUS, where one stage sees every string at once. That recording had a
 * turn as a third voice, `recorded`, to compare the two side by side; once the bus
 * version held up it was retired rather than kept as a permanent third option — a
 * choice that exists only to be compared against the thing it replaced is not one a
 * player needs. It falls back to `clean`, so old links keep working.
 *
 * A fourth voice, `soft`, was the microphone take of the same archtop as `clean`. It
 * measured 6.7 dB away across third-octave bands and still did not sound like a
 * second instrument — because it was not one. It also falls back to `clean`.
 */
export type Timbre = 'clean' | 'electric';

/**
 * How each voice is put together.
 *
 * There is no tone shaping here any more. It used to hold one gentle resonance for
 * `clean` and nothing at all for `electric`, and both of those jobs now belong
 * somewhere better: the resonance was a pickup's, and it lives in
 * src/synth/pickup.ts where it can be chosen; the voicing `electric` gets instead
 * comes from the amplifier it is about to go through.
 */
const VOICES: Record<
  Timbre,
  {
    /** Which recorded set feeds it, keyed as in public/samples/manifest.json. */
    readonly recording: 'electric';
    /** Loudness trim, measured — not set by ear. */
    readonly gain: number;
    /** Whether the sum goes through the amplifier in src/synth/amp.ts. */
    readonly amp: boolean;
  }
> = {
  clean: {
    recording: 'electric',
    gain: 1,
    amp: false,
  },
  electric: {
    // The CLEAN recording — feeding a pre-distorted one into a second amplifier is
    // just mud, and the whole point is that the distortion happens after the sum.
    recording: 'electric',
    // Full level: the amplifier's own trim, AMP.makeup, is what balances this voice
    // against the others, and it was measured against exactly this input.
    gain: 1,
    amp: true,
  },
};

/**
 * Fallback string settings, used only until the recordings finish loading or if they
 * fail outright.
 */
const STRINGS: Record<Timbre, Omit<PluckOptions, 'random'>> = {
  clean: { damping: 0.08, pickPosition: 0.19, pickNoise: 0.07, sustainSeconds: 6 },
  electric: { damping: 0.02, pickPosition: 0.1, pickNoise: 0.05, sustainSeconds: 8 },
};

/** How much of a fallback note is rendered; longer than anything the app holds. */
const RENDER_SECONDS = 2.4;

/**
 * How many rendered fallback strings to keep. A looping progression schedules a
 * couple of hundred plucks per pass and rendering each on the spot would stutter,
 * but only a few dozen distinct pitches are ever in play.
 */
const CACHE_LIMIT = 64;

/** Where the recordings live, relative to the app's base URL. */
const SAMPLES = 'samples';

/** A curve for a WaveShaper: `shape` sampled across inputs from -1 to 1. */
function shaperCurve(shape: (x: number) => number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  // Backed by an explicit ArrayBuffer so the type matches WaveShaperNode.curve
  // (which rejects the ArrayBufferLike a bare `new Float32Array(n)` infers).
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < samples; i++) curve[i] = shape((i / (samples - 1)) * 2 - 1);
  return curve;
}

/** Below this the safety net is a straight wire; above it, it bends. */
const CEILING_KNEE = 0.7;

/**
 * The last thing before the output: a soft ceiling.
 *
 * This replaced a DynamicsCompressor, which was the wrong tool and provably so —
 * measured over a looping progression it took the peak from 0.637 to 0.80. It was
 * *raising* the level it was meant to hold down: a 3 ms attack lets every transient
 * straight through, and the 150 ms release then pumps the level in time with the
 * strumming. That pumping is what "it distorts" actually sounded like.
 *
 * A shaper has no time constants, so it cannot pump and cannot overshoot. Below the
 * knee it is exactly a straight line — normal playing passes untouched — and above
 * it bends smoothly to a ceiling it can never cross.
 */
const CEILING_CURVE = shaperCurve((x) => {
  const magnitude = Math.abs(x);
  if (magnitude <= CEILING_KNEE) return x;
  const over = (magnitude - CEILING_KNEE) / (1 - CEILING_KNEE);
  return Math.sign(x) * (CEILING_KNEE + (1 - CEILING_KNEE) * Math.tanh(over));
});

export interface PlayOptions {
  mode?: PlayMode;
  /** Seconds between successive onsets. */
  gap?: number;
  /** How long each note rings. */
  duration?: number;
  /**
   * Let this ring alongside whatever is already sounding instead of replacing it.
   *
   * Single-shot sounds (a note, a chord) stack: you want to stack chords up and
   * hear them ring out. Timed runs (a scale, a progression) replace, because two
   * of those over each other is just mush.
   */
  stack?: boolean;
  /**
   * Fires as each note sounds, by index, and with null once the run is over —
   * this is what drives a marker along the neck.
   *
   * Only meaningful for a run that replaces (so: not stacking), because the marker
   * belongs to one run at a time.
   */
  onNote?: (index: number | null) => void;
}

const DEFAULTS: Record<PlayMode, { gap: number; duration: number }> = {
  sequence: { gap: 0.28, duration: 0.42 }, // a scale, one note after another
  strum: { gap: STANDARD_STRUM_GAP, duration: 1.9 }, // strings brushed, left to ring
};

/**
 * Seconds between notes when a chord is arpeggiated outside the transport — a click
 * on a chord card, where there is no bar to spread across.
 */
export const LOOSE_ARPEGGIO_GAP = 0.14;

/**
 * How a held note behaves once its loop has taken over.
 *
 * The recording's own decay is gone from the loop by then — src/synth/loopPoints.ts
 * flattens it, because a lap that restarts louder than it ended is a tremolo. This
 * is what goes back in its place: far slower than a real string, so a held fret is
 * actually held, but unmistakably there, so it is still a struck note and not a
 * drone. `SUSTAIN` is where it settles, as a share of where it started.
 *
 * How FAST it gets there depends on the pitch and lives in theory/rhythm.ts with
 * the other decisions about how a note ends — a low string rings far longer than
 * a high one, and giving them the same fade made the low ones sound like they
 * were sagging.
 */
const HOLD_SUSTAIN = 0.3;
/**
 * Where a held note's brightness ends up, as a multiple of its own fundamental.
 *
 * The loop hands the note a spectrum and then never changes it, so the harmonics
 * have to be taken away by hand or the note stops sounding struck. Measured on the
 * recordings: while a note dies, its spectral centroid falls by about a third — the
 * low E from 348 Hz to 225 Hz, the E above middle C from 886 Hz to 518 Hz. Tied to
 * the fundamental rather than fixed in hertz, because that fall is roughly the same
 * proportion whatever the pitch, and a fixed corner would gut a low note and leave a
 * high one untouched.
 */
const HOLD_TONE_FLOOR = 5;
/**
 * Where it starts, also as a multiple of the fundamental.
 *
 * High enough to be very nearly no filter at all: measured on the recordings, under
 * half a percent of a note's energy sits above the twentieth harmonic. That matters
 * because it means the filter can simply BE there from the first sample, at this
 * setting, rather than being opened wide and then dropped into place when the loop
 * arrives — a step in a cutoff is as audible as a step in a gain.
 */
const HOLD_TONE_OPEN = 20;
/**
 * How much faster the brightness fades than the loudness.
 *
 * On the recordings the two do not keep step: a note loses about a third of its
 * centroid inside its first second while it is still plainly loud. Sharing the
 * level's time constant outright was the first attempt and did nothing at all —
 * starting from wide open, the cutoff was still above 13 kHz after six seconds.
 */
const HOLD_TONE_SHARE = 0.25;
/** How long the other held notes take to step aside when one more joins them. */
const HOLD_ADJUST = 0.025;
/**
 * The longest a note may be held. A looping buffer has no end of its own, so this
 * is the only thing standing between a lost pointerup and a note that never stops.
 */
const MAX_HOLD = 30;

/** The click track: a fifth apart so the downbeat is tellable, and very short. */
const CLICK_HZ = 1000;
const CLICK_ACCENT_HZ = 1500;
const CLICK_SECONDS = 0.045;
const CLICK_PEAK = 0.3;

/** Amplitude of a note sounding on its own. */
const PEAK = 0.55;

/**
 * How loud each voice may be when `simultaneous` of them ring together.
 *
 * Without this every voice was equally loud, so a lone note sat six times below a
 * six-string chord, and a chord spanning the whole neck summed past 1.0 and clipped.
 *
 * The exponent sits between the two honest extremes. Loudness follows the square
 * root of the voice count when the voices are unrelated, and that is fair enough
 * once a chord is ringing — but the *attacks* of one strum land within a few
 * milliseconds of each other and add much more directly than that. Leaning past 0.5
 * buys headroom exactly where the peaks are, at the cost of a chord sitting a shade
 * below a single note.
 *
 * It also keeps the level arriving at the amplifier's shaper nearly constant
 * across every voicing, which is what makes ONE measured makeup gain valid for
 * all of them — so exported for src/synth/amp.test.ts to measure against.
 */
export function voicePeak(simultaneous: number): number {
  return PEAK / Math.pow(Math.max(1, simultaneous), 0.65);
}

export interface ProgressionOptions {
  /** How long one bar lasts — beatsPerBar beats at the current tempo. */
  secondsPerBar: number;
  /** Beats per bar, so the bar can be divided into the strum grid. */
  beatsPerBar: number;
  /** The strum pattern for one bar (eighth-note grid), repeated under each chord. */
  pattern: readonly StrumSlot[];
  /** Bars each chord is held; defaults to one bar each. Aligned with `chords`. */
  chordBars?: readonly number[];
  loop?: boolean;
  /** Brushed together, or walked across the whole bar. */
  style?: StrumStyle;
  /** Straight eighths, or a shuffle. Ignored by an arpeggio, which has no slots. */
  feel?: SwingFeel;
  /** Left to ring on, or cut off after each strum. */
  length?: NoteLength;
  /** Count-in only, a click throughout, or neither. */
  click?: ClickMode;
  /** Fires as each chord starts, and with null when playback ends — drives the marker. */
  onChord?: (index: number | null) => void;
}

/** Lets the caller stop a progression it started. */
export interface ProgressionHandle {
  stop(): void;
}

/** Lets the caller end a note it is holding down. Safe to call more than once. */
export interface NoteHandle {
  /**
   * @param fade Seconds to fade over. The default is a note let go of; pass
   *   HARD_RELEASE where the finger was taken away rather than lifted — a swipe
   *   across the neck should leave a click, not a note.
   */
  release(fade?: number): void;
}

export interface AudioPlayer {
  /** Play a list of MIDI notes. Cancels whatever was playing first, unless stacking. */
  play(midiNotes: readonly number[], options?: PlayOptions): void;
  /**
   * Sound a single note for as long as it is held, WITHOUT cancelling anything
   * already ringing — so several fingers on the neck stack into a chord.
   *
   * The caller owns the finger and must release the handle. Nothing else ends the
   * note except a global stop() or MAX_HOLD.
   */
  holdNote(midi: number): NoteHandle;
  /** Play chords in tempo, optionally looping. Replaces any current playback. */
  startProgression(
    chords: readonly (readonly number[])[],
    options: ProgressionOptions,
  ): ProgressionHandle;
  /** Silence everything immediately, including a running progression. */
  stop(): void;
  /** Switch the voice. Takes effect on the next note; no AudioContext is created. */
  setTimbre(timbre: Timbre): void;
  /**
   * Switch the amplifier the `electric` voice runs through. Silent under `clean`,
   * which never reaches it. No AudioContext is created.
   */
  setAmp(amp: AmpId): void;
  /** Switch the pickup. Applies to both voices — it is the guitar, not the amp. */
  setPickup(pickup: PickupId): void;
  /** Bass, Mitten, Höhen, in decibels. Zero is a wire. */
  setTone(gains: ToneGains): void;
  /** Which room, or none. */
  setReverb(reverb: ReverbId): void;
  /** Which note the echo falls on, or none. */
  setDelay(delay: DelayId): void;
  /**
   * The tempo the delay divides.
   *
   * Told to the player directly rather than derived inside startProgression: a
   * single chord clicked on the neck never passes through the transport, and it
   * should still echo in time with everything else.
   */
  setTempo(bpm: number): void;
  /** Whether this browser can make sound at all. */
  readonly available: boolean;
}

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  // Older Safari only exposes the webkit-prefixed constructor.
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const NO_OP_HANDLE: ProgressionHandle = { stop: () => {} };
const NO_OP_NOTE: NoteHandle = { release: () => {} };

/** Which recordings exist. Static data, so it is shared rather than per player. */
let manifest: Record<string, SampleSet> | null = null;
let downloaded: Promise<Map<string, ArrayBuffer>> | null = null;

/**
 * Pulls the recordings down, once per page.
 *
 * Worth calling as soon as the app has rendered: a fetch needs no AudioContext and
 * no user gesture, so the ~380 KB can be on its way long before anyone clicks a
 * chord. Decoding still waits for the first gesture, because that needs a context.
 */
export function prefetchSamples(): Promise<Map<string, ArrayBuffer>> {
  downloaded ??= (async () => {
    const bytes = new Map<string, ArrayBuffer>();
    const base = `${import.meta.env.BASE_URL}${SAMPLES}`;

    const response = await fetch(`${base}/manifest.json`);
    if (!response.ok) throw new Error(`manifest.json: ${response.status}`);
    const loaded = (await response.json()) as Record<string, SampleSet>;

    await Promise.all(
      Object.values(loaded)
        .flat()
        .map(async (entry) => {
          const file = await fetch(`${base}/${entry.file}`);
          if (!file.ok) throw new Error(`${entry.file}: ${file.status}`);
          bytes.set(entry.file, await file.arrayBuffer());
        }),
    );

    manifest = loaded;
    return bytes;
  })().catch((error: unknown) => {
    // Offline on a first visit, or a bad deploy. The synthesised string takes over —
    // for a tool whose whole point is "click it and hear it", worse beats silent.
    console.warn('Gitarren-Aufnahmen nicht ladbar, weiche auf das Modell aus:', error);
    manifest = null;
    return new Map<string, ArrayBuffer>();
  });

  return downloaded;
}

export function createAudioPlayer(): AudioPlayer {
  const Ctor = audioContextCtor();

  if (!Ctor) {
    return {
      play: () => {},
      holdNote: () => NO_OP_NOTE,
      startProgression: () => NO_OP_HANDLE,
      stop: () => {},
      setTimbre: () => {},
      setAmp: () => {},
      setPickup: () => {},
      setTone: () => {},
      setReverb: () => {},
      setDelay: () => {},
      setTempo: () => {},
      available: false,
    };
  }

  // Created lazily on the first play: a browser only lets audio start from a user
  // gesture, and on iOS a context made earlier stays suspended until resumed.
  let context: AudioContext | null = null;
  /** Everything goes through here, so nothing can hit the output raw. */
  let master: GainNode | null = null;
  /**
   * The pickup, in the sum rather than per note — one guitar, not six.
   *
   * A resonant peak and a shelf for the output difference, which is what
   * src/synth/pickup.ts explains a pickup is worth modelling as. Before the
   * amplifier on purpose: it is the guitar, and the amplifier comes after it.
   */
  let pickupStages: { resonance: BiquadFilterNode; level: BiquadFilterNode } | null = null;
  /**
   * The safety net, kept to hand because the click joins the signal here.
   *
   * A metronome is not the instrument: it must not pick up the guitar's pickup, its
   * loudness trim, its amplifier, its tone controls or its effects, or changing any
   * one of them would move the click too. Joining here is what buys all of that at
   * once, so do not "tidy" the click onto `master` — or onto `bus`, which is the
   * newer and much more tempting mistake, since `bus` genuinely is "the sound".
   * A click with reverb on it is unusable as a click. It does still pass the
   * ceiling, because nothing reaches the output raw.
   */
  let ceiling: WaveShaperNode | null = null;
  /**
   * The amplifier, as a pair of level controls rather than a pair of connections.
   *
   * Both paths stay wired the whole time and the voice only crossfades between them.
   * Re-plugging nodes would click if anything were ringing, and setTimbre fires from
   * a useEffect on mount — before there is an AudioContext to re-plug. Five biquads
   * and a shaper idling cost nothing worth having a bug over.
   */
  let dry: GainNode | null = null;
  let wet: GainNode | null = null;
  /**
   * Where the two paths meet: the instrument, finished.
   *
   * There was no such point before — `dry` and `wet` each ran straight to the
   * ceiling — and everything after the amplifier needs one. The tone stack chains
   * out of it and the two effect sends tap the end of that chain, so a repeat and
   * a reverb tail carry the same tone the dry signal does.
   */
  let bus: GainNode | null = null;
  /** Bass, Mitten, Höhen. A wire at NEUTRAL_TONE — see src/synth/toneStack.ts. */
  let stack: BiquadFilterNode[] | null = null;
  /** The last node of the tone stack: what the effect sends listen to. */
  let voiceOut: AudioNode | null = null;
  let delayStages: {
    send: GainNode;
    line: DelayNode;
    damp: BiquadFilterNode;
    feedback: GainNode;
  } | null = null;
  let reverbStages: { send: GainNode; convolver: ConvolverNode } | null = null;
  let live: AudioScheduledSourceNode[] = [];
  /**
   * The notes with a finger still on them, so each new one can ask the others to
   * step back. Only the level adjustment lives here — ending a note is the
   * handle's job, and the handle belongs to whoever is holding it.
   */
  const held = new Set<{ retarget(peak: number): void }>();
  /** The current voice — changed by setTimbre, read when each note is built. */
  let timbre: Timbre = 'clean';
  /** Which amplifier the `electric` voice runs through. */
  let ampId: AmpId = DEFAULT_AMP;
  /** Which pickup, which room, which echo, and where the three controls sit. */
  let pickupId: PickupId = DEFAULT_PICKUP;
  let reverbId: ReverbId = DEFAULT_REVERB;
  let delayId: DelayId = DEFAULT_DELAY;
  let toneGains: ToneGains = NEUTRAL_TONE;
  /**
   * The tempo the delay divides, in BPM.
   *
   * Seeded with the same 90 that DEFAULT_STATE uses, spelled out rather than
   * imported: urlState.ts imports Timbre from this file, and the cycle would be a
   * worse thing to own than one duplicated number that only matters until App's
   * first effect fires.
   */
  let bpm = 90;

  /**
   * The two rooms, rendered once and kept.
   *
   * Built lazily on the first selection rather than with the context: a hall is
   * 1.8 s of stereo noise to generate, and most sessions never turn the reverb on.
   */
  const rooms = new Map<ReverbId, AudioBuffer>();

  /**
   * The amplifier's nodes, kept so a different amplifier can be written into them.
   *
   * Null until the first AudioContext exists — setAmp fires from a useEffect on
   * mount, long before a user gesture has allowed one.
   */
  let ampStages: {
    tight: BiquadFilterNode;
    preGain: GainNode;
    valve: WaveShaperNode;
    block: BiquadFilterNode;
    cab: [BiquadFilterNode, BiquadFilterNode];
    presence: BiquadFilterNode;
    body: BiquadFilterNode;
    makeup: GainNode;
  } | null = null;

  /** Decoded audio, once an AudioContext has existed long enough to decode it. */
  const recordings = new Map<string, AudioBuffer>();

  /**
   * The looping build of each recording, for held notes. Null where a recording
   * had no sustain worth looping — cached too, so it is not searched for twice.
   */
  const sustained = new Map<string, { buffer: AudioBuffer; loop: LoopRegion } | null>();

  /** Rendered fallback strings, keyed by voice and pitch. Insertion-ordered, so the
   *  oldest entry is simply the first key when the cache has to make room. */
  const strings = new Map<string, AudioBuffer>();

  /**
   * The one timed run in flight — a progression, or a scale played note by note.
   * Both schedule their audio on the AudioContext clock and let a timer nudge the
   * marker along behind it, and both are torn down the same way, so they share
   * these rather than each keeping their own.
   */
  let runTimers: number[] = [];
  let runCancelled = true;
  let runOnStep: ((index: number | null) => void) | undefined = undefined;

  /**
   * Writes one stage's numbers into one filter.
   *
   * Shared by every block in the graph, and the reason is webAudioQ: a Q taken
   * from a filter table is wrong for two of the five types the app uses, and
   * silently so. One helper means there is one place that can get it right.
   */
  const point = (filter: BiquadFilterNode, settings: AmpStage) => {
    filter.frequency.value = settings.frequency;
    filter.Q.value = webAudioQ(filter.type as StageKind, settings.q);
    if (settings.gain !== undefined) filter.gain.value = settings.gain;
  };

  /** Points the pickup filters at the chosen position. */
  const applyPickup = () => {
    if (!pickupStages) return;
    const spec = PICKUPS[pickupId];
    point(pickupStages.resonance, spec.resonance);
    point(pickupStages.level, spec.level);
  };

  /**
   * Writes the three tone controls into the three filters.
   *
   * At NEUTRAL_TONE every one of them has A = 1, which makes an RBJ numerator its
   * own denominator — so the default really is a wire, and the amplifier's four
   * measured makeup values are still measured against the signal they see.
   * toneStack.test.ts holds that to 1e-12.
   */
  const applyToneStack = () => {
    if (!stack) return;
    const stages = stackStages(toneGains);
    stack.forEach((filter, i) => point(filter, stages[i]));
  };

  /**
   * Sets the reverb send, building the room the first time it is asked for.
   *
   * The buffer is swapped rather than a second convolver being wired up alongside.
   * That is the one place this file departs from "wire it once and only write
   * parameters", and it is a considered departure: a ConvolverNode runs its FFTs
   * whether or not anyone is listening, so two of them idling would cost real
   * processor time on a phone for a feature that is off by default.
   *
   * Swapping a buffer is an assignment, like valve.curve in applyAmpSpec — but
   * unlike that one it RESTARTS the convolution, cutting off whatever tail was
   * ringing. So the send is ducked first and the swap waits for the duck to have
   * actually happened. That wait is a setTimeout and not a scheduled AudioParam
   * event, because `convolver.buffer = x` runs on this thread the instant it is
   * written: a ramp scheduled on the audio clock would still be sliding down while
   * the buffer underneath it had already changed, which is exactly the click the
   * duck exists to prevent.
   */
  const rampSend = (send: GainNode, to: number, at: number, seconds: number) => {
    send.gain.cancelScheduledValues(at);
    send.gain.setValueAtTime(send.gain.value, at);
    send.gain.linearRampToValueAtTime(to, at + seconds);
  };

  const applyReverb = (seconds = 0.02) => {
    if (!context || !reverbStages) return;
    const send = reverbStages.send;

    if (reverbId === 'off') {
      rampSend(send, 0, context.currentTime, seconds);
      return;
    }

    let buffer = rooms.get(reverbId);
    if (!buffer) {
      const room = REVERBS[reverbId];
      const channels = CHANNEL_SEEDS.map((seed) =>
        impulseResponse(room, context!.sampleRate, seeded(seed)),
      );
      buffer = context.createBuffer(channels.length, channels[0].length, context.sampleRate);
      channels.forEach((channel, i) => buffer!.copyToChannel(Float32Array.from(channel), i));
      rooms.set(reverbId, buffer);
    }

    const wanted = REVERBS[reverbId].mix;
    if (reverbStages.convolver.buffer === buffer) {
      rampSend(send, wanted, context.currentTime, seconds);
      return;
    }

    rampSend(send, 0, context.currentTime, seconds);
    const room = reverbId;
    const swapped = buffer;
    window.setTimeout(() => {
      // The choice may have moved on again while the duck was running; the last
      // call wins, and it will have scheduled its own swap.
      if (!context || !reverbStages || reverbId !== room) return;
      reverbStages.convolver.buffer = swapped;
      rampSend(reverbStages.send, wanted, context.currentTime, seconds);
    }, seconds * 1000);
  };

  /** Sets the delay send and, when it is on, the time the tempo asks for. */
  const applyDelay = (seconds = 0.02) => {
    if (!context || !delayStages) return;
    const at = context.currentTime;

    const send = delayStages.send;
    send.gain.cancelScheduledValues(at);
    send.gain.setValueAtTime(send.gain.value, at);
    send.gain.linearRampToValueAtTime(delayId === 'off' ? 0 : DELAY_MIX, at + seconds);

    if (delayId === 'off') return;
    /*
     * A glide and not a step, which is the opposite of what applyAmpSpec does with
     * its filter corners — and for a reason that is also the opposite. An amplifier
     * is switched, so its numbers should land at once. A tempo is DRAGGED, and a
     * step in a delay line's read pointer is a click where a slide is the tape
     * bend every delay pedal makes when you turn its time knob.
     */
    delayStages.line.delayTime.setTargetAtTime(delaySeconds(bpm, delayId), at, 0.05);
  };

  /**
   * Writes the current amplifier's numbers into the nodes that are already wired.
   *
   * Plain assignments and no ramp, unlike applyAmp below, and the difference is
   * deliberate: a gain crossfade is about not clicking, whereas these are the
   * amplifier's identity. A filter corner sliding from 4200 to 3800 Hz over 20 ms
   * is a sweep — an effect nobody asked for. Switching amplifier mid-chord is a
   * step, exactly as reaching over and pressing the channel switch would be.
   */
  const applyAmpSpec = () => {
    if (!ampStages) return;
    const spec = AMPS[ampId];

    point(ampStages.tight, spec.tight);
    point(ampStages.block, spec.block);
    point(ampStages.cab[0], spec.cab[0]);
    point(ampStages.cab[1], spec.cab[1]);
    point(ampStages.presence, spec.presence);
    point(ampStages.body, spec.body);

    ampStages.preGain.gain.value = spec.preGain;
    ampStages.makeup.gain.value = spec.makeup;
    ampStages.valve.curve = shaperCurve((x) => ampShape(x, spec.drive, spec.bias));
  };

  /**
   * Crossfades the amplifier in or out for the current voice.
   *
   * Only ever called while something might be sounding. Setting the pair up in the
   * first place is a plain assignment (see ensureContext) rather than a ramp of zero
   * length: nothing is ringing yet, so there is nothing to be smooth about, and a
   * ramp whose end lands on the same instant as its start is a degenerate thing to
   * ask an AudioParam for.
   */
  const applyAmp = (seconds = 0.02) => {
    if (!context || !dry || !wet) return;
    const at = context.currentTime;

    // Short, but a ramp and not a jump: switching the voice while a chord rings is
    // an ordinary thing to do, and a step in a gain is a click.
    for (const [node, target] of ampLevels()) {
      node.gain.cancelScheduledValues(at);
      node.gain.setValueAtTime(node.gain.value, at);
      node.gain.linearRampToValueAtTime(target, at + seconds);
    }
  };

  /** Where the dry and wet gains belong for the current voice. */
  const ampLevels = (): readonly (readonly [GainNode, number])[] => {
    const driven = VOICES[timbre].amp;
    return [
      [dry!, driven ? 0 : 1],
      [wet!, driven ? 1 : 0],
    ];
  };

  const decodeAll = async (ctx: AudioContext) => {
    const bytes = await prefetchSamples();
    await Promise.all(
      [...bytes].map(async ([file, data]) => {
        try {
          // decodeAudioData detaches the buffer it is given, so hand it a copy —
          // otherwise a second context would find nothing left to decode.
          recordings.set(file, await ctx.decodeAudioData(data.slice(0)));
        } catch {
          // One bad file falls back per note; the rest still play.
        }
      }),
    );
  };

  const ensureContext = (): AudioContext => {
    if (!context) {
      context = new Ctor();

      // The safety net, and the last thing anything passes through.
      ceiling = context.createWaveShaper();
      ceiling.curve = CEILING_CURVE;
      ceiling.oversample = '4x';
      ceiling.connect(context.destination);

      master = context.createGain();
      master.gain.value = 0.9;

      /*
       * The pickup belongs to the instrument, not to any one note, so it sits in
       * the sum: two filters in total rather than two per pluck.
       */
      pickupStages = {
        resonance: context.createBiquadFilter(),
        level: context.createBiquadFilter(),
      };
      pickupStages.resonance.type = 'peaking';
      pickupStages.level.type = 'lowshelf';
      const shaped = master.connect(pickupStages.resonance).connect(pickupStages.level);

      /*
       * The amplifier, hanging off the sum — which is the entire point. One
       * nonlinearity that sees all six strings at once is what makes a chord read
       * as one thick voice instead of six fuzzy notes; src/synth/amp.ts carries the
       * numbers and amp.test.ts measures that it actually happens.
       *
       * It sits AFTER the pickup filters because those are the guitar, and the
       * amplifier comes after the guitar — not the speaker before the pickup. That
       * ordering is what lets the neck pickup drive the valve a shade harder than
       * the bridge one does; pickup.test.ts measures it.
       *
       * No DynamicsCompressor here to glue the chord together, however tempting.
       * That was measured once already (see CEILING_CURVE) and it raised the peak
       * it was meant to hold down while pumping in time with the strumming.
       */
      const stage = (kind: StageKind, settings: AmpStage): BiquadFilterNode => {
        const filter = context!.createBiquadFilter();
        filter.type = kind;
        filter.frequency.value = settings.frequency;
        // Web Audio does not take a Q the same way for every filter type — a table
        // value handed over raw is wrong for two of these four, and silently so.
        filter.Q.value = webAudioQ(kind, settings.q);
        if (settings.gain !== undefined) filter.gain.value = settings.gain;
        return filter;
      };

      const preGain = context.createGain();

      const valve = context.createWaveShaper();
      // Without this the aliasing of everything the curve adds folds back down into
      // the guitar's own range, which is a good deal of what "sounds computed" is.
      valve.oversample = '4x';

      const makeup = context.createGain();

      wet = context.createGain();
      dry = context.createGain();

      /*
       * Held on to rather than left anonymous, so switching amplifier re-points the
       * same nodes instead of rewiring the graph — the same reason applyPickup can
       * change the guitar while a chord is ringing. AMPS entries all have the same
       * shape, so every stage always has somewhere to point.
       */
      ampStages = {
        tight: stage('lowshelf', AMP.tight),
        preGain,
        valve,
        block: stage('highpass', AMP.block),
        cab: [stage('lowpass', AMP.cab[0]), stage('lowpass', AMP.cab[1])],
        presence: stage('peaking', AMP.presence),
        body: stage('lowshelf', AMP.body),
        makeup,
      };
      applyAmpSpec();

      /*
       * Where the two paths meet. It stays at unity forever and exists only so that
       * there is somewhere to say "the instrument, finished" — which is what
       * everything below needs, and what the graph did not have before.
       */
      bus = context.createGain();

      shaped
        .connect(ampStages.tight)
        .connect(preGain)
        .connect(valve)
        .connect(ampStages.block)
        .connect(ampStages.cab[0])
        .connect(ampStages.cab[1])
        .connect(ampStages.presence)
        .connect(ampStages.body)
        .connect(makeup)
        .connect(wet)
        .connect(bus);

      shaped.connect(dry).connect(bus);

      /*
       * The tone controls, on the sum rather than inside the amplifier.
       *
       * A real tone stack hangs in the middle of the preamp, where it decides what
       * the valve distorts next as well as what you hear. Ours only does the second
       * half, and src/synth/toneStack.ts argues the trade at length — the short
       * version is that a stack inside the amplifier would move the ratio between
       * the clean and driven paths, and that ratio is exactly what each amp's one
       * measured makeup number is.
       */
      const stackAt = stackStages(toneGains);
      stack = STACK_KINDS.map((kind, i) => stage(kind, stackAt[i]));
      voiceOut = stack.reduce<AudioNode>((node, filter) => node.connect(filter), bus);

      voiceOut.connect(ceiling);

      /*
       * Delay and reverb as SENDS, not as wet/dry crossfades — and that choice is
       * what makes "off" mean off. A crossfade would leave the dry level a function
       * of the mix, so transparency would rest on two floats summing to exactly one.
       * A send at gain 0 emits literal zeros, and adding zero is exact in IEEE 754.
       * That is the property the four measured makeup values rest on, and it is
       * worth an extra node.
       *
       * They hang off the END of the tone stack so a repeat and a tail carry the
       * same tone the dry signal does, and docs/effektpedale.md §1 puts them after
       * the amplifier for the reason it gives there: in front of one, the preamp
       * would distort the reverb tail and the result is mud.
       */
      delayStages = {
        send: context.createGain(),
        line: context.createDelay(MAX_DELAY_SECONDS),
        damp: stage('lowpass', DELAY_DAMPING),
        feedback: context.createGain(),
      };
      delayStages.send.gain.value = 0;
      delayStages.line.delayTime.value = delaySeconds(bpm, 'quarter');
      delayStages.feedback.gain.value = DELAY_FEEDBACK;

      voiceOut
        .connect(delayStages.send)
        .connect(delayStages.line)
        .connect(delayStages.damp)
        .connect(ceiling);
      /*
       * The loop. Legal because a DelayNode sits in it — Web Audio allows a cycle
       * only through one, and adds a 128-sample render quantum to it, so each lap
       * runs 2.7 ms late at 48 kHz. That is below the ear and above zero: the
       * reference renderer in delay.ts deliberately does not model it, which is
       * worth knowing before someone measures three milliseconds and calls it a bug.
       */
      delayStages.damp.connect(delayStages.feedback).connect(delayStages.line);

      reverbStages = { send: context.createGain(), convolver: context.createConvolver() };
      reverbStages.send.gain.value = 0;
      /*
       * The impulse responses carry unit energy of their own (see reverb.ts), which
       * is what makes the send gain mean the wet level and what stops a hall being
       * louder than a room just because it is longer. A ConvolverNode normalises by
       * default and would throw all of that away.
       */
      reverbStages.convolver.normalize = false;
      voiceOut.connect(reverbStages.send).connect(reverbStages.convolver).connect(ceiling);
      // The repeats are in the room too, which is the order effektpedale.md §1 puts
      // them in — and it costs one connection rather than a second dry path.
      delayStages.damp.connect(reverbStages.send);

      applyPickup();
      // Straight assignment, not a crossfade: the voice may already be the overdrive
      // when the first note arrives, and there is nothing ringing yet to ease it in
      // for.
      for (const [node, level] of ampLevels()) node.gain.value = level;
      // First gesture: the bytes are usually already here, so this only decodes.
      void decodeAll(context);
    }

    if (context.state === 'suspended') void context.resume();
    return context;
  };

  const stopVoices = () => {
    for (const osc of live) {
      try {
        osc.stop();
      } catch {
        // Already stopped — fine.
      }
    }
    live = [];
    // Their handles may still be released later and that is harmless, but the
    // count must not survive the notes: left standing it would make every note
    // played afterwards quieter, for good.
    held.clear();
  };

  /**
   * Tears down the timed run. Kept separate from stop() so that stop() can call it
   * without recursing back through the handle. Reporting the end (null) is part of
   * it, so whoever is drawing a marker always hears that it is over.
   */
  const cancelRun = () => {
    runCancelled = true;
    for (const timer of runTimers) clearTimeout(timer);
    runTimers = [];

    runOnStep?.(null);
    runOnStep = undefined;
  };

  /**
   * Fires `run` at an AudioContext time. The audio itself is scheduled
   * sample-accurately; this only has to move a marker, so a timer derived from the
   * same clock is close enough.
   */
  const after = (ctx: AudioContext, seconds: number, run: () => void) => {
    const delayMs = Math.max(0, (seconds - ctx.currentTime) * 1000);
    runTimers.push(
      window.setTimeout(() => {
        if (!runCancelled) run();
      }, delayMs),
    );
  };

  /**
   * Silences everything. Crucially this also kills a looping progression — its
   * timers would otherwise keep scheduling new chords after the sound stopped.
   *
   * With a room selected this no longer means instant silence: the tail runs on
   * for up to a couple of seconds after the last string is stopped. That is
   * correct rather than a leak — a room does not stop when you mute the strings —
   * but it is new, and it is why nothing here reaches for the reverb send.
   */
  const stop = () => {
    cancelRun();
    stopVoices();
  };

  /** The rendered string for this pitch and voice, from cache or freshly plucked. */
  /** The recording for this note, and how far off its own pitch it has to be played. */
  const recordingFor = (midi: number): { buffer: AudioBuffer; playbackRate: number } | null => {
    const set = manifest?.[VOICES[timbre].recording];
    if (!set) return null;

    const choice = sampleFor(midi, set);
    const buffer = choice && recordings.get(choice.file);
    return buffer ? { buffer, playbackRate: choice.playbackRate } : null;
  };

  /** The synthesised stand-in, used until the recordings arrive or if they never do. */
  const modelledFor = (ctx: AudioContext, midi: number): AudioBuffer => {
    const key = `${timbre}:${midi}`;
    const cached = strings.get(key);
    if (cached) return cached;

    const samples = pluck(midiToFrequency(midi), ctx.sampleRate, RENDER_SECONDS, STRINGS[timbre]);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);

    if (strings.size >= CACHE_LIMIT) {
      const oldest = strings.keys().next().value;
      if (oldest !== undefined) strings.delete(oldest);
    }
    strings.set(key, buffer);
    return buffer;
  };

  /**
   * The looping build of this note's buffer, for a finger that is still down.
   *
   * A recording runs out after about two seconds, and less than that once it has
   * been stretched down a few semitones — well short of how long anyone holds a
   * fret. So the sustain is rebuilt to loop; src/synth/loopPoints.ts does the work
   * and explains why it takes as much care as it does.
   *
   * Built on first use rather than at decode, because most sessions never hold a
   * note, and cached per file: there are a dozen recordings and one buffer each.
   */
  const sustainedFor = (
    ctx: AudioContext,
    midi: number,
  ): { buffer: AudioBuffer; loop: LoopRegion } | null => {
    const set = manifest?.[VOICES[timbre].recording];
    const choice = set ? sampleFor(midi, set) : null;
    const source = choice && recordings.get(choice.file);
    // Falls back to the plain buffer, which simply runs out — better a note that
    // ends early than one that does not sound.
    if (!choice || !source) return null;

    const cached = sustained.get(choice.file);
    if (cached !== undefined) return cached;

    const samples = source.getChannelData(0);
    // The pitch of the RECORDING: the loop is cut from this buffer, so it has to
    // line up with the periods in it, not with the note being asked for.
    const loop = findLoop(samples, source.sampleRate, midiToFrequency(choice.midi));

    let built: { buffer: AudioBuffer; loop: LoopRegion } | null = null;
    if (loop) {
      const flattened = renderSustain(samples, source.sampleRate, loop);
      const buffer = ctx.createBuffer(1, flattened.length, source.sampleRate);
      buffer.copyToChannel(flattened, 0);
      built = { buffer, loop };
    }

    sustained.set(choice.file, built);
    return built;
  };

  /**
   * One sounding string: a buffer, a level, and nothing else decided yet.
   *
   * Whether the note ends on a schedule or when a finger lifts is the caller's
   * business, which is the only difference between the two ways of playing one.
   *
   * `sustain` swaps in the looping build of the buffer — see src/synth/loopPoints.ts.
   * Only a held note wants it: everything else already knows how long it has, and a
   * note that outlives its recording is exactly what a scheduled one never does.
   */
  const buildVoice = (
    ctx: AudioContext,
    midi: number,
    at: number,
    peak: number,
    sustain = false,
  ): {
    source: AudioBufferSourceNode;
    gain: GainNode;
    /** Only built for a held note — the thing that keeps it from going static. */
    colour: BiquadFilterNode | null;
    loopFrom: number;
    level: number;
  } => {
    const recorded = recordingFor(midi);
    const held = sustain ? sustainedFor(ctx, midi) : null;

    const source = ctx.createBufferSource();
    source.buffer = held ? held.buffer : (recorded?.buffer ?? modelledFor(ctx, midi));
    // Playing a recording faster raises its pitch, the way speeding up a record does.
    if (recorded) source.playbackRate.value = recorded.playbackRate;

    let loopFrom = Infinity;
    if (held) {
      source.loop = true;
      source.loopStart = held.loop.start;
      source.loopEnd = held.loop.end;
      // Loop points are positions in the BUFFER, so the rate stretches how long it
      // takes to reach them. Whoever puts a decay back on this needs to know when.
      loopFrom = held.loop.start / (recorded?.playbackRate ?? 1);
    }

    // The decay lives in the buffer — a real string dies away on its own, highs
    // first. So this gain only sets the level and takes the note away when its time
    // is up; an envelope with a decay of its own would fight that and choke the note.
    const gain = ctx.createGain();
    const level = peak * VOICES[timbre].gain;
    gain.gain.setValueAtTime(level, at);

    /*
     * The one filter that is per note rather than on the bus, and only for a held
     * one.
     *
     * A loop freezes the spectrum it was cut from, and a frozen spectrum is what
     * gives a held note away: measured on the recordings, a plucked string loses
     * a third of its brightness while it dies (the low E's spectral centroid falls
     * from 348 Hz to 225 Hz), where the looped note sat at 225 Hz for as long as it
     * was held, to the hertz. That unchanging tone is the sound of an oscillator,
     * not a string.
     *
     * So the harmonics are taken away again by hand, from where the loop takes over.
     * Wide open until then, so nothing touches the attack or the recording's own
     * decay — everything the microphone caught is heard as it was caught.
     *
     * On the bus this could not work: the sweep belongs to one note's age, and two
     * notes held at different moments are at different points in it.
     */
    const colour = sustain && held ? ctx.createBiquadFilter() : null;
    if (colour) {
      colour.type = 'lowpass';
      colour.Q.value = webAudioQ('lowpass', 0.707);
      colour.frequency.value = midiToFrequency(midi) * HOLD_TONE_OPEN;
    }

    // Straight through otherwise. The overdrive was a WaveShaper here once and is now
    // on the bus in ensureContext, where it can distort the sum rather than each string.
    (colour ? source.connect(colour) : source).connect(gain).connect(master!);
    source.start(at);

    source.addEventListener('ended', () => {
      live = live.filter((other) => other !== source);
      // A looping progression builds a few hundred of these per pass; letting go
      // explicitly is cheaper than leaning on the graph to notice.
      gain.disconnect();
      colour?.disconnect();
    });
    live.push(source);

    return { source, gain, colour, loopFrom, level };
  };

  const voice = (
    ctx: AudioContext,
    midi: number,
    at: number,
    duration: number,
    peak: number,
    release = SOFT_RELEASE,
  ) => {
    const { source, gain } = buildVoice(ctx, midi, at, peak);

    // How sharply the note is taken away is the caller's call, because that is what
    // separates a note left to ring from one damped with the palm.
    const scaledPeak = peak * VOICES[timbre].gain;
    const fade = Math.min(release, duration / 2);
    gain.gain.setValueAtTime(scaledPeak, at + duration - fade);
    gain.gain.linearRampToValueAtTime(0.0001, at + duration);

    source.stop(at + duration + 0.02);
  };

  /**
   * One tick of the click track.
   *
   * A short, hard ping rather than a sampled woodblock: it has to cut through a
   * ringing chord, and anything with a tail of its own would blur against the beat
   * it is marking. The downbeat sits a fifth higher so a bar is countable.
   */
  const tick = (ctx: AudioContext, at: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? CLICK_ACCENT_HZ : CLICK_HZ;

    // Square waves are harsh on their own; this takes the edge off without
    // softening the transient, which is the part that marks the beat.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3200;

    const gain = ctx.createGain();
    const peak = CLICK_PEAK * (accent ? 1 : 0.72);
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + CLICK_SECONDS);

    osc.connect(filter).connect(gain).connect(ceiling!);
    osc.start(at);
    osc.stop(at + CLICK_SECONDS + 0.01);

    osc.addEventListener('ended', () => {
      live = live.filter((other) => other !== osc);
    });
    live.push(osc);
  };

  const play = (midiNotes: readonly number[], options: PlayOptions = {}) => {
    if (midiNotes.length === 0) return;

    // Unless asked to stack, a fresh play interrupts the previous one so that
    // repeated clicks on a scale never pile up.
    if (!options.stack) stop();

    const mode = options.mode ?? 'sequence';
    const { gap, duration } = DEFAULTS[mode];
    const step = options.gap ?? gap;
    const ring = options.duration ?? duration;

    const ctx = ensureContext();
    const start = ctx.currentTime + 0.03;

    // A strum lands all at once, so every note shares the room. A scale run only
    // ever overlaps its neighbour, which is why it may sound near full strength.
    const peak = voicePeak(mode === 'strum' ? midiNotes.length : 2);

    midiNotes.forEach((midi, i) => {
      voice(ctx, midi, start + i * step, ring, peak);
    });

    /*
     * Follow the run with a marker. This sits AFTER the stop() above on purpose:
     * that call ends the previous run and reports its null, so pressing play twice
     * hands the marker cleanly from one run to the next instead of leaving the
     * first one lit.
     */
    if (options.onNote) {
      const onNote = options.onNote;
      runCancelled = false;
      runOnStep = onNote;

      midiNotes.forEach((_, i) => after(ctx, start + i * step, () => onNote(i)));
      after(ctx, start + (midiNotes.length - 1) * step + ring, () => {
        onNote(null);
        runCancelled = true;
      });
    }
  };

  const holdNote = (midi: number): NoteHandle => {
    const ctx = ensureContext();
    const at = ctx.currentTime + 0.02;

    const voiceGain = VOICES[timbre].gain;
    const { source, gain, colour, loopFrom, level } = buildVoice(
      ctx,
      midi,
      at,
      voicePeak(held.size + 1),
      true,
    );

    /**
     * The slow decay that keeps a held note a guitar.
     *
     * The loop holds the string at a steady level for as long as the finger is
     * down, and a string that never dies away is an organ. So the decay the loop
     * took out goes back on here — much slower than the recording's own, because
     * the point of holding a fret is to hear the note, but present, so it still
     * behaves like something that was struck once.
     *
     * Armed for when the loop actually begins: until then the recording is still
     * playing its own attack and decay, and two decays over each other would
     * choke it.
     *
     * And not armed at all where there is no loop — the fallback string, or a
     * recording with no sustain to cut one from. That note still has its own
     * decay and simply runs out, which is the honest thing for it to do.
     */
    const looping = Number.isFinite(loopFrom);
    // Slower the lower the note, the way a wound string outrings a plain one.
    const frequency = midiToFrequency(midi);
    const fade = holdDecaySeconds(frequency);
    const decay = (from: number, top: number) => {
      if (looping) gain.gain.setTargetAtTime(top * HOLD_SUSTAIN, from, fade);
    };
    decay(at + loopFrom, level);

    /*
     * And the brightness goes with it, on the same clock but faster. A string does
     * not merely get quieter — it gets darker, and losing that is what made a held
     * note sound like an oscillator once the loop had taken over.
     *
     * The clock is shared because a low string keeps both its loudness and its
     * harmonics longer than a high one; HOLD_TONE_SHARE is there because the two do
     * not fade at the same RATE, and the measurements it comes from are written out
     * where it is defined.
     */
    if (colour && looping) {
      colour.frequency.setTargetAtTime(
        frequency * HOLD_TONE_FLOOR,
        at + loopFrom,
        fade * HOLD_TONE_SHARE,
      );
    }

    /** Where this note is now, as a fraction of the level it was given. */
    let peakNow = level;

    const entry = {
      retarget: (peak: number) => {
        const now = ctx.currentTime;
        const next = peak * voiceGain;
        // Reading the parameter is the only way to find out how far the decay has
        // already got: cancelScheduledValues rewinds to the last scheduled event,
        // not to where the value actually is, so it has to be pinned first.
        const current = gain.gain.value;
        const decayed = peakNow > 0 ? current / peakNow : 1;

        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(current, now);
        gain.gain.linearRampToValueAtTime(next * decayed, now + HOLD_ADJUST);
        // Re-armed from the new level, so a note that has been ringing a while
        // does not get its decay handed back to it.
        decay(now + HOLD_ADJUST, next);
        peakNow = next;
      },
    };

    // Every finger already down steps back to make room for this one. Without it
    // six held notes would arrive at the ceiling six times over and come out
    // crushed — voicePeak is the same rule a strum is held to.
    held.add(entry);
    for (const other of held) other.retarget(voicePeak(held.size));

    // A looping buffer never ends on its own, so a pointerup that never arrives
    // would leave a note sounding for good. Nothing is held this long on purpose.
    source.stop(at + MAX_HOLD);

    let released = false;
    return {
      release: (fade = SOFT_RELEASE) => {
        if (released) return;
        released = true;

        held.delete(entry);
        for (const other of held) other.retarget(voicePeak(held.size));

        const now = ctx.currentTime;
        try {
          const current = gain.gain.value;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(current, now);
          gain.gain.linearRampToValueAtTime(0.0001, now + fade);
          // Replaces the MAX_HOLD stop above; a second stop() supersedes the first.
          source.stop(now + fade + 0.02);
        } catch {
          // Already stopped by a global stop() — the note is over either way.
        }
      },
    };
  };

  const startProgression = (
    chords: readonly (readonly number[])[],
    options: ProgressionOptions,
  ): ProgressionHandle => {
    const voiced = chords.filter((chord) => chord.length > 0);
    if (voiced.length === 0) return NO_OP_HANDLE;

    stop(); // a timed run replaces whatever was going on

    const {
      secondsPerBar,
      beatsPerBar,
      pattern,
      chordBars,
      loop = false,
      style = 'standard',
      feel = 'straight',
      length = 'ring',
      click = 'off',
      onChord,
    } = options;
    const barsOf = (index: number) => Math.max(1, chordBars?.[index] ?? 1);

    const secondsPerBeat = secondsPerBar / beatsPerBar;
    /** When a slot sounds, and — one slot further on — when the next one does. */
    const slotAt = (s: number) => slotTime(s, secondsPerBeat, feel);

    const ctx = ensureContext();
    runCancelled = false;
    runOnStep = onChord;

    /** This progression's binding of the shared timer helper. */
    const schedule = (seconds: number, run: () => void) => after(ctx, seconds, run);

    // Every chord of an arpeggio plays the same number of strings, so that dividing
    // the bar among them gives the same pulse throughout. Decided across the whole
    // progression, which is why it lives here rather than inside one strum.
    const arpeggioStrings = style === 'arpeggio' ? arpeggioStringCount(voiced) : 0;

    /** One step of an arpeggio — a constant, since the bar is divided evenly. */
    const arpeggioStep = arpeggioStrings > 0 ? secondsPerBar / arpeggioStrings : 0;

    /**
     * One strum: the strings brushed low-to-high (down) or high-to-low (up).
     *
     * `untilNext` is how long this note has before its successor arrives, and it is
     * passed in rather than computed once outside because under a shuffle the slots
     * are NOT evenly spaced — the long eighth and the short one want different
     * lengths, and "stopped" is measured against exactly that gap.
     */
    const strum = (
      chord: readonly number[],
      at: number,
      slot: StrumSlot,
      peak: number,
      untilNext: number,
    ) => {
      if (slot === null) return;
      const { seconds: ring, release } = noteSeconds(style, length, secondsPerBar, untilNext);
      const played = style === 'arpeggio' ? dropHighest(chord, arpeggioStrings) : chord;
      const order = slot === 'up' ? [...played].reverse() : played;
      const offsets = strumOffsets(order.length, style, secondsPerBar);
      order.forEach((midi, i) => {
        voice(ctx, midi, at + offsets[i], ring, peak, release);
      });
    };

    /**
     * One bar of one chord. An arpeggio ignores the strum pattern: spreading the
     * chord across the whole bar IS the pattern, and laying a second one over it
     * would just restart the arpeggio on every eighth.
     */
    const scheduleBar = (chord: readonly number[], barAt: number, peak: number) => {
      if (style === 'arpeggio') {
        strum(chord, barAt, 'down', peak, arpeggioStep);
        return;
      }
      // One slot past the end is the next bar's downbeat, so the last slot gets a
      // real gap like every other one.
      pattern.forEach((slot, s) =>
        strum(chord, barAt + slotAt(s), slot, peak, slotAt(s + 1) - slotAt(s)),
      );
    };

    // Total span, so the loop knows where to rejoin — chords may differ in length.
    const totalSeconds = voiced.reduce((sum, _, index) => sum + barsOf(index) * secondsPerBar, 0);

    const schedulePass = (startAt: number) => {
      if (runCancelled) return;

      let offset = 0;
      voiced.forEach((chord, index) => {
        const at = startAt + offset;
        const bars = barsOf(index);
        const peak = voicePeak(chord.length);
        // Lay one bar's worth across each bar the chord is held.
        for (let bar = 0; bar < bars; bar++) {
          scheduleBar(chord, at + bar * secondsPerBar, peak);
          if (click === 'metronome') {
            for (const beat of clickTimes(beatsPerBar, secondsPerBar, 1, at + bar * secondsPerBar)) {
              tick(ctx, beat.at, beat.accent);
            }
          }
        }
        // The audio is scheduled sample-accurately; the marker just follows along.
        if (onChord) schedule(at, () => onChord(index));
        offset += bars * secondsPerBar;
      });

      const endAt = startAt + totalSeconds;

      if (loop) {
        // Arm the next pass slightly early so the loop joins without a gap.
        schedule(endAt - 0.3, () => schedulePass(endAt));
      } else {
        schedule(endAt, () => {
          onChord?.(null);
          runCancelled = true;
        });
      }
    };

    // The count-in sits before the music, once — a loop counts you in at the start,
    // not on every repeat.
    const begin = ctx.currentTime + 0.06;
    const countIn = countInBars(click) * secondsPerBar;
    for (const beat of clickTimes(beatsPerBar, secondsPerBar, countInBars(click), begin)) {
      tick(ctx, beat.at, beat.accent);
    }

    schedulePass(begin + countIn);

    return { stop };
  };

  const setTimbre = (next: Timbre) => {
    timbre = next;
    // Recordings are cached per file and fallback strings per voice, so neither needs
    // invalidating — only the amplifier's blend, which is one shared pair of gains.
    // The pickup does NOT move with the voice: it is the guitar, and the guitar is
    // the same instrument whichever amplifier it is plugged into.
    applyAmp();
  };

  const setAmp = (next: AmpId) => {
    ampId = next;
    applyAmpSpec();
  };

  const setPickup = (next: PickupId) => {
    pickupId = next;
    applyPickup();
  };

  const setTone = (next: ToneGains) => {
    toneGains = next;
    applyToneStack();
  };

  const setReverb = (next: ReverbId) => {
    reverbId = next;
    applyReverb();
  };

  const setDelay = (next: DelayId) => {
    delayId = next;
    applyDelay();
  };

  const setTempo = (next: number) => {
    bpm = next;
    // Only the delay cares, and only while it is on — applyDelay checks both.
    applyDelay();
  };

  return {
    play,
    holdNote,
    startProgression,
    stop,
    setTimbre,
    setAmp,
    setPickup,
    setTone,
    setReverb,
    setDelay,
    setTempo,
    available: true,
  };
}
