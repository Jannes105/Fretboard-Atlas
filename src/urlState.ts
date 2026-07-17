import type { Timbre } from './audio';
import type { LabelMode } from './components/FretboardView';
import { ROOT_CHOICES, SCALE_TYPES, type ChordSize, Tuning } from './theory';

/**
 * Everything the app shows, kept in the URL query string.
 *
 * The URL is the single source of truth for persistence: a reload restores the
 * view, and the link can simply be sent to someone else — which localStorage
 * could not do. Anything unknown or out of range falls back to the default
 * rather than throwing, because a URL is user-editable and will be mistyped.
 */
export interface AppState {
  root: string;
  scaleTypeId: string;
  tuningId: string;
  capo: number;
  fretCount: number;
  labelMode: LabelMode;
  chordSize: ChordSize;
  progressionId: string;
  /** 0 = whole neck. */
  boxNumber: number;
  /** Tempo of the progression, in beats per minute. */
  bpm: number;
  loop: boolean;
  /** The instrument's voice. */
  sound: Timbre;
  /** Beats per bar — the time signature's feel (4 = 4/4, 3 = 3/4, 6 = 6/8, 2 = 2/4). */
  beatsPerBar: number;
}

export const DEFAULT_STATE: AppState = {
  root: 'A',
  scaleTypeId: 'major',
  tuningId: 'standard',
  capo: 0,
  fretCount: 24,
  labelMode: 'note',
  chordSize: 3,
  progressionId: 'I-V-vi-IV',
  boxNumber: 0,
  bpm: 90,
  loop: true,
  sound: 'soft',
  beatsPerBar: 4,
};

const FRET_COUNTS = [12, 15, 24];
const SOUNDS: readonly Timbre[] = ['soft', 'clean', 'electric'];
const BEATS_PER_BAR = [2, 3, 4, 6];
const MAX_CAPO = 7;
export const MIN_BPM = 40;
export const MAX_BPM = 200;

/**
 * A self-built progression rides in the same `prog` slot as the presets, marked
 * off by this prefix: `custom:C,G,Am,F`. The chords are absolute (not scale
 * degrees), so the sequence survives a key change — only its roman numerals move.
 * Each chord may carry a duration in bars, `C*2`; a bare symbol means one bar, so
 * older links stay valid.
 */
const CUSTOM_PROG_PREFIX = 'custom:';
const MAX_BARS = 8;

/** One chord of a self-built progression: what to play, and for how many bars. */
export interface CustomStep {
  readonly symbol: string;
  readonly bars: number;
}

export function customProgId(steps: readonly CustomStep[]): string {
  return (
    CUSTOM_PROG_PREFIX +
    steps.map((step) => (step.bars > 1 ? `${step.symbol}*${step.bars}` : step.symbol)).join(',')
  );
}

/** The chords of a custom progression id, with bar counts, or null if it is a preset. */
export function customProgSteps(progressionId: string): CustomStep[] | null {
  if (!progressionId.startsWith(CUSTOM_PROG_PREFIX)) return null;
  return progressionId
    .slice(CUSTOM_PROG_PREFIX.length)
    .split(',')
    .filter(Boolean)
    .map((token) => {
      const star = token.indexOf('*');
      if (star < 0) return { symbol: token, bars: 1 };
      const bars = Number(token.slice(star + 1));
      return {
        symbol: token.slice(0, star),
        bars: Number.isInteger(bars) && bars >= 1 && bars <= MAX_BARS ? bars : 1,
      };
    });
}

/**
 * A free tuning rides in the same `tuning` slot as the presets, marked by this
 * prefix: `custom:D,A,D,G,B,E` — six note names, low string first.
 */
