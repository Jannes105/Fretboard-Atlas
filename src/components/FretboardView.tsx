import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HARD_RELEASE,
  pitchClassNames,
  type CagedPlacement,
  type Fretboard,
  type FretPosition,
  type ScalePosition,
  type Scale,
} from '../theory';
import {
  DOT_RADIUS,
  DOUBLE_INLAY_OFFSET,
  FRET_WIDTH,
  fretCenterX,
  neckLayout,
  noteX as noteXAt,
  NUT_X,
  numberX,
  positionKey,
  ROOT_RADIUS,
  STRING_GAP,
  stringY,
} from './neckGeometry';
import { NoteTspans } from './NoteText';
import './FretboardView.css';

/** Show the note name on each dot, or its scale degree. */
export type LabelMode = 'note' | 'degree';

/**
 * One dot as the neck draws it, with the key already resolved away.
 *
 * Both modes end up here so the drawing loop is written once: a scale note knows
 * its spelling and its degree, a keyless one knows only which pitch it is and
 * answers to both of its names.
 */
interface DrawnNote extends FretPosition {
  /** What the dot says. Two lines only where a pitch has two names and no key. */
  readonly lines: readonly string[];
  /** Named for the title and the accessible text, in one piece. */
  readonly spoken: string;
  readonly isRoot: boolean;
}

function drawnNotes(
  fretboard: Fretboard,
  scale: Scale | null,
  labelMode: LabelMode,
): DrawnNote[] {
  if (scale === null) {
    // No key to spell them, so every accidental carries both readings — see
    // pitchClassNames. Naturals stay one line and one size, which keeps the
    // letters you navigate by the loudest thing on the board.
    return fretboard.allPositions().map((position) => {
      const names = pitchClassNames(position.pitchClass);
      return { ...position, lines: names, spoken: names.join(' oder '), isRoot: false };
    });
  }

  return fretboard.mapScale(scale).map((note) => ({
    ...note,
    lines: [labelMode === 'note' ? note.note.name() : note.degree],
    spoken: note.note.name(),
    isRoot: note.isRoot,
  }));
}

interface FretboardViewProps {
  /** The key on the neck, or null to name every note instead. */
  scale: Scale | null;
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
  /**
   * Sound a single position at its real pitch for as long as it is held down,
   * and hand back the handle that ends it.
   *
   * Declared structurally rather than as the audio module's NoteHandle: the view
   * owns the finger, whoever passes this owns the note, and the neck has no
   * business knowing there is an audio module at all.
   */
  onHoldNote?: (midi: number) => { release(fade?: number): void };
  /**
   * Crop the drawing to the selected position instead of showing the whole neck
   * dimmed around it. Without a position there is nothing to crop to.
   */
  zoom?: boolean;
  /**
   * Positions sounding right now, as keys from positionKey — the marker that walks
   * the neck while a scale plays.
   */
  sounding?: ReadonlySet<string> | null;
  /**
   * One CAGED form laid over the scale: its fret window outlined, and a ring on
   * every scale dot the grip actually stops.
   */
  caged?: CagedPlacement | null;
}

