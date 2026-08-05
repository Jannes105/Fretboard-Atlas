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

/**
 * The same, one third further: the ninth is eight letters up, not one.
 *
 * Eight rather than one because the letter distance is what spells the note, and a
 * ninth is a second an octave up — Note.transpose folds it back into an octave
 * itself. Writing 1 would spell it the same but would say the wrong thing about
 * the interval, and this table is read by people as much as by code.
 */
const TERTIAN_NINTH = [0, 2, 4, 6, 8] as const;

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

  /*
   * Ninths — a seventh chord with one more third on top.
   *
   * The list is not a taste selection. Stacking five thirds on each of the seven
   * degrees of every heptatonic scale the app offers produces exactly these
   * signatures, and Chord.test.ts checks that by enumerating them: a scale whose
   * ninth chords are not all nameable would otherwise show "?" on a card and offer
   * no grips. Some of them (m7b9, m7b5b9) are chords nobody reaches for by name —
   * they are here because the third degree of an ordinary major key IS one.
   */
  { id: 'major9', symbol: 'maj9', semitones: [0, 4, 7, 11, 14], diatonicSteps: TERTIAN_NINTH, uppercase: true, romanSuffix: 'maj9' },
  { id: 'dominant9', symbol: '9', semitones: [0, 4, 7, 10, 14], diatonicSteps: TERTIAN_NINTH, uppercase: true, romanSuffix: '9' },
  { id: 'minor9', symbol: 'm9', semitones: [0, 3, 7, 10, 14], diatonicSteps: TERTIAN_NINTH, uppercase: false, romanSuffix: '9' },
  { id: 'minor7b9', symbol: 'm7b9', semitones: [0, 3, 7, 10, 13], diatonicSteps: TERTIAN_NINTH, uppercase: false, romanSuffix: '7b9' },
  { id: 'minor9b5', symbol: 'm9b5', semitones: [0, 3, 6, 10, 14], diatonicSteps: TERTIAN_NINTH, uppercase: false, romanSuffix: 'ø9' },
  { id: 'minor7b5b9', symbol: 'm7b5b9', semitones: [0, 3, 6, 10, 13], diatonicSteps: TERTIAN_NINTH, uppercase: false, romanSuffix: 'ø7b9' },
  { id: 'dominant7b9', symbol: '7b9', semitones: [0, 4, 7, 10, 13], diatonicSteps: TERTIAN_NINTH, uppercase: true, romanSuffix: '7b9' },
  { id: 'minorMajor9', symbol: 'mMaj9', semitones: [0, 3, 7, 11, 14], diatonicSteps: TERTIAN_NINTH, uppercase: false, romanSuffix: 'maj9' },
  { id: 'augmentedMajor9', symbol: 'maj9#5', semitones: [0, 4, 8, 11, 14], diatonicSteps: TERTIAN_NINTH, uppercase: true, romanSuffix: '+maj9' },
  { id: 'diminished7b9', symbol: 'dim7b9', semitones: [0, 3, 6, 9, 13], diatonicSteps: TERTIAN_NINTH, uppercase: false, romanSuffix: '°7b9' },
  /*
   * The VI of harmonic minor, and the reason the enumeration test exists: in A it
   * is F A C E G#, and the G# is an augmented ninth above the F. Nobody writes
   * this chord down on purpose — it is what the scale produces, and without it the
   * sixth card of every harmonic minor key would read "?".
   */
  { id: 'major7s9', symbol: 'maj7#9', semitones: [0, 4, 7, 11, 15], diatonicSteps: TERTIAN_NINTH, uppercase: true, romanSuffix: 'maj7#9' },

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

/**
 * A set of semitones as one comparable string: folded into an octave, deduplicated,
 * and sorted.
 *
 * Sorting is the point. The signature used to be compared index by index against
 * each quality in turn, which quietly assumed the notes arrive in ascending order
 * from the root. `fromScaleDegree` and `fromQuality` do supply that, but the
 * constructor is public, and a chord handed its notes in another order failed to
 * match anything at all — leaving `quality: null`, a name of "C?" and no grips,
 * with nothing thrown and nothing logged.
 */
function signatureKey(semitones: readonly number[]): string {
  return [...new Set(semitones.map((semitone) => mod(semitone, 12)))]
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Every quality by its signature. Built once — a lookup rather than a scan of the
 * table, which matters as the table grows.
 *
 * Two qualities sharing a signature would make one of them unreachable, and which
 * one would depend on declaration order. Chord.test.ts asserts the keys are
 * distinct, so a new entry that collides with an old one fails loudly instead of
 * silently shadowing it.
 */
const BY_SIGNATURE = new Map<string, ChordQuality>(
  QUALITIES.map((quality) => [signatureKey(quality.semitones), quality]),
);

/** Exported for the collision test — the map's own keys, in declaration order. */
export function qualitySignatures(): string[] {
  return QUALITIES.map((quality) => signatureKey(quality.semitones));
}

/** Finds the quality whose semitone signature matches, or null for exotic stacks. */
function identifyQuality(root: Note, notes: readonly Note[]): ChordQuality | null {
  const signature = notes.map((note) => mod(note.pitchClass - root.pitchClass, 12));
  return BY_SIGNATURE.get(signatureKey(signature)) ?? null;
}

/**
 * How many notes a chord is built from: a triad, a seventh chord, or a ninth.
 *
 * `fromScaleDegree` was already general — it takes every second scale note and
 * wraps, so a fifth tone falls out on its own. Only this type and the quality
 * table stood in the way.
 */
export type ChordSize = 3 | 4 | 5;

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
