import type { Chord } from './Chord';
import { mod } from './Note';
import { Tuning } from './Tuning';
import { generateVoicings } from './voicingSearch';

/**
 * A movable chord shape: a pattern of frets, slid up and down the neck.
 *
 * What a shape sounds like depends purely on the gaps BETWEEN the strings, never
 * on their absolute pitch. So a shape set is keyed by a tuning's interval pattern:
 * standard is [5,5,5,4,5], Drop D is [7,5,5,4,5]. Anything that shifts every
 * string equally — a capo above all — keeps the pattern and reuses the same set.
 *
 * The numbers are not taken on trust: ChordShape.test.ts plays every shape of
 * every set on every root and checks the pitches really do spell the chord.
 */
export interface ChordShape {
  /** Which chord quality this shape voices. */
  readonly qualityId: string;
  readonly name: string;
  /** String the root sits on: 0 = low E, 1 = A. */
  readonly rootString: number;
  /**
   * Fret per string (0 = low E .. 5 = high e), relative to the shape's position.
   * -1 = muted. The lowest played fret is 0, so the position is where the barre goes.
   *
   * Note that the root is NOT always at 0: in Drop D the low string is a whole step
   * down, so a root fretted there sits two frets higher than the rest of the shape.
   */
  readonly frets: readonly number[];
}

export interface ShapeSet {
  readonly id: string;
  /** Semitone gaps between adjacent strings that these shapes require. */
  readonly intervals: readonly number[];
  readonly shapes: readonly ChordShape[];
}

const STANDARD_SHAPES: readonly ChordShape[] = [
  // Root on the low E string.
  { qualityId: 'major', name: 'E-Form', rootString: 0, frets: [0, 2, 2, 1, 0, 0] },
  { qualityId: 'minor', name: 'E-Form', rootString: 0, frets: [0, 2, 2, 0, 0, 0] },
  { qualityId: 'dominant7', name: 'E-Form', rootString: 0, frets: [0, 2, 0, 1, 0, 0] },
  { qualityId: 'minor7', name: 'E-Form', rootString: 0, frets: [0, 2, 0, 0, 0, 0] },
  { qualityId: 'major7', name: 'E-Form', rootString: 0, frets: [0, 2, 1, 1, 0, 0] },
  { qualityId: 'diminished', name: 'E-Form', rootString: 0, frets: [0, 1, 2, 0, -1, -1] },
  { qualityId: 'minor7b5', name: 'E-Form', rootString: 0, frets: [0, 1, 0, 0, -1, -1] },
  { qualityId: 'augmented', name: 'E-Form', rootString: 0, frets: [0, 3, 2, 1, 1, 0] },
  { qualityId: 'minorMajor7', name: 'E-Form', rootString: 0, frets: [0, 2, 1, 0, 0, 0] },
  { qualityId: 'diminished7', name: 'E-Form', rootString: 0, frets: [0, 1, 2, 0, 2, -1] },

  // Root on the A string.
  { qualityId: 'major', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 2, 2, 0] },
  { qualityId: 'minor', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 2, 1, 0] },
  { qualityId: 'dominant7', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 0, 2, 0] },
  { qualityId: 'minor7', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 0, 1, 0] },
  { qualityId: 'major7', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 1, 2, 0] },
  { qualityId: 'diminished', name: 'A-Form', rootString: 1, frets: [-1, 0, 1, 2, 1, -1] },
  { qualityId: 'minor7b5', name: 'A-Form', rootString: 1, frets: [-1, 0, 1, 0, 1, -1] },
  { qualityId: 'diminished7', name: 'A-Form', rootString: 1, frets: [-1, 0, 1, 2, 1, 2] },
  { qualityId: 'augmented', name: 'A-Form', rootString: 1, frets: [-1, 0, 3, 2, 2, -1] },
  { qualityId: 'minorMajor7', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 1, 1, 0] },

  // Power chords: root, fifth, octave — no third, so nothing to make major or minor.
  { qualityId: 'power', name: 'E-Form', rootString: 0, frets: [0, 2, 2, -1, -1, -1] },
  { qualityId: 'power', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 2, -1, -1] },

  // Suspensions: the third is replaced by the second (sus2) or the fourth (sus4).
  { qualityId: 'sus4', name: 'E-Form', rootString: 0, frets: [0, 2, 2, 2, 0, 0] },
  { qualityId: 'sus4', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 2, 3, 0] },
  // sus2 has no comfortable root-on-low-E grip, so it lives on the A-form only.
  { qualityId: 'sus2', name: 'A-Form', rootString: 1, frets: [-1, 0, 2, 2, 0, 0] },
];

