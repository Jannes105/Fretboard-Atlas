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
  /**
   * Letter steps from the root, one per tone. Tertian chords stack thirds, so
   * theirs is [0, 2, 4, ...] — but a power chord's fifth is four letters up, not
   * two, and a sus4 reaches a fourth. Spelling the fifth of E5 as B rather than
   * E### needs this per-tone, exactly as ScaleType carries its own diatonicSteps.
   */
  readonly diatonicSteps: readonly number[];
  /** Roman numerals are uppercase for major-ish chords, lowercase for minor-ish. */
  readonly uppercase: boolean;
  /** Appended to the roman numeral, e.g. "°" for diminished. */
  readonly romanSuffix: string;
}

/** Letter steps for a chord built by stacking thirds: root, third, fifth, seventh. */
const TERTIAN = [0, 2, 4, 6] as const;

const QUALITIES: readonly ChordQuality[] = [
  // Triads
  { id: 'major', symbol: '', semitones: [0, 4, 7], diatonicSteps: TERTIAN, uppercase: true, romanSuffix: '' },
  { id: 'minor', symbol: 'm', semitones: [0, 3, 7], diatonicSteps: TERTIAN, uppercase: false, romanSuffix: '' },
  { id: 'diminished', symbol: 'dim', semitones: [0, 3, 6], diatonicSteps: TERTIAN, uppercase: false, romanSuffix: '°' },
  { id: 'augmented', symbol: 'aug', semitones: [0, 4, 8], diatonicSteps: TERTIAN, uppercase: true, romanSuffix: '+' },

  // Sevenths
  { id: 'major7', symbol: 'maj7', semitones: [0, 4, 7, 11], diatonicSteps: TERTIAN, uppercase: true, romanSuffix: 'maj7' },
  { id: 'dominant7', symbol: '7', semitones: [0, 4, 7, 10], diatonicSteps: TERTIAN, uppercase: true, romanSuffix: '7' },
  { id: 'minor7', symbol: 'm7', semitones: [0, 3, 7, 10], diatonicSteps: TERTIAN, uppercase: false, romanSuffix: '7' },
  { id: 'minor7b5', symbol: 'm7b5', semitones: [0, 3, 6, 10], diatonicSteps: TERTIAN, uppercase: false, romanSuffix: 'ø7' },
  {
    id: 'diminished7',
    symbol: 'dim7',
    semitones: [0, 3, 6, 9],
    diatonicSteps: TERTIAN,
    uppercase: false,
    romanSuffix: '°7',
  },
  {
    id: 'minorMajor7',
    symbol: 'mMaj7',
    semitones: [0, 3, 7, 11],
    diatonicSteps: TERTIAN,
    uppercase: false,
    romanSuffix: 'maj7',
  },
  {
    id: 'augmentedMajor7',
    symbol: 'maj7#5',
    semitones: [0, 4, 8, 11],
    diatonicSteps: TERTIAN,
    uppercase: true,
    romanSuffix: '+maj7',
  },

  // Non-tertian: no third, or a suspended one, so each carries its own letter steps.
  { id: 'power', symbol: '5', semitones: [0, 7], diatonicSteps: [0, 4], uppercase: true, romanSuffix: '5' },
  { id: 'sus2', symbol: 'sus2', semitones: [0, 2, 7], diatonicSteps: [0, 1, 4], uppercase: true, romanSuffix: 'sus2' },
  { id: 'sus4', symbol: 'sus4', semitones: [0, 5, 7], diatonicSteps: [0, 3, 4], uppercase: true, romanSuffix: 'sus4' },
  { id: 'sixth', symbol: '6', semitones: [0, 4, 7, 9], diatonicSteps: [0, 2, 4, 5], uppercase: true, romanSuffix: '6' },
  { id: 'minor6', symbol: 'm6', semitones: [0, 3, 7, 9], diatonicSteps: [0, 2, 4, 5], uppercase: false, romanSuffix: '6' },
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
  // Power chord and suspensions — the staples of real tabs.
  '5': 'power',
  sus: 'sus4',
  sus4: 'sus4',
  sus2: 'sus2',
  '6': 'sixth',
  m6: 'minor6',
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
  /**
   * A slash bass — the note under the chord when it differs from the root, as in
   * C/G. null for an ordinary root-position chord. It changes what sounds and how
   * the chord is named, but not its quality: C/G is still a major chord.
   */
  readonly bass: Note | null;

  constructor(root: Note, notes: readonly Note[], bass: Note | null = null) {
    this.root = root;
    this.notes = notes;
    this.quality = identifyQuality(root, notes);
    // A bass equal to the root is no slash at all — "C/C" is just C.
    this.bass = bass && bass.pitchClass !== root.pitchClass ? bass : null;
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
   * "C", and a slash bass like "C/G" or "D/F#". The counterpart to Note.parse and
   * Scale.parse — it throws on anything it does not recognise, so a caller can
   * report exactly which token was bad.
   */
  static parse(input: string): Chord {
    const text = input.trim();

    // A slash splits the chord from its bass: "C/G" is C over a G bass. Everything
    // before the slash is an ordinary chord symbol.
    const slash = text.indexOf('/');
    const symbolText = slash < 0 ? text : text.slice(0, slash);
    const bassText = slash < 0 ? null : text.slice(slash + 1).trim();

    // The root grabs its accidentals greedily, so "Ebm" splits as "Eb" + "m",
    // never "E" + "bm". Whatever is left is the quality suffix.
    const match = /^([A-Ga-g][#b]*)(.*)$/.exec(symbolText);
    if (!match) {
      throw new Error(`Kein gültiger Akkord: "${input}"`);
    }

    const root = Note.parse(match[1]);
    const suffix = match[2].trim();

    const qualityId = SUFFIX_ALIASES[suffix];
    if (qualityId === undefined) {
      throw new Error(`Unbekannter Akkordtyp: "${suffix}" in "${input}"`);
    }

    // An empty bass ("C/") is malformed — Note.parse rejects it.
    const bass = bassText === null ? null : Note.parse(bassText);
    return Chord.fromQuality(root, qualityId, bass);
  }

  /** Builds a chord from a root and an explicit quality, e.g. a dominant 7 in a blues. */
  static fromQuality(root: Note, qualityId: string, bass: Note | null = null): Chord {
    const quality = QUALITIES.find((q) => q.id === qualityId);
    if (!quality) throw new Error(`Unbekannte Akkordqualität: "${qualityId}"`);

    // Each tone's letter distance comes from the quality — thirds for a tertian
    // chord, but a fourth or a bare fifth for sus and power chords.
    const notes = quality.semitones.map((semitones, i) =>
      root.transpose(semitones, quality.diatonicSteps[i]),
    );
    return new Chord(root, notes, bass);
  }

  /** Pitch classes that sound, chord tones first, the slash bass added if it is a new one. */
  get pitchClasses(): number[] {
    const classes = this.notes.map((note) => note.pitchClass);
    if (this.bass && !classes.includes(this.bass.pitchClass)) {
      classes.push(this.bass.pitchClass);
    }
    return classes;
  }

  /** Chord symbol, e.g. "Am7", "Bbmaj7", "F#dim", "C/G". */
  name(): string {
    const symbol = this.root.name() + (this.quality?.symbol ?? '?');
    return this.bass ? `${symbol}/${this.bass.name()}` : symbol;
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
