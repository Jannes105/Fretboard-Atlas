import type { Chord } from './Chord';
import { mod } from './Note';

/** The interval of a major scale on each letter step — the yardstick for "b3", "#5". */
const MAJOR_REFERENCE = [0, 2, 4, 5, 7, 9, 11];

/**
 * What each tone of a chord is, counted from the chord's own root: "1", "b3", "5",
 * "b7", "9". Keyed by pitch class.
 *
 * The neck's degree labels count from the KEY, which says where a chord sits in
 * the key — but to learn the chord itself you want its own numbers. Spelled from
 * letters, not semitones, so a diminished fifth is "b5" and never "#4".
 */
export function chordIntervals(chord: Chord): Map<number, string> {
  const intervals = new Map<number, string>();
  const isExtended = chord.notes.length >= 5;
  for (const note of chord.notes) {
    const semitones = mod(note.pitchClass - chord.root.pitchClass, 12);
    const step = mod(note.letter - chord.root.letter, 7);
    let alter = semitones - MAJOR_REFERENCE[step];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    const accidental = alter === 0 ? '' : alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter);
    // A second in a five-note stack is a ninth.
    const number = step === 1 && isExtended ? 9 : step + 1;
    intervals.set(note.pitchClass, `${accidental}${number}`);
  }
  return intervals;
}
