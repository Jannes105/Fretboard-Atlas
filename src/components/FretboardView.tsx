import type { Chord, Fretboard, Scale, ScalePosition } from '../theory';
import './FretboardView.css';

/** Show the note name on each dot, or its scale degree. */
export type LabelMode = 'note' | 'degree';

interface FretboardViewProps {
  scale: Scale;
  fretboard: Fretboard;
  labelMode: LabelMode;
  /** Restrict to one box: notes outside its fret window fade into the background. */
  position?: ScalePosition | null;
  /** Pick out the tones of one chord, to show where it sits inside the scale. */
  chord?: Chord | null;
}

// Geometry. Frets are evenly spaced — this is a scale map, not a photo of a neck.
const LABEL_X = 14; // open-string name, far left
const OPEN_OFFSET = 30; // how far left of the nut (or capo) the open-string dots sit
const NUT_X = 70;
const FRET_WIDTH = 56;
const STRING_GAP = 34;
const TOP_Y = 40;
const DOT_RADIUS = 12;
const ROOT_RADIUS = 15;
/**
 * Vertical offset of the two dots on octave frets. A whole STRING_GAP would put
 * them right on a string, where the note dots hide them — 0.85 lands between.
 */
const DOUBLE_INLAY_OFFSET = STRING_GAP * 0.85;

/** Y of a string. String 0 is the low E and sits at the bottom, as on a chart. */
function stringY(stringIndex: number, stringCount: number): number {
  return TOP_Y + (stringCount - 1 - stringIndex) * STRING_GAP;
}

