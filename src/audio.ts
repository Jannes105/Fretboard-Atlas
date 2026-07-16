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

export interface ProgressionOptions {
  /** How long each chord gets. One chord is one bar, so this comes from the tempo. */
  secondsPerChord: number;
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
      available: false,
    };
  }

  // Created lazily on the first play: a browser only lets audio start from a user
  // gesture, and on iOS a context made earlier stays suspended until resumed.
  let context: AudioContext | null = null;
  let live: OscillatorNode[] = [];

  /** Timers of the running progression — its loop keeps arming new ones. */
  let progressionTimers: number[] = [];
  let progressionCancelled = true;
  let progressionOnChord: ProgressionOptions['onChord'] = undefined;

  const ensureContext = (): AudioContext => {
    context ??= new Ctor();
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

  const voice = (ctx: AudioContext, frequency: number, at: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // A triangle wave is softer and a touch closer to a plucked string than a sine.
    osc.type = 'triangle';
    osc.frequency.value = frequency;

    // A short attack and an exponential decay — no click on start or end.
    const peak = 0.22;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain).connect(ctx.destination);
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

    midiNotes.forEach((midi, i) => {
      voice(ctx, midiToFrequency(midi), start + i * step, ring);
    });
  };

  const playNote = (midi: number) => {
    const ctx = ensureContext();
    voice(ctx, midiToFrequency(midi), ctx.currentTime + 0.02, 1);
  };

  const startProgression = (
    chords: readonly (readonly number[])[],
    options: ProgressionOptions,
  ): ProgressionHandle => {
    const voiced = chords.filter((chord) => chord.length > 0);
    if (voiced.length === 0) return NO_OP_HANDLE;

    stop(); // a timed run replaces whatever was going on

    const { secondsPerChord, loop = false, strumGap = 0.035, onChord } = options;
    // Let a chord ring almost to the next one, but never absurdly long at slow tempi.
    const ring = Math.min(secondsPerChord * 0.98, 2.4);

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

    const schedulePass = (startAt: number) => {
      if (progressionCancelled) return;

      voiced.forEach((chord, index) => {
        const at = startAt + index * secondsPerChord;
        chord.forEach((midi, string) => {
          voice(ctx, midiToFrequency(midi), at + string * strumGap, ring);
        });
        // The audio is scheduled sample-accurately; the marker just follows along.
        if (onChord) after(at, () => onChord(index));
      });

      const endAt = startAt + voiced.length * secondsPerChord;

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

  return {
    play,
    playNote,
    startProgression,
    stop,
    available: true,
  };
}
