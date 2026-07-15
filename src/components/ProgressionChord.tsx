import { useMemo, useState } from 'react';
import { defaultVoicingIndex, type ProgressionStep, type Tuning, voicingsFor } from '../theory';
import { ChordDiagram } from './ChordDiagram';
import './ProgressionChord.css';

interface ProgressionChordProps {
  step: ProgressionStep;
  /** Already carries the capo, so voicing frets come out relative to it. */
  tuning: Tuning;
  /** Owned by App so that opening one chord's picker closes every other. */
  isOpen: boolean;
  onToggle: () => void;
  /** Sound the selected voicing — the exact grip shown, as MIDI notes. */
  onHear?: (midiNotes: number[]) => void;
}

/** "A-Form, 5. Bund" — or "offen" when the shape sits at the nut. */
function describe(shapeName: string, baseFret: number): string {
  return baseFret === 0 ? `${shapeName}, offen` : `${shapeName}, ${baseFret}. Bund`;
}

/**
 * One chord of a progression. It starts on a barre shape and clicking it opens
 * every voicing we know, so an open chord is always one click away on any single
 * step without a global setting to flip.
 *
 * The picked voicing lives here; whether the picker is open lives in App, which
 * is what keeps two pickers from being open at once. App remounts this on key
 * changes (scale, progression, chord size), resetting the pick to the default.
 */
export function ProgressionChord({
  step,
  tuning,
  isOpen,
  onToggle,
  onHear,
}: ProgressionChordProps) {
  const voicings = useMemo(() => voicingsFor(step.chord, { tuning }), [step.chord, tuning]);

  const [selected, setSelected] = useState(() => defaultVoicingIndex(voicings));

  const voicing = voicings[selected];

  /** The MIDI notes the shown grip actually sounds — muted strings dropped. */
  const hear = () => {
    if (!onHear || !voicing) return;
    const midi = voicing.frets
      .map((fret, string) => (fret < 0 ? null : tuning.midiAt(string, fret)))
      .filter((note): note is number => note !== null);
    onHear(midi);
  };

  if (!voicing) {
    return (
      <li className="progression-chord">
        <span className="roman">{step.roman}</span>
        <span className="chord-symbol">{step.chord.name()}</span>
        <span className="chord-notes">
          {step.chord.notes.map((note) => note.name()).join(' ')}
        </span>
        <span className="no-shape">kein Griff hinterlegt</span>
      </li>
    );
  }

  return (
    <li className="progression-chord">
      <span className="roman">{step.roman}</span>
      <span className="chord-symbol">{step.chord.name()}</span>

      <button
        type="button"
        className="voicing-button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${step.chord.name()}: Griff wählen (aktuell ${describe(voicing.shapeName, voicing.baseFret)})`}
        disabled={voicings.length < 2}
      >
        <ChordDiagram chord={step.chord} voicing={voicing} />
        {voicings.length > 1 ? (
          <span className="voicing-count">{voicings.length} Griffe ▾</span>
        ) : null}
      </button>

      {onHear ? (
        <button
          type="button"
          className="play-button play-button--small"
          onClick={hear}
          aria-label={`${step.chord.name()} anhören`}
          title="Griff anhören"
        >
          ▶
        </button>
      ) : null}

      {isOpen ? (
        <div className="voicing-picker" role="listbox">
          {voicings.map((option, i) => (
            <button
              key={`${option.shapeName}-${option.baseFret}`}
              type="button"
              role="option"
              aria-selected={i === selected}
              className={i === selected ? 'voicing-option is-selected' : 'voicing-option'}
              onClick={() => {
                setSelected(i);
                onToggle();
              }}
            >
              <ChordDiagram
                chord={step.chord}
                voicing={option}
                caption={describe(option.shapeName, option.baseFret)}
              />
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
