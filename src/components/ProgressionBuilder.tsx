import { useState } from 'react';
import { Chord } from '../theory';
import './ProgressionBuilder.css';

interface ProgressionBuilderProps {
  /** The seven diatonic chords of the key, for one-tap adding. */
  diatonic: readonly Chord[];
  /** The current sequence as chord symbols. */
  symbols: readonly string[];
  onChange: (symbols: string[]) => void;
}

/**
 * Build a chord sequence by hand: tap the diatonic chords, or type anything —
 * including the power chords and suspensions the vocabulary now knows. The result
 * is what the transport above plays, closing the loop the key finder opened.
 */
export function ProgressionBuilder({ diatonic, symbols, onChange }: ProgressionBuilderProps) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (symbol: string) => onChange([...symbols, symbol]);

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

  const removeAt = (index: number) => onChange(symbols.filter((_, i) => i !== index));

  return (
    <div className="builder">
      <div className="builder-sequence" aria-label="Deine Akkordfolge">
        {symbols.length === 0 ? (
          <span className="builder-empty">Noch leer — tippe Akkorde an oder gib welche ein.</span>
        ) : (
          symbols.map((symbol, i) => (
            <span key={`${symbol}#${i}`} className="builder-chip">
              {symbol}
              <button
                type="button"
                className="builder-remove"
                onClick={() => removeAt(i)}
                aria-label={`${symbol} entfernen`}
              >
                ×
              </button>
            </span>
          ))
        )}

        {symbols.length > 0 ? (
          <button type="button" className="builder-clear" onClick={() => onChange([])}>
            Leeren
          </button>
        ) : null}
      </div>

      <div className="builder-add">
        <ul className="builder-diatonic">
          {diatonic.map((chord, i) => (
            <li key={chord.name()}>
              <button
                type="button"
                className="builder-diatonic-btn"
                onClick={() => add(chord.name())}
                title={`${chord.name()} anhängen`}
              >
                <span className="builder-roman">{chord.romanNumeral(i)}</span>
                <span className="builder-name">{chord.name()}</span>
              </button>
            </li>
          ))}
        </ul>

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
