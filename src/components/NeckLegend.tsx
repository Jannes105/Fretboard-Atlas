import { type Note, type Scale, withAccidentals } from '../theory';
import { NoteText } from './NoteText';

interface NeckLegendProps {
  /** The key on the neck, or null for the keyless map. */
  scale: Scale | null;
  characteristic: { index: number; note: Note; why: string } | null;
  isDegreeActive: (index: number) => boolean;
  onPickDegree: (index: number) => void;
  /**
   * What a note touched on the neck picked out — the note with its octave, and on
   * how many places it lives. Null unless the highlight started on the neck or at
   * a chip; a chord's way out sits with the chord cards.
   */
  pickedNote: { label: string; places: number; hasUnison: boolean } | null;
  onClear: () => void;
}

/**
 * Under the neck, explaining it. With a key: the scale's tones as chips that pick
 * themselves out on the neck, and the tone a mode is recognised by. Without one:
 * only what a touched note picked out, and the way back.
 */
export function NeckLegend({
  scale,
  characteristic,
  isDegreeActive,
  onPickDegree,
  pickedNote,
  onClear,
}: NeckLegendProps) {
  if (scale === null && pickedNote === null) return null;

  return (
    <section className="neck-legend" aria-label={scale ? 'Töne der Tonart' : 'Gefundener Ton'}>
      {scale ? (
        <ul className="degree-chips">
          {scale.notes.map((note, i) => (
            <li key={note.name()}>
              <button
                type="button"
                className={[
                  'degree-chip',
                  i === 0 ? 'is-root' : '',
                  characteristic?.index === i ? 'is-characteristic' : '',
                  isDegreeActive(i) ? 'is-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={isDegreeActive(i)}
                onClick={() => onPickDegree(i)}
              >
                <span className="note-name">
                  <NoteText name={note.name()} />
                </span>
                <span className="note-degree">
                  <NoteText name={scale.degreeLabelOf(note.pitchClass) ?? ''} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
       * The one tone that makes this mode sound like itself. Six of its seven
       * notes are the neighbour's too; without this line the neck shows two
       * pictures nobody can tell apart.
       */}
      {scale && characteristic ? (
        <p className="characteristic-hint">
          <span className="characteristic-mark" aria-hidden="true" />
          Charakterton{' '}
          <strong>
            <NoteText name={characteristic.note.name()} />
          </strong>{' '}
          ({withAccidentals(scale.degreeLabelOf(characteristic.note.pitchClass) ?? '')}):{' '}
          {characteristic.why}.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => onPickDegree(characteristic.index)}
          >
            Im Hals zeigen
          </button>
        </p>
      ) : null}

      {pickedNote ? (
        <p className="picked-actions">
          <span className="picked-note">
            {scale ? null : (
              <strong>
                <NoteText name={pickedNote.label} />
              </strong>
            )}
            {scale ? null : ` — an ${pickedNote.places} Stellen auf dem Hals. `}
            {pickedNote.hasUnison ? (
              <>
                <span className="unison-mark" aria-hidden="true" /> Umrandet: genau diese Tonhöhe.{' '}
              </>
            ) : null}
          </span>
          <button type="button" className="link-button" onClick={onClear}>
            Hervorhebung aufheben
          </button>
        </p>
      ) : null}
    </section>
  );
}
