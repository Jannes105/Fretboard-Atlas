import { type Chord, type ChordSize, type Scale, withAccidentals } from '../theory';
import { NoteText } from './NoteText';

interface ChordRowProps {
  chords: readonly Chord[];
  scale: Scale | null;
  /** The key the chords come from, when it is not the scale itself. */
  borrowedFrom: Scale | null;
  chordSize: ChordSize;
  onChordSizeChange: (size: ChordSize) => void;
  isChordActive: (index: number) => boolean;
  onPickChord: (index: number) => void;
  onAppend: (chord: Chord) => void;
  /** Whether the current highlight is a chord — its way out sits here. */
  showClear: boolean;
  onClear: () => void;
}

/**
 * The key's own chords as cards. Clicking one sounds it and shows it on the neck;
 * its „+" appends it to the progression — one set of cards, two actions.
 */
export function ChordRow({
  chords,
  scale,
  borrowedFrom,
  chordSize,
  onChordSizeChange,
  isChordActive,
  onPickChord,
  onAppend,
  showClear,
  onClear,
}: ChordRowProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Leitereigene Akkorde
          {borrowedFrom ? (
            <span className="panel-source">aus {withAccidentals(borrowedFrom.name())}</span>
          ) : null}
        </h2>
        <select
          className="select"
          aria-label="Akkordgröße"
          value={chordSize}
          onChange={(e) => onChordSizeChange(Number(e.target.value) as ChordSize)}
        >
          <option value={3}>Dreiklänge</option>
          <option value={4}>Septakkorde</option>
          <option value={5}>Nonakkorde</option>
        </select>
      </div>

      <p className="hint">
        {borrowedFrom
          ? `${scale?.type.name} hat keine eigenen Stufenakkorde — diese kommen aus ${borrowedFrom.name()}, der Tonart dahinter. Anklicken: du hörst den Akkord und siehst ihn im Hals; Töne außerhalb der Skala sind hohl gezeichnet.`
          : 'Anklicken: du hörst den Akkord und siehst seine Töne im Hals. „+" hängt ihn an die Akkordfolge an.'}
      </p>

      <ol className="chord-row">
        {chords.map((chord, i) => (
          <li key={chord.name()} className="chord-slot">
            <button
              type="button"
              className={isChordActive(i) ? 'chord-card is-active' : 'chord-card'}
              aria-pressed={isChordActive(i)}
              onClick={() => onPickChord(i)}
            >
              <span className="roman">{chord.romanNumeral(i)}</span>
              <span className="chord-symbol">
                <NoteText name={chord.name()} />
              </span>
              <span className="chord-notes">
                {chord.notes.map((note) => note.name()).map(withAccidentals).join(' ')}
              </span>
            </button>

            <button
              type="button"
              className="chord-add tap-target"
              aria-label={`${chord.name()} an die Folge anhängen`}
              title="An die Folge anhängen"
              onClick={() => onAppend(chord)}
            >
              +
            </button>
          </li>
        ))}
      </ol>

      {showClear ? (
        <p className="chord-row-actions">
          <button type="button" className="link-button" onClick={onClear}>
            Hervorhebung aufheben
          </button>
        </p>
      ) : null}
    </section>
  );
}