export function FretboardView({
  scale,
  fretboard,
  labelMode,
  position = null,
  chord = null,
}: FretboardViewProps) {
  const { fretCount, stringCount, capo, tuning } = fretboard;

  const positions = fretboard.mapScale(scale);
  const inlays = fretboard.inlayFrets();
  const labels = tuning.stringLabels;

  const chordPitchClasses = chord ? new Set(chord.pitchClasses) : null;

  /** Inside the selected box — or everywhere, when no box is selected. */
  const inBox = (fret: number) =>
    position === null || (fret >= position.startFret && fret <= position.endFret);

  const boardBottom = stringY(0, stringCount);
  const width = NUT_X + fretCount * FRET_WIDTH + 20;
  const height = boardBottom + 60;
  const inlayY = (TOP_Y + boardBottom) / 2;

  // The capo acts as a movable nut: notes at the capo fret are the new open
  // strings, so they get drawn in the open column just left of the bar.
  const capoX = NUT_X + capo * FRET_WIDTH;
  const openX = capoX - OPEN_OFFSET;

  /** Middle of a fret space — where inlays and fret numbers physically belong. */
  const fretCenterX = (fret: number) => NUT_X + (fret - 0.5) * FRET_WIDTH;

  /** Where a note dot goes. The lowest playable fret is drawn as an open string. */
  const noteX = (fret: number) => (fret === capo ? openX : fretCenterX(fret));

  const numberX = (fret: number) => (fret === 0 ? NUT_X - OPEN_OFFSET : fretCenterX(fret));

  return (
    <div className="fretboard-scroll">
      <svg
        className="fretboard"
        viewBox={`0 0 ${width} ${height}`}
        // Tie the minimum width to the fret count instead of pinning it at one
        // value: a 12-fret neck then fits a phone, where a 24-fret one cannot.
        style={{ minWidth: `${(fretCount + 2) * 42}px` }}
        role="img"
        aria-label={`Griffbrett: ${scale.name()}`}
      >
        {/* Inlay dots sit under the strings. */}
        {inlays.map(({ fret, double }) =>
          double ? (
            <g key={fret}>
              <circle
                className="inlay"
                cx={fretCenterX(fret)}
                cy={inlayY - DOUBLE_INLAY_OFFSET}
                r={5}
              />
              <circle
                className="inlay"
                cx={fretCenterX(fret)}
                cy={inlayY + DOUBLE_INLAY_OFFSET}
                r={5}
              />
            </g>
          ) : (
            <circle key={fret} className="inlay" cx={fretCenterX(fret)} cy={inlayY} r={5} />
          ),
        )}

        {/* Fret wires. */}
        {Array.from({ length: fretCount }, (_, i) => i + 1).map((fret) => (
          <line
            key={fret}
            className="fret-wire"
            x1={NUT_X + fret * FRET_WIDTH}
            y1={TOP_Y}
            x2={NUT_X + fret * FRET_WIDTH}
            y2={boardBottom}
          />
        ))}

        {/* The nut. */}
        <line className="nut" x1={NUT_X} y1={TOP_Y} x2={NUT_X} y2={boardBottom} />

        {/* Strings — the low ones are drawn thicker. */}
        {Array.from({ length: stringCount }, (_, stringIndex) => (
          <g key={stringIndex}>
            <line
              className="string"
              x1={NUT_X}
              y1={stringY(stringIndex, stringCount)}
              x2={width - 20}
              y2={stringY(stringIndex, stringCount)}
              strokeWidth={3.2 - stringIndex * 0.35}
            />
            <text
              className="string-label"
              x={LABEL_X}
              y={stringY(stringIndex, stringCount)}
              dominantBaseline="central"
            >
              {labels[stringIndex]}
            </text>
          </g>
        ))}

        {/* Everything behind the capo is out of reach. */}
        {capo > 0 ? (
          <>
            <rect
              className="capo-dead-zone"
              x={NUT_X}
              y={TOP_Y - 4}
              width={capoX - NUT_X}
              height={boardBottom - TOP_Y + 8}
            />
            <line className="capo" x1={capoX} y1={TOP_Y - 6} x2={capoX} y2={boardBottom + 6} />
            <text className="capo-label" x={capoX} y={TOP_Y - 14} textAnchor="middle">
              Kapo {capo}
            </text>
          </>
        ) : null}

        {/* Outline of the selected box, so it reads as one hand shape. */}
        {position ? (
          <rect
            className="box-outline"
            x={NUT_X + (position.startFret - 1) * FRET_WIDTH}
            y={TOP_Y - 12}
            width={(position.endFret - position.startFret + 1) * FRET_WIDTH}
            height={boardBottom - TOP_Y + 24}
            rx={8}
          />
        ) : null}

        {/* Fret numbers. */}
        {Array.from({ length: fretCount + 1 }, (_, fret) => fret).map((fret) => (
          <text
            key={fret}
            className={fret < capo ? 'fret-number is-muted' : 'fret-number'}
            x={numberX(fret)}
            y={boardBottom + 32}
            textAnchor="middle"
          >
            {fret}
          </text>
        ))}

        {/* Scale notes. The root gets its own colour and a larger dot. */}
        {positions.map((note) => {
          const cx = noteX(note.fret);
          const cy = stringY(note.stringIndex, stringCount);
          const label = labelMode === 'note' ? note.note.name() : note.degree;

          const faded = !inBox(note.fret);
          const isChordTone = chordPitchClasses?.has(note.pitchClass) ?? false;
          // A chord tone outside the box stays faded — the box is the stronger filter.
          const dimmed = faded || (chordPitchClasses !== null && !isChordTone);

          const classes = [
            'note-dot',
            note.isRoot ? 'note-dot--root' : '',
            isChordTone && !faded ? 'note-dot--chord' : '',
            dimmed ? 'is-dimmed' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <g key={`${note.stringIndex}-${note.fret}`}>
              <circle
                className={classes}
                cx={cx}
                cy={cy}
                r={note.isRoot ? ROOT_RADIUS : DOT_RADIUS}
              />
              <text
                className={[
                  'note-label',
                  note.isRoot ? 'note-label--root' : '',
                  dimmed ? 'is-dimmed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
