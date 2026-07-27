import { splitAccidental } from '../theory';

/**
 * Note names, chord symbols and degree labels, set with real ♯ and ♭.
 *
 * Two components rather than one, because HTML and SVG raise a glyph by
 * different means and the neck is drawn in SVG. Neither touches the string it is
 * given beyond `splitAccidental` — see theory/format.ts for why the ASCII
 * spelling underneath has to survive untouched.
 */

interface Props {
  /** An ASCII name as `Note.name()` or `Chord.name()` produces it. */
  readonly name: string;
}

/** For the page: chord cards, chips, headings. */
export function NoteText({ name }: Props) {
  return (
    <>
      {splitAccidental(name).map((part, i) =>
        part.isAccidental ? (
          <span key={i} className="accidental">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * For the neck and the grip diagrams.
 *
 * The size comes from the same .accidental rule as on the page, so the ratio is
 * stated once — and no `dy` here: a raised tspan shifts everything after it too,
 * so a "B♭m7" would need the shift undone on the next run, measured in the
 * accidental's own em rather than the label's. The glyphs do not need the help;
 * ♯ and ♭ are drawn sitting high in their em box already.
 */
export function NoteTspans({ name }: Props) {
  return (
    <>
      {splitAccidental(name).map((part, i) =>
        part.isAccidental ? (
          <tspan key={i} className="accidental">
            {part.text}
          </tspan>
        ) : (
          <tspan key={i}>{part.text}</tspan>
        ),
      )}
    </>
  );
}
