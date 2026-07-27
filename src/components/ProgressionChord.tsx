import { type ProgressionStep, type Voicing, withAccidentals } from '../theory';
import { ChordDiagram } from './ChordDiagram';
import { NoteText } from './NoteText';
import './ProgressionChord.css';

interface ProgressionChordProps {
  step: ProgressionStep;
  /** Every grip we know for this chord, in the current tuning. Owned by App. */
  voicings: readonly Voicing[];
  selected: number;
  onSelect: (index: number) => void;
  /** Owned by App so that opening one chord's picker closes every other. */
  isOpen: boolean;
  onToggle: () => void;
  /** Sound the grip shown. Clicking the diagram plays it — the same rule as everywhere. */
  onHear?: (voicing: Voicing) => void;
  /** True while the progression is playing this chord. */
  isPlaying?: boolean;
}

/** "A-Form, 5. Bund" — or just "5. Bund" for a generated grip with no form name. */
function describe(shapeName: string, baseFret: number): string {
  const position = baseFret === 0 ? 'offen' : `${baseFret}. Bund`;
  return shapeName === '' ? position : `${shapeName}, ${position}`;
}

/**
 * One chord of a progression.
 *
 * Clicking the diagram sounds the grip — the app's one rule: click the thing and
 * you hear the thing. Changing to another grip is the separate "N Griffe" button,
 * so hearing a chord never means committing to a different shape.
 *
 * Which grip is chosen lives in App, because the transport has to play the very
 * shapes shown here.
 */
export function ProgressionChord({
  step,
  voicings,
  selected,
  onSelect,
  isOpen,
  onToggle,
  onHear,
  isPlaying = false,
}: ProgressionChordProps) {
  const voicing = voicings[selected];

  if (!voicing) {
    return (
      <li className="progression-chord">
        <span className="roman">{step.roman}</span>
        <span className="chord-symbol">
          <NoteText name={step.chord.name()} />
        </span>
        <span className="chord-notes">
          {step.chord.notes.map((note) => note.name()).map(withAccidentals).join(' ')}
        </span>
        <span className="no-shape">kein Griff hinterlegt</span>
      </li>
    );
  }

  return (
    <li className={isPlaying ? 'progression-chord is-playing' : 'progression-chord'}>
      <span className="roman">{step.roman}</span>
      <span className="chord-symbol">
        <NoteText name={step.chord.name()} />
      </span>

      <button
        type="button"
        className="voicing-button"
        onClick={() => onHear?.(voicing)}
        aria-label={`${step.chord.name()} anhören (${describe(voicing.shapeName, voicing.baseFret)})`}
      >
        {/* The switch below already names the grip. */}
        <ChordDiagram chord={step.chord} voicing={voicing} caption={null} />
      </button>

      {voicings.length > 1 ? (
        <button
          type="button"
          className="voicing-switch"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={`${step.chord.name()}: Griff wechseln (aktuell ${describe(voicing.shapeName, voicing.baseFret)})`}
        >
          {describe(voicing.shapeName, voicing.baseFret)} ▾
        </button>
      ) : (
        <span className="voicing-caption">
          {describe(voicing.shapeName, voicing.baseFret)}
        </span>
      )}

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
                onSelect(i);
                onToggle();
                onHear?.(option);
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
