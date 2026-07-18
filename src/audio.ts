import { pluck, type PluckOptions } from './synth/pluck';
import { sampleFor, type SampleSet } from './synth/sampleSet';
import { midiToFrequency, type StrumSlot } from './theory';

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
 * All three are recordings of one archtop guitar from the CC0 Karoryfer Shinyguitar
 * library, captured two ways at once: `soft` is the microphone in front of the body,
 * `clean` the magnetic pickup, and `electric` that same pickup driven into an
 * overdrive — which is what an amplifier does to it.
 *
 * That two of them are genuinely different takes matters. An earlier version derived
 * all three from one synthesised string by nudging numbers, and they measured 3.7 dB
 * apart across third-octave bands, which is to say indistinguishable.
 *
 * The names are the ones already in shared links, so they stay as they are.
 */
export type Timbre = 'soft' | 'clean' | 'electric';

/** One resonance: where, how narrow, how much. */
interface Resonance {
  frequency: number;
  q: number;
  gain: number;
}

/**
 * How each voice is put together.
 *
 * The tone shaping is deliberately light. A recorded guitar arrives with its own
 * body and its own pickup, so there is nothing here to reconstruct — only the
 * overdrive needs its fizz taken off up top, and the pickup take can use a touch of
 * presence. The heavy resonances this once carried existed to give a bare string
 * model the body it did not have.
 */
const VOICES: Record<
  Timbre,
  {
    /** Which recorded set feeds it, keyed as in public/samples/manifest.json. */
    readonly recording: 'acoustic' | 'electric';
    /**
     * How hard the note is pushed into the overdrive, or null for none.
     *
     * This has to be well above 1 to do anything worth hearing. A plucked note spends
     * almost all of its life quiet, and down there a soft-clipper is very nearly a
     * straight line — driving it at unity left the overdrive measuring 2.0 dB from
     * clean, which is to say identical. Pushing it 10× puts the decay into the bend
     * too, which is exactly what an amplifier's preamp is for.
     */
    readonly drive: number | null;
    readonly tone: readonly Resonance[];
    /** Loudness trim, measured — not set by ear. */
    readonly gain: number;
  }
> = {
  soft: { recording: 'acoustic', drive: null, tone: [], gain: 1 },
  clean: {
    recording: 'electric',
    drive: null,
    tone: [{ frequency: 2600, q: 0.8, gain: 2 }],
    gain: 1.23,
  },
  electric: {
    recording: 'electric',
    drive: 10,
    tone: [{ frequency: 6000, q: 0.7, gain: -4 }],
    gain: 0.1375,
  },
};

/** Filters kept in the sum for tone shaping. Unused ones sit flat and pass through. */
const TONE_FILTERS = 2;

/**
 * Fallback string settings, used only until the recordings finish loading or if they
 * fail outright. Deliberately three distinguishable models rather than three shades
 * of one.
 */