/**
 * Drop D moves ONLY the low string, down a whole step. Three consequences:
 *
 * - The A-forms mute that string anyway, so they carry over untouched.
 *
 * - The E-forms keep their grip on strings 2-6 — those are still tuned like
 *   standard — but need the low string two frets higher to reach the same root:
 *   [0,2,2,1,0,0] becomes [2,2,2,1,0,0]. The root therefore sits two frets ABOVE
 *   the shape's position instead of on it.
 *
 * - That E-form can never reach a root on fret 0, which would leave Drop D
 *   without the one chord it exists for: a D with the fat open low string. Hence
 *   the D-form, where the root lies on the barre itself. At position 0 it is
 *   exactly the open Drop D chord, and it slides up the neck like any other.
 */
const DROP_D_SHAPES: readonly ChordShape[] = [
  // Root two frets above the barre (the adapted E-forms).
  { qualityId: 'major', name: 'E-Form', rootString: 0, frets: [2, 2, 2, 1, 0, 0] },
  { qualityId: 'minor', name: 'E-Form', rootString: 0, frets: [2, 2, 2, 0, 0, 0] },
  { qualityId: 'dominant7', name: 'E-Form', rootString: 0, frets: [2, 2, 0, 1, 0, 0] },
  { qualityId: 'minor7', name: 'E-Form', rootString: 0, frets: [2, 2, 0, 0, 0, 0] },
  { qualityId: 'major7', name: 'E-Form', rootString: 0, frets: [2, 2, 1, 1, 0, 0] },
  { qualityId: 'diminished', name: 'E-Form', rootString: 0, frets: [2, 1, 2, 0, -1, -1] },
  { qualityId: 'minor7b5', name: 'E-Form', rootString: 0, frets: [2, 1, 0, 0, -1, -1] },
  { qualityId: 'augmented', name: 'E-Form', rootString: 0, frets: [2, 3, 2, 1, 1, 0] },
  { qualityId: 'minorMajor7', name: 'E-Form', rootString: 0, frets: [2, 2, 1, 0, 0, 0] },
  { qualityId: 'diminished7', name: 'E-Form', rootString: 0, frets: [2, 1, 2, 0, 2, -1] },

  // Root on the barre — the three low strings give root, fifth and octave.
  { qualityId: 'major', name: 'D-Form', rootString: 0, frets: [0, 0, 0, 2, 3, 2] },
  { qualityId: 'minor', name: 'D-Form', rootString: 0, frets: [0, 0, 0, 2, 3, 1] },
  { qualityId: 'dominant7', name: 'D-Form', rootString: 0, frets: [0, 0, 0, 2, 1, 2] },
  { qualityId: 'minor7', name: 'D-Form', rootString: 0, frets: [0, 0, 0, 2, 1, 1] },
  { qualityId: 'major7', name: 'D-Form', rootString: 0, frets: [0, 0, 0, 2, 2, 2] },

  // The one-finger power chord Drop D exists for: the low three strings are tuned
  // to root, fifth, octave, so barring them is already a power chord. The adapted
  // E-form would mute those strings and so never start on relative fret 0.
  { qualityId: 'power', name: 'D-Form', rootString: 0, frets: [0, 0, 0, -1, -1, -1] },

  // sus4 carries over as an adapted E-form: the low string two frets higher, the
  // rest of the grip unchanged because those strings are still tuned like standard.
  { qualityId: 'sus4', name: 'E-Form', rootString: 0, frets: [2, 2, 2, 2, 0, 0] },

  // Untouched — these never sound the low string (power, sus2 and sus4 A-forms too).
  ...STANDARD_SHAPES.filter((shape) => shape.rootString === 1),
];

export const SHAPE_SETS: readonly ShapeSet[] = [
  { id: 'standard', intervals: Tuning.STANDARD.intervals, shapes: STANDARD_SHAPES },
  { id: 'drop-d', intervals: Tuning.DROP_D.intervals, shapes: DROP_D_SHAPES },
];

