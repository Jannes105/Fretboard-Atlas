import { usePopover } from '../hooks/usePopover';
import type { CagedForm, CagedPlacement } from '../theory';
import type { LabelMode } from './FretboardView';

interface NeckViewPanelProps {
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
 * How the neck is drawn, behind one trigger.
 *
 * These used to stand as a row of three dropdowns and a toggle right above the
 * neck — four controls of equal weight between the key and the picture, every
 * one of them a refinement rather than a first step. The positions stay outside
 * (they are how you move around the neck); everything that only changes how the
 * same notes are drawn lives in here.
 */
export function NeckViewPanel({
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
  const { open, toggle, containerRef } = usePopover();

  const summary = [
    labelMode === 'degree' ? 'Stufen' : 'Notennamen',
    cagedForm ? `CAGED ${cagedForm}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="setup view-setup" ref={containerRef}>
      <button
        type="button"
        className={open ? 'trigger view-trigger is-open' : 'trigger view-trigger'}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg className="trigger-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
        Ansicht
        <span className="trigger-value">{summary}</span>
        <span className="trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="popover setup-panel view-panel">
          <div className="field field--plain">
            <span>Beschriftung</span>
            {/* Two options are not worth a dropdown: both fit side by side. */}
            <div className="segmented" role="group" aria-label="Beschriftung">
              <button
                type="button"
                aria-pressed={labelMode === 'note'}
                onClick={() => onLabelModeChange('note')}
              >
                Notennamen
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

          {/* Only meaningful with a position selected — there is nothing else to crop to. */}
          {hasBox ? (
            <label className="toggle">
              <input
                type="checkbox"
                checked={boxZoom}
                onChange={(e) => onBoxZoomChange(e.target.checked)}
              />
              <span>Nur die gewählte Lage zeigen</span>
            </label>
          ) : null}

          {/* Hidden where the forms would not hold — a wrong grip helps nobody. */}
          {cagedForms.length > 0 ? (
            <label className="field">
              <span>CAGED-Form</span>
              <select
                aria-label="CAGED-Form"
                value={cagedForm ?? ''}
                onChange={(e) =>
                  onCagedFormChange(e.target.value === '' ? null : (e.target.value as CagedForm))
                }
              >
                <option value="">aus</option>
                {cagedForms.map((placement) => (
                  <option key={placement.form} value={placement.form}>
                    {placement.form}-Form ({fretLabel(placement.startFret)})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {cagedForms.length > 0 ? (
            <p className="hint view-hint">
              Die Form des Grundakkords, über die Skala gelegt.
              {minorTonic
                ? ' In Moll gibt es nur die E-, A- und D-Form — die C- und G-Form sind als Moll-Griff nicht greifbar.'
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
