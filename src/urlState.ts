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
  /** Tempo of the progression, in beats per minute. One chord lasts one bar. */
  bpm: number;
  loop: boolean;
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
};

const FRET_COUNTS = [12, 15, 24];
const MAX_CAPO = 7;
export const MIN_BPM = 40;
export const MAX_BPM = 200;

function pickInt(raw: string | null, allowed: (value: number) => boolean, fallback: number): number {
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && allowed(value) ? value : fallback;
}

function pickFrom<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
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
    tuningId: pickFrom(
      params.get('tuning'),
      Tuning.ALL.map((tuning) => tuning.id),
      DEFAULT_STATE.tuningId,
    ),
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

  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
