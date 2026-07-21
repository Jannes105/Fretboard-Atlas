import { useEffect, useRef, useState } from 'react';
import {
  type NoteLength,
  PATTERN_PRESETS,
  serializePattern,
  type StrumStyle,
} from '../theory';
import { RhythmEditor } from './RhythmEditor';
import './RhythmControls.css';

interface RhythmControlsProps {
  beatsPerBar: number;
  rhythm: string;
  strum: StrumStyle;
  sustain: NoteLength;
  onBeatsPerBarChange: (beatsPerBar: number) => void;
  onRhythmChange: (rhythm: string) => void;
  onStrumChange: (strum: StrumStyle) => void;
  onSustainChange: (sustain: NoteLength) => void;
}

/**
 * How the hand crosses the strings.
 *
 * This replaced three speeds — 36, 72 and 156 ms across six strings. Measured they
 * were three shades of one gesture, and the first two were not tellable apart. Strum
 * against arpeggio is a musical difference instead of a slider.
 */
const STRUMS: readonly { value: StrumStyle; label: string }[] = [
  { value: 'standard', label: 'Anschlag' },
  { value: 'arpeggio', label: 'Arpeggio' },
];

/**
 * How long a note lasts. Sits directly under the playing style because the two are
 * one decision about the strumming hand: what it does, and whether it lets go.
 */
const LENGTHS: readonly { value: NoteLength; label: string }[] = [
  { value: 'ring', label: 'ausklingen' },
  { value: 'stopped', label: 'abgestoppt' },
];

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
 * one trigger instead of taking two permanent rows next to the transport. Same
 * idiom as the setup panel, down to the name in front of the value: "4/4 · Viertel"
 * alone never suggested a strum pattern editor was behind it.
 *
 * The click track used to live in here and no longer does. It is not set-and-forget
 * — you reach for the metronome mid-practice — and nobody goes hunting for it
 * behind a time signature. It sits in the transport row now, with tempo and loop.
 */
export function RhythmControls({
  beatsPerBar,
  rhythm,
  strum,
  sustain,
  onBeatsPerBarChange,
  onRhythmChange,
  onStrumChange,
  onSustainChange,
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
        className={open ? 'trigger rhythm-trigger is-open' : 'trigger rhythm-trigger'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {/* Two strokes, down and up — the same language the pattern grid speaks. */}
        <svg className="trigger-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M5 2v10M2.6 9.6 5 12.4l2.4-2.8M11 14V4M8.6 6.4 11 3.6l2.4 2.8" />
        </svg>
        Rhythmus
        {/* Naming the pattern would be a lie under an arpeggio, which has none. */}
        <span className="trigger-value">
          {meter} · {strum === 'arpeggio' ? 'Arpeggio' : patternName(rhythm, beatsPerBar)}
        </span>
        <span className="trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="popover rhythm-panel">
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

          <label className="field field--inline">
            <span>Spielweise</span>
            <select
              aria-label="Spielweise"
              value={strum}
              onChange={(event) => onStrumChange(event.target.value as StrumStyle)}
            >
              {STRUMS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--inline">
            <span>Ton</span>
            <select
              aria-label="Tonlänge"
              value={sustain}
              onChange={(event) => onSustainChange(event.target.value as NoteLength)}
            >
              {LENGTHS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          {strum === 'arpeggio' ? (
            // The pattern grid is meaningless here — an arpeggio spread across the
            // whole bar IS the pattern. Saying so beats leaving a dead control.
            <p className="hint">Die Töne verteilen sich über den ganzen Takt — ohne Schlagmuster.</p>
          ) : (
            <RhythmEditor rhythm={rhythm} beatsPerBar={beatsPerBar} onChange={onRhythmChange} />
          )}
        </div>
      ) : null}
    </div>
  );
}