/**
 * The shapes valid in a tuning, or null if we have none for it.
 *
 * Matching on intervals rather than on the tuning object is what makes a capo
 * work: a capo shifts every string equally, so a capoed standard tuning still
 * has standard intervals and keeps its shapes.
 */
export function shapeSetFor(tuning: Tuning): ShapeSet | null {
  const intervals = tuning.intervals;

  return (
    SHAPE_SETS.find(
      (set) =>
        set.intervals.length === intervals.length &&
        set.intervals.every((interval, i) => interval === intervals[i]),
    ) ?? null
  );
}

/** Whether chord diagrams can be drawn for this tuning at all. */
export function hasChordShapes(tuning: Tuning): boolean {
  return shapeSetFor(tuning) !== null;
}

/** A shape placed at a concrete position on the neck. */
export interface Voicing {
  readonly shapeName: string;
  /** Fret the shape's lowest finger sits on; 0 means it uses open strings. */
  readonly baseFret: number;
  /** Absolute fret per string (0 = low E .. 5 = high e). -1 = muted, 0 = open. */
  readonly frets: readonly number[];
  /** A shape moved off the nut is barred: the index finger stops the whole fret. */
  readonly isBarre: boolean;
}

export interface VoicingOptions {
  readonly tuning?: Tuning;
  readonly maxFret?: number;
}

/** Lowest fret at which `string` sounds the given pitch class. */
function firstFretFor(tuning: Tuning, stringIndex: number, pitchClass: number): number {
  const open = tuning.pitchClassAt(stringIndex, 0);
  return mod(pitchClass - open, 12);
}

/**
 * The hand-authored movable shapes placed at concrete positions — the idiomatic
 * grips (E-form, A-form, ...) for a root-position chord in a tuning we have a set
 * for. Empty when neither applies; the generator then takes over.
 */
function namedVoicings(chord: Chord, tuning: Tuning, maxFret: number): Voicing[] {
  const shapeSet = shapeSetFor(tuning);
  if (!shapeSet || !chord.quality) return [];

  const voicings: Voicing[] = [];

  for (const shape of shapeSet.shapes) {
    if (shape.qualityId !== chord.quality.id) continue;

    // Where the root must land, and where the shape has to sit for it to land there.
    const rootFret = firstFretFor(tuning, shape.rootString, chord.root.pitchClass);
    const lowestPosition = mod(rootFret - shape.frets[shape.rootString], 12);

    // The same shape repeats an octave — 12 frets — higher up the neck.
    for (let baseFret = lowestPosition; baseFret <= maxFret; baseFret += 12) {
      const frets = shape.frets.map((relative) => (relative < 0 ? -1 : baseFret + relative));

      if (Math.max(...frets) > maxFret) break;

      voicings.push({ shapeName: shape.name, baseFret, frets, isBarre: baseFret > 0 });
    }
  }

  return voicings.sort((a, b) => a.baseFret - b.baseFret || a.shapeName.localeCompare(b.shapeName));
}

/**
 * Every playable voicing of a chord, lowest position first. The UI shows all of
 * them in the picker, so nothing is filtered out here; defaultVoicingIndex
 * decides what starts selected.
 *
 * Idiomatic hand shapes come first where they exist. Everything else — sixths,
 * m6, augMaj7, and any slash chord (whose bass the fixed shapes cannot place) —
 * falls to the search engine, which finds a grip on the actual fretboard. So
 * every chord the app can name can also be played, and what is drawn is what
 * sounds.
 */
export function voicingsFor(chord: Chord, options: VoicingOptions = {}): Voicing[] {
  const { tuning = Tuning.STANDARD, maxFret = 15 } = options;

  if (!chord.quality) return [];

  const named = chord.bass ? [] : namedVoicings(chord, tuning, maxFret);
  if (named.length > 0) return named;

  return generateVoicings(chord, tuning, maxFret);
}

/**
 * Which voicing starts selected: the lowest barre shape.
 *
 * Barre is the default because it is the same grip everywhere on the neck — the
 * open shapes stay one click away in the picker.
 *
 * Falls back to the first entry rather than selecting nothing.
 */
export function defaultVoicingIndex(voicings: readonly Voicing[]): number {
  const index = voicings.findIndex((voicing) => voicing.isBarre);
  return index < 0 ? 0 : index;
}