const CUSTOM_TUNING_PREFIX = 'custom:';
const NOTE_PATTERN = /^[A-Ga-g][#b]*$/;

export function customTuningId(noteNames: readonly string[]): string {
  return CUSTOM_TUNING_PREFIX + noteNames.join(',');
}

/** The six string notes of a custom tuning id, or null if it is a preset or malformed. */
export function customTuningNotes(tuningId: string): string[] | null {
  if (!tuningId.startsWith(CUSTOM_TUNING_PREFIX)) return null;
  const notes = tuningId.slice(CUSTOM_TUNING_PREFIX.length).split(',');
  // Only a full, note-shaped six-string set counts — anything else falls back.
  if (notes.length !== 6 || !notes.every((note) => NOTE_PATTERN.test(note))) return null;
  return notes;
}

function pickInt(raw: string | null, allowed: (value: number) => boolean, fallback: number): number {
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && allowed(value) ? value : fallback;
}

function pickFrom<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** A preset id, or a well-formed custom tuning; anything else falls back to standard. */
function readTuning(raw: string | null): string {
  if (raw !== null && customTuningNotes(raw) !== null) return raw;
  return pickFrom(
    raw,
    Tuning.ALL.map((tuning) => tuning.id),
    DEFAULT_STATE.tuningId,
  );
}

export function readState(search: string): AppState {
  const params = new URLSearchParams(search);

  return {
    root: pickFrom(params.get('root'), ROOT_CHOICES as readonly string[], DEFAULT_STATE.root),
    scaleTypeId: pickFrom(
      params.get('scale'),
      SCALE_TYPES.map((type) => type.id),
      DEFAULT_STATE.scaleTypeId,
    ),
    tuningId: readTuning(params.get('tuning')),
    capo: pickInt(params.get('capo'), (v) => v >= 0 && v <= MAX_CAPO, DEFAULT_STATE.capo),
    fretCount: pickInt(params.get('frets'), (v) => FRET_COUNTS.includes(v), DEFAULT_STATE.fretCount),
    labelMode: pickFrom(params.get('labels'), ['note', 'degree'] as const, DEFAULT_STATE.labelMode),
    chordSize: pickInt(params.get('chords'), (v) => v === 3 || v === 4, DEFAULT_STATE.chordSize) as
      | 3
      | 4,
    progressionId: params.get('prog') ?? DEFAULT_STATE.progressionId,
    // The scale decides how many boxes exist, so only the lower bound is checked here.
    boxNumber: pickInt(params.get('box'), (v) => v >= 0, DEFAULT_STATE.boxNumber),
    bpm: pickInt(params.get('bpm'), (v) => v >= MIN_BPM && v <= MAX_BPM, DEFAULT_STATE.bpm),
    loop: params.get('loop') === null ? DEFAULT_STATE.loop : params.get('loop') !== '0',
    sound: pickFrom(params.get('sound'), SOUNDS, DEFAULT_STATE.sound),
    beatsPerBar: pickInt(
      params.get('sig'),
      (v) => BEATS_PER_BAR.includes(v),
      DEFAULT_STATE.beatsPerBar,
    ),
  };
}

/** Query string for a state, leaving out anything still at its default. */
export function writeState(state: AppState): string {
  const params = new URLSearchParams();

  const add = (key: string, value: string | number, fallback: string | number) => {
    if (value !== fallback) params.set(key, String(value));
  };

  add('root', state.root, DEFAULT_STATE.root);
  add('scale', state.scaleTypeId, DEFAULT_STATE.scaleTypeId);
  add('tuning', state.tuningId, DEFAULT_STATE.tuningId);
  add('capo', state.capo, DEFAULT_STATE.capo);
  add('frets', state.fretCount, DEFAULT_STATE.fretCount);
  add('labels', state.labelMode, DEFAULT_STATE.labelMode);
  add('chords', state.chordSize, DEFAULT_STATE.chordSize);
  add('prog', state.progressionId, DEFAULT_STATE.progressionId);
  add('box', state.boxNumber, DEFAULT_STATE.boxNumber);
  add('bpm', state.bpm, DEFAULT_STATE.bpm);
  if (state.loop !== DEFAULT_STATE.loop) params.set('loop', state.loop ? '1' : '0');
  add('sound', state.sound, DEFAULT_STATE.sound);
  add('sig', state.beatsPerBar, DEFAULT_STATE.beatsPerBar);

  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