const STRINGS: Record<Timbre, Omit<PluckOptions, 'random'>> = {
  soft: { damping: 0.3, pickPosition: 0.3, pickNoise: 0.04, sustainSeconds: 3.5 },
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

/**
 * How fast the hand crosses the strings, in seconds between one string and the next.
 *
 * The old fixed 35 ms meant 175 ms to cross six strings, which is a slow drag rather
 * than a strum — a real one lands in 30–90 ms. Which of these feels right is taste,
 * so it is a setting rather than a number picked here.
 */
export const STRUM_SPEEDS = {
  fast: 0.006,
  medium: 0.012,
  plucked: 0.026,
} as const;

export type StrumSpeed = keyof typeof STRUM_SPEEDS;

const DEFAULTS: Record<PlayMode, { gap: number; duration: number }> = {
  sequence: { gap: 0.28, duration: 0.42 }, // a scale, one note after another
  strum: { gap: STRUM_SPEEDS.medium, duration: 1.9 }, // strings brushed, left to ring
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
  /** Tone shaping, in the sum rather than per note — see VOICES. */
  let tone: BiquadFilterNode[] | null = null;
  let live: AudioScheduledSourceNode[] = [];
  /** The current voice — changed by setTimbre, read when each note is built. */
  let timbre: Timbre = 'soft';

  /** Decoded audio, once an AudioContext has existed long enough to decode it. */
  const recordings = new Map<string, AudioBuffer>();

  /** Rendered fallback strings, keyed by voice and pitch. Insertion-ordered, so the
   *  oldest entry is simply the first key when the cache has to make room. */
  const strings = new Map<string, AudioBuffer>();

  /** Timers of the running progression — its loop keeps arming new ones. */
  let progressionTimers: number[] = [];
  let progressionCancelled = true;
  let progressionOnChord: ProgressionOptions['onChord'] = undefined;

  /** Points the tone filters at the current voice. */
  const applyTone = () => {
    if (!tone) return;
    const wanted = VOICES[timbre].tone;
    tone.forEach((filter, i) => {
      const resonance = wanted[i];
      // A peaking filter at 0 dB is transparent, so unused slots simply pass through
      // rather than needing the graph rewired every time the voice changes.
      filter.frequency.value = resonance?.frequency ?? 1000;
      filter.Q.value = resonance?.q ?? 1;
      filter.gain.value = resonance?.gain ?? 0;
    });
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

      // A limiter catches whatever the per-voice maths does not: a chord spanning
      // the whole neck is a dozen voices at once, and summing those straight into
      // the output clipped audibly.
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;

      // Tone shaping belongs to the instrument, not to any one note, so it sits in
      // the sum: two filters in total rather than two per pluck.
      tone = Array.from({ length: TONE_FILTERS }, () => {
        const filter = context!.createBiquadFilter();
        filter.type = 'peaking';
        return filter;
      });

      master = context.createGain();
      master.gain.value = 0.9;
      tone.reduce<AudioNode>((node, filter) => node.connect(filter), master).connect(limiter);
      limiter.connect(context.destination);

      applyTone();
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

  const voice = (ctx: AudioContext, midi: number, at: number, duration: number, peak: number) => {
    const recorded = recordingFor(midi);

    const source = ctx.createBufferSource();
    source.buffer = recorded ? recorded.buffer : modelledFor(ctx, midi);
    // Playing a recording faster raises its pitch, the way speeding up a record does.
    if (recorded) source.playbackRate.value = recorded.playbackRate;

    // The decay lives in the buffer — a real string dies away on its own, highs
    // first. So this gain only sets the level and takes the note away cleanly when
    // its time is up; an envelope with a decay of its own would fight that and choke
    // the note.
    const gain = ctx.createGain();
    const scaledPeak = peak * VOICES[timbre].gain;
    const fade = Math.min(0.08, duration / 2);
    gain.gain.setValueAtTime(scaledPeak, at);
    gain.gain.setValueAtTime(scaledPeak, at + duration - fade);
    gain.gain.linearRampToValueAtTime(0.0001, at + duration);

    const drive = VOICES[timbre].drive;
    if (drive !== null) {
      // Push it hard into the shaper first — that is what makes the note stay driven
      // as it decays instead of only clipping on the attack. The lowpass afterwards
      // shaves the fizz the shaper adds right at the top, leaving the bite.
      const preGain = ctx.createGain();
      preGain.gain.value = drive;

      const shaper = ctx.createWaveShaper();
      shaper.curve = DRIVE_CURVE;
      shaper.oversample = '4x';

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 8000;
      filter.Q.value = 0.7;

      source.connect(preGain).connect(shaper).connect(filter).connect(gain).connect(master!);
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
      voice(ctx, midi, start + i * step, ring, peak);
    });
  };

  const playNote = (midi: number) => {
    const ctx = ensureContext();
    // On its own, and so at full strength.
    voice(ctx, midi, ctx.currentTime + 0.02, 1, voicePeak(1));
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
      strumGap = STRUM_SPEEDS.medium,
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
        voice(ctx, midi, at + i * strumGap, strumRing, peak);
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
    // Recordings are cached per file and fallback strings per voice, so neither needs
    // invalidating — but the tone filters are one shared set and have to be pointed
    // at the new voice.
    applyTone();
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
