import { useEffect, useRef, useState } from 'react';
import { PATTERN_PRESETS, serializePattern } from '../theory';
import { RhythmEditor } from './RhythmEditor';
import './RhythmControls.css';

interface RhythmControlsProps {
  beatsPerBar: number;
  rhythm: string;
  onBeatsPerBarChange: (beatsPerBar: number) => void;
  onRhythmChange: (rhythm: string) => void;
}

const METERS: readonly { value: number; label: string }[] = [
  { value: 4, label: '4/4' },
  { value: 3, label: '3/4' },
  { value: 6, label: '6/8' },
  { value: 2, label: '2/4' },
];

/** The preset a pattern matches, so the trigger can name it instead of showing d/u/-. */
function patternName(rhythm: string, beatsPerBar: number): string {
  const preset = PATTERN_PRESETS.find(
    (candidate) => serializePattern(candidate.build(beatsPerBar)) === rhythm,
  );
  return preset ? preset.name : 'Eigenes Muster';
}

/**
 * Time signature and strum pattern: set once, then left alone — so they sit behind
 * one trigger that spells out their value ("4/4 · Viertel") instead of taking two
 * permanent rows next to the transport. Same idiom as the setup panel.
 */
export function RhythmControls({
  beatsPerBar,
  rhythm,
  onBeatsPerBarChange,
  onRhythmChange,
}: RhythmControlsProps) {
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

  const meter = METERS.find((entry) => entry.value === beatsPerBar)?.label ?? `${beatsPerBar}/4`;

  return (
    <div className="rhythm-controls" ref={containerRef}>
      <button
        type="button"
        className={open ? 'rhythm-trigger is-open' : 'rhythm-trigger'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {meter} · {patternName(rhythm, beatsPerBar)}
        </span>
        <span className="rhythm-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="rhythm-panel">
          <label className="field field--inline">
            <span>Takt</span>
            <select
              aria-label="Taktart"
              value={beatsPerBar}
              onChange={(event) => onBeatsPerBarChange(Number(event.target.value))}
            >
              {METERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <RhythmEditor rhythm={rhythm} beatsPerBar={beatsPerBar} onChange={onRhythmChange} />
        </div>
      ) : null}
    </div>
  );
}
