import type {
  ClickMode,
  NoteLength,
  Progression,
  ProgressionStep,
  StrumStyle,
  SwingFeel,
  Voicing,
} from '../theory';
import { customProgId, type CustomStep, type GripPreference, MAX_BPM, MIN_BPM } from '../urlState';
import { ProgressionBuilder } from './ProgressionBuilder';
import { ProgressionChord } from './ProgressionChord';
import { RhythmControls, type RhythmStyleSettings } from './RhythmControls';
import './ProgressionPanel.css';

/**
 * The click track. 'Einzähler' counts you in and then leaves you to the guitar;
 * 'Metronom' keeps going. Both count in, because a click that starts on the same
 * beat as the music gives you nothing to come in on.
 */
const CLICKS: readonly { value: ClickMode; label: string }[] = [
  { value: 'off', label: 'aus' },
  { value: 'countIn', label: 'Einzähler' },
  { value: 'metronome', label: 'Metronom' },
];

interface ProgressionPanelProps {
  /** The presets that fit this key, plus "Eigene Folge". */
  progressions: readonly Progression[];
  /**
   * What each preset spells out in this key — "Am – F – C – G". Roman numerals are
   * the theory behind a progression; the chord names are what a player recognises.
   */
  presetChords: ReadonlyMap<string, string>;
  preset: Progression | null;
  isCustom: boolean;
  customChordSteps: CustomStep[] | null;
  onProgressionIdChange: (progressionId: string) => void;

  steps: readonly ProgressionStep[];
  stepVoicings: readonly (readonly Voicing[])[];
  voicingIndex: (step: number) => number;
  onSelectVoicing: (step: number, voicing: number) => void;
  openPicker: number | null;
  onTogglePicker: (step: number) => void;
  onHearVoicing: (voicing: Voicing) => void;

  isPlaying: boolean;
  playingStep: number | null;
  onToggleTransport: () => void;

  bpm: number;
  onBpmChange: (bpm: number) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  beatsPerBar: number;
  rhythm: string;
  strum: StrumStyle;
  feel: SwingFeel;
  sustain: NoteLength;
  click: ClickMode;
  onBeatsPerBarChange: (beatsPerBar: number) => void;
  onRhythmChange: (rhythm: string) => void;
  onStrumChange: (strum: StrumStyle) => void;
  onFeelChange: (feel: SwingFeel) => void;
  onSustainChange: (sustain: NoteLength) => void;
  onClickChange: (click: ClickMode) => void;
  onApplyStyle: (settings: RhythmStyleSettings) => void;

  grips: GripPreference;
  onGripsChange: (grips: GripPreference) => void;
  /** Move the key — and the progression with it — by a semitone. */
  onTranspose: (semitones: 1 | -1) => void;
}

/** The grip rule, said in a few words for the folded options. */
const GRIP_LABELS: Record<GripPreference, string> = {
  open: 'Offene Griffe zuerst',
  near: 'Kürzeste Wege',
};

/**
 * The progression sheet, in the order you use it: play it, pick which one, see
 * its grips — and, folded away, what you set once and leave.
 *
 * It used to be one long run of eight rows — template, description, a box of
 * transport controls, an unlabelled grip switch, a „Tonart" that meant
 * transposing, grips two to a row that took two screens, the rhythm last.
 * Now the transport is on top, the grips sit four to a row so the whole
 * progression fits on screen, and everything set once lives under „Optionen".
 */
