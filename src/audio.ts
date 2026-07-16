import { midiToFrequency } from './theory';

/**
 * A thin wrapper over the Web Audio API — the one place in the app that makes
 * sound. Everything about which notes to play is computed in src/theory/pitch.ts;
 * this file only knows about oscillators and timing.
 *
 * No dependencies: Web Audio is built into the browser. If it is somehow missing,
 * every method is a harmless no-op.
 */

export type PlayMode = 'sequence' | 'strum' | 'together';

export interface PlayOptions {
  mode?: PlayMode;
  /** Seconds between successive onsets. Ignored for 'together'. */
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
  together: { gap: 0, duration: 1.9 }, // a chord struck as a block
};

export interface ChordSequenceOptions {
  /** Seconds between chords. */
  chordGap?: number;
  /** Seconds between the strings of one chord. */
  strumGap?: number;
  duration?: number;
}

export interface AudioPlayer {
  /** Play a list of MIDI notes. Cancels whatever was playing first. */
  play(midiNotes: readonly number[], options?: PlayOptions): void;
  /** Play several chords one after another in tempo — a progression. */
  playChords(chords: readonly (readonly number[])[], options?: ChordSequenceOptions): void;
  /**
   * Sound a single note WITHOUT cancelling anything already ringing — so tapping
   * several fretboard dots lets them stack into a chord by ear.
   */
  playNote(midi: number): void;
  /** Silence everything immediately. */
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

export function createAudioPlayer(): AudioPlayer {
  const Ctor = audioContextCtor();

  if (!Ctor) {
    return {
      play: () => {},
      playChords: () => {},
      playNote: () => {},
      stop: () => {},
      available: false,
    };
  }

  // Created lazily on the first play: a browser only lets audio start from a user
  // gesture, and on iOS a context made earlier stays suspended until resumed.
  let context: AudioContext | null = null;
  let live: OscillatorNode[] = [];

  const ensureContext = (): AudioContext => {
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  };

  const stop = () => {
    for (const osc of live) {
      try {
        osc.stop();
      } catch {
        // Already stopped — fine.
      }
    }
    live = [];
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
    // repeated clicks on a scale or progression never pile up.
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

  const playChords = (
    chords: readonly (readonly number[])[],
    options: ChordSequenceOptions = {},
  ) => {
    const voiced = chords.filter((chord) => chord.length > 0);
    if (voiced.length === 0) return;

    stop();

    const chordGap = options.chordGap ?? 0.62;
    const strumGap = options.strumGap ?? 0.035;
    const ring = options.duration ?? 0.7;

    const ctx = ensureContext();
    const base = ctx.currentTime + 0.03;

    voiced.forEach((chord, chordIndex) => {
      const at = base + chordIndex * chordGap;
      chord.forEach((midi, string) => {
        voice(ctx, midiToFrequency(midi), at + string * strumGap, ring);
      });
    });
  };

  const playNote = (midi: number) => {
    const ctx = ensureContext();
    voice(ctx, midiToFrequency(midi), ctx.currentTime + 0.02, 1);
  };

  return {
    play,
    playChords,
    playNote,
    stop,
    available: true,
  };
}
