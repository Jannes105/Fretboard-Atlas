import { useState } from 'react';
import { ROOT_CHOICES, type Scale, scaleTypesInGroup, withAccidentals } from '../theory';
import { KeyFinder } from './KeyFinder';
import { NoteText } from './NoteText';
import './KeyPicker.css';

export type KeyPickerTab = 'choose' | 'detect';

interface KeyPickerProps {
  /** The key on the neck, or null for the plain map of every note. */
  scale: Scale | null;
  root: string;
  onRootChange: (root: string) => void;
  /** null clears the key and goes back to every note. */
  onScaleTypeChange: (scaleTypeId: string | null) => void;
  /** Root and scale at once — from a match in the chord lookup. */
  onPickKey: (root: string, scaleTypeId: string) => void;
  /**
   * Take the typed chords as a playable progression, in the given key. Where the
   * sheet goes next is the caller's call — to the progression it just made.
   */
  onAdopt: (symbols: string[], root: string, scaleTypeId: string) => void;
  /** Which tab it opens on — „Wählen", unless a start card asked for the lookup. */
  initialTab?: KeyPickerTab;
  /** A match from the lookup is a finished answer: the sheet can close. */
  onDone: () => void;
}

interface KeyButtonProps {
  scale: Scale | null;
  root: string;
  expanded: boolean;
  onClick: () => void;
}

/**
 * The key's name at the top of the screen, and the way to change it: it opens the
 * „Tonart" sheet. It says „Tonart wählen" until there is one.
 */
export function KeyButton({ scale, root, expanded, onClick }: KeyButtonProps) {
  return (
    <button
      type="button"
      className={expanded ? 'key-trigger is-open' : 'key-trigger'}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      aria-controls="sheet-key"
      onClick={onClick}
    >
      {scale ? (
        <>
          <span className="key-trigger-root">
            <NoteText name={root} />
          </span>
          <span className="key-trigger-type">{scale.type.name}</span>
        </>
      ) : (
        <span className="key-trigger-type">Tonart wählen</span>
      )}
      <span className="trigger-caret" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

/**
 * THE way to choose a key. One button, one sheet, everything in it.
 *
 * Before, the key was two invisible selects lying over a headline, the root only
 * appeared once a scale had been chosen, and the button right beside them was
 * called „Tonart finden" — and opened something else. A newcomer told „wähl oben
 * eine Tonart" found no control by that name, or the wrong one.
 *
 * Now the button says „Tonart wählen" until there is one, and then names it. The
 * panel shows the twelve roots as a grid (one tap, no list to scroll) and the
 * scales as buttons, most-used first. Each choice applies at once, so the neck
 * changes above the sheet while you look.
 *
 * The chord lookup is the second tab: the other way of answering „which key?".
 */
export function KeyPicker({
  scale,
  root,
  onRootChange,
  onScaleTypeChange,
  onPickKey,
  onAdopt,
  initialTab = 'choose',
  onDone,
}: KeyPickerProps) {
  const [tab, setTab] = useState<KeyPickerTab>(initialTab);

  const scaleId = scale?.type.id ?? null;

  const scaleButton = (id: string | null, label: string) => (
    <button
      key={id ?? 'all'}
      type="button"
      className="key-option"
      aria-pressed={scaleId === id}
      onClick={() => onScaleTypeChange(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="key-picker">
      <div className="key-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'choose'}
          onClick={() => setTab('choose')}
        >
          Wählen
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'detect'}
          onClick={() => setTab('detect')}
        >
          Aus Akkorden erkennen
        </button>
      </div>

      {tab === 'choose' ? (
        <div role="tabpanel">
          <p className="key-section">Grundton</p>
          <div className="root-grid" role="group" aria-label="Grundton">
            {ROOT_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                className="root-option"
                // Without a scale there is no root on the neck to be pressed.
                aria-pressed={scale !== null && choice === root}
                aria-label={withAccidentals(choice)}
                onClick={() => {
                  onRootChange(choice);
                  // A root alone shows nothing — it needs a scale to be a key.
                  // Major is the scale everyone starts from.
                  if (scale === null) onScaleTypeChange('major');
                }}
              >
                <NoteText name={choice} />
              </button>
            ))}
          </div>

          <p className="key-section">Skala</p>
          <div className="scale-options" role="group" aria-label="Skala">
            {scaleTypesInGroup('basics').map((type) => scaleButton(type.id, type.name))}
          </div>

          <details className="fine-tuning more-scales" open={scale?.type.group === 'more'}>
            <summary>Weitere Skalen</summary>
            <div className="scale-options" role="group" aria-label="Weitere Skalen">
              {scaleTypesInGroup('more').map((type) => scaleButton(type.id, type.name))}
            </div>
          </details>

          {scale ? (
            <div className="key-panel-foot">
              <button
                type="button"
                className="link-button"
                onClick={() => onScaleTypeChange(null)}
              >
                Keine Tonart — alle Töne zeigen
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel">
          <KeyFinder
            onPick={(pickedRoot, pickedScaleTypeId) => {
              onPickKey(pickedRoot, pickedScaleTypeId);
              onDone();
            }}
            onAdopt={(symbols, pickedRoot, pickedScaleTypeId) => {
              onAdopt(symbols, pickedRoot, pickedScaleTypeId);
            }}
          />
        </div>
      )}
    </div>
  );
}