export function FretboardView({
  scale,
  fretboard,
  labelMode,
  position = null,
  highlight = null,
  highlightLabel = null,
  onHoldNote,
  zoom = false,
  sounding = null,
  caged = null,
}: FretboardViewProps) {
  const { fretCount, stringCount, capo, tuning } = fretboard;

  const notes = useMemo(() => drawnNotes(fretboard, scale, labelMode), [fretboard, scale, labelMode]);
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
    scale ? scale.name() : 'alle Töne',
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

  /*
   * The notes with a finger on them, by pointer id, so several fingers hold
   * several notes — a chord under the hand rather than one note at a time.
   *
   * A ref and not state: nothing on screen depends on it, and a re-render per
   * finger-down on a neck of several hundred dots would be felt.
   */
  const holds = useRef(new Map<number, { release(fade?: number): void }>());

  const releaseHold = (pointerId: number, fade?: number) => {
    const handle = holds.current.get(pointerId);
    // pointerup and lostpointercapture both arrive for one lift, in that order —
    // capture is dropped implicitly. Whichever gets here first ends the note.
    if (!handle) return;
    holds.current.delete(pointerId);
    handle.release(fade);
  };

  // A finger still down when the neck goes away would otherwise sound for good:
  // its pointerup has nothing left to arrive at.
  useEffect(() => {
    const sounding = holds.current;
    return () => {
      for (const handle of sounding.values()) handle.release(HARD_RELEASE);
      sounding.clear();
    };
  }, []);

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

  /**
   * Whether there is neck to the right of what is on screen. The fading edge and
   * the swipe hint hang off this rather than being always-on: an edge that fades
   * even when you have scrolled all the way right promises more that is not there.
   */
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    // jsdom has no layout — scrollWidth is 0, so this stays false and the hint
    // simply says less. Same caution as the scroll effect above.
    if (!el) return;

    const measure = () => setOverflows(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    measure();

    el.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);

    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [width, cropped, fretCount]);

  return (
    <>
      <div
        ref={scrollRef}
        className={overflows ? 'fretboard-scroll fretboard-scroll--more' : 'fretboard-scroll'}
      >
        <svg
          className={onHoldNote ? 'fretboard fretboard--playable' : 'fretboard'}
          viewBox={layout.viewBox}
          // Tie the minimum width to what is actually shown, not to the fret count:
          // a 12-fret neck then fits a phone where a 24-fret one cannot, and a
          // cropped box is not stretched to the width of a neck it does not show.
          //
          // FRET_WIDTH, not some smaller number: this floor is what decides how
          // small the neck may be squeezed, and at 42 it drew the drawing at 0.74
          // of its own scale — the note names, the whole point of the picture,
          // came out at 9 px on every phone. At 1:1 they are the size they were
          // drawn to be, and the neck simply scrolls a little further.
          style={{ minWidth: `${(layout.visibleFrets + 2) * FRET_WIDTH}px` }}
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
            {/*
             * The board itself. Everything below is drawn on top of it.
             *
             * Inset by one unit all round so its binding (a stroke, see the .board
             * rule) lies fully inside the clip window — centred on the very edge,
             * the left half of that stroke would be clipped away and the neck
             * would carry a thinner rim on one side than on the other three.
             */}
            <rect
              className="board"
              x={boardLeft + 1}
              y={boardTop + 1}
              width={width - boardLeft - 10}
              height={boardFoot - boardTop - 2}
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
              </>
            ) : null}

            {/*
             * Outline of the selected box, so it reads as one hand shape — but only
             * when the whole neck is on screen and the box needs locating among
             * twenty-four frets. Cropped, the visible area already IS the box, and
             * the one dimmed fret of air at each edge marks where it ends. A frame
             * there would state a third time what the crop and the dimming say.
             */}
            {position && !cropped ? (
              <rect
                className="box-outline"
                x={NUT_X + (position.startFret - 1) * FRET_WIDTH}
                y={boardTop + 3}
                width={(position.endFret - position.startFret + 1) * FRET_WIDTH}
                height={boardFoot - boardTop - 6}
                rx={7}
              />
            ) : null}

            {/*
             * The CAGED form has no frame of its own. It used to get one, drawn like
             * the box outline in the chord accent — but two rectangles crossing each
             * other on one neck explain each other away: you see two frames and can
             * read neither. The rings on the stopped notes say where the grip is, and
             * they say it exactly, which a fret window only approximates.
             */}

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

              const isSounding = sounding?.has(positionKey(note)) ?? false;
              // A scale dot the grip actually stops — where the shape and the scale
              // are the same note under the same finger.
              const isCagedTone = caged?.frets[note.stringIndex] === note.fret;

              return (
                <g
                  key={positionKey(note)}
                  className="note"
                  /*
                   * Held, not tapped: the note sounds while the finger is down and
                   * stops when it lifts, which is what an instrument does.
                   *
                   * Pointer capture is what makes a finger that slides off the dot
                   * still deliver its own pointerup here. It comes AFTER the note
                   * and inside a try, because it is an improvement to the note and
                   * never a condition for it: setPointerCapture throws outright if
                   * the pointer is no longer active by the time the handler runs,
                   * and a dot that stays silent because of that is a far worse bug
                   * than one whose pointerup arrives somewhere else. jsdom has none
                   * of the capture methods at all, hence the typeof as well.
                   *
                   * Deliberately NOT gated on event.isPrimary: the extra fingers of
                   * a chord are exactly the non-primary pointers.
                   */
                  onPointerDown={
                    onHoldNote
                      ? (event) => {
                          if (holds.current.has(event.pointerId)) return;
                          holds.current.set(event.pointerId, onHoldNote(note.midi));

                          const target = event.currentTarget;
                          if (typeof target.setPointerCapture !== 'function') return;
                          try {
                            target.setPointerCapture(event.pointerId);
                          } catch {
                            // No active pointer with that id — the note still sounds.
                          }
                        }
                      : undefined
                  }
                  onPointerUp={
                    onHoldNote ? (event) => releaseHold(event.pointerId) : undefined
                  }
                  onLostPointerCapture={
                    onHoldNote ? (event) => releaseHold(event.pointerId) : undefined
                  }
                  /*
                   * The browser sends this when it decides the gesture was a scroll
                   * after all — the neck pans sideways, so a swipe often starts on a
                   * dot. Cut rather than faded, so that leaves a click and not a note.
                   * (The alternative, waiting to see whether a touch becomes a swipe,
                   * would make the instrument answer late — which the touch-action
                   * comment in the stylesheet says was fixed once already.)
                   */
                  onPointerCancel={
                    onHoldNote ? (event) => releaseHold(event.pointerId, HARD_RELEASE) : undefined
                  }
                >
                  {/* A title makes the pitch discoverable on hover and to a screen reader. */}
                  {onHoldNote ? <title>{`${note.spoken} — halten zum Hören`}</title> : null}
                  {/*
                   * The marker, as its own ring UNDER the dot rather than a class on
                   * it: the dot already carries a root/picked/dimmed cascade, and a
                   * fourth state fighting that would be a colour puzzle. Drawn first,
                   * so the dot stays legible on top of it.
                   */}
                  {isSounding ? (
                    <circle
                      className="note-halo"
                      cx={cx}
                      cy={cy}
                      r={(note.isRoot ? ROOT_RADIUS : DOT_RADIUS) + 7}
                    />
                  ) : null}
                  {/* Also a ring, and also under the dot — same reasoning as the
                      marker, and the two can legitimately coincide. */}
                  {isCagedTone ? (
                    <circle
                      // Fades with the note it marks. A full-strength ring around a
                      // dot at 14% opacity reads as a rendering fault, and the grip
                      // reaches outside the box often enough for that to show.
                      className={dimmed ? 'note-caged is-dimmed' : 'note-caged'}
                      cx={cx}
                      cy={cy}
                      r={(note.isRoot ? ROOT_RADIUS : DOT_RADIUS) + 4}
                    />
                  ) : null}
                  {/*
                   * The tap target. A dot of r=13 renders around 19 CSS px on a
                   * phone, well under a fingertip. A RECTANGLE rather than a bigger
                   * circle: circles wide enough to help would overlap on adjacent
                   * strings, and the note drawn last would steal its neighbour's
                   * tap — a wrong-note bug that is miserable to track down. One
                   * fret by one string spacing tiles the neck exactly.
                   *
                   * `fill` must be transparent, not none: an unpainted shape takes
                   * no pointer events at all.
                   */}
                  {onHoldNote ? (
                    <rect
                      className="note-hit"
                      x={cx - FRET_WIDTH / 2}
                      y={cy - STRING_GAP / 2}
                      width={FRET_WIDTH}
                      height={STRING_GAP}
                    />
                  ) : null}
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
                      note.lines.length > 1 ? 'note-label--stacked' : '',
                      dimmed ? 'is-dimmed' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {note.lines.length === 1 ? (
                      <NoteTspans name={note.lines[0]} />
                    ) : (
                      /*
                       * Both names, stacked. A dot is 28 units across and "C♯/D♭"
                       * on one line does not fit at a readable size — two short
                       * lines do, and they also read as what they are: one fret,
                       * two names. The x has to be repeated on every line; a tspan
                       * otherwise continues where the last one ended.
                       */
                      note.lines.map((line, index) => (
                        <tspan key={line} x={cx} dy={index === 0 ? '-0.5em' : '1em'}>
                          <NoteTspans name={line} />
                        </tspan>
                      ))
                    )}
                  </text>
                </g>
              );
            })}
          </g>

          {/*
           * Outside the clip, like the string names: it is an annotation above the
           * board, not part of it. A crop that starts at or past the capo would
           * otherwise slice the word in half, since it is centred on the bar. Nudged
           * right where it would run off the left edge, so it stays readable.
           */}
          {capo > 0 ? (
            <text
              className="capo-label"
              x={Math.max(capoX, layout.labelX + 26)}
              y={boardTop - 10}
              textAnchor="middle"
            >
              Kapo {capo}
            </text>
          ) : null}

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

      {/*
       * Holding a dot sounds it — which the neck said only through a hover title,
       * and a finger never hovers. One line, where the neck ends. It has to say
       * "halten" rather than "antippen", because a tap that is let go of at once
       * now gives a short note rather than a whole one.
       */}
      {onHoldNote ? (
        <p className="hint fretboard-hint">
          Einen Ton gedrückt halten: du hörst ihn, solange du hältst.
          {overflows ? ' Der Hals geht rechts weiter — seitlich wischen.' : ''}
        </p>
      ) : null}
    </>
  );
}
