/**
 * Spelling a name for the eye rather than for a URL.
 *
 * Everything else in `theory/` produces ASCII: `name()` yields "F#" and "Bbm7",
 * and that spelling is load-bearing. It rides in the query string (`?root=Eb`,
 * `prog=custom:C,G,Am,F`), it comes back through `Note.parse` and `Chord.parse`,
 * and `urlState.ts` matches it against `/^[A-Ga-g][#b]*$/`. Touching it would
 * break every link anyone has ever shared.
 *
 * So the accidentals become ♯ and ♭ here, at the edge, on the way to the screen —
 * and nowhere else. The app already sets the diminished sign as a real ° and
 * spends two paragraphs of the README arguing that F# major must be spelled with
 * an E#; writing that E# with a hash was the one place the care ran out.
 */

const SHARP = '♯';
const FLAT = '♭';

/** A note name and its accidental: "Bb", "F##", "Bbm7". */
const LEADING_ACCIDENTAL = /^([A-G])(#{1,2}|b{1,2})/;

/**
 * An accidental that alters a numbered degree: the b5 of "Bm7b5", the #5 of
 * "maj7#5", the whole of a degree label like "b3".
 *
 * Deliberately narrow — only a run directly in front of a digit counts. Without
 * that, the "b" of a hypothetical suffix would be read as a flat, and no
 * lookbehind is used anywhere here because Safari only learned it in 16.4 and a
 * SyntaxError at parse time would take the whole app down on older phones.
 */
const ACCIDENTAL_BEFORE_DIGIT = /(#{1,2}|b{1,2})(?=\d)/g;

/** One run of a name: either an accidental, or everything between two of them. */
export interface NamePart {
  readonly text: string;
  /** True for the ♯/♭ itself, which is set smaller than what it belongs to. */
  readonly isAccidental: boolean;
}

function glyphs(ascii: string): string {
  return (ascii.startsWith('#') ? SHARP : FLAT).repeat(ascii.length);
}

/**
 * Splits a note name, chord symbol or degree label into its parts, with the
 * accidentals converted. Anything that is not one of those comes back untouched
 * as a single part — a roman numeral like "vii°" has nothing to convert.
 */
export function splitAccidental(name: string): NamePart[] {
  const parts: NamePart[] = [];

  const leading = LEADING_ACCIDENTAL.exec(name);
  let rest = name;

  if (leading !== null) {
    parts.push({ text: leading[1], isAccidental: false });
    parts.push({ text: glyphs(leading[2]), isAccidental: true });
    rest = name.slice(leading[0].length);
  }

  let cursor = 0;
  for (const match of rest.matchAll(ACCIDENTAL_BEFORE_DIGIT)) {
    const ascii = match[1];
    if (match.index > cursor) {
      parts.push({ text: rest.slice(cursor, match.index), isAccidental: false });
    }
    parts.push({ text: glyphs(ascii), isAccidental: true });
    cursor = match.index + ascii.length;
  }

  if (cursor < rest.length) {
    parts.push({ text: rest.slice(cursor), isAccidental: false });
  }

  // A name with no accidental at all still has to come back as something.
  return parts.length > 0 ? parts : [{ text: name, isAccidental: false }];
}

/**
 * The same thing as one string, for the places that cannot hold markup: the text
 * of an `<option>`, and any label read out rather than looked at.
 */
export function withAccidentals(name: string): string {
  return splitAccidental(name)
    .map((part) => part.text)
    .join('');
}
