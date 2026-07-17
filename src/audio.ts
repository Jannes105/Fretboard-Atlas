import { midiToFrequency } from './theory';

/**
 * A thin wrapper over the Web Audio API — the one place in the app that makes
 * sound. Everything about which notes to play is computed in src/theory/pitch.ts;
 * this file only knows about oscillators and timing.
 *
 * No dependencies: Web Audio is built into the browser. If it is somehow missing,
 * every method is a harmless no-op.
 */

export type PlayMode = 'sequence' | 'strum';

/**
 * The instrument's voice. `soft` is the mellow triangle the app started with;
 * `clean` and `electric` are a filtered sawtooth — brighter, more like an electric
 * guitar — with `electric` adding a touch of overdrive on top. Only the timbre
 * changes; the pitches played are identical.
 */
export type Timbre = 'soft' | 'clean' | 'electric';

/**
 * Per-timbre loudness trim, so switching voice does not jump in volume: a
 * sawtooth carries far more energy than a triangle, and overdrive adds more still.
 */
const TIMBRE_GAIN: Record<Timbre, number> = { soft: 1, clean: 0.6, electric: 0.38 };

/**
 * A soft-clipping curve for the overdrive — tanh rounds the peaks off rather than
 * chopping them square, which is the difference between warm and harsh. Built once
 * and shared by every voice's WaveShaper.
 */
const DRIVE_CURVE = (() => {
  const samples = 1024;
  // Backed by an explicit ArrayBuffer so the type matches WaveShaperNode.curve
  // (which rejects the ArrayBufferLike a bare `new Float32Array(n)` infers).
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  // A steep tanh so the sawtooth's ramp gets squashed toward a square — that hard
  // edge is the overdrive. Gentle amounts are inaudible on a wave that already has
  // every harmonic; this has to bite.
  const amount = 6;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x);
  }
  return curve;
})();

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
}

const DEFAULTS: Record<PlayMode, { gap: number; duration: number }> = {
  sequence: { gap: 0.28, duration: 0.42 }, // a scale, one note after another
  strum: { gap: 0.035, duration: 1.9 }, // a chord, strings brushed — left to ring out
};

/** Amplitude of a note sounding on its own. */
const PEAK = 0.5;

/**
 * How loud each voice may be when `simultaneous` of them ring together.
 *
 * Without this every voice was equally loud, so a lone note sat six times below a
 * six-string chord — and a chord spanning the whole neck summed past 1.0 and
 * clipped. Loudness roughly follows the square root of the voice count, so
 * dividing by it puts a single note and a full chord in the same ballpark.
 */
function voicePeak(simultaneous: number): number {
  return PEAK / Math.sqrt(Math.max(1, simultaneous));
}

export interface ProgressionOptions {
  /** How long one bar lasts — beatsPerBar beats at the current tempo. */
  secondsPerBar: number;
  /** Bars each chord is held; defaults to one bar each. Aligned with `chords`. */
  chordBars?: readonly number[];
  loop?: boolean;
  /** Seconds between the strings of one chord. */
  strumGap?: number;
  /** Fires as each chord starts, and with null when playback ends — drives the marker. */
  onChord?: (index: number | null) => void;
}

/** Lets the caller stop a progression it started. */
export interface ProgressionHandle {
  stop(): void;
}

