/**
 * Scale types as interval patterns.
 *
 * Each degree carries two numbers: the semitone distance from the root and the
 * letter distance from the root letter. Both are needed so Scale can spell its
 * notes correctly (see Note.transpose).
 */

/** Semitone offsets of the major scale, used as the reference for degree labels. */
const MAJOR_REFERENCE = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * How much a guitarist actually reaches for a scale. "basics" is what you need to
 * play and solo over most rock, pop and blues; everything else is real music
 * theory but rarely the first choice, so the UI tucks it away in a second group.
 */
export type ScaleGroup = 'basics' | 'more';

export interface ScaleType {
  readonly id: string;
  /** German display name. */
  readonly name: string;
  /** Semitone offset of each degree from the root. */
  readonly semitones: readonly number[];
  /** Letter offset of each degree from the root letter. */
  readonly diatonicSteps: readonly number[];
  /** True for seven-note scales that support diatonic chord building. */
  readonly isHeptatonic: boolean;
  readonly group: ScaleGroup;
}

function scaleType(
  id: string,
  name: string,
  semitones: readonly number[],
  diatonicSteps: readonly number[],
  group: ScaleGroup = 'more',
): ScaleType {
  if (semitones.length !== diatonicSteps.length) {
    throw new Error(`ScaleType "${id}": semitones und diatonicSteps müssen gleich lang sein.`);
  }
  return {
    id,
    name,
    semitones,
    diatonicSteps,
    isHeptatonic: semitones.length === 7,
    group,
  };
}

export const MAJOR = scaleType(
  'major',
  'Dur (Ionisch)',
  [0, 2, 4, 5, 7, 9, 11],
  [0, 1, 2, 3, 4, 5, 6],
  'basics',
);

export const NATURAL_MINOR = scaleType(
  'natural-minor',
  'Moll (Äolisch)',
  [0, 2, 3, 5, 7, 8, 10],
  [0, 1, 2, 3, 4, 5, 6],
  'basics',
);

export const HARMONIC_MINOR = scaleType(
  'harmonic-minor',
  'Harmonisch Moll',
  [0, 2, 3, 5, 7, 8, 11],
  [0, 1, 2, 3, 4, 5, 6],
);

export const MELODIC_MINOR = scaleType(
  'melodic-minor',
  'Melodisch Moll',
  [0, 2, 3, 5, 7, 9, 11],
  [0, 1, 2, 3, 4, 5, 6],
);

export const DORIAN = scaleType('dorian', 'Dorisch', [0, 2, 3, 5, 7, 9, 10], [0, 1, 2, 3, 4, 5, 6]);
export const PHRYGIAN = scaleType('phrygian', 'Phrygisch', [0, 1, 3, 5, 7, 8, 10], [0, 1, 2, 3, 4, 5, 6]);
export const LYDIAN = scaleType('lydian', 'Lydisch', [0, 2, 4, 6, 7, 9, 11], [0, 1, 2, 3, 4, 5, 6]);
export const MIXOLYDIAN = scaleType('mixolydian', 'Mixolydisch', [0, 2, 4, 5, 7, 9, 10], [0, 1, 2, 3, 4, 5, 6]);
export const LOCRIAN = scaleType('locrian', 'Lokrisch', [0, 1, 3, 5, 6, 8, 10], [0, 1, 2, 3, 4, 5, 6]);

export const MAJOR_PENTATONIC = scaleType(
  'major-pentatonic',
  'Dur-Pentatonik',
  [0, 2, 4, 7, 9],
  [0, 1, 2, 4, 5],
);

export const MINOR_PENTATONIC = scaleType(
  'minor-pentatonic',
  'Moll-Pentatonik',
  [0, 3, 5, 7, 10],
  [0, 2, 3, 4, 6],
  'basics',
);

/** Minor pentatonic plus the b5 "blue note"; the b5 and 5 share a letter by design. */
export const BLUES = scaleType(
  'blues',
  'Bluesskala',
  [0, 3, 5, 6, 7, 10],
  [0, 2, 3, 4, 4, 6],
  'basics',
);

/** Basics first — that is also the order the UI lists them in. */
export const SCALE_TYPES: readonly ScaleType[] = [
  MAJOR,
  NATURAL_MINOR,
  MINOR_PENTATONIC,
  BLUES,

  MAJOR_PENTATONIC,
  DORIAN,
  MIXOLYDIAN,
  HARMONIC_MINOR,
  MELODIC_MINOR,
  PHRYGIAN,
  LYDIAN,
  LOCRIAN,
];

export function scaleTypeById(id: string): ScaleType {
  const type = SCALE_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unbekannter Skalentyp: "${id}"`);
  return type;
}

export function scaleTypesInGroup(group: ScaleGroup): ScaleType[] {
  return SCALE_TYPES.filter((type) => type.group === group);
}

/**
 * Degree label relative to the major scale, e.g. "1", "b3", "#4", "b7".
 * Derived rather than hardcoded so it stays consistent with the interval table.
 */
export function degreeLabel(type: ScaleType, index: number): string {
  const semitones = type.semitones[index];
  const step = type.diatonicSteps[index];
  const alter = semitones - MAJOR_REFERENCE[step];
  const accidental = alter === 0 ? '' : alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter);
  return `${accidental}${step + 1}`;
}
