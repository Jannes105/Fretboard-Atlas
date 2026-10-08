import { Chord } from './Chord';
import { mod, Note } from './Note';

/**
 * Move a chord by the interval between two keys, spelled the way the new key
 * spells it.
 *
 * The interval is carried as semitones AND letter steps, because that is what
 * keeps the spelling honest: G to A is one letter up, so a D becomes an E and an
 * F♯m a G♯m — not an A♭m that happens to sound the same.
 *
 * A symbol the app cannot read is handed back untouched rather than dropped: a
 * transposition must never lose a chord from someone's progression.
 */
export function transposeSymbol(symbol: string, from: Note, to: Note): string {
  let chord: Chord;
  try {
    chord = Chord.parse(symbol);
  } catch {
    return symbol;
  }
  if (!chord.quality) return symbol;

  const semitones = mod(to.pitchClass - from.pitchClass, 12);
  const steps = mod(to.letter - from.letter, 7);
  const move = (note: Note) => note.transpose(semitones, steps);

  return Chord.fromQuality(
    move(chord.root),
    chord.quality.id,
    chord.bass ? move(chord.bass) : null,
  ).name();
}
