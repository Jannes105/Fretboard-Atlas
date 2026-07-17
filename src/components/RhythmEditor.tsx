import {
  parsePattern,
  PATTERN_PRESETS,
  serializePattern,
  SLOTS_PER_BEAT,
  type StrumSlot,
} from '../theory';
import './RhythmEditor.css';

interface RhythmEditorProps {
  /** The pattern as a d/u/- string. */
  rhythm: string;
  beatsPerBar: number;
  onChange: (rhythm: string) => void;
}

const GLYPH: Record<'down' | 'up', string> = { down: '↓', up: '↑' };
const LABEL: Record<string, string> = { down: 'Abschlag', up: 'Aufschlag', rest: 'Pause' };

/** Click a slot to cycle it: rest → down → up → rest. */
function cycle(slot: StrumSlot): StrumSlot {
  return slot === null ? 'down' : slot === 'down' ? 'up' : null;
}

/**
 * The strum pattern for one bar, on an eighth-note grid. Each cell is a downstroke,
 * an upstroke or a rest; clicking cycles through them. This is the "individuell"
 * in the rhythm — the presets are just quick starts.
 */
export function RhythmEditor({ rhythm, beatsPerBar, onChange }: RhythmEditorProps) {
  const pattern = parsePattern(rhythm, beatsPerBar);

  const setSlot = (index: number, slot: StrumSlot) => {
    const next = pattern.map((current, i) => (i === index ? slot : current));
    onChange(serializePattern(next));
  };

  return (
    <div className="rhythm">
      <div className="rhythm-grid" role="group" aria-label="Schlagmuster">
        {pattern.map((slot, i) => {
          const kind = slot ?? 'rest';
          return (
            <button
              key={i}
              type="button"
              // The downbeat of each beat starts a new group.
              className={[
                'rhythm-cell',
                `is-${kind}`,
                i % SLOTS_PER_BEAT === 0 ? 'is-beat' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`Slot ${i + 1}: ${LABEL[kind]}`}
              onClick={() => setSlot(i, cycle(slot))}
            >
              {slot === null ? '·' : GLYPH[slot]}
            </button>
          );
        })}
      </div>

      <div className="rhythm-presets">
        {PATTERN_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="rhythm-preset"
            onClick={() => onChange(serializePattern(preset.build(beatsPerBar)))}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}
