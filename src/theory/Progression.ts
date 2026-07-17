import { Chord, type ChordSize, diatonicChords } from './Chord';
import type { Scale } from './Scale';

export interface Progression {
  readonly id: string;
  readonly name: string;
  /** Zero-based scale degrees, in order. I = 0, ii = 1, ... vii = 6. */
  readonly degrees: readonly number[];
  /** Which keys this progression is idiomatic in. */
  readonly fits: 'major' | 'minor' | 'any';
  /**
   * Blues plays I, IV and V as dominant sevenths even though only V is diatonic.
   * When set, every chord is forced to this quality instead of being stacked
   * from the scale.
   */
  readonly forceQuality?: string;
  readonly hint?: string;
}

export const PROGRESSIONS: readonly Progression[] = [
  {
    id: 'I-V-vi-IV',
    name: 'I – V – vi – IV',
    degrees: [0, 4, 5, 3],
    fits: 'major',
    hint: 'Der „Vier-Akkorde-Song“ — unzählige Pop-Hits.',
  },
  {
    id: 'I-vi-IV-V',
    name: 'I – vi – IV – V',
    degrees: [0, 5, 3, 4],
    fits: 'major',
    hint: 'Doo-Wop / 50er-Progression.',
  },
  {
    id: 'vi-IV-I-V',
    name: 'vi – IV – I – V',
    degrees: [5, 3, 0, 4],
    fits: 'major',
    hint: 'Dieselben Akkorde, aber auf der Mollstufe begonnen.',
  },
  {
    id: 'ii-V-I',
    name: 'ii – V – I',
    degrees: [1, 4, 0],
    fits: 'major',
    hint: 'Die Jazz-Kadenz schlechthin.',
  },
  {
    id: 'I-IV-V',
    name: 'I – IV – V',
    degrees: [0, 3, 4],
    fits: 'major',
    hint: 'Die drei Hauptdreiklänge (Tonika, Subdominante, Dominante).',
  },
  {
    id: 'i-VI-III-VII',
    name: 'i – VI – III – VII',
    degrees: [0, 5, 2, 6],
    fits: 'minor',
    hint: 'Häufige Moll-Progression (Andalusisch verwandt).',
  },
  {
    id: 'i-iv-v',
    name: 'i – iv – v',
    degrees: [0, 3, 4],
    fits: 'minor',
    hint: 'Die Moll-Variante der drei Hauptdreiklänge.',
  },
  {
    id: '12-bar-blues',
    name: '12-Bar-Blues',
    // I I I I | IV IV I I | V IV I V
    degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4],
    fits: 'any',
    forceQuality: 'dominant7',
    hint: 'Zwölf Takte. I, IV und V werden als Dominantseptakkorde gespielt.',
  },
];

export interface ProgressionStep {
  readonly degreeIndex: number;
  readonly chord: Chord;
  readonly roman: string;
}

/**
 * Turns a progression into actual chords in the given key.
 * Only heptatonic scales have diatonic degrees to build on.
 */
export function buildProgression(
  scale: Scale,
  progression: Progression,
  size: ChordSize = 3,
): ProgressionStep[] {
  const diatonic = diatonicChords(scale, size);

  return progression.degrees.map((degreeIndex) => {
    const diatonicChord = diatonic[degreeIndex];

    const chord = progression.forceQuality
      ? Chord.fromQuality(diatonicChord.root, progression.forceQuality)
      : diatonicChord;

    return { degreeIndex, chord, roman: chord.romanNumeral(degreeIndex) };
  });
}

/**
 * Turns an explicit list of chords into progression steps — the path for a
 * self-built sequence, where the chords are given outright rather than as scale
 * degrees (a power chord or a borrowed chord has no degree to stack from).
 *
 * The roman numeral is shown only when the chord is genuinely diatonic — every
 * tone in the key. A borrowed chord keeps a blank numeral rather than a wrong
 * one; its name is shown alongside anyway.
 */
export function customSteps(scale: Scale, chords: readonly Chord[]): ProgressionStep[] {
  return chords.map((chord) => {
    const degreeIndex = scale.degreeIndexOf(chord.root.pitchClass);
    const diatonic =
      degreeIndex !== null && chord.pitchClasses.every((pitchClass) => scale.contains(pitchClass));

    return {
      degreeIndex: degreeIndex ?? -1,
      chord,
      roman: diatonic ? chord.romanNumeral(degreeIndex) : '',
    };
  });
}

/** The progressions worth showing for a given key. */
export function progressionsFor(scale: Scale): Progression[] {
  if (!scale.type.isHeptatonic) return [];

  // A minor third between root and third makes it a minor key.
  const isMinor = (scale.pitchClasses[2] - scale.pitchClasses[0] + 12) % 12 === 3;

  return PROGRESSIONS.filter(
    (progression) =>
      progression.fits === 'any' || progression.fits === (isMinor ? 'minor' : 'major'),
  );
}
