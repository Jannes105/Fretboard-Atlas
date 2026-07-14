import type { Fretboard, Scale, ScalePosition } from '../theory';
import './FretboardView.css';

/** Show the note name on each dot, or its scale degree. */
export type LabelMode = 'note' | 'degree';

interface FretboardViewProps {
  scale: Scale;
  fretboard: Fretboard;
  labelMode: LabelMode;
  /** Restrict to one box: notes outside its fret window fade into the background. */
  position?: ScalePosition | null;
  /**
   * Pick out some pitch classes — the tones of a chord, or a single scale degree.
   * One mechanism serves both: everything else on the neck dims away.
   */
  highlight?: readonly number[] | null;
  /** Only used for the accessible label, so the picked-out tones have a name. */
  highlightLabel?: string | null;
}

// Geometry. Frets are evenly spaced — this is a scale map, not a photo of a neck.
const LABEL_X = 16; // open-string name, far left
const OPEN_OFFSET = 32; // how far left of the nut (or capo) the open-string dots sit
const NUT_X = 74;
const FRET_WIDTH = 58;
const STRING_GAP = 36;
const TOP_Y = 44;
const DOT_RADIUS = 13;
const ROOT_RADIUS = 16;
/** A real neck is wider than the span of its strings. */
const BOARD_MARGIN = 18;
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
  highlight = null,
  highlightLabel = null,
}: FretboardViewProps) {
  const { fretCount, stringCount, capo, tuning } = fretboard;

  const notes = fretboard.mapScale(scale);
  const inlays = fretboard.inlayFrets();
  const labels = tuning.stringLabels;

  const picked = highlight && highlight.length > 0 ? new Set(highlight) : null;

  /** Inside the selected box — or everywhere, when no box is selected. */
  const inBox = (fret: number) =>
    position === null || (fret >= position.startFret && fret <= position.endFret);

  const boardTop = TOP_Y - BOARD_MARGIN;
  const boardBottom = stringY(0, stringCount);
  const boardFoot = boardBottom + BOARD_MARGIN;

  const width = NUT_X + fretCount * FRET_WIDTH + 20;
  const height = boardFoot + 42;
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

  // The board starts left of the nut so the open-string dots sit on wood too,
  // rather than floating on the page background.
  const boardLeft = NUT_X - OPEN_OFFSET - 16;

  const described = [
    scale.name(),
    position ? `Lage ${position.number}` : null,
    highlightLabel,
  ].filter(Boolean);

  return (
    <div className="fretboard-scroll">
      <svg
        className="fretboard"
        viewBox={`0 0 ${width} ${height}`}
        // Tie the minimum width to the fret count instead of pinning it at one
        // value: a 12-fret neck then fits a phone, where a 24-fret one cannot.
        style={{ minWidth: `${(fretCount + 2) * 42}px` }}
        role="img"
        aria-label={`Griffbrett: ${described.join(', ')}`}
      >
        <defs>
          {/* Hints at the curvature of the board without pretending to be wood. */}
          <linearGradient id="board-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--board-top)" />
            <stop offset="45%" stopColor="var(--board)" />
            <stop offset="100%" stopColor="var(--board-edge)" />
          </linearGradient>
        </defs>

        {/* The board itself. Everything below is drawn on top of it. */}
        <rect
          className="board"
          x={boardLeft}
          y={boardTop}
          width={width - boardLeft - 8}
          height={boardFoot - boardTop}
          rx={6}
        />

        {/* Inlays sit in the wood, under the strings. */}
        {inlays.map(({ fret, double }) =>
          double ? (
            <g key={fret}>
              <circle
                className="inlay"
                cx={fretCenterX(fret)}
                cy={inlayY - DOUBLE_INLAY_OFFSET}
                r={6}
              />
              <circle
                className="inlay"
                cx={fretCenterX(fret)}
                cy={inlayY + DOUBLE_INLAY_OFFSET}
                r={6}
              />
            </g>
          ) : (
            <circle key={fret} className="inlay" cx={fretCenterX(fret)} cy={inlayY} r={6} />
          ),
        )}

        {/* Fret wires — light metal on dark wood, the way a neck actually looks. */}
        {Array.from({ length: fretCount }, (_, i) => i + 1).map((fret) => (
          <line
            key={fret}
            className="fret-wire"
            x1={NUT_X + fret * FRET_WIDTH}
            y1={boardTop + 4}
            x2={NUT_X + fret * FRET_WIDTH}
            y2={boardFoot - 4}
          />
        ))}

        {/* The nut: bone, and thicker than any fret. */}
        <line className="nut" x1={NUT_X} y1={boardTop + 2} x2={NUT_X} y2={boardFoot - 2} />

        {/* Strings — the low ones are drawn thicker, as they are. */}
        {Array.from({ length: stringCount }, (_, stringIndex) => (
          <g key={stringIndex}>
            <line
              className="string"
              x1={boardLeft}
              y1={stringY(stringIndex, stringCount)}
              x2={width - 8}
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
              x={boardLeft}
              y={boardTop}
              width={capoX - boardLeft}
              height={boardFoot - boardTop}
              rx={6}
            />
            <line
              className="capo"
              x1={capoX}
              y1={boardTop - 3}
              x2={capoX}
              y2={boardFoot + 3}
            />
            <text className="capo-label" x={capoX} y={boardTop - 10} textAnchor="middle">
              Kapo {capo}
            </text>
          </>
        ) : null}

        {/* Outline of the selected box, so it reads as one hand shape. */}
        {position ? (
          <rect
            className="box-outline"
            x={NUT_X + (position.startFret - 1) * FRET_WIDTH}
            y={boardTop + 3}
            width={(position.endFret - position.startFret + 1) * FRET_WIDTH}
            height={boardFoot - boardTop - 6}
            rx={7}
          />
        ) : null}

        {/* Fret numbers, below the board. */}
        {Array.from({ length: fretCount + 1 }, (_, fret) => fret).map((fret) => (
          <text
            key={fret}
            className={fret < capo ? 'fret-number is-muted' : 'fret-number'}
            x={numberX(fret)}
            y={boardFoot + 24}
            textAnchor="middle"
          >
            {fret}
          </text>
        ))}

        {/* Scale notes. The root is bigger AND warmer — colour is never the only cue. */}
        {notes.map((note) => {
          const cx = noteX(note.fret);
          const cy = stringY(note.stringIndex, stringCount);
          const label = labelMode === 'note' ? note.note.name() : note.degree;

          const outsideBox = !inBox(note.fret);
          const isPicked = picked?.has(note.pitchClass) ?? false;
          // The box is the stronger filter: a picked tone outside it still fades.
          const dimmed = outsideBox || (picked !== null && !isPicked);

          const classes = [
            'note-dot',
            note.isRoot ? 'note-dot--root' : '',
            isPicked && !note.isRoot && !outsideBox ? 'note-dot--picked' : '',
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
                  isPicked && !note.isRoot && !outsideBox ? 'note-label--picked' : '',
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
