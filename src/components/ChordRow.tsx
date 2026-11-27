import { useState } from 'react';
import {
  type Chord,
  type ChordSize,
  type Scale,
  type Voicing,
  voicingPath,
  withAccidentals,
} from '../theory';
import { ChordDiagram } from './ChordDiagram';
import { NoteText } from './NoteText';
import './ChordRow.css';

const SIZES: readonly { value: ChordSize; label: string }[] = [
  { value: 3, label: 'Drei' },
  { value: 4, label: 'Sept' },
  { value: 5, label: 'Non' },
];

interface ChordRowProps {
  chords: readonly Chord[];
  /** The key the chords come from, when it is not the scale itself. */
  borrowedFrom: Scale | null;
  chordSize: ChordSize;
  onChordSizeChange: (size: ChordSize) => void;
  isChordActive: (index: number) => boolean;
  onPickChord: (index: number) => void;
  onAppend: (chord: Chord) => void;
  /** Every grip there is for a chord in the current tuning. */
  voicingsOf: (chord: Chord) => readonly Voicing[];
  onHearVoicing: (voicing: Voicing) => void;
  /** „Offene Griffe zuerst": the grip shown first is the one the progression would pick. */
  preferOpen: boolean;
}

/** "A-Form, 5. Bund" — or just "5. Bund" for a generated grip with no form name. */
function describe(voicing: Voicing): string {
  const position = voicing.baseFret === 0 ? 'offen' : `${voicing.baseFret}. Bund`;
  return voicing.shapeName === '' ? position : `${voicing.shapeName}, ${position}`;
}

/**
 * The key's own chords in the „Akkorde" sheet: a grid of cards, each a whole
 * fingertip wide. A tap sounds the chord and shows it on the neck above; below
 * the grid the picked chord then shows how to grip it, and how to add it to the
 * progression.
 *
 * The „+" used to hang half off the corner of every card — seven small targets
 * crowding seven big ones, and the cause of every mis-tap between „hear it" and
 * „add it". Now there is one, for the chord you are looking at.
 */
export function ChordRow({
  chords,
  borrowedFrom,
  chordSize,
  onChordSizeChange,
  isChordActive,
  onPickChord,
  onAppend,
  voicingsOf,
  onHearVoicing,
  preferOpen,
}: ChordRowProps) {
  const activeIndex = chords.findIndex((_, i) => isChordActive(i));
  const active = activeIndex >= 0 ? chords[activeIndex] : null;

  return (
    <section className="chord-sheet" aria-label="Leitereigene Akkorde">
      {/* The size first, where the eye starts; the source, when there is one, after. */}
      <div className="sheet-toolbar">
        <div className="segmented" role="group" aria-label="Akkordgröße">
          {SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              aria-pressed={chordSize === size.value}
              onClick={() => onChordSizeChange(size.value)}
            >
              {size.label}
            </button>
          ))}
        </div>
        {borrowedFrom ? (
          <span className="panel-source">aus {withAccidentals(borrowedFrom.name())}</span>
        ) : null}
      </div>

      <ol className="chord-grid">
        {chords.map((chord, i) => (
          <li key={chord.name()}>
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
          </li>
        ))}
      </ol>

      {active ? (
        <ChordDetail
          // A different chord starts again at its own best grip.
          key={active.name()}
          chord={active}
          voicings={voicingsOf(active)}
          preferOpen={preferOpen}
          onHear={onHearVoicing}
          onAppend={() => onAppend(active)}
        />
      ) : null}
    </section>
  );
}

interface ChordDetailProps {
  chord: Chord;
  voicings: readonly Voicing[];
  preferOpen: boolean;
  onHear: (voicing: Voicing) => void;
  onAppend: () => void;
}

/** The picked chord: one grip at a time, the others a step away, and „+ zur Folge". */
function ChordDetail({ chord, voicings, preferOpen, onHear, onAppend }: ChordDetailProps) {
  // A path of one chord: the same comfort rule the progression walks by.
  const [index, setIndex] = useState(() => voicingPath([voicings], { preferOpen })[0] ?? 0);
  const voicing = voicings[index];

  const step = (delta: number) => {
    const next = (index + delta + voicings.length) % voicings.length;
    setIndex(next);
    onHear(voicings[next]);
  };

  return (
    <div className="chord-detail">
      {voicing ? (
        <div className="chord-detail-grip">
          {voicings.length > 1 ? (
            <button
              type="button"
              className="grip-step"
              aria-label="Vorheriger Griff"
              onClick={() => step(-1)}
            >
              ‹
            </button>
          ) : null}
          <button
            type="button"
            className="voicing-button"
            onClick={() => onHear(voicing)}
            aria-label={`${chord.name()} anhören (${describe(voicing)})`}
          >
            <ChordDiagram chord={chord} voicing={voicing} caption={describe(voicing)} />
          </button>
          {voicings.length > 1 ? (
            <button
              type="button"
              className="grip-step"
              aria-label="Nächster Griff"
              onClick={() => step(1)}
            >
              ›
            </button>
          ) : null}
        </div>
      ) : (
        <p className="no-shape">Für diesen Akkord ist in dieser Stimmung kein Griff hinterlegt.</p>
      )}

      <button type="button" className="chord-append" onClick={onAppend}>
        + <NoteText name={chord.name()} /> zur Folge
      </button>
    </div>
  );
}

interface ChordStripProps {
  chords: readonly Chord[];
  isChordActive: (index: number) => boolean;
  onPickChord: (index: number) => void;
}

/**
 * The key's chords in one row, for the „Akkorde" sheet shrunk to a strip: after
 * a pick, the neck above is what you want to see, and the next chord is still
 * one tap away. Grips and „+ zur Folge" wait behind „Mehr".
 */
export function ChordStrip({ chords, isChordActive, onPickChord }: ChordStripProps) {
  return (
    <ol className="chord-strip" aria-label="Leitereigene Akkorde">
      {chords.map((chord, i) => (
        <li key={chord.name()}>
          <button
            type="button"
            className={isChordActive(i) ? 'chord-card chord-chip is-active' : 'chord-card chord-chip'}
            aria-pressed={isChordActive(i)}
            onClick={() => onPickChord(i)}
          >
            <span className="roman">{chord.romanNumeral(i)}</span>
            <span className="chord-symbol">
              <NoteText name={chord.name()} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
