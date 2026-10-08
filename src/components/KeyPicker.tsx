import { useEffect, useState } from 'react';
import { usePopover } from '../hooks/usePopover';
import { ROOT_CHOICES, type Scale, scaleTypesInGroup, withAccidentals } from '../theory';
import { KeyFinder } from './KeyFinder';
import { NoteText } from './NoteText';
import './KeyPicker.css';

export type KeyPickerTab = 'choose' | 'detect';

/** Opening the picker from elsewhere on the page — a start card, say. */
export interface KeyPickerRequest {
  readonly tab: KeyPickerTab;
  /** Bumped per request, so asking twice for the same tab opens it twice. */
  readonly serial: number;
}

interface KeyPickerProps {
  /** The key on the neck, or null for the plain map of every note. */
  scale: Scale | null;
  root: string;
  onRootChange: (root: string) => void;
  /** null clears the key and goes back to every note. */
  onScaleTypeChange: (scaleTypeId: string | null) => void;
  /** Root and scale at once — from a match in the chord lookup. */
  onPickKey: (root: string, scaleTypeId: string) => void;
  /** Take the typed chords as a playable progression, in the given key. */
  onAdopt: (symbols: string[], root: string, scaleTypeId: string) => void;
  request?: KeyPickerRequest | null;
}

/**
 * THE way to choose a key. One button, one panel, everything in it.
 *
 * Before, the key was two invisible selects lying over a headline, the root only
 * appeared once a scale had been chosen, and the button right beside them was
 * called „Tonart finden" — and opened something else. A newcomer told „wähl oben
 * eine Tonart" found no control by that name, or the wrong one.
 *
 * Now the button says „Tonart wählen" until there is one, and then names it. The
 * panel shows the twelve roots as a grid (one tap, no list to scroll) and the
 * scales as buttons, most-used first. Each choice applies at once, so the neck
 * changes behind the panel while you look; „Fertig" or a tap outside closes it.
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
  request = null,
}: KeyPickerProps) {
  const { open, setOpen, toggle, containerRef } = usePopover();
  const [tab, setTab] = useState<KeyPickerTab>('choose');

  // A request from elsewhere opens the panel on the tab it asks for.
  useEffect(() => {
    if (request === null) return;
    setTab(request.tab);
    setOpen(true);
    containerRef.current?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.serial]);

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
    <div className="key-picker" ref={containerRef}>
      <button
        type="button"
        className={open ? 'key-trigger is-open' : 'key-trigger'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) setTab('choose');
          toggle();
        }}
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

      {open ? (
        <div className="popover key-panel" role="dialog" aria-label="Tonart">
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

              <div className="key-panel-foot">
                {scale ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onScaleTypeChange(null)}
                  >
                    Keine Tonart — alle Töne zeigen
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" className="key-done" onClick={() => setOpen(false)}>
                  Fertig
                </button>
              </div>
            </div>
          ) : (
            <div role="tabpanel">
              <KeyFinder
                onPick={(pickedRoot, pickedScaleTypeId) => {
                  onPickKey(pickedRoot, pickedScaleTypeId);
                  setOpen(false);
                }}
                onAdopt={(symbols, pickedRoot, pickedScaleTypeId) => {
                  onAdopt(symbols, pickedRoot, pickedScaleTypeId);
                  setOpen(false);
                }}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
