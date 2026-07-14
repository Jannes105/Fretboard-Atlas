import type { Chord, Voicing } from '../theory';
import './ChordDiagram.css';

interface ChordDiagramProps {
  chord: Chord;
  voicing: Voicing;
  /** Defaults to the shape name; override to spell out the position too. */
  caption?: string;
}

// A five-fret window, strings drawn vertically as on a classic chord chart.
const STRING_GAP = 14;
const FRET_GAP = 16;
const ROWS = 5;
const LEFT = 16;
const TOP = 22;
const WIDTH = LEFT * 2 + STRING_GAP * 5;
const HEIGHT = TOP + FRET_GAP * ROWS + 10;

export function ChordDiagram({ chord, voicing, caption }: ChordDiagramProps) {
  // An open chord shows frets 1..5 behind the nut; a barre starts at its base fret.
  const firstFret = voicing.baseFret === 0 ? 1 : voicing.baseFret;
  const isOpen = voicing.baseFret === 0;

  const stringX = (stringIndex: number) => LEFT + stringIndex * STRING_GAP;
  const fretY = (row: number) => TOP + row * FRET_GAP;

  return (
    <figure className="chord-diagram">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${chord.name()}, ${voicing.shapeName}`}>
        {/* Muted and open string markers, above the nut. */}
        {voicing.frets.map((fret, stringIndex) => {
          if (fret > 0) return null;
          return (
            <text
              key={stringIndex}
              className="marker"
              x={stringX(stringIndex)}
              y={TOP - 6}
              textAnchor="middle"
            >
              {fret < 0 ? '×' : '○'}
            </text>
          );
        })}

        {/* Nut, or the fret number when the shape sits up the neck. */}
        {isOpen ? (
          <line className="nut" x1={LEFT} y1={TOP} x2={stringX(5)} y2={TOP} />
        ) : (
          <text className="base-fret" x={LEFT - 7} y={fretY(1) - 4} textAnchor="end">
            {voicing.baseFret}
          </text>
        )}

        {Array.from({ length: ROWS + 1 }, (_, row) => (
          <line
            key={row}
            className="fret"
            x1={LEFT}
            y1={fretY(row)}
            x2={stringX(5)}
            y2={fretY(row)}
          />
        ))}

        {Array.from({ length: 6 }, (_, stringIndex) => (
          <line
            key={stringIndex}
            className="string"
            x1={stringX(stringIndex)}
            y1={TOP}
            x2={stringX(stringIndex)}
            y2={fretY(ROWS)}
          />
        ))}

        {/* Finger dots. */}
        {voicing.frets.map((fret, stringIndex) => {
          if (fret <= 0) return null;
          const row = fret - firstFret + 1;
          if (row < 1 || row > ROWS) return null;

          return (
            <circle
              key={stringIndex}
              className="finger"
              cx={stringX(stringIndex)}
              cy={fretY(row) - FRET_GAP / 2}
              r={5}
            />
          );
        })}
      </svg>
      <figcaption>{caption ?? voicing.shapeName}</figcaption>
    </figure>
  );
}
