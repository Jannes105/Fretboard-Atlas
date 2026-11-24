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
 * The instrument itself — tuning, capo, fret count. All of it is set once and
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
  onFretCountChange,
}: SetupPanelProps) {
  return (
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
  );
}
