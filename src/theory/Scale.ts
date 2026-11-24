import { Note, pitchClassNames } from './Note';
import {
  chordParentOf,
  degreeLabel,
  MAJOR,
  NATURAL_MINOR,
  scaleTypeById,
  type ScaleType,
} from './ScaleType';

/** A key: a root note plus a scale type. */
export class Scale {
  readonly root: Note;
  readonly type: ScaleType;
  /** The scale notes, correctly spelled, starting at the root. */
  readonly notes: readonly Note[];

  constructor(root: Note, type: ScaleType) {
    this.root = root;
    this.type = type;
    this.notes = type.semitones.map((semitones, i) =>
      root.transpose(semitones, type.diatonicSteps[i]),
    );
  }

  /**
   * Parses a key the way a guitarist types it: "A-Dur", "C#-Moll", "Bb major",
   * "D dorisch". A bare root defaults to major.
   */
  static parse(input: string): Scale {
    const text = input.trim();
    const match = /^([A-Ga-g][#b]*)\s*[-\s]?\s*(.*)$/.exec(text);
    if (!match) {
      throw new Error(`Keine gültige Tonart: "${input}"`);
    }

    const root = Note.parse(match[1]);
    const rest = match[2].trim().toLowerCase();

    if (rest === '') return new Scale(root, MAJOR);

    const type = SCALE_ALIASES[rest];
    if (!type) {
      throw new Error(`Unbekannte Tonart/Skala: "${match[2].trim()}"`);
    }
    return new Scale(root, type);
  }

  /**
   * The key whose diatonic harmony backs this one: itself when it has seven
   * degrees, its parent on the SAME root when it has fewer, null when it has no
   * parent either.
   *
   * A-Moll-Pentatonik → A-Moll, A-Blues → A-Moll, C-Dur-Pentatonik → C-Dur. The
   * root never moves: a pentatonic is played over the key it is named for, not
   * over its relative major.
   */
  chordSource(): Scale | null {
    const parent = chordParentOf(this.type);
    if (parent === null) return null;
    return parent === this.type ? this : new Scale(this.root, parent);
  }

  /** Pitch classes of the scale notes, in scale order. */
  get pitchClasses(): number[] {
    return this.notes.map((note) => note.pitchClass);
  }

  /** True if the pitch class sounds in this scale. */
  contains(pitchClass: number): boolean {
    return this.pitchClasses.includes(pitchClass);
  }

  /** Index of the pitch class within the scale, or null if it is not a scale note. */
  degreeIndexOf(pitchClass: number): number | null {
    const index = this.pitchClasses.indexOf(pitchClass);
    return index < 0 ? null : index;
  }

  /** Degree label of a pitch class, e.g. "b3" — or null if not a scale note. */
  degreeLabelOf(pitchClass: number): string | null {
    const index = this.degreeIndexOf(pitchClass);
    return index === null ? null : degreeLabel(this.type, index);
  }

  /** True if the pitch class is the root of the scale. */
  isRoot(pitchClass: number): boolean {
    return this.root.pitchClass === pitchClass;
  }

  /** e.g. "A-Dur (Ionisch)". */
  name(): string {
    return `${this.root.name()}-${this.type.name}`;
  }

  toString(): string {
    return this.name();
  }
}

/**
 * The twelve roots, one per pitch, in the flat spelling — the usual lead-sheet
 * convention. Where a key is actually chosen, spellRoot picks the name.
 */
export const ROOT_CHOICES: readonly string[] = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

/**
 * Every root the app accepts, from the grid or a link: the twelve above, plus the
 * sharp names of the five black keys. A key on C♯ or F♯ is often the right one —
 * C♯ minor has four sharps where D♭ minor needs a double flat.
 */
export const ACCEPTED_ROOTS: readonly string[] = [
  ...ROOT_CHOICES,
  ...ROOT_CHOICES.filter((name) => name.includes('b')).map(
    (name) => pitchClassNames(Note.parse(name).pitchClass)[0],
  ),
];

/** Accidentals a key needs, counting a double one twice. */
function accidentalCount(scale: Scale): number {
  return scale.notes.reduce((sum, note) => sum + Math.abs(note.alter), 0);
}

/**
 * How to write the root of a key on a given pitch: whichever name needs fewer
 * accidentals in that scale. A black key read off the neck says „C♯ or D♭"; the
 * scale decides. D♭ major takes five flats where C♯ major takes seven sharps, and
 * C♯ minor four sharps where D♭ minor would need a double flat. Where both cost
 * the same — F♯ or G♭ major, D♯ or E♭ minor — the reader's preference decides.
 */
export function spellRoot(pitchClass: number, scaleTypeId: string, preferSharps: boolean): string {
  const names = pitchClassNames(pitchClass);
  if (names.length === 1) return names[0];

  const type = scaleTypeById(scaleTypeId);
  const [sharp, flat] = names;
  const sharps = accidentalCount(new Scale(Note.parse(sharp), type));
  const flats = accidentalCount(new Scale(Note.parse(flat), type));
  if (sharps !== flats) return sharps < flats ? sharp : flat;
  return preferSharps ? sharp : flat;
}

/** Written forms accepted by Scale.parse, mapped to scale types. */
const SCALE_ALIASES: Record<string, ScaleType> = {
  dur: MAJOR,
  major: MAJOR,
  ionisch: MAJOR,
  moll: NATURAL_MINOR,
  minor: NATURAL_MINOR,
  äolisch: NATURAL_MINOR,
  aeolisch: NATURAL_MINOR,
  'harmonisch moll': scaleTypeById('harmonic-minor'),
  'moll harmonisch': scaleTypeById('harmonic-minor'),
  'melodisch moll': scaleTypeById('melodic-minor'),
  'moll melodisch': scaleTypeById('melodic-minor'),
  dorisch: scaleTypeById('dorian'),
  phrygisch: scaleTypeById('phrygian'),
  lydisch: scaleTypeById('lydian'),
  mixolydisch: scaleTypeById('mixolydian'),
  lokrisch: scaleTypeById('locrian'),
  'dur-pentatonik': scaleTypeById('major-pentatonic'),
  'moll-pentatonik': scaleTypeById('minor-pentatonic'),
  blues: scaleTypeById('blues'),
  bluesskala: scaleTypeById('blues'),
};
