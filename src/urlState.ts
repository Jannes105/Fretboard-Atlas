import type { Timbre } from './audio';
import type { LabelMode } from './components/FretboardView';
import {
  ROOT_CHOICES,
  SCALE_TYPES,
  type ChordSize,
  isDefaultPattern,
  serializePattern,
  defaultPattern,
  type ClickMode,
  type NoteLength,
  type StrumStyle,
  Tuning,
} from './theory';

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
  /**
   * Crop the neck to the selected position. Unlike the theme, this describes the
   * picture rather than the viewer, so it belongs in a shareable link.
   */
  boxZoom: boolean;
  /** Tempo of the progression, in beats per minute. */
  bpm: number;
  loop: boolean;
  /** The instrument's voice. */
  sound: Timbre;
  /** Beats per bar — the time signature's feel (4 = 4/4, 3 = 3/4, 6 = 6/8, 2 = 2/4). */
  beatsPerBar: number;
  /** Strum pattern for one bar as a d/u/- string; length follows beatsPerBar. */
  rhythm: string;
  /** Brushed together, or walked across the whole bar. */
  strum: StrumStyle;
  /** Whether notes ring on or are cut off after each strum. */
  sustain: NoteLength;
  /** Count-in only, a click throughout, or neither. */
  click: ClickMode;
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
  boxZoom: true,
  bpm: 90,
  loop: true,
  sound: 'clean',
  beatsPerBar: 4,
  rhythm: serializePattern(defaultPattern(4)),
  strum: 'standard',
  sustain: 'ring',
  click: 'off',
};

const FRET_COUNTS = [12, 15, 24];
const SOUNDS: readonly Timbre[] = ['clean', 'electric'];
const STRUMS: readonly StrumStyle[] = ['standard', 'arpeggio'];
const SUSTAINS: readonly NoteLength[] = ['ring', 'stopped'];
const CLICKS: readonly ClickMode[] = ['off', 'countIn', 'metronome'];
const BEATS_PER_BAR = [2, 3, 4, 6];
/** Exported because SetupPanel builds its dropdown from it — one limit, not two. */
export const MAX_CAPO = 12;
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

  const beatsPerBar = pickInt(
    params.get('sig'),
    (v) => BEATS_PER_BAR.includes(v),
    DEFAULT_STATE.beatsPerBar,
  );
  // Keep the pattern the right length for the meter — a leftover from another time
  // signature is dropped rather than kept as garbage.
  const rawRhythm = params.get('rhythm');
  const rhythm =
    rawRhythm !== null && rawRhythm.length === beatsPerBar * 2
      ? rawRhythm
      : serializePattern(defaultPattern(beatsPerBar));

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
    boxZoom: params.get('zoom') === null ? DEFAULT_STATE.boxZoom : params.get('zoom') !== '0',
    bpm: pickInt(params.get('bpm'), (v) => v >= MIN_BPM && v <= MAX_BPM, DEFAULT_STATE.bpm),
    loop: params.get('loop') === null ? DEFAULT_STATE.loop : params.get('loop') !== '0',
    sound: pickFrom(params.get('sound'), SOUNDS, DEFAULT_STATE.sound),
    strum: pickFrom(params.get('strum'), STRUMS, DEFAULT_STATE.strum),
    sustain: pickFrom(params.get('sustain'), SUSTAINS, DEFAULT_STATE.sustain),
    click: pickFrom(params.get('click'), CLICKS, DEFAULT_STATE.click),
    beatsPerBar,
    rhythm,
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
  // A boolean needs its own branch: add() only takes strings and numbers.
  if (state.boxZoom !== DEFAULT_STATE.boxZoom) params.set('zoom', state.boxZoom ? '1' : '0');
  add('bpm', state.bpm, DEFAULT_STATE.bpm);
  if (state.loop !== DEFAULT_STATE.loop) params.set('loop', state.loop ? '1' : '0');
  add('sound', state.sound, DEFAULT_STATE.sound);
  add('strum', state.strum, DEFAULT_STATE.strum);
  add('sustain', state.sustain, DEFAULT_STATE.sustain);
  add('click', state.click, DEFAULT_STATE.click);
  add('sig', state.beatsPerBar, DEFAULT_STATE.beatsPerBar);
  // Only a real, meter-matching pattern is worth a link; a wrong-length leftover
  // would be reset on read anyway.
  if (
    state.rhythm.length === state.beatsPerBar * 2 &&
    !isDefaultPattern(state.rhythm, state.beatsPerBar)
  ) {
    params.set('rhythm', state.rhythm);
  }

  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** Below this width the CSS switches to its phone layout (see App.css). */
export const NARROW_VIEWPORT = 700;
/** A 24-fret neck cannot be read on a phone; twelve frets can. */
export const NARROW_FRET_COUNT = 12;

/**
 * What a device should start from: the URL, plus a device-appropriate value for
 * anything the URL did not spell out. Only the fret count qualifies today.
 *
 * Kept apart from readState so that stays a pure function of its string — a
 * property urlState.test.ts pins down in its very first assertion, and the reason
 * DEFAULT_STATE.fretCount stays at 24 no matter what device is asking.
 *
 * The seed does not create a hidden mode: writeState omits only DEFAULTS, so the
 * moment it applies, `frets=12` lands in the URL. A phone user's link is therefore
 * explicit and opens as twelve frets anywhere. A desktop link at 24 (unwritten)
 * opening on a phone as 12 is the correct reading of "the sender did not say".
 */
export function initialState(search: string, viewportWidth: number): AppState {
  const state = readState(search);

  const urlIsSilentAboutFrets = new URLSearchParams(search).get('frets') === null;
  if (urlIsSilentAboutFrets && viewportWidth > 0 && viewportWidth < NARROW_VIEWPORT) {
    return { ...state, fretCount: NARROW_FRET_COUNT };
  }

  return state;
}
