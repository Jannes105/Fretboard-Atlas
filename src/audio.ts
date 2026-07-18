import { pluck, type PluckOptions } from './synth/pluck';
import { midiToFrequency, type StrumSlot } from './theory';

/**
 * A thin wrapper over the Web Audio API — the one place in the app that makes
 * sound. Everything about which notes to play is computed in src/theory/pitch.ts,
 * and what a single plucked note looks like in src/synth/pluck.ts; this file only
 * wires those together and handles timing.
 *
 * No dependencies: Web Audio is built into the browser. If it is somehow missing,
 * every method is a harmless no-op.
 */

export type PlayMode = 'sequence' | 'strum';

/**
 * The instrument's voice — three strings rather than three waveforms. `soft` is a
 * nylon-ish acoustic, `clean` a brighter steel string, `electric` the same string
 * put through an overdrive. Only the timbre changes; the pitches played are
 * identical.
 *
 * The names are the ones already in shared links, so they stay as they are even
 * though "soft" now means "acoustic".
 */
export type Timbre = 'soft' | 'clean' | 'electric';

/**
 * How each voice's string is strung. Heavier damping eats the highs faster, which
 * is the difference between nylon and steel; the pick runs from a thumb to a
 * plectrum.
 */
const STRINGS: Record<Timbre, Omit<PluckOptions, 'random'>> = {
  soft: { damping: 0.55, pick: 0.62, sustainSeconds: 4 },
  clean: { damping: 0.22, pick: 0.22, sustainSeconds: 6 },
  electric: { damping: 0.14, pick: 0.14, sustainSeconds: 8 },
};

/**
 * Per-timbre loudness trim, so switching voice does not jump in volume. Set from
 * the measured RMS of the rendered strings, not by ear.
 */
const TIMBRE_GAIN: Record<Timbre, number> = { soft: 1, clean: 0.85, electric: 0.3 };

/** How much of a note is rendered; longer than anything the app actually holds. */
const RENDER_SECONDS = 2.4;

/**
 * How many rendered strings to keep. A looping progression schedules a couple of
 * hundred plucks per pass, and rendering each one on the spot would stutter — but
 * only a few dozen distinct pitches are ever in play, so a small cache covers it.
 */
const CACHE_LIMIT = 64;

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
  // Enough to bite without swamping the string underneath. This now shapes a
  // plucked string rather than a raw waveform, which is what an amplifier actually
  // does — so it needs far less brute force than it did to colour a sawtooth.
  const amount = 3.2;
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
  /** Beats per bar, so the bar can be divided into the strum grid. */
  beatsPerBar: number;
  /** The strum pattern for one bar (eighth-note grid), repeated under each chord. */
  pattern: readonly StrumSlot[];
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
  let live: AudioScheduledSourceNode[] = [];
  /** The current voice — changed by setTimbre, read when each note is built. */
  let timbre: Timbre = 'soft';

  /** Rendered strings, keyed by voice and pitch. Insertion-ordered, so the oldest
   *  entry is simply the first key when the cache has to make room. */
  const strings = new Map<string, AudioBuffer>();

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

  /** The rendered string for this pitch and voice, from cache or freshly plucked. */
  const stringFor = (ctx: AudioContext, frequency: number): AudioBuffer => {
    // Rounded, because a cache keyed on raw floats would never hit twice.
    const key = `${timbre}:${frequency.toFixed(2)}`;
    const cached = strings.get(key);
    if (cached) return cached;

    const samples = pluck(frequency, ctx.sampleRate, RENDER_SECONDS, STRINGS[timbre]);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);

    if (strings.size >= CACHE_LIMIT) {
      const oldest = strings.keys().next().value;
      if (oldest !== undefined) strings.delete(oldest);
    }
    strings.set(key, buffer);
    return buffer;
  };

  const voice = (
    ctx: AudioContext,
    frequency: number,
    at: number,
    duration: number,
    peak: number,
  ) => {
    const source = ctx.createBufferSource();
    source.buffer = stringFor(ctx, frequency);

    // The decay lives in the buffer now — the string dies away on its own, and the
    // highs go before the fundamental. So this gain only sets the level and takes
    // the note away cleanly when its time is up; an envelope shaped like the old one
    // would decay a second time on top and choke the note.
    const gain = ctx.createGain();
    const scaledPeak = peak * TIMBRE_GAIN[timbre];
    const fade = Math.min(0.08, duration / 2);
    gain.gain.setValueAtTime(scaledPeak, at);
    gain.gain.setValueAtTime(scaledPeak, at + duration - fade);
    gain.gain.linearRampToValueAtTime(0.0001, at + duration);

    if (timbre === 'electric') {
      // Overdrive: the shaper squashes the string's peaks, and a lowpass shaves the
      // fizz the shaper adds right at the top without touching what makes it bite.
      const shaper = ctx.createWaveShaper();
      shaper.curve = DRIVE_CURVE;
      shaper.oversample = '4x';

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 5200;
      filter.Q.value = 0.7;

      source.connect(shaper).connect(filter).connect(gain).connect(master!);
    } else {
      source.connect(gain).connect(master!);
    }

    source.start(at);
    source.stop(at + duration + 0.02);

    source.addEventListener('ended', () => {
      live = live.filter((other) => other !== source);
    });
    live.push(source);
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

    const {
      secondsPerBar,
      beatsPerBar,
      pattern,
      chordBars,
      loop = false,
      strumGap = 0.035,
      onChord,
    } = options;
    const barsOf = (index: number) => Math.max(1, chordBars?.[index] ?? 1);

    const secondsPerBeat = secondsPerBar / beatsPerBar;
    const slotSeconds = secondsPerBeat / 2; // eighth-note grid: two slots per beat
    // A strum rings a beat or so, overlapping the next a little the way real
    // strumming sustains; the limiter keeps the stack from clipping.
    const strumRing = Math.min(secondsPerBeat * 1.3, 2);

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

    // One strum: the strings brushed low-to-high (down) or high-to-low (up).
    const strum = (chord: readonly number[], at: number, slot: StrumSlot, peak: number) => {
      if (slot === null) return;
      const order = slot === 'up' ? [...chord].reverse() : chord;
      order.forEach((midi, i) => {
        voice(ctx, midiToFrequency(midi), at + i * strumGap, strumRing, peak);
      });
    };

    // Total span, so the loop knows where to rejoin — chords may differ in length.
    const totalSeconds = voiced.reduce((sum, _, index) => sum + barsOf(index) * secondsPerBar, 0);

    const schedulePass = (startAt: number) => {
      if (progressionCancelled) return;

      let offset = 0;
      voiced.forEach((chord, index) => {
        const at = startAt + offset;
        const bars = barsOf(index);
        const peak = voicePeak(chord.length);
        // Lay the one-bar pattern across each bar the chord is held.
        for (let bar = 0; bar < bars; bar++) {
          const barAt = at + bar * secondsPerBar;
          pattern.forEach((slot, s) => strum(chord, barAt + s * slotSeconds, slot, peak));
        }
        // The audio is scheduled sample-accurately; the marker just follows along.
        if (onChord) after(at, () => onChord(index));
        offset += bars * secondsPerBar;
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
