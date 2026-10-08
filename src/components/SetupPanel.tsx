import { usePopover } from '../hooks/usePopover';
import { pitchClassName, Tuning, withAccidentals } from '../theory';
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
  onTuningIdChange: (tuningId: string) => void;
  onCapoChange: (capo: number) => void;
  onFretCountChange: (fretCount: number) => void;
}

/**
 * The instrument itself — tuning, capo, fret count. All of it is set once
 * and then left alone, so it lives behind a trigger rather than four dropdowns
 * competing with the key for attention.
 *
 * The light/dark switch used to be in here too, which is why the trigger was
 * called "Instrument & Darstellung" and why this comment used to concede that the
 * theme "has nowhere better to live". It does: the page foot. Everything in this
 * drawer now describes the instrument and nothing describes the reader, so the
 * trigger can simply say what it opens.
 */
export function SetupPanel({
  tuning,
  tuningId,
  isCustomTuning,
  capo,
  fretCount,
  onTuningIdChange,
  onCapoChange,
  onFretCountChange,
}: SetupPanelProps) {
  const { open, toggle, containerRef } = usePopover();

  // A custom tuning shows its notes; a preset just its name. A capo only earns a
  // mention when there is one — the normal case is no capo.
  // A custom tuning spells its six strings out, and withAccidentals converts one
  // name at a time — so it is applied per note token rather than to the sentence.
  const tuningLabel = isCustomTuning
    ? tuning.description.replace(/[A-G][#b]{1,2}/g, withAccidentals)
    : tuning.name;

  const summary = [
    tuningLabel,
    capo > 0 ? `Kapo ${capo}. Bund` : null,
    `${fretCount} Bünde`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="setup" ref={containerRef}>
      <button
        type="button"
        className={open ? 'trigger setup-trigger is-open' : 'trigger setup-trigger'}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg className="trigger-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="2.4" />
          <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" />
        </svg>
        Instrument
        <span className="trigger-value">{summary}</span>
        <span className="trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="popover setup-panel">
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
                    // The value is the ASCII name the tuning id is built from.
                    <option key={note} value={note}>
                      {withAccidentals(note)}
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

        </div>
      ) : null}
    </div>
  );
}