export interface AudioPlayer {
  /** Play a list of MIDI notes. Cancels whatever was playing first, unless stacking. */
  play(midiNotes: readonly number[], options?: PlayOptions): void;
  /**
   * Sound a single note WITHOUT cancelling anything already ringing — so tapping
   * several fretboard dots lets them stack into a chord by ear.
   */
  playNote(midi: number): void;
  /** Play chords in tempo, optionally looping. Replaces any current playback. */
  startProgression(
    chords: readonly (readonly number[])[],
    options: ProgressionOptions,
  ): ProgressionHandle;
  /** Silence everything immediately, including a running progression. */
  stop(): void;
  /** Switch the voice. Takes effect on the next note; no AudioContext is created. */
  setTimbre(timbre: Timbre): void;
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

export function createAudioPlayer(): AudioPlayer {
  const Ctor = audioContextCtor();

  if (!Ctor) {
    return {
      play: () => {},
      playNote: () => {},
      startProgression: () => NO_OP_HANDLE,
      stop: () => {},
      setTimbre: () => {},
      available: false,
    };
  }

  // Created lazily on the first play: a browser only lets audio start from a user
  // gesture, and on iOS a context made earlier stays suspended until resumed.
  let context: AudioContext | null = null;
  /** Everything goes through here, so nothing can hit the output raw. */
  let master: GainNode | null = null;
  let live: OscillatorNode[] = [];
  /** The current voice — changed by setTimbre, read when each note is built. */
  let timbre: Timbre = 'soft';

  /** Timers of the running progression — its loop keeps arming new ones. */
  let progressionTimers: number[] = [];
  let progressionCancelled = true;
  let progressionOnChord: ProgressionOptions['onChord'] = undefined;

  const ensureContext = (): AudioContext => {
    if (!context) {
      context = new Ctor();

      // A limiter catches whatever the per-voice maths does not: a chord spanning
      // the whole neck is a dozen voices at once, and summing those straight into
      // the output clipped audibly.
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;

      master = context.createGain();
      master.gain.value = 0.9;
      master.connect(limiter).connect(context.destination);
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
  };

  /**
   * Tears down a running progression. Kept separate from stop() so that stop()
   * can call it without recursing back through the handle.
   */
  const cancelProgression = () => {
    progressionCancelled = true;
    for (const timer of progressionTimers) clearTimeout(timer);
    progressionTimers = [];

    progressionOnChord?.(null);
    progressionOnChord = undefined;
  };

  /**
   * Silences everything. Crucially this also kills a looping progression — its
   * timers would otherwise keep scheduling new chords after the sound stopped.
   */
  const stop = () => {
    cancelProgression();
    stopVoices();
  };

  const voice = (
    ctx: AudioContext,
    frequency: number,
    at: number,
    duration: number,
    peak: number,
  ) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;

    // A short attack and an exponential decay — no click on start or end. The
    // per-timbre trim keeps the loudness even when the voice changes.
    const scaledPeak = peak * TIMBRE_GAIN[timbre];
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(scaledPeak, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    if (timbre === 'soft') {
      // A triangle wave is softer and a touch closer to a plucked string than a sine.
      osc.type = 'triangle';
      osc.connect(gain).connect(master!);
    } else {
      // A sawtooth is bright and buzzy like an electric pickup; a lowpass that
      // opens on the attack and closes as the note decays gives it a plucked edge
      // that softens, instead of a static drone.
      osc.type = 'sawtooth';

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';

      if (timbre === 'electric') {
        // Overdrive: drive the wave hard into the shaper, then keep the filter
        // wide open — the whole point is to HEAR the harmonics the distortion
        // adds, so this must stay much brighter than clean.
        filter.Q.value = 4;
        filter.frequency.setValueAtTime(Math.min(frequency * 10 + 3500, 12000), at);
        filter.frequency.exponentialRampToValueAtTime(
          Math.min(frequency * 5 + 1800, 7000),
          at + duration,
        );

        const shaper = ctx.createWaveShaper();
        shaper.curve = DRIVE_CURVE;
        shaper.oversample = '4x';
        osc.connect(shaper).connect(filter).connect(gain).connect(master!);
      } else {
        // Clean: a filtered sawtooth, no drive — clear and a touch bright, but
        // deliberately darker and smoother than the overdrive above.
        filter.Q.value = 2;
        filter.frequency.setValueAtTime(Math.min(frequency * 4 + 1000, 5000), at);
        filter.frequency.exponentialRampToValueAtTime(
          Math.min(frequency * 1.5 + 300, 2200),
          at + duration,
        );
        osc.connect(filter).connect(gain).connect(master!);
      }
    }

    osc.start(at);
    osc.stop(at + duration + 0.05);

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
      voice(ctx, midiToFrequency(midi), start + i * step, ring, peak);
    });
  };

  const playNote = (midi: number) => {
    const ctx = ensureContext();
    // On its own, and so at full strength.
    voice(ctx, midiToFrequency(midi), ctx.currentTime + 0.02, 1, voicePeak(1));
  };

  const startProgression = (
    chords: readonly (readonly number[])[],
    options: ProgressionOptions,
  ): ProgressionHandle => {
    const voiced = chords.filter((chord) => chord.length > 0);
    if (voiced.length === 0) return NO_OP_HANDLE;

    stop(); // a timed run replaces whatever was going on

    const { secondsPerBar, chordBars, loop = false, strumGap = 0.035, onChord } = options;
    const barsOf = (index: number) => Math.max(1, chordBars?.[index] ?? 1);

    const ctx = ensureContext();
    progressionCancelled = false;
    progressionOnChord = onChord;

    const after = (seconds: number, run: () => void) => {
      const delayMs = Math.max(0, (seconds - ctx.currentTime) * 1000);
      progressionTimers.push(
        window.setTimeout(() => {
          if (!progressionCancelled) run();
        }, delayMs),
      );
    };

    // Total span, so the loop knows where to rejoin — chords may differ in length.
    const totalSeconds = voiced.reduce((sum, _, index) => sum + barsOf(index) * secondsPerBar, 0);

    const schedulePass = (startAt: number) => {
      if (progressionCancelled) return;

      let offset = 0;
      voiced.forEach((chord, index) => {
        const at = startAt + offset;
        const held = barsOf(index) * secondsPerBar;
        // Ring almost to the next chord, but never absurdly long at slow tempi.
        const ring = Math.min(held * 0.98, 2.4);
        const peak = voicePeak(chord.length);
        chord.forEach((midi, string) => {
          voice(ctx, midiToFrequency(midi), at + string * strumGap, ring, peak);
        });
        // The audio is scheduled sample-accurately; the marker just follows along.
        if (onChord) after(at, () => onChord(index));
        offset += held;
      });

      const endAt = startAt + totalSeconds;

      if (loop) {
        // Arm the next pass slightly early so the loop joins without a gap.
        after(endAt - 0.3, () => schedulePass(endAt));
      } else {
        after(endAt, () => {
          onChord?.(null);
          progressionCancelled = true;
        });
      }
    };

    schedulePass(ctx.currentTime + 0.06);

    return { stop };
  };

  const setTimbre = (next: Timbre) => {
    timbre = next;
  };

  return {
    play,
    playNote,
    startProgression,
    stop,
    setTimbre,
    available: true,
  };
}
