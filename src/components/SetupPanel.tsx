import { useEffect, useRef, useState } from 'react';
import type { Timbre } from '../audio';
import { pitchClassName, Tuning } from '../theory';
import { customTuningId, MAX_CAPO } from '../urlState';

/** The twelve notes offered per string in the custom-tuning editor. */
const NOTE_OPTIONS: string[] = Array.from({ length: 12 }, (_, pitchClass) =>
  pitchClassName(pitchClass),
);

interface SetupPanelProps {
  tuning: Tuning;
  tuningId: string;
  isCustomTuning: boolean;
  capo: number;
  fretCount: number;
  sound: Timbre;
  onTuningIdChange: (tuningId: string) => void;
  onCapoChange: (capo: number) => void;
  onFretCountChange: (fretCount: number) => void;
  onSoundChange: (sound: Timbre) => void;
}

/**
 * The instrument itself — tuning, capo, fret count, voice. All of it is set once
 * and then left alone, so it lives behind a trigger that spells out its value
 * rather than four dropdowns competing with the key for attention.
 */
export function SetupPanel({
  tuning,
  tuningId,
  isCustomTuning,
  capo,
  fretCount,
  sound,
  onTuningIdChange,
  onCapoChange,
  onFretCountChange,
  onSoundChange,
}: SetupPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A custom tuning shows its notes; a preset just its name. A capo only earns a
  // mention when there is one — the normal case is no capo.
  const summary = [
    isCustomTuning ? tuning.description : tuning.name,
    capo > 0 ? `Kapo ${capo}. Bund` : null,
    `${fretCount} Bünde`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="setup" ref={containerRef}>
      <button
        type="button"
        className={open ? 'setup-trigger is-open' : 'setup-trigger'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{summary}</span>
        <span className="setup-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="setup-panel">
          <label className="field">
            <span>Stimmung</span>
            <select
              value={isCustomTuning ? 'custom' : tuningId}
              onChange={(e) =>
                onTuningIdChange(
                  // Switching to custom seeds the editor from the current tuning.
                  e.target.value === 'custom'
                    ? customTuningId(tuning.stringLabels)
                    : e.target.value,
                )
              }
            >
              {Tuning.ALL.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.description}
                </option>
              ))}
              <option value="custom">Eigene Stimmung</option>
            </select>
          </label>

          {isCustomTuning ? (
            <div className="tuning-strings" role="group" aria-label="Saiten stimmen">
              {tuning.stringLabels.map((label, i) => (
                <select
                  // Strings never reorder, so the index is a stable key.
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  aria-label={`Saite ${tuning.stringLabels.length - i}`}
                  value={label}
                  onChange={(e) => {
                    const notes = [...tuning.stringLabels];
                    notes[i] = e.target.value;
                    onTuningIdChange(customTuningId(notes));
                  }}
                >
                  {NOTE_OPTIONS.map((note) => (
                    <option key={note} value={note}>
                      {note}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          ) : null}

          <label className="field">
            <span>Kapo</span>
            <select value={capo} onChange={(e) => onCapoChange(Number(e.target.value))}>
              <option value={0}>ohne</option>
              {/* Also capped by the neck, which today never bites — the shortest
                  neck on offer has as many frets as MAX_CAPO. It is here so that
                  shortening either limit cannot start promising a capo that
                  App then quietly clamps away. */}
              {Array.from({ length: Math.min(MAX_CAPO, fretCount) }, (_, i) => i + 1).map((fret) => (
                <option key={fret} value={fret}>
                  {fret}. Bund
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Bünde</span>
            <select value={fretCount} onChange={(e) => onFretCountChange(Number(e.target.value))}>
              <option value={12}>12</option>
              <option value={15}>15</option>
              <option value={24}>24</option>
            </select>
          </label>

          <label className="field">
            <span>Klang</span>
            <select value={sound} onChange={(e) => onSoundChange(e.target.value as Timbre)}>
              <option value="clean">Clean</option>
              <option value="electric">Overdrive</option>
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
