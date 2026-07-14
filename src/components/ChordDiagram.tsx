import type { Chord, Voicing } from '../theory';
import './ChordDiagram.css';

interface ChordDiagramProps {
  chord: Chord;
  voicing: Voicing;
  /** Defaults to the shape name; override to spell out the position too. */
  caption?: string;
}

// A five-fret window, strings drawn vertically as on a classic chord chart.
const STRING_GAP = 17;
const FRET_GAP = 19;
const ROWS = 5;
const LEFT = 20;
const TOP = 26;
const WIDTH = LEFT * 2 + STRING_GAP * 5;
const HEIGHT = TOP + FRET_GAP * ROWS + 12;

/**
 * The strings the index finger barres: those stopped at the very fret the shape
 * sits on. Drawing them as one bar rather than six dots is what a barre actually
 * is — one finger laid flat — and it makes the grip readable at a glance.
 *
 * An open shape (baseFret 0) has no barre: those are open strings, not stopped.
 */
function barredStrings(voicing: Voicing): { from: number; to: number } | null {
  if (voicing.baseFret === 0) return null;

  const stopped = voicing.frets
    .map((fret, stringIndex) => (fret === voicing.baseFret ? stringIndex : -1))
    .filter((stringIndex) => stringIndex >= 0);

  if (stopped.length < 2) return null;
  return { from: Math.min(...stopped), to: Math.max(...stopped) };
}

export function ChordDiagram({ chord, voicing, caption }: ChordDiagramProps) {
  // An open chord shows frets 1..5 behind the nut; a barre starts at its base fret.
  const firstFret = voicing.baseFret === 0 ? 1 : voicing.baseFret;
  const isOpen = voicing.baseFret === 0;
  const barre = barredStrings(voicing);

  const stringX = (stringIndex: number) => LEFT + stringIndex * STRING_GAP;
  const fretY = (row: number) => TOP + row * FRET_GAP;
  /** Dots sit in the middle of a fret space, not on the wire. */
  const dotY = (row: number) => fretY(row) - FRET_GAP / 2;

  return (
    <figure className="chord-diagram">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${chord.name()}, ${caption ?? voicing.shapeName}`}
      >
        {/* Muted and open string markers, above the nut. */}
        {voicing.frets.map((fret, stringIndex) => {
          if (fret > 0) return null;
          return (
            <text
              key={stringIndex}
              className={fret < 0 ? 'marker marker--muted' : 'marker'}
              x={stringX(stringIndex)}
              y={TOP - 7}
              textAnchor="middle"
            >
              {fret < 0 ? '×' : '○'}
            </text>
          );
        })}

        {/* The board — same dark wood as the big neck, so both read as one instrument. */}
        <rect
          className="board"
          x={LEFT - 7}
          y={TOP}
          width={STRING_GAP * 5 + 14}
          height={FRET_GAP * ROWS}
          rx={3}
        />

        {/* Nut, or the fret number when the shape sits up the neck. */}
        {isOpen ? (
          <line className="nut" x1={LEFT - 7} y1={TOP} x2={stringX(5) + 7} y2={TOP} />
        ) : (
          <text className="base-fret" x={LEFT - 11} y={dotY(1)} textAnchor="end">
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

        {/* The barre: one finger across. */}
        {barre ? (
          <line
            className="barre"
            x1={stringX(barre.from)}
            y1={dotY(1)}
            x2={stringX(barre.to)}
            y2={dotY(1)}
          />
        ) : null}

        {/* The remaining fingers. */}
        {voicing.frets.map((fret, stringIndex) => {
          if (fret <= 0) return null;
          // Already drawn as part of the bar.
          if (barre && fret === voicing.baseFret) return null;

          const row = fret - firstFret + 1;
          if (row < 1 || row > ROWS) return null;

          return (
            <circle
              key={stringIndex}
              className="finger"
              cx={stringX(stringIndex)}
              cy={dotY(row)}
              r={6}
            />
          );
        })}
      </svg>
      <figcaption>{caption ?? voicing.shapeName}</figcaption>
    </figure>
  );
}
