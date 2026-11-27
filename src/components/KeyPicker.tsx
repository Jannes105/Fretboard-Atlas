import { useState } from 'react';
import { Note, pitchClassNames, type Scale, scaleTypesInGroup, withAccidentals } from '../theory';
import type { Spelling } from './FretboardView';
import { KeyFinder } from './KeyFinder';
import { NoteText } from './NoteText';
import './KeyPicker.css';

type KeyPickerTab = 'choose' | 'detect';

interface KeyPickerProps {
  /** The key on the neck, or null for the plain map of every note. */
  scale: Scale | null;
  root: string;
  /** A pitch, not a name: how the key is written is the caller's to decide. */
  onRootChange: (pitchClass: number) => void;
  /** Which name of a black key is the big one. */
  spelling: Spelling;
  /** null clears the key and goes back to every note. */
  onScaleTypeChange: (scaleTypeId: string | null) => void;
  /** Root and scale at once — from a match in the chord lookup. */
  onPickKey: (root: string, scaleTypeId: string) => void;
  /**
   * Take the typed chords as a playable progression, in the given key. Where the
   * sheet goes next is the caller's call — to the progression it just made.
   */
  onAdopt: (symbols: string[], root: string, scaleTypeId: string) => void;
  /** A match from the lookup is a finished answer: the sheet can close. */
  onDone: () => void;
}

interface KeyTitleProps {
  scale: Scale | null;
  root: string;
}

/**
 * The key's name at the top of the screen. Only a name: the way to change it is
 * the „Tonart" tab at the bottom, where the thumb already is. A second, identical
 * way in up here only raised the question which of the two to use.
 */
export function KeyTitle({ scale, root }: KeyTitleProps) {
  return (
    <p className="key-title" aria-hidden="true">
      {scale ? (
        <>
          <span className="key-title-root">
            <NoteText name={root} />
          </span>
          <span className="key-title-type">{scale.type.name}</span>
        </>
      ) : (
        <span className="key-title-type key-title-type--none">Alle Töne</span>
      )}
    </p>
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
 * The panel shows the twelve roots as a grid (one tap, no list to scroll) and the
 * scales as buttons, most-used first. Each choice applies at once, so the neck
 * changes above the sheet while you look.
 *
 * The chord lookup is the second tab: the other way of answering „which key?".
 */
export function KeyPicker({
  scale,
  root,
  onRootChange,
  spelling,
  onScaleTypeChange,
  onPickKey,
  onAdopt,
  onDone,
}: KeyPickerProps) {
  const [tab, setTab] = useState<KeyPickerTab>('choose');

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
            {Array.from({ length: 12 }, (_, pitchClass) => {
              // A black key carries both names — the one you read off the neck big,
              // the other small. Which one the key is written with, the scale decides.
              const names = pitchClassNames(pitchClass);
              const [main, other] =
                names.length === 1 ? [names[0], null] : spelling === 'flat' ? [names[1], names[0]] : names;
              return (
                <button
                  key={pitchClass}
                  type="button"
                  className="root-option"
                  // Without a scale there is no root on the neck to be pressed.
                  aria-pressed={scale !== null && Note.parse(root).pitchClass === pitchClass}
                  aria-label={
                    other ? `${withAccidentals(main)} oder ${withAccidentals(other)}` : main
                  }
                  onClick={() => onRootChange(pitchClass)}
                >
                  <span>
                    <NoteText name={main} />
                  </span>
                  {other ? (
                    <span className="root-option-alt" aria-hidden="true">
                      <NoteText name={other} />
                    </span>
                  ) : null}
                </button>
              );
            })}
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
