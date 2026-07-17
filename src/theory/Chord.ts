import { mod, Note } from './Note';
import type { Scale } from './Scale';

/**
 * Chord qualities, identified by their semitone signature from the root.
 * The signature is the lookup key, so a chord's quality is derived from the
 * notes it actually contains rather than assumed from the scale degree.
 */
export interface ChordQuality {
  readonly id: string;
  /** Chord symbol suffix: "" for major, "m" for minor, "m7b5" ... */
  readonly symbol: string;
  /** Semitones from the root. */
  readonly semitones: readonly number[];
  /** Roman numerals are uppercase for major-ish chords, lowercase for minor-ish. */
  readonly uppercase: boolean;
  /** Appended to the roman numeral, e.g. "°" for diminished. */
  readonly romanSuffix: string;
}

const QUALITIES: readonly ChordQuality[] = [
  // Triads
  { id: 'major', symbol: '', semitones: [0, 4, 7], uppercase: true, romanSuffix: '' },
  { id: 'minor', symbol: 'm', semitones: [0, 3, 7], uppercase: false, romanSuffix: '' },
  { id: 'diminished', symbol: 'dim', semitones: [0, 3, 6], uppercase: false, romanSuffix: '°' },
  { id: 'augmented', symbol: 'aug', semitones: [0, 4, 8], uppercase: true, romanSuffix: '+' },

  // Sevenths
  { id: 'major7', symbol: 'maj7', semitones: [0, 4, 7, 11], uppercase: true, romanSuffix: 'maj7' },
  { id: 'dominant7', symbol: '7', semitones: [0, 4, 7, 10], uppercase: true, romanSuffix: '7' },
  { id: 'minor7', symbol: 'm7', semitones: [0, 3, 7, 10], uppercase: false, romanSuffix: '7' },
  { id: 'minor7b5', symbol: 'm7b5', semitones: [0, 3, 6, 10], uppercase: false, romanSuffix: 'ø7' },
  {
    id: 'diminished7',
    symbol: 'dim7',
    semitones: [0, 3, 6, 9],
    uppercase: false,
    romanSuffix: '°7',
  },
  {
    id: 'minorMajor7',
    symbol: 'mMaj7',
    semitones: [0, 3, 7, 11],
    uppercase: false,
    romanSuffix: 'maj7',
  },
  {
    id: 'augmentedMajor7',
    symbol: 'maj7#5',
    semitones: [0, 4, 8, 11],
    uppercase: true,
    romanSuffix: '+maj7',
  },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

/**
 * Chord-symbol suffixes as written in tabs and lead sheets, mapped to a quality
 * id. Matched exactly against the whole suffix — not as a prefix — so "m7b5" can
 * never be mis-read as "m" plus leftovers. Case matters: "M7" is major 7, "m7"
 * is minor 7.
 */
const SUFFIX_ALIASES: Record<string, string> = {
  '': 'major',
  maj: 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  dim: 'diminished',
  '°': 'diminished',
  aug: 'augmented',
  '+': 'augmented',
  maj7: 'major7',
  M7: 'major7',
  '7': 'dominant7',
  m7: 'minor7',
  min7: 'minor7',
  m7b5: 'minor7b5',
  ø: 'minor7b5',
  'ø7': 'minor7b5',
  dim7: 'diminished7',
  '°7': 'diminished7',
};

/** Finds the quality whose semitone signature matches, or null for exotic stacks. */
function identifyQuality(root: Note, notes: readonly Note[]): ChordQuality | null {
  const signature = notes.map((note) => mod(note.pitchClass - root.pitchClass, 12));

  return (
    QUALITIES.find(
      (quality) =>
        quality.semitones.length === signature.length &&
        quality.semitones.every((semitone, i) => semitone === signature[i]),
    ) ?? null
  );
}

/** How many notes a chord is built from: a triad or a seventh chord. */
export type ChordSize = 3 | 4;

export class Chord {
  readonly root: Note;
  /** The chord tones, root first, correctly spelled. */
  readonly notes: readonly Note[];
  /** null when the stack does not match any known quality. */
  readonly quality: ChordQuality | null;

  constructor(root: Note, notes: readonly Note[]) {
    this.root = root;
    this.notes = notes;
    this.quality = identifyQuality(root, notes);
  }

  /**
   * Builds a chord on a scale degree by stacking thirds — i.e. taking every
   * second scale note from that degree. This is what makes the chord diatonic:
   * every tone comes from the scale, so the quality falls out of the key.
   */
  static fromScaleDegree(scale: Scale, degreeIndex: number, size: ChordSize = 3): Chord {
    if (!scale.type.isHeptatonic) {
      throw new Error(
        `Diatonische Akkorde brauchen eine 7-stufige Skala, "${scale.type.name}" hat ${scale.type.semitones.length}.`,
      );
    }
    if (degreeIndex < 0 || degreeIndex > 6) {
      throw new Error(`Stufe ${degreeIndex} existiert nicht (0..6).`);
    }

    const notes = Array.from(
      { length: size },
      (_, i) => scale.notes[mod(degreeIndex + i * 2, 7)],
    );

    return new Chord(notes[0], notes);
  }

  /**
   * Parses a chord symbol the way it appears in a tab: "Em", "Bbmaj7", "F#m7b5",
   * "C". The counterpart to Note.parse and Scale.parse — it throws on anything it
   * does not recognise, so a caller can report exactly which token was bad.
   */
  static parse(input: string): Chord {
    const text = input.trim();
    // The root grabs its accidentals greedily, so "Ebm" splits as "Eb" + "m",
    // never "E" + "bm". Whatever is left is the quality suffix.
    const match = /^([A-Ga-g][#b]*)(.*)$/.exec(text);
    if (!match) {
      throw new Error(`Kein gültiger Akkord: "${input}"`);
    }

    const root = Note.parse(match[1]);
    const suffix = match[2].trim();

    const qualityId = SUFFIX_ALIASES[suffix];
    if (qualityId === undefined) {
      throw new Error(`Unbekannter Akkordtyp: "${suffix}" in "${input}"`);
    }

    return Chord.fromQuality(root, qualityId);
  }

  /** Builds a chord from a root and an explicit quality, e.g. a dominant 7 in a blues. */
  static fromQuality(root: Note, qualityId: string): Chord {
    const quality = QUALITIES.find((q) => q.id === qualityId);
    if (!quality) throw new Error(`Unbekannte Akkordqualität: "${qualityId}"`);

    // Third, fifth and seventh are 2, 4 and 6 letters above the root.
    const notes = quality.semitones.map((semitones, i) => root.transpose(semitones, i * 2));
    return new Chord(root, notes);
  }

  get pitchClasses(): number[] {
    return this.notes.map((note) => note.pitchClass);
  }

  /** Chord symbol, e.g. "Am7", "Bbmaj7", "F#dim". */
  name(): string {
    return this.root.name() + (this.quality?.symbol ?? '?');
  }

  /**
   * Roman numeral for this chord on the given scale degree, e.g. "I", "vi", "vii°".
   * Case and suffix come from the chord's actual quality.
   */
  romanNumeral(degreeIndex: number): string {
    const numeral = ROMAN[mod(degreeIndex, 7)];
    if (!this.quality) return numeral;

    const base = this.quality.uppercase ? numeral : numeral.toLowerCase();
    return base + this.quality.romanSuffix;
  }

  toString(): string {
    return this.name();
  }
}

/** All seven diatonic chords of a key, degree I first. */
export function diatonicChords(scale: Scale, size: ChordSize = 3): Chord[] {
  return Array.from({ length: 7 }, (_, i) => Chord.fromScaleDegree(scale, i, size));
}
