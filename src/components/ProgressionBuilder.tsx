import { useState } from 'react';
import { Chord } from '../theory';
import type { CustomStep } from '../urlState';
import { NoteText } from './NoteText';
import './ProgressionBuilder.css';

/** One chord may be held up to this many bars. */
const MAX_BARS = 4;

interface ProgressionBuilderProps {
  /** The current sequence: each chord and how many bars it is held. */
  steps: readonly CustomStep[];
  onChange: (steps: CustomStep[]) => void;
}

/**
 * The sequence itself: reorderable chips with their bar counts, plus a field for
 * anything the vocabulary knows (power chords, suspensions, slash chords). The
 * diatonic chords are added from their cards above — they are not drawn twice.
 */
export function ProgressionBuilder({ steps, onChange }: ProgressionBuilderProps) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (symbol: string) => onChange([...steps, { symbol, bars: 1 }]);

  const addTyped = () => {
    const text = typed.trim();
    if (text === '') return;
    try {
      // Normalise through the parser, so "e5" becomes "E5" and junk is caught here.
      add(Chord.parse(text).name());
      setTyped('');
      setError(null);
    } catch {
      setError(`„${text}" ist kein Akkord, den ich kenne.`);
    }
  };

  const removeAt = (index: number) => onChange(steps.filter((_, i) => i !== index));

  // Click cycles the bar count 1 → 2 → 3 → 4 → 1.
  const cycleBars = (index: number) =>
    onChange(
      steps.map((step, i) =>
        i === index ? { ...step, bars: (step.bars % MAX_BARS) + 1 } : step,
      ),
    );

  return (
    <div className="builder">
      <div className="builder-sequence" aria-label="Deine Akkordfolge">
        {steps.length === 0 ? (
          <span className="builder-empty">Noch leer — tippe Akkorde an oder gib welche ein.</span>
        ) : (
          steps.map((step, i) => (
            <span key={`${step.symbol}#${i}`} className="builder-chip">
              <NoteText name={step.symbol} />
              <button
                type="button"
                className="builder-bars"
                onClick={() => cycleBars(i)}
                aria-label={`${step.symbol}: Länge ${step.bars} ${step.bars === 1 ? 'Takt' : 'Takte'}`}
                title="Länge in Takten"
              >
                {step.bars}×
              </button>
              <button
                type="button"
                className="builder-remove"
                onClick={() => removeAt(i)}
                aria-label={`${step.symbol} entfernen`}
              >
                ×
              </button>
            </span>
          ))
        )}

        {steps.length > 0 ? (
          <button type="button" className="builder-clear" onClick={() => onChange([])}>
            Leeren
          </button>
        ) : null}
      </div>

      <div className="builder-add">
        {/* The seven diatonic chords are NOT repeated here — they already sit
            above as cards, each with a "+" that appends. One set, not two. */}
        <form
          className="builder-type"
          onSubmit={(event) => {
            event.preventDefault();
            addTyped();
          }}
        >
          <input
            type="text"
            value={typed}
            placeholder="z. B. E5, Dsus4"
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Akkord eingeben"
          />
          <button type="submit" className="builder-type-add">
            Hinzufügen
          </button>
        </form>
      </div>

      {error ? <p className="builder-error">{error}</p> : null}
    </div>
  );
}
