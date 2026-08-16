/**
 * Note: a pitch spelled as a diatonic letter plus an accidental.
 *
 * Modelling a note as a bare pitch class (0..11) is not enough for correct key
 * spelling: A major must read A B C# D E F# G# — one note per letter — and
 * F# major needs E#, not F. Letter + alteration keeps that information.
 *
 * Note that sharps vs. flats are therefore NOT a display preference: within a
 * key they follow from the key. The free choice only exists when naming a pitch
 * with no key context — see pitchClassName, which prefers flats.
 */

/** Diatonic letters, indexed 0..6. */
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/** Pitch class of each natural letter (C = 0). */
const NATURAL_PITCH_CLASS = [0, 2, 4, 5, 7, 9, 11] as const;

/** Letter index: 0 = C, 1 = D, 2 = E, 3 = F, 4 = G, 5 = A, 6 = B. */
export type LetterIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** True modulo: JS `%` returns negatives for negative operands. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Renders an alteration as accidentals: -2 => "bb", +1 => "#". */
function accidentalToString(alter: number): string {
  if (alter === 0) return '';
  return alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter);
}

/**
 * Names a bare pitch class, where no key tells us how to spell it.
 * Defaults to flats, the common convention on lead sheets.
 */
export function pitchClassName(pitchClass: number, preferFlats = true): string {
  const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return (preferFlats ? flats : sharps)[mod(pitchClass, 12)];
}

/**
 * Every name a pitch class answers to: one for a natural, two for the others.
 *
 * For the neck with no key on it, where preferring one spelling would be taking a
 * side the music has not taken — the 6th fret of the low E really is both F# and
 * Gb, and which one you write depends on a key that has not been chosen yet.
 */
export function pitchClassNames(pitchClass: number): string[] {
  const sharp = pitchClassName(pitchClass, false);
  const flat = pitchClassName(pitchClass, true);
  return sharp === flat ? [sharp] : [sharp, flat];
}

export class Note {
  /** Diatonic letter index (0 = C .. 6 = B). */
  readonly letter: LetterIndex;
  /** Semitone alteration: -2 = double flat .. +2 = double sharp. */
  readonly alter: number;

  constructor(letter: LetterIndex, alter: number = 0) {
    this.letter = letter;
    this.alter = alter;
  }

  /** Pitch class 0..11, octave-independent (C = 0). */
  get pitchClass(): number {
    return mod(NATURAL_PITCH_CLASS[this.letter] + this.alter, 12);
  }

  /** Parses note names like "C", "F#", "Bb", "Eb", "C##". */
  static parse(input: string): Note {
    const text = input.trim();
    // Accidentals must be all sharps or all flats — "C#b" is not a note.
    const match = /^([A-Ga-g])(#*|b*)$/.exec(text);
    if (!match) {
      throw new Error(`Kein gültiger Notenname: "${input}"`);
    }

    const letter = LETTERS.indexOf(
      match[1].toUpperCase() as (typeof LETTERS)[number],
    ) as LetterIndex;

    let alter = 0;
    for (const char of match[2]) {
      alter += char === '#' ? 1 : -1;
    }

    if (alter < -2 || alter > 2) {
      throw new Error(`Zu viele Vorzeichen in "${input}" (max. doppelt).`);
    }

    return new Note(letter, alter);
  }

  /** Display name, e.g. "F#" or "Bb". */
  name(): string {
    return LETTERS[this.letter] + accidentalToString(this.alter);
  }

  /**
   * Transposes by an interval given as both a semitone distance and a letter
   * distance. Passing both is what keeps the spelling correct: a major third up
   * from C is 4 semitones AND 2 letters => E, never Fb.
   */
  transpose(semitones: number, diatonicSteps: number): Note {
    const letter = mod(this.letter + diatonicSteps, 7) as LetterIndex;
    const targetPitchClass = mod(this.pitchClass + semitones, 12);

    // Alteration needed to bend the new letter onto the target pitch class,
    // resolved into the range -6..+5 so we never pick an absurd spelling.
    const alter = mod(targetPitchClass - NATURAL_PITCH_CLASS[letter] + 6, 12) - 6;

    return new Note(letter, alter);
  }

  /** Same letter and same alteration. */
  equals(other: Note): boolean {
    return this.letter === other.letter && this.alter === other.alter;
  }

  /** Same sounding pitch, regardless of spelling: C# equals Db. */
  isEnharmonicWith(other: Note): boolean {
    return this.pitchClass === other.pitchClass;
  }

  toString(): string {
    return this.name();
  }
}
