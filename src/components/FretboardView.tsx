import { useEffect, useRef } from 'react';
import type { Fretboard, Scale, ScalePosition } from '../theory';
import {
  DOT_RADIUS,
  DOUBLE_INLAY_OFFSET,
  FRET_WIDTH,
  fretCenterX,
  neckLayout,
  noteX as noteXAt,
  NUT_X,
  numberX,
  ROOT_RADIUS,
  stringY,
} from './neckGeometry';
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
  /** Sound a single position when its dot is tapped, at its real pitch. */
  onPlayNote?: (midi: number) => void;
  /**
   * Crop the drawing to the selected position instead of showing the whole neck
   * dimmed around it. Without a position there is nothing to crop to.
   */
  zoom?: boolean;
}

export function FretboardView({
  scale,
  fretboard,
  labelMode,
  position = null,
  highlight = null,
  highlightLabel = null,
  onPlayNote,
  zoom = false,
}: FretboardViewProps) {
  const { fretCount, stringCount, capo, tuning } = fretboard;

  const notes = fretboard.mapScale(scale);
  const inlays = fretboard.inlayFrets();
  const labels = tuning.stringLabels;

  const picked = highlight && highlight.length > 0 ? new Set(highlight) : null;

  /** Inside the selected box — or everywhere, when no box is selected. */
  const inBox = (fret: number) =>
    position === null || (fret >= position.startFret && fret <= position.endFret);

  // A crop needs a position to crop to; asking for one without is simply the
  // whole neck.
  const cropped = zoom && position !== null;
  const layout = neckLayout(fretCount, stringCount, cropped ? position : null);
  const { width, boardTop, boardFoot, inlayY, boardLeft } = layout;

  // The capo acts as a movable nut: notes at the capo fret are the new open
  // strings, so they get drawn in the open column just left of the bar.
  const capoX = NUT_X + capo * FRET_WIDTH;

  const noteX = (fret: number) => noteXAt(fret, capo);

  const described = [
    scale.name(),
    position ? `Lage ${position.number}` : null,
    cropped ? `Bünde ${position.startFret}–${position.endFret}` : null,
    highlightLabel,
  ].filter(Boolean);

  /**
   * Bring the selected position into view when the neck is NOT cropped — Lage 5
   * sits around the 15th fret, and without this you would have to go looking for
   * the box you just picked. A crop needs none of this: it already shows only the
   * box.
   *
   * Lives here rather than in App because only the view knows where a fret falls
   * in pixels, and handing that upward would leak the geometry this component
   * just gathered up.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const positionNumber = position?.number ?? null;

  useEffect(() => {
    const el = scrollRef.current;
    // jsdom has no layout: scrollWidth is 0 and scrollTo may be missing entirely.
    if (!el || position === null || cropped || typeof el.scrollTo !== 'function') return;
    if (el.scrollWidth === 0) return;

    const pxPerUnit = el.scrollWidth / width;
    const centre = fretCenterX((position.startFret + position.endFret) / 2) * pxPerUnit;

    el.scrollTo({
      left: Math.max(0, centre - el.clientWidth / 2),
      // The CSS honours this twice already; a scroll is no less motion.
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
    // Keyed on the position NUMBER, not the object: App rebuilds the boxes on
    // every render, so the object identity changes even when the box does not —
    // which would re-scroll and fight the user mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionNumber, cropped, width]);

  return (
    <div
      ref={scrollRef}
      className={cropped ? 'fretboard-scroll fretboard-scroll--zoomed' : 'fretboard-scroll'}
    >
      <svg
        className={onPlayNote ? 'fretboard fretboard--playable' : 'fretboard'}
        viewBox={layout.viewBox}
        // Tie the minimum width to what is actually shown, not to the fret count:
        // a 12-fret neck then fits a phone where a 24-fret one cannot, and a
        // cropped box is not stretched to the width of a neck it does not show.
        style={{ minWidth: `${(layout.visibleFrets + 2) * 42}px` }}
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

          {/*
           * Keeps the neck off the left margin. A crop reserves a gutter there for
           * the string names, and that gutter sits INSIDE the view — so without
           * this, dots and fret numbers from a fret just outside the box would be
           * drawn over the names. Full height, so the fret numbers under the board
           * survive.
           */}
          <clipPath id="board-window">
            <rect x={boardLeft} y={0} width={width - boardLeft} height={layout.height} />
          </clipPath>
        </defs>

        <g clipPath="url(#board-window)">
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
            <line
              key={stringIndex}
              className="string"
              x1={boardLeft}
              y1={stringY(stringIndex, stringCount)}
              x2={width - 8}
              y2={stringY(stringIndex, stringCount)}
              strokeWidth={3.2 - stringIndex * 0.35}
            />
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
              <line className="capo" x1={capoX} y1={boardTop - 3} x2={capoX} y2={boardFoot + 3} />
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
              <g
                key={`${note.stringIndex}-${note.fret}`}
                className="note"
                onClick={onPlayNote ? () => onPlayNote(note.midi) : undefined}
              >
                {/* A title makes the pitch discoverable on hover and to a screen reader. */}
                {onPlayNote ? <title>{`${note.note.name()} — anhören`}</title> : null}
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
        </g>

        {/* Outside the clip: the names live in the left margin, not on the wood. */}
        {Array.from({ length: stringCount }, (_, stringIndex) => (
          <text
            key={stringIndex}
            className="string-label"
            x={layout.labelX}
            y={stringY(stringIndex, stringCount)}
            dominantBaseline="central"
          >
            {labels[stringIndex]}
          </text>
        ))}
      </svg>
    </div>
  );
}
