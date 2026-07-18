import type { Progression, ProgressionStep, Voicing } from '../theory';
import { customProgId, type CustomStep, MAX_BPM, MIN_BPM } from '../urlState';
import { ProgressionBuilder } from './ProgressionBuilder';
import { ProgressionChord } from './ProgressionChord';
import { RhythmControls } from './RhythmControls';

interface ProgressionPanelProps {
  /** The presets that fit this key, plus "Eigene Folge". */
  progressions: readonly Progression[];
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
  onBeatsPerBarChange: (beatsPerBar: number) => void;
  onRhythmChange: (rhythm: string) => void;
}

/**
 * The progression: which one, how it is built, how it is played. The seven
 * diatonic chords are NOT repeated here — they sit above as cards, each with a "+"
 * that appends to the sequence.
 */
export function ProgressionPanel({
  progressions,
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
  onBeatsPerBarChange,
  onRhythmChange,
}: ProgressionPanelProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Akkordfolge</h2>
        <select
          className="select"
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
              {p.name}
            </option>
          ))}
          <option value="custom">Eigene Folge</option>
        </select>
      </div>

      {isCustom ? (
        <ProgressionBuilder
          steps={customChordSteps ?? []}
          onChange={(next) => onProgressionIdChange(customProgId(next))}
        />
      ) : preset?.hint ? (
        <p className="hint">{preset.hint}</p>
      ) : null}

      <div className="transport">
        <button
          type="button"
          className={isPlaying ? 'play-button is-playing' : 'play-button'}
          onClick={onToggleTransport}
          aria-label={isPlaying ? 'Akkordfolge stoppen' : 'Akkordfolge abspielen'}
        >
          {isPlaying ? '■' : '▶'}
        </button>

        <label className="tempo">
          <span>
            Tempo <output>{bpm}</output> BPM
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

        <label className="toggle">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => onLoopChange(e.target.checked)}
          />
          <span>Wiederholen</span>
        </label>

        <RhythmControls
          beatsPerBar={beatsPerBar}
          rhythm={rhythm}
          onBeatsPerBarChange={onBeatsPerBarChange}
          onRhythmChange={onRhythmChange}
        />
      </div>

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
    </section>
  );
}
