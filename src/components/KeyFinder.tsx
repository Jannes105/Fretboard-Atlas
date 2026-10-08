import { useMemo, useState } from 'react';
import { Chord, type KeyMatch, matchKeys, withAccidentals } from '../theory';
import { NoteText } from './NoteText';
import './KeyFinder.css';

interface KeyFinderProps {
  /** Apply a found key. root is always one of ROOT_CHOICES, id a real scale type. */
  onPick: (root: string, scaleTypeId: string) => void;
  /** Take the typed chords as a playable progression, in the given key. */
  onAdopt: (symbols: string[], root: string, scaleTypeId: string) => void;
}

interface Analysis {
  /** The chords that parsed, aligned to each KeyMatch.degrees array. */
  chords: Chord[];
  matches: KeyMatch[];
  /** Tokens that are not chords, so the user learns which word was rejected. */
  unknown: string[];
  hasInput: boolean;
}

function analyse(text: string): Analysis {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const chords: Chord[] = [];
  const unknown: string[] = [];

  for (const token of tokens) {
    try {
      chords.push(Chord.parse(token));
    } catch {
      unknown.push(token);
    }
  }

  return {
    chords,
    matches: chords.length > 0 ? matchKeys(chords) : [],
    unknown,
    hasInput: tokens.length > 0,
  };
}

/** Short label for a key, e.g. "G-Dur", "A-Moll" — the mode's first word only. */
function keyLabel(match: KeyMatch): string {
  return `${match.scale.root.name()}-${match.scale.type.name.split(' ')[0]}`;
}

/**
 * Reverse lookup: paste the chords from a tab, get the key — and one click sets
 * the whole app to it.
 *
 * No trigger of its own any more. It used to be a button called „Tonart finden"
 * right next to the key, and that name is exactly what a newcomer looking for the
 * key picker reads — so they opened this instead. It now lives INSIDE the key
 * picker, as its second way in, under a name that says what it does.
 */
export function KeyFinder({ onPick, onAdopt }: KeyFinderProps) {
  const [text, setText] = useState('');

  const analysis = useMemo(() => analyse(text), [text]);

  const pick = (match: KeyMatch) => {
    onPick(match.scale.root.name(), match.scale.type.id);
  };

  const adopt = () => {
    // Play the chords the user actually typed, in the best-matching key.
    const best = analysis.matches[0];
    onAdopt(
      analysis.chords.map((chord) => chord.name()),
      best.scale.root.name(),
      best.scale.type.id,
    );
  };

  return (
    <div className="keyfinder">
      <label className="keyfinder-field">
        <span>Akkorde aus einem Song, durch Leerzeichen getrennt</span>
        <input
          // The tab was opened to type here, so the cursor waits in the field.
          autoFocus
          type="text"
          value={text}
          placeholder="G D Em C"
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>

      {analysis.unknown.length > 0 ? (
        <p className="keyfinder-note keyfinder-note--warn">
          Nicht erkannt: {analysis.unknown.join(', ')}
        </p>
      ) : null}

      {analysis.hasInput && analysis.matches.length === 0 ? (
        <p className="keyfinder-note">
          Keine Dur- oder Moll-Tonart enthält diese Akkorde.
        </p>
      ) : null}

      {analysis.matches.length > 1 ? (
        <p className="keyfinder-note">
          Mehrere Tonarten teilen sich dieselben Akkorde — wähl die, deren Grundton sich
          richtig anfühlt.
        </p>
      ) : null}

      {analysis.matches.length > 0 ? (
        <ul className="keyfinder-results">
          {analysis.matches.map((match) => (
            <li key={keyLabel(match)}>
              <button type="button" className="keyfinder-result" onClick={() => pick(match)}>
                <span className="keyfinder-key">{withAccidentals(keyLabel(match))}</span>
                <span className="keyfinder-degrees">
                  {analysis.chords.map((chord, i) => {
                    const degree = match.degrees[i];
                    return (
                      <span
                        key={`${chord.name()}#${i}`}
                        className={
                          degree === null
                            ? 'keyfinder-degree is-outsider'
                            : 'keyfinder-degree'
                        }
                        title={chord.name()}
                      >
                        {degree === null ? (
                          <NoteText name={chord.name()} />
                        ) : (
                          chord.romanNumeral(degree)
                        )}
                      </span>
                    );
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {analysis.matches.length > 0 ? (
        <button type="button" className="keyfinder-adopt" onClick={adopt}>
          Als spielbare Akkordfolge übernehmen
        </button>
      ) : null}
    </div>
  );
}
