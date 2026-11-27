import { pitchClassName, Tuning, withAccidentals } from '../theory';
import { customTuningId, MAX_CAPO } from '../urlState';
import './SetupPanel.css';

/** The twelve notes offered per string in the custom-tuning editor. */
const NOTE_OPTIONS: string[] = Array.from({ length: 12 }, (_, pitchClass) =>
  pitchClassName(pitchClass),
);

interface SetupPanelProps {
  tuning: Tuning;
  tuningId: string;
  isCustomTuning: boolean;
  capo: number;
  /** Caps the capo: it cannot sit beyond the last fret. */
  fretCount: number;
  onTuningIdChange: (tuningId: string) => void;
  onCapoChange: (capo: number) => void;
}

/**
 * Tuning and capo in a few words, for the folded line above the panel. A custom
 * tuning spells its strings out; a capo is only mentioned when there is one.
 */
function instrumentSummary(tuning: Tuning, isCustomTuning: boolean, capo: number): string {
  const tuningLabel = isCustomTuning
    ? tuning.description.replace(/[A-G][#b]{1,2}/g, withAccidentals)
    : tuning.name;
  return capo > 0 ? `${tuningLabel} · Kapo ${capo}. Bund` : tuningLabel;
}

/**
 * The instrument itself — tuning and capo. Both are set once and
 * then left alone, so it lives in the „Ansicht" sheet rather than competing with
 * the key for attention.
 */
export function SetupPanel({
  tuning,
  tuningId,
  isCustomTuning,
  capo,
  fretCount,
  onTuningIdChange,
  onCapoChange,
}: SetupPanelProps) {
  return (
    <details className="sheet-fold">
      <summary>
        <h3>Instrument</h3>
        <span className="sheet-fold-value">{instrumentSummary(tuning, isCustomTuning, capo)}</span>
      </summary>
      <div className="option-rows">
        <label className="option-row">
          <span className="option-label">Stimmung</span>
          <span className="select-box">
            <select className="select"
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
          </span>
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

        <label className="option-row">
          <span className="option-label">Kapo</span>
          <span className="select-box">
            <select className="select" value={capo} onChange={(e) => onCapoChange(Number(e.target.value))}>
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
          </span>
        </label>
      </div>
    </details>
  );
}
