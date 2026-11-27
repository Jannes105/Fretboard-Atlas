import type { CagedForm, CagedPlacement } from '../theory';
import { FRET_COUNTS } from '../urlState';
import type { LabelMode } from './FretboardView';
import './NeckViewPanel.css';

interface NeckViewPanelProps {
  fretCount: number;
  onFretCountChange: (fretCount: number) => void;
  /** Labels and CAGED need a key; the fret count does not. */
  hasScale: boolean;
  labelMode: LabelMode;
  onLabelModeChange: (mode: LabelMode) => void;
  /** Whether a position is selected — the crop needs one to crop to. */
  hasBox: boolean;
  boxZoom: boolean;
  onBoxZoomChange: (zoom: boolean) => void;
  /** Empty where the forms would not hold (other string intervals). */
  cagedForms: readonly CagedPlacement[];
  cagedForm: CagedForm | null;
  onCagedFormChange: (form: CagedForm | null) => void;
  /** A minor tonic offers only three of the five forms, and says why. */
  minorTonic: boolean;
}

const fretLabel = (fret: number) => (fret === 0 ? 'offen' : `${fret}. Bund`);

/**
 * How the neck is drawn, in the „Ansicht" sheet: one row per setting, the name
 * on the left and the choice on the right.
 *
 * Every choice of up to three is a segmented control, and the CAGED forms a row
 * of chips — before, the sheet mixed segmented controls, dropdowns and
 * checkboxes under three different kinds of heading.
 */
export function NeckViewPanel({
  fretCount,
  onFretCountChange,
  hasScale,
  labelMode,
  onLabelModeChange,
  hasBox,
  boxZoom,
  onBoxZoomChange,
  cagedForms,
  cagedForm,
  onCagedFormChange,
  minorTonic,
}: NeckViewPanelProps) {
  return (
    <div className="option-rows view-panel">
      {/* How much neck: shorter is the exception, so it is three taps, not a list. */}
      <div className="option-row">
        <span className="option-label">Bünde</span>
        <div className="segmented" role="group" aria-label="Bünde">
          {FRET_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={fretCount === count}
              onClick={() => onFretCountChange(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {hasScale ? (
        <div className="option-row">
          <span className="option-label">Beschriftung</span>
          <div className="segmented" role="group" aria-label="Beschriftung">
            <button
              type="button"
              aria-pressed={labelMode === 'note'}
              onClick={() => onLabelModeChange('note')}
            >
              Töne
            </button>
            <button
              type="button"
              aria-pressed={labelMode === 'degree'}
              onClick={() => onLabelModeChange('degree')}
            >
              Stufen
            </button>
          </div>
        </div>
      ) : null}

      {/* Only meaningful with a position selected — there is nothing else to crop to. */}
      {hasBox ? (
        <label className="option-row switch-row">
          <span className="option-label">Nur die gewählte Lage</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={boxZoom}
            onChange={(e) => onBoxZoomChange(e.target.checked)}
          />
        </label>
      ) : null}

      {/* Hidden where the forms would not hold — a wrong grip helps nobody. */}
      {cagedForms.length > 0 ? (
        <div className="option-row option-row--stacked">
          <span className="option-label">CAGED-Form</span>
          <div className="caged-chips" role="group" aria-label="CAGED-Form">
            <button
              type="button"
              className="option-chip"
              aria-pressed={cagedForm === null}
              onClick={() => onCagedFormChange(null)}
            >
              aus
            </button>
            {cagedForms.map((placement) => (
              <button
                key={placement.form}
                type="button"
                className="option-chip"
                aria-pressed={cagedForm === placement.form}
                aria-label={`${placement.form}-Form (${fretLabel(placement.startFret)})`}
                title={`${placement.form}-Form (${fretLabel(placement.startFret)})`}
                data-form={placement.form}
                onClick={() => onCagedFormChange(placement.form)}
              >
                {placement.form}
              </button>
            ))}
          </div>
          <p className="hint view-hint">
            Die Form des Grundakkords, über die Skala gelegt.
            {minorTonic
              ? ' In Moll gibt es nur die E-, A- und D-Form — die C- und G-Form sind als Moll-Griff nicht greifbar.'
              : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}
