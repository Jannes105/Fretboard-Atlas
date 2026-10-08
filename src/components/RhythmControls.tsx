import { usePopover } from '../hooks/usePopover';
import {
  defaultPattern,
  type NoteLength,
  PATTERN_PRESETS,
  serializePattern,
  SLOTS_PER_BEAT,
  type StrumSlot,
  type StrumStyle,
  type SwingFeel,
} from '../theory';
import { RhythmEditor } from './RhythmEditor';
import './RhythmControls.css';

/** Everything one rhythm style sets at once. */
export interface RhythmStyleSettings {
  rhythm: string;
  strum: StrumStyle;
  feel: SwingFeel;
  sustain: NoteLength;
}

interface RhythmControlsProps {
  beatsPerBar: number;
  rhythm: string;
  strum: StrumStyle;
  feel: SwingFeel;
  sustain: NoteLength;
  onBeatsPerBarChange: (beatsPerBar: number) => void;
  onRhythmChange: (rhythm: string) => void;
  onStrumChange: (strum: StrumStyle) => void;
  onFeelChange: (feel: SwingFeel) => void;
  onSustainChange: (sustain: NoteLength) => void;
  /** Apply a style — pattern, strum, feel and note length as one change. */
  onApplyStyle: (settings: RhythmStyleSettings) => void;
}

/**
 * How the hand crosses the strings.
 *
 * This replaced three speeds — 36, 72 and 156 ms across six strings. Measured they
 * were three shades of one gesture, and the first two were not tellable apart. Strum
 * against arpeggio is a musical difference instead of a slider.
 */
const STRUMS: readonly { value: StrumStyle; label: string }[] = [
  { value: 'standard', label: 'schlagen' },
  { value: 'arpeggio', label: 'zupfen (Arpeggio)' },
];

/** How long a note lasts: whether the strumming hand lets go. */
const LENGTHS: readonly { value: NoteLength; label: string }[] = [
  { value: 'ring', label: 'klingen lassen' },
  { value: 'stopped', label: 'abstoppen' },
];

/** Where the offbeat sits: straight or shuffled. */
const FEELS: readonly { value: SwingFeel; label: string }[] = [
  { value: 'straight', label: 'gerade' },
  { value: 'shuffle', label: 'Shuffle (swingend)' },
];

const METERS: readonly { value: number; label: string }[] = [
  { value: 4, label: '4/4' },
  { value: 3, label: '3/4' },
  { value: 6, label: '6/8' },
  { value: 2, label: '2/4' },
];

const eighths = (beatsPerBar: number, slot: (i: number) => StrumSlot) =>
  Array.from({ length: beatsPerBar * SLOTS_PER_BEAT }, (_, i) => slot(i));

/**
 * The classic campfire strum, down — down-up — up-down-up, which only exists in
 * four. Any other meter gets plain alternating eighths, which is what that strum
 * reduces to when there is no bar of four to shape it.
 */
function popPattern(beatsPerBar: number): StrumSlot[] {
  if (beatsPerBar === 4) return ['down', null, 'down', 'up', null, 'up', 'down', 'up'];
  return eighths(beatsPerBar, (i) => (i % SLOTS_PER_BEAT === 0 ? 'down' : 'up'));
}

/**
 * Named grooves, so the first choice is a word a player already knows instead of
 * four settings and a grid. Every one is a complete setting; the controls further
 * down stay for anyone who wants to build their own.
 */
const STYLES: readonly {
  id: string;
  label: string;
  build: (beatsPerBar: number) => RhythmStyleSettings;
}[] = [
  {
    id: 'pop',
    label: 'Pop-Strum',
    build: (b) => ({ rhythm: serializePattern(popPattern(b)), strum: 'standard', feel: 'straight', sustain: 'ring' }),
  },
  {
    id: 'ballad',
    label: 'Ballade (gezupft)',
    build: (b) => ({ rhythm: serializePattern(defaultPattern(b)), strum: 'arpeggio', feel: 'straight', sustain: 'ring' }),
  },
  {
    id: 'shuffle',
    label: 'Blues-Shuffle',
    build: (b) => ({
      rhythm: serializePattern(eighths(b, (i) => (i % SLOTS_PER_BEAT === 0 ? 'down' : 'up'))),
      strum: 'standard',
      feel: 'shuffle',
      sustain: 'ring',
    }),
  },
  {
    id: 'rock',
    label: 'Rock (Achtel, gedämpft)',
    build: (b) => ({ rhythm: serializePattern(eighths(b, () => 'down')), strum: 'standard', feel: 'straight', sustain: 'stopped' }),
  },
  {
    id: 'simple',
    label: 'Einfach (Viertel)',
    build: (b) => ({ rhythm: serializePattern(defaultPattern(b)), strum: 'standard', feel: 'straight', sustain: 'ring' }),
  },
];

