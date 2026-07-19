/**
 * CAGED: the five open chord shapes, moved up the neck.
 *
 * The lesson it teaches is one sentence — *the box your hand is in right now is
 * the E-shape of an A chord* — and that is what this module serves: given a chord,
 * say where each of its five shapes sits.
 *
 * Deliberately NOT part of SHAPE_SETS. Adding C, G and D forms there would quietly
 * change an existing feature: `namedVoicings` would start offering five grips per
 * major chord instead of two, the voicing picker in the progression panel would
 * grow, and `defaultVoicingIndex` could settle on a barred C-form — a grip nobody
 * actually plays. A teaching overlay and a list of playable grips are two
 * different jobs.
 */

import { type Chord } from './Chord';
import { firstFretFor, shapeSetFor } from './ChordShape';
import { mod } from './Note';
import { Tuning } from './Tuning';

export type CagedForm = 'C' | 'A' | 'G' | 'E' | 'D';

export interface CagedShape {
  readonly form: CagedForm;
  readonly qualityId: 'major' | 'minor';
  /** Which string carries the root. 0 = low E. */
  readonly rootString: number;
  /** Fret per string relative to the form's position; -1 = muted, lowest played = 0. */
  readonly frets: readonly number[];
}

/**
 * The five forms, read off the open chords they are named for. Relative frets, so
 * the lowest stopped string is 0.
 *
 * Minor forms exist for E, A and D — those are the open minor chords every
 * guitarist plays. C-minor and G-minor forms are theoretically derivable but
 * unplayable as barre grips, so they are left out rather than shown as advice
 * nobody could follow.
 */
export const CAGED_SHAPES: readonly CagedShape[] = [
  // C: x32010
  { form: 'C', qualityId: 'major', rootString: 1, frets: [-1, 3, 2, 0, 1, 0] },
  // A: x02220
  { form: 'A', qualityId: 'major', rootString: 1, frets: [-1, 0, 2, 2, 2, 0] },
  { form: 'A', qualityId: 'minor', rootString: 1, frets: [-1, 0, 2, 2, 1, 0] },
  // G: 320003
  { form: 'G', qualityId: 'major', rootString: 0, frets: [3, 2, 0, 0, 0, 3] },
  // E: 022100
  { form: 'E', qualityId: 'major', rootString: 0, frets: [0, 2, 2, 1, 0, 0] },
  { form: 'E', qualityId: 'minor', rootString: 0, frets: [0, 2, 2, 0, 0, 0] },
  // D: xx0232
  { form: 'D', qualityId: 'major', rootString: 2, frets: [-1, -1, 0, 2, 3, 2] },
  { form: 'D', qualityId: 'minor', rootString: 2, frets: [-1, -1, 0, 2, 3, 1] },
];

/** One CAGED form placed on the neck for a concrete chord. */
export interface CagedPlacement {
  readonly form: CagedForm;
  /** Fret the form's lowest finger sits on; 0 means it uses open strings. */
  readonly baseFret: number;
  readonly startFret: number;
  readonly endFret: number;
  /** Absolute fret per string; -1 = muted. */
  readonly frets: readonly number[];
}

export interface CagedOptions {
  readonly tuning?: Tuning;
  readonly maxFret?: number;
}

/** The order they appear in going up the neck, and the order the picker lists. */
export const CAGED_ORDER: readonly CagedForm[] = ['C', 'A', 'G', 'E', 'D'];

/**
 * Where the five forms of a chord sit, low to high.
 *
 * Empty for any tuning without the standard string intervals: in Drop D the C, G
 * and E forms all change shape, and the project's rule is that no grip beats a
 * wrong one (see voicingsFor). Eb is unaffected — it shifts every string equally
 * and so keeps the standard intervals.
 *
 * A form recurs twelve frets higher; only the lowest placement is returned, since
 * the overlay shows one window at a time.
 */
export function cagedPlacements(chord: Chord, options: CagedOptions = {}): CagedPlacement[] {
  const tuning = options.tuning ?? Tuning.STANDARD;
  const maxFret = options.maxFret ?? 15;

  // CAGED is a standard-tuning idea. A capoed standard tuning still qualifies:
  // the capo shifts every string equally, so the intervals are untouched.
  if (shapeSetFor(tuning)?.id !== 'standard') return [];
  if (!chord.quality) return [];

  const quality = chord.quality.id;
  if (quality !== 'major' && quality !== 'minor') return [];

  const placements: CagedPlacement[] = [];

  for (const shape of CAGED_SHAPES) {
    if (shape.qualityId !== quality) continue;

    // Where the root has to land, and where the form must sit for it to land there.
    const rootFret = firstFretFor(tuning, shape.rootString, chord.root.pitchClass);
    const baseFret = mod(rootFret - shape.frets[shape.rootString], 12);

    const frets = shape.frets.map((relative) => (relative < 0 ? -1 : baseFret + relative));
    const played = frets.filter((fret) => fret >= 0);
    if (Math.max(...played) > maxFret) continue;

    placements.push({
      form: shape.form,
      baseFret,
      startFret: Math.min(...played),
      endFret: Math.max(...played),
      frets,
    });
  }

  return placements.sort((a, b) => a.baseFret - b.baseFret);
}

/** The placement of one named form, or null if it does not fit this neck. */
export function cagedPlacement(
  chord: Chord,
  form: CagedForm,
  options: CagedOptions = {},
): CagedPlacement | null {
  return cagedPlacements(chord, options).find((placement) => placement.form === form) ?? null;
}