export function ProgressionPanel({
  progressions,
  presetChords,
  preset,
  isCustom,
  customChordSteps,
  onProgressionIdChange,
  steps,
  stepVoicings,
  voicingIndex,
  onSelectVoicing,
  openPicker,
  onTogglePicker,
  onHearVoicing,
  isPlaying,
  playingStep,
  onToggleTransport,
  bpm,
  onBpmChange,
  loop,
  onLoopChange,
  beatsPerBar,
  rhythm,
  strum,
  feel,
  sustain,
  click,
  onBeatsPerBarChange,
  onRhythmChange,
  onStrumChange,
  onFeelChange,
  onSustainChange,
  onClickChange,
  onApplyStyle,
  grips,
  onGripsChange,
  onTranspose,
}: ProgressionPanelProps) {
  const clickLabel = CLICKS.find((entry) => entry.value === click)?.label ?? '';

  return (
    <section className="progression-panel" aria-label="Akkordfolge">
      <div className="transport">
        <button
          type="button"
          className={isPlaying ? 'play-button is-playing' : 'play-button'}
          onClick={onToggleTransport}
          aria-label={isPlaying ? 'Akkordfolge stoppen' : 'Akkordfolge abspielen'}
          // The scale has a ▶ too. On hover the two say which is which.
          title={isPlaying ? 'Akkordfolge stoppen' : 'Akkordfolge abspielen'}
        >
          {isPlaying ? '■' : '▶'}
        </button>

        <label className="tempo">
          <span className="tempo-head">
            <span>Tempo</span>
            <span>
              <output>{bpm}</output> BPM
            </span>
          </span>
          {/* Single BPM steps: pushing a passage up by two is how tempo practice
              actually works. Arrow keys nudge exactly one. */}
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            value={bpm}
            onChange={(e) => onBpmChange(Number(e.target.value))}
          />
        </label>

        <button
          type="button"
          className="loop-toggle"
          aria-pressed={loop}
          aria-label="Wiederholen"
          title="Wiederholen"
          onClick={() => onLoopChange(!loop)}
        >
          ⟳
        </button>
      </div>

      <label className="sheet-field">
        <span className="sheet-label">Vorlage</span>
        <select
          className="select preset-select"
          aria-label="Vorlage"
          value={isCustom ? 'custom' : (preset?.id ?? '')}
          onChange={(e) =>
            onProgressionIdChange(
              e.target.value === 'custom'
                ? // Seed the builder with what is on screen (one bar each), so it
                  // is never blank.
                  customProgId(steps.map((s) => ({ symbol: s.chord.name(), bars: 1 })))
                : e.target.value,
            )
          }
        >
          {progressions.map((p) => (
            <option key={p.id} value={p.id}>
              {presetChords.get(p.id) ?? p.name}
            </option>
          ))}
          <option value="custom">Eigene Folge</option>
        </select>
      </label>

      {isCustom ? (
        <ProgressionBuilder
          steps={customChordSteps ?? []}
          onChange={(next) => onProgressionIdChange(customProgId(next))}
        />
      ) : preset ? (
        <p className="hint preset-hint">
          <span className="roman-hint">{preset.name}</span>
          {preset.hint ? ` · ${preset.hint}` : null}
        </p>
      ) : null}

      <ol className="progression">
        {steps.map((step, i) => (
          <ProgressionChord
            key={`${step.chord.name()}#${i}`}
            step={step}
            voicings={stepVoicings[i] ?? []}
            selected={voicingIndex(i)}
            onSelect={(index) => onSelectVoicing(i, index)}
            isOpen={openPicker === i}
            onToggle={() => onTogglePicker(i)}
            onHear={onHearVoicing}
            isPlaying={playingStep === i}
          />
        ))}
      </ol>

      {/* Set once and left alone: folded, with what it is set to on the fold. */}
      <details className="sheet-fold progression-options">
        <summary>
          <h3>Optionen</h3>
          <span className="sheet-fold-value">
            {GRIP_LABELS[grips]} · Klick {clickLabel}
          </span>
        </summary>

        <div className="option-rows">
          <div className="option-row option-row--stacked">
            <span className="option-label">Griffe</span>
            <div className="segmented" role="group" aria-label="Griffe">
              <button type="button" aria-pressed={grips === 'open'} onClick={() => onGripsChange('open')}>
                {GRIP_LABELS.open}
              </button>
              <button type="button" aria-pressed={grips === 'near'} onClick={() => onGripsChange('near')}>
                {GRIP_LABELS.near}
              </button>
            </div>
          </div>

          <div className="option-row option-row--stacked">
            <span className="option-label">Klick</span>
            <div className="segmented" role="group" aria-label="Klick">
              {CLICKS.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  aria-pressed={click === entry.value}
                  onClick={() => onClickChange(entry.value)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <div className="option-row">
            <span className="option-label">Transponieren</span>
            <div className="transpose" role="group" aria-label="Transponieren">
              <button type="button" onClick={() => onTranspose(-1)} aria-label="Einen Halbton tiefer">
                −½
              </button>
              <button type="button" onClick={() => onTranspose(1)} aria-label="Einen Halbton höher">
                +½
              </button>
            </div>
          </div>

          <RhythmControls
            beatsPerBar={beatsPerBar}
            rhythm={rhythm}
            strum={strum}
            feel={feel}
            sustain={sustain}
            onBeatsPerBarChange={onBeatsPerBarChange}
            onRhythmChange={onRhythmChange}
            onStrumChange={onStrumChange}
            onFeelChange={onFeelChange}
            onSustainChange={onSustainChange}
            onApplyStyle={onApplyStyle}
          />
        </div>
      </details>
    </section>
  );
}
