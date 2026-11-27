import { type Note, type Scale, withAccidentals } from '../theory';
import { NoteText } from './NoteText';
import './ScaleTones.css';

interface ScaleTonesProps {
  scale: Scale;
  characteristic: { index: number; note: Note; why: string } | null;
  isDegreeActive: (index: number) => boolean;
  onPickDegree: (index: number) => void;
  /** Just the chips, for the sheet shrunk to a strip. */
  compact?: boolean;
}

/**
 * The key's tones, at the top of the „Tonart" sheet: chips that pick themselves
 * out on the neck above, and the tone a mode is recognised by.
 *
 * They used to sit under the neck as its legend — which, on a phone with an
 * upright 24-fret neck, was two screens below the picture they explained.
 */
export function ScaleTones({
  scale,
  characteristic,
  isDegreeActive,
  onPickDegree,
  compact = false,
}: ScaleTonesProps) {
  return (
    <section className="scale-tones" aria-label="Töne der Tonart">
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

      {/*
       * The one tone that makes this mode sound like itself. Six of its seven
       * notes are the neighbour's too; without this line the neck shows two
       * pictures nobody can tell apart.
       */}
      {characteristic && !compact ? (
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

    </section>
  );
}
