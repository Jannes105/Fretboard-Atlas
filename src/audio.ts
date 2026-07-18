import { pluck, type PluckOptions } from './synth/pluck';
import { impulseResponse, ROOMS, type RoomId } from './synth/reverb';
import { sampleFor, type SampleSet } from './synth/sampleSet';
import {
  arpeggioStringCount,
  dropHighest,
  midiToFrequency,
  STANDARD_STRUM_GAP,
  type StrumSlot,
  strumOffsets,
  strumRing,
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
 * The instrument's voice. Both are recordings, and of different guitars:
 *
 * - `clean` — Karoryfer Shinyguitar, an archtop through its magnetic pickup.
 * - `electric` — FreePats EGuitarFSBS, a Fender recorded *through a real amplifier
 *   and effects rack*, so the overdrive is played rather than computed.
 *
 * The overdrive used to be a WaveShaper on the clean recording, and three rounds of
 * tuning it never sounded like an amplifier. Two reasons, both structural: a shaper
 * per note distorts each string separately where an amplifier distorts the sum of
 * all six, and there was no speaker cabinet to tame the fizz above 5 kHz. Both come
 * free with a recording.
 *
 * A third voice, `soft`, was the microphone take of the same archtop as `clean`. It
 * measured 6.7 dB away across third-octave bands and still did not sound like a
 * second instrument — because it was not one. It now falls back to `clean`, so old
 * links keep working.
 */
export type Timbre = 'clean' | 'electric';

/** One resonance: where, how narrow, how much. */
interface Resonance {
  frequency: number;
  q: number;
  gain: number;
}

/**
 * How each voice is put together.
 *
 * The tone shaping is deliberately light, and for the overdrive there is none at
 * all: a recording arrives with its own guitar, its own pickup and — for the
 * overdrive — its own amplifier and speaker. There is nothing here left to build.
 */
const VOICES: Record<
  Timbre,
  {
    /** Which recorded set feeds it, keyed as in public/samples/manifest.json. */
    readonly recording: 'electric' | 'dist';
    readonly tone: readonly Resonance[];
    /** Loudness trim, measured — not set by ear. */
    readonly gain: number;
  }
> = {
  clean: {
    recording: 'electric',
    tone: [{ frequency: 2600, q: 0.8, gain: 2 }],
    gain: 1,
  },
  electric: {
    recording: 'dist',
    tone: [],
    // A distorted recording is heavily compressed, so it carries far more energy at
    // the same peak level. Measured at 2.97x the clean set's RMS.
    gain: 0.34,
  },
};

/** Filters kept in the sum for tone shaping. Unused ones sit flat and pass through. */
const TONE_FILTERS = 2;

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
 */
function voicePeak(simultaneous: number): number {
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
  /** Switch the room. Takes effect immediately, including on notes already ringing. */
  setRoom(room: RoomId): void;
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
      setRoom: () => {},
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
  /** The room: a convolver on a send, with its share set by wetGain. */
  let convolver: ConvolverNode | null = null;
  let wetGain: GainNode | null = null;
  /** The current voice — changed by setTimbre, read when each note is built. */
  let timbre: Timbre = 'clean';
  let room: RoomId = 'on';

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

  /** Builds the room and sets how much of it is heard. */
  const applyRoom = (ctx: AudioContext) => {
    if (!convolver || !wetGain) return;

    const { seconds, decay, wet } = ROOMS[room];
    if (wet > 0) {
      const channels = impulseResponse(ctx.sampleRate, { seconds, decay });
      const buffer = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
      channels.forEach((channel, i) => buffer.copyToChannel(channel, i));
      convolver.buffer = buffer;
    }
    // A short ramp rather than a jump: switching rooms mid-chord would otherwise click.
    wetGain.gain.setTargetAtTime(wet, ctx.currentTime, 0.02);
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

      // Tone shaping belongs to the instrument, not to any one note, so it sits in
      // the sum: two filters in total rather than two per pluck.
      tone = Array.from({ length: TONE_FILTERS }, () => {
        const filter = context!.createBiquadFilter();
        filter.type = 'peaking';
        return filter;
      });

      // The safety net, and the last thing anything passes through.
      const ceiling = context.createWaveShaper();
      ceiling.curve = CEILING_CURVE;
      ceiling.oversample = '4x';
      ceiling.connect(context.destination);

      master = context.createGain();
      master.gain.value = 0.9;
      const shaped = tone.reduce<AudioNode>((node, filter) => node.connect(filter), master);

      // The room hangs off a send, so the dry signal reaches the output untouched
      // whether or not there is any reverb — "off" is genuinely off, not a mix at
      // zero that still colours things.
      convolver = context.createConvolver();
      // Left on — the default — this scales the impulse response to unit gain, and
      // for a long noisy tail that is a division by well over a hundred. Measured, it
      // brought the reverb back at 4 % of the dry signal: audibly nothing.
      convolver.normalize = false;
      wetGain = context.createGain();
      wetGain.gain.value = 0;
      shaped.connect(convolver).connect(wetGain).connect(ceiling);
      shaped.connect(ceiling);

      applyTone();
      applyRoom(context);
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

    // Straight through. The overdrive used to be a WaveShaper here and is now part of
    // the recording, which is the whole reason it stopped sounding computed.
    source.connect(gain).connect(master!);

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
      style = 'standard',
      onChord,
    } = options;
    const barsOf = (index: number) => Math.max(1, chordBars?.[index] ?? 1);

    const secondsPerBeat = secondsPerBar / beatsPerBar;
    const slotSeconds = secondsPerBeat / 2; // eighth-note grid: two slots per beat
    // A strum rings a beat or so, overlapping the next a little the way real
    // strumming sustains. An arpeggio has to hold its notes until the bar is out, or
    // the chord is never heard as a chord.
    const ring = strumRing(style, secondsPerBar, Math.min(secondsPerBeat * 1.3, 2));

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

    // Every chord of an arpeggio plays the same number of strings, so that dividing
    // the bar among them gives the same pulse throughout. Decided across the whole
    // progression, which is why it lives here rather than inside one strum.
    const arpeggioStrings = style === 'arpeggio' ? arpeggioStringCount(voiced) : 0;

    // One strum: the strings brushed low-to-high (down) or high-to-low (up).
    const strum = (chord: readonly number[], at: number, slot: StrumSlot, peak: number) => {
      if (slot === null) return;
      const played = style === 'arpeggio' ? dropHighest(chord, arpeggioStrings) : chord;
      const order = slot === 'up' ? [...played].reverse() : played;
      const offsets = strumOffsets(order.length, style, secondsPerBar);
      order.forEach((midi, i) => {
        voice(ctx, midi, at + offsets[i], ring, peak);
      });
    };

    /**
     * One bar of one chord. An arpeggio ignores the strum pattern: spreading the
     * chord across the whole bar IS the pattern, and laying a second one over it
     * would just restart the arpeggio on every eighth.
     */
    const scheduleBar = (chord: readonly number[], barAt: number, peak: number) => {
      if (style === 'arpeggio') {
        strum(chord, barAt, 'down', peak);
        return;
      }
      pattern.forEach((slot, s) => strum(chord, barAt + s * slotSeconds, slot, peak));
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
        // Lay one bar's worth across each bar the chord is held.
        for (let bar = 0; bar < bars; bar++) {
          scheduleBar(chord, at + bar * secondsPerBar, peak);
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

  const setRoom = (next: RoomId) => {
    room = next;
    // Only if a context exists — this must not start audio before a gesture.
    if (context) applyRoom(context);
  };

  return {
    play,
    playNote,
    startProgression,
    stop,
    setTimbre,
    setRoom,
    available: true,
  };
}