function matchingStyle(current: RhythmStyleSettings, beatsPerBar: number) {
  return (
    STYLES.find((style) => {
      const s = style.build(beatsPerBar);
      return (
        s.strum === current.strum &&
        s.feel === current.feel &&
        s.sustain === current.sustain &&
        // An arpeggio has no pattern, so the grid does not decide whether it matches.
        (s.strum === 'arpeggio' || s.rhythm === current.rhythm)
      );
    }) ?? null
  );
}

/** The preset a pattern matches, so the trigger can name it instead of showing d/u/-. */
function patternName(rhythm: string, beatsPerBar: number): string {
  const preset = PATTERN_PRESETS.find(
    (candidate) => serializePattern(candidate.build(beatsPerBar)) === rhythm,
  );
  return preset ? preset.name : 'Eigenes Muster';
}

/**
 * Time signature and strum pattern: set once, then left alone — so they sit behind
 * one trigger instead of taking two permanent rows next to the transport.
 *
 * The first thing inside is a row of named grooves. The four separate settings
 * under them used to be the only way in, labelled in studio words („Feel",
 * „Spielweise", „Ton") — fine for whoever knows them, a wall for everyone else.
 */
export function RhythmControls({
  beatsPerBar,
  rhythm,
  strum,
  feel,
  sustain,
  onBeatsPerBarChange,
  onRhythmChange,
  onStrumChange,
  onFeelChange,
  onSustainChange,
  onApplyStyle,
}: RhythmControlsProps) {
  const { open, toggle, containerRef } = usePopover();

  const meter = METERS.find((entry) => entry.value === beatsPerBar)?.label ?? `${beatsPerBar}/4`;
  const style = matchingStyle({ rhythm, strum, feel, sustain }, beatsPerBar);

  const value =
    style?.label ??
    `${strum === 'arpeggio' ? 'Arpeggio' : patternName(rhythm, beatsPerBar)}${
      strum !== 'arpeggio' && feel === 'shuffle' ? ' · Shuffle' : ''
    }`;

  return (
    <div className="rhythm-controls" ref={containerRef}>
      <button
        type="button"
        className={open ? 'trigger rhythm-trigger is-open' : 'trigger rhythm-trigger'}
        aria-expanded={open}
        onClick={toggle}
      >
        {/* Two strokes, down and up — the same language the pattern grid speaks. */}
        <svg className="trigger-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M5 2v10M2.6 9.6 5 12.4l2.4-2.8M11 14V4M8.6 6.4 11 3.6l2.4 2.8" />
        </svg>
        Rhythmus
        <span className="trigger-value">
          {meter} · {value}
        </span>
        <span className="trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="popover rhythm-panel">
          <div className="preset-grid" role="group" aria-label="Rhythmus-Stil">
            {STYLES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="preset-button"
                aria-pressed={style?.id === entry.id}
                onClick={() => onApplyStyle(entry.build(beatsPerBar))}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <details className="fine-tuning">
            <summary>Selbst einstellen</summary>

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
              <span>Anschlag</span>
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

            {/* An arpeggio has no slots to shift, so the control would do nothing. */}
            {strum === 'arpeggio' ? null : (
              <label className="field field--inline">
                <span>Groove</span>
                <select
                  aria-label="Feel"
                  value={feel}
                  onChange={(event) => onFeelChange(event.target.value as SwingFeel)}
                >
                  {FEELS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field field--inline">
              <span>Töne</span>
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
          </details>
        </div>
      ) : null}
    </div>
  );
}
