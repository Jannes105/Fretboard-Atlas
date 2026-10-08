import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  INLAY_RADIUS,
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

/** Which name a black key gets where no key decides it. */
export type Spelling = 'sharp' | 'flat';

/**
 * A chord picked out on the neck, beyond the bare pitch classes in `highlight`:
 * which of them is its root, what each tone is called in the chord's own spelling,
 * and what interval it is above that root.
 */
export interface ChordTones {
  readonly root: number;
  /** Pitch class → the chord's own spelling of it, e.g. 5 → "F". */
  readonly names: ReadonlyMap<number, string>;
  /** Pitch class → interval above the chord root, e.g. "1", "b3", "5". */
  readonly intervals: ReadonlyMap<number, string>;
}

/**
 * One dot as the neck draws it, with the key already resolved away.
 *
 * Both modes end up here so the drawing loop is written once: a scale note knows
 * its spelling and its degree, a keyless one knows only which pitch it is.
 */
interface DrawnNote extends FretPosition {
  readonly lines: readonly string[];
  /** Named for the title and the accessible text, in one piece. */
  readonly spoken: string;
  readonly isRoot: boolean;
  /** A black key on the keyless map, drawn darker. */
  readonly isBlackKey?: boolean;
  /** A chord tone the scale does not contain — drawn hollow, see below. */
  readonly isGhost?: boolean;
}

/** The one name a keyless dot shows: the reader's choice of ♯ or ♭. */
function keylessName(pitchClass: number, spelling: Spelling): string {
  const names = pitchClassNames(pitchClass);
  return spelling === 'flat' && names.length > 1 ? names[1] : names[0];
}

function drawnNotes(
  fretboard: Fretboard,
  scale: Scale | null,
  labelMode: LabelMode,
  spelling: Spelling,
): DrawnNote[] {
  if (scale === null) {
    /*
     * One name per dot. Both spellings on every black key („F♯ über G♭") were
     * correct — without a key neither is truer — but they turned five dots in
     * twelve into 9-px print that nobody could read at a glance. Which of the two
     * is the reader's choice (♯ or ♭, see useViewPrefs); the other name is still
     * on the title and in the accessible text.
     */
    return fretboard.allPositions().map((position) => {
      const names = pitchClassNames(position.pitchClass);
      return {
        ...position,
        lines: [keylessName(position.pitchClass, spelling)],
        spoken: names.join(' oder '),
        isRoot: false,
        isBlackKey: names.length > 1,
      };
    });
  }

  return fretboard.mapScale(scale).map((note) => ({
    ...note,
    lines: [labelMode === 'note' ? note.note.name() : note.degree],
    spoken: note.note.name(),
    isRoot: note.isRoot,
  }));
}

/** Andrew's monotone chain: the outline around a CAGED grip's stopped notes. */
function convexHull(points: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted.map((p) => [p[0], p[1]]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: (readonly [number, number])[]) => {
    const out: (readonly [number, number])[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())].map((p) => [p[0], p[1]]);
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
  /** Set when the highlight is a chord — see ChordTones. */
  chordTones?: ChordTones | null;
  /**
   * Sound a single position at its real pitch for as long as it is held down,
   * and hand back the handle that ends it.
   */
  onHoldNote?: (midi: number) => { release(fade?: number): void };
  /**
   * A dot was touched (or chosen by keyboard). Separate from onHoldNote: that one
   * is about SOUND and ends when the finger lifts; this one is about FINDING —
   * the app answers by picking out every place that note lives on the neck.
   */
  onPickNote?: (position: FretPosition) => void;
  /**
   * The exact pitch that was touched. Every dot with this very pitch gets a ring;
   * the same note in other octaves is picked out too, but without one — so „all
   * the C's" and „this C, in all the places you can play it" read apart.
   */
  unisonMidi?: number | null;
  /** ♯ or ♭ for black keys where no key spells them. */
  spelling?: Spelling;
  /** Crop the drawing to the selected position instead of showing the whole neck. */
  zoom?: boolean;
  /** Positions sounding right now, as keys from positionKey. */
  sounding?: ReadonlySet<string> | null;
  /** One CAGED form laid over the scale. */
  caged?: CagedPlacement | null;
  /** The pitch class that gives this mode its colour, ringed on the neck. */
  characteristic?: number | null;
  /** Nut at the top, strings running down the page — the phone layout. */
  vertical?: boolean;
  /** Mirrored: a left-handed guitar, seen from the front. */
  lefty?: boolean;
}

export function FretboardView({
  scale,
  fretboard,
  labelMode,
  position = null,
  highlight = null,
  highlightLabel = null,
  chordTones = null,
  onHoldNote,
  onPickNote,
  unisonMidi = null,
  spelling = 'sharp',
  zoom = false,
  sounding = null,
  caged = null,
  characteristic = null,
  vertical = false,
  lefty = false,
}: FretboardViewProps) {
  const { fretCount, stringCount, capo, tuning } = fretboard;

  const notes = useMemo(
    () => drawnNotes(fretboard, scale, labelMode, spelling),
    [fretboard, scale, labelMode, spelling],
  );
  const allPositions = useMemo(() => fretboard.allPositions(), [fretboard]);
  const inlays = fretboard.inlayFrets();
  const labels = tuning.stringLabels;

  const picked = highlight && highlight.length > 0 ? new Set(highlight) : null;

  /**
   * The chord tones the scale has no dot for. A chord borrowed into a pentatonic
   * reaches outside it — the VI of A minor pentatonic is F–A–C, and there is no F
   * on that neck. Showing only A and C called a two-note fragment „F", and nothing
   * on screen said a tone was missing. They are drawn now, hollow and dashed: on
   * the neck, playable, and visibly not part of the scale.
   */
  const ghosts = useMemo<DrawnNote[]>(() => {
    if (!chordTones || !picked || scale === null) return [];
    const inScale = new Set(scale.notes.map((note) => note.pitchClass));
    return allPositions
      .filter((p) => picked.has(p.pitchClass) && !inScale.has(p.pitchClass))
      .map((p) => {
        const name = chordTones.names.get(p.pitchClass) ?? pitchClassNames(p.pitchClass)[0];
        return { ...p, lines: [name], spoken: name, isRoot: false, isGhost: true };
      });
    // `picked` is rebuilt per render from `highlight`, which is what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordTones, highlight, scale, allPositions]);

  /** Inside the selected box — or everywhere, when no box is selected. */
  const inBox = (fret: number) =>
    position === null || (fret >= position.startFret && fret <= position.endFret);

  const cropped = zoom && position !== null;
  const layout = neckLayout(fretCount, stringCount, cropped ? position : null);
  const { width, height, boardTop, boardFoot, inlayY, boardLeft } = layout;

  /*
   * Every coordinate below is written for the neck as it always was — frets along
   * x, strings across y — and goes through P on its way to the screen. That one
   * function is the whole of the upright and the mirrored neck: no element is
   * drawn twice, and the text stays upright because only positions move, never a
   * rotation that would turn the letters with them.
   *
   *   along  = distance from the nut side of the drawing (old x)
   *   across = distance from the top string side (old y)
   */
  const P = (along: number, across: number): [number, number] => {
    if (vertical) return [lefty ? across : height - across, along];
    return [lefty ? width - along : along, across];
  };
  const R = (along: number, across: number, wAlong: number, wAcross: number) => {
    const [x1, y1] = P(along, across);
    const [x2, y2] = P(along + wAlong, across + wAcross);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  };
  const L = (a1: number, c1: number, a2: number, c2: number) => {
    const [x1, y1] = P(a1, c1);
    const [x2, y2] = P(a2, c2);
    return { x1, y1, x2, y2 };
  };

  const [vx, , vw] = layout.viewBox.split(' ').map(Number);
  const viewBox = vertical
    ? `0 ${vx} ${height} ${vw}`
    : `${lefty ? width - vx - vw : vx} 0 ${vw} ${height}`;

  // The capo acts as a movable nut: notes at the capo fret are the new open strings.
  const capoX = NUT_X + capo * FRET_WIDTH;

  const noteX = (fret: number) => noteXAt(fret, capo);

  const described = [
    scale ? scale.name() : 'alle Töne',
    position ? `Lage ${position.number}` : null,
    cropped ? `Bünde ${position.startFret}–${position.endFret}` : null,
    highlightLabel,
  ].filter(Boolean);

  const scrollRef = useRef<HTMLDivElement>(null);
  const positionNumber = position?.number ?? null;

  /*
   * The notes with a finger on them, by pointer id, so several fingers hold
   * several notes — a chord under the hand rather than one note at a time.
   */
  const holds = useRef(new Map<number, { release(fade?: number): void }>());

  const releaseHold = (pointerId: number, fade?: number) => {
    const handle = holds.current.get(pointerId);
    if (!handle) return;
    holds.current.delete(pointerId);
    handle.release(fade);
  };

  useEffect(() => {
    const sounding = holds.current;
    return () => {
      for (const handle of sounding.values()) handle.release(HARD_RELEASE);
      sounding.clear();
    };
  }, []);

  // A mirrored neck starts at its nut, which is now the right-hand end.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || vertical || !lefty || el.scrollWidth === 0) return;
    el.scrollLeft = el.scrollWidth;
  }, [lefty, vertical, width]);

  /**
   * Bring the selected position into view when the neck is NOT cropped. Upright,
   * the page itself scrolls and the whole neck is already there at full width.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || position === null || cropped || vertical || typeof el.scrollTo !== 'function') return;
    if (el.scrollWidth === 0) return;

    const pxPerUnit = el.scrollWidth / width;
    const along = fretCenterX((position.startFret + position.endFret) / 2);
    const centre = (lefty ? width - along : along) * pxPerUnit;

    el.scrollTo({
      left: Math.max(0, centre - el.clientWidth / 2),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
    // Keyed on the position NUMBER, not the object: App rebuilds the boxes on
    // every render, which would re-scroll and fight the user mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionNumber, cropped, width, lefty, vertical]);

  /**
   * Whether there is neck beyond what is on screen — to the right, or to the left
   * on a mirrored neck. The fading edge and the swipe hint hang off this.
   */
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () =>
      setOverflows(
        !vertical &&
          (lefty
            ? el.scrollLeft > 1
            : el.scrollLeft + el.clientWidth < el.scrollWidth - 1),
      );
    measure();

    el.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);

    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [width, cropped, fretCount, lefty, vertical]);

  // ---- Keyboard: a cursor that walks the neck, Space or Enter sounds it ----

  const [cursor, setCursor] = useState<{ stringIndex: number; fret: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const keyHold = useRef<{ release(fade?: number): void } | null>(null);

  // A cursor left behind on a fret the neck no longer has would point at nothing.
  useEffect(() => {
    setCursor((current) =>
      current && (current.fret > fretCount || current.fret < capo) ? null : current,
    );
  }, [fretCount, capo]);

  const cursorPosition = cursor
    ? allPositions.find((p) => p.stringIndex === cursor.stringIndex && p.fret === cursor.fret) ??
      null
    : null;

  const drawnAt = (stringIndex: number, fret: number) =>
    notes.find((n) => n.stringIndex === stringIndex && n.fret === fret) ??
    ghosts.find((n) => n.stringIndex === stringIndex && n.fret === fret) ??
    null;

  const announce = (() => {
    if (!cursorPosition) return '';
    const stringName = labels[cursorPosition.stringIndex];
    const place = cursorPosition.fret === 0 ? 'leer' : `${cursorPosition.fret}. Bund`;
    const drawn = drawnAt(cursorPosition.stringIndex, cursorPosition.fret);
    const name = drawn?.spoken ?? pitchClassNames(cursorPosition.pitchClass).join(' oder ');
    const outside = scale !== null && !drawn ? ' — nicht in der Tonart' : '';
    return `${stringName}-Saite, ${place}: ${name}${outside}`;
  })();

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const alongInc = vertical ? 'ArrowDown' : lefty ? 'ArrowLeft' : 'ArrowRight';
    const alongDec = vertical ? 'ArrowUp' : lefty ? 'ArrowRight' : 'ArrowLeft';
    // Higher strings: up on a lying neck, right (or left, mirrored) on an upright one.
    const acrossInc = vertical ? (lefty ? 'ArrowLeft' : 'ArrowRight') : 'ArrowUp';
    const acrossDec = vertical ? (lefty ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown';

    const start = cursor ?? { stringIndex: 0, fret: capo };
    const move = (dString: number, dFret: number) => {
      event.preventDefault();
      setCursor({
        stringIndex: Math.min(stringCount - 1, Math.max(0, start.stringIndex + dString)),
        fret: Math.min(fretCount, Math.max(capo, start.fret + dFret)),
      });
    };

    if (event.key === alongInc) move(0, 1);
    else if (event.key === alongDec) move(0, -1);
    else if (event.key === acrossInc) move(1, 0);
    else if (event.key === acrossDec) move(-1, 0);
    else if ((event.key === ' ' || event.key === 'Enter') && onHoldNote) {
      event.preventDefault();
      if (event.repeat || keyHold.current) return;
      const target = cursorPosition ?? allPositions.find((p) => p.stringIndex === 0 && p.fret === capo);
      if (!cursor) setCursor(start);
      if (target) {
        keyHold.current = onHoldNote(target.midi);
        onPickNote?.(target);
      }
    }
  };

  const onKeyUp = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      keyHold.current?.release();
      keyHold.current = null;
    }
  };

  // ---- The CAGED grip as one shape ----

  const cagedHull = useMemo(() => {
    if (!caged) return null;
    const points: [number, number][] = [];
    caged.frets.forEach((fret, stringIndex) => {
      if (fret >= 0) points.push([noteX(fret), stringY(stringIndex, stringCount)]);
    });
    if (points.length === 0) return null;
    return convexHull(points)
      .map(([a, c]) => P(a, c).join(','))
      .join(' ');
    // P depends on these; it is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caged, capo, stringCount, vertical, lefty, width, height]);

  const textAnchorAcross = vertical ? 'middle' : lefty ? 'end' : 'start';

  const renderNote = (note: DrawnNote) => {
    const [cx, cy] = P(noteX(note.fret), stringY(note.stringIndex, stringCount));

    const outsideBox = !inBox(note.fret);
    const isPicked = picked?.has(note.pitchClass) ?? false;
    /*
     * A picked tone outside the position is not dimmed away with the rest. The
     * box says where the hand is; the pick asks where a note IS — and answering
     * that with half the neck greyed out was the wrong answer. It is drawn a
     * little quieter instead, so the box still reads.
     */
    const faint = outsideBox && isPicked;
    const dimmed = !faint && (outsideBox || (picked !== null && !isPicked));

    /*
     * Inside a chord every tone is a chord tone, the key's root included. It used
     * to keep its orange, so an A-minor chord in A minor showed up in two colours,
     * as if the A were not part of it. Now the chord is one colour, and ITS root
     * is the big dot — which is the root that matters while you look at a chord.
     */
    const asChord = chordTones !== null && isPicked;
    const isChordRoot = asChord && note.pitchClass === chordTones!.root;
    const showAsRoot = note.isRoot && !asChord;
    const big = showAsRoot || isChordRoot;

    const lines =
      asChord && labelMode === 'degree'
        ? [chordTones!.intervals.get(note.pitchClass) ?? note.lines[0]]
        : note.lines;

    const showAsPicked = isPicked && !showAsRoot && !note.isGhost;
    const showAsBlack = note.isBlackKey === true && !showAsPicked;

    const classes = [
      note.isGhost ? 'note-dot note-dot--ghost' : 'note-dot',
      showAsRoot ? 'note-dot--root' : '',
      showAsBlack ? 'note-dot--black' : '',
      showAsPicked ? 'note-dot--picked' : '',
      isChordRoot ? 'note-dot--chord-root' : '',
      dimmed ? 'is-dimmed' : '',
      faint ? 'is-faint' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const isSounding = sounding?.has(positionKey(note)) ?? false;
    const isCagedTone = caged?.frets[note.stringIndex] === note.fret;
    const isCharacteristic =
      characteristic !== null && note.pitchClass === characteristic && !note.isGhost;
    const isUnison = unisonMidi !== null && note.midi === unisonMidi && !dimmed;
    const radius = big ? ROOT_RADIUS : DOT_RADIUS;
    const hit = R(noteX(note.fret) - FRET_WIDTH / 2, stringY(note.stringIndex, stringCount) - STRING_GAP / 2, FRET_WIDTH, STRING_GAP);

    return (
      <g
        key={`${note.isGhost ? 'ghost' : 'note'}-${positionKey(note)}`}
        className="note"
        // Held, not tapped: the note sounds while the finger is down. Pointer
        // capture keeps a finger that slides off the dot delivering its own
        // pointerup here; it is an improvement, never a condition, hence the try.
        onPointerDown={
          onHoldNote
            ? (event) => {
                if (holds.current.has(event.pointerId)) return;
                holds.current.set(event.pointerId, onHoldNote(note.midi));
                onPickNote?.(note);

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
        onPointerUp={onHoldNote ? (event) => releaseHold(event.pointerId) : undefined}
        onLostPointerCapture={onHoldNote ? (event) => releaseHold(event.pointerId) : undefined}
        // The browser decided the gesture was a scroll after all: cut, not faded.
        onPointerCancel={
          onHoldNote ? (event) => releaseHold(event.pointerId, HARD_RELEASE) : undefined
        }
      >
        {onHoldNote ? (
          <title>{`${note.spoken}${note.isGhost ? ' (nicht in der Tonart)' : ''} — antippen oder halten zum Hören`}</title>
        ) : null}
        {isSounding ? <circle className="note-halo" cx={cx} cy={cy} r={radius + 7} /> : null}
        {isCagedTone ? (
          <circle
            className={dimmed ? 'note-caged is-dimmed' : 'note-caged'}
            cx={cx}
            cy={cy}
            r={radius + 4}
          />
        ) : null}
        {isCharacteristic ? (
          <circle
            className={dimmed ? 'note-characteristic is-dimmed' : 'note-characteristic'}
            cx={cx}
            cy={cy}
            r={radius + 5}
          />
        ) : null}
        {isUnison ? <circle className="note-unison" cx={cx} cy={cy} r={radius + 5} /> : null}
        {/* The tap target: one fret by one string, so neighbours never overlap. */}
        {onHoldNote ? <rect className="note-hit" {...hit} /> : null}
        <circle className={classes} cx={cx} cy={cy} r={radius} />
        <text
          className={[
            'note-label',
            showAsRoot ? 'note-label--root' : '',
            showAsBlack ? 'note-label--black' : '',
            showAsPicked ? 'note-label--picked' : '',
            note.isGhost ? 'note-label--ghost' : '',
            dimmed ? 'is-dimmed' : '',
            faint ? 'is-faint' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
        >
          <NoteTspans name={lines[0]} />
        </text>
      </g>
    );
  };

  const cursorRect =
    focused && cursorPosition
      ? R(
          noteX(cursorPosition.fret) - FRET_WIDTH / 2 + 3,
          stringY(cursorPosition.stringIndex, stringCount) - STRING_GAP / 2 + 3,
          FRET_WIDTH - 6,
          STRING_GAP - 6,
        )
      : null;

  return (
    <>
      <div
        ref={scrollRef}
        className={[
          'fretboard-scroll',
          overflows ? (lefty ? 'fretboard-scroll--more-left' : 'fretboard-scroll--more') : '',
          vertical ? 'fretboard-scroll--vertical' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <svg
          className={[
            'fretboard',
            onHoldNote ? 'fretboard--playable' : '',
            vertical ? 'fretboard--vertical' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          viewBox={viewBox}
          // Lying down, the minimum width keeps the drawing at 1:1 so the names
          // stay the size they were drawn; upright, the page width IS the neck's
          // width, and the page scrolls down it instead.
          style={vertical ? undefined : { minWidth: `${(layout.visibleFrets + 2) * FRET_WIDTH}px` }}
          role="img"
          aria-label={`Griffbrett: ${described.join(', ')}. Pfeiltasten wandern über den Hals, Leertaste spielt den Ton.`}
          tabIndex={onHoldNote ? 0 : undefined}
          onKeyDown={onHoldNote ? onKeyDown : undefined}
          onKeyUp={onHoldNote ? onKeyUp : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            keyHold.current?.release();
            keyHold.current = null;
          }}
        >
          <defs>
            {/* Hints at the curvature of the board, across the strings. */}
            <linearGradient
              id="board-face"
              x1={vertical ? (lefty ? 0 : 1) : 0}
              y1="0"
              x2={vertical ? (lefty ? 1 : 0) : 0}
              y2={vertical ? 0 : 1}
            >
              <stop offset="0%" stopColor="var(--board-top)" />
              <stop offset="45%" stopColor="var(--board)" />
              <stop offset="100%" stopColor="var(--board-edge)" />
            </linearGradient>

            {/* Keeps the neck off the string-name gutter of a crop. */}
            <clipPath id="board-window">
              <rect {...R(boardLeft, 0, width - boardLeft, height)} />
            </clipPath>
          </defs>

          <g clipPath="url(#board-window)">
            <rect
              className="board"
              {...R(boardLeft + 1, boardTop + 1, width - boardLeft - 10, boardFoot - boardTop - 2)}
              rx={6}
            />

            {inlays.map(({ fret, double }) =>
              double ? (
                <g key={fret}>
                  {[-1, 1].map((side) => {
                    const [cx, cy] = P(fretCenterX(fret), inlayY + side * DOUBLE_INLAY_OFFSET);
                    return <circle key={side} className="inlay" cx={cx} cy={cy} r={INLAY_RADIUS} />;
                  })}
                </g>
              ) : (
                (() => {
                  const [cx, cy] = P(fretCenterX(fret), inlayY);
                  return <circle key={fret} className="inlay" cx={cx} cy={cy} r={INLAY_RADIUS} />;
                })()
              ),
            )}

            {Array.from({ length: fretCount }, (_, i) => i + 1).map((fret) => (
              <line
                key={fret}
                className="fret-wire"
                {...L(NUT_X + fret * FRET_WIDTH, boardTop + 4, NUT_X + fret * FRET_WIDTH, boardFoot - 4)}
              />
            ))}

            <line className="nut" {...L(NUT_X, boardTop + 2, NUT_X, boardFoot - 2)} />

            {/* Strings — the low ones are drawn thicker, as they are. */}
            {Array.from({ length: stringCount }, (_, stringIndex) => (
              <line
                key={stringIndex}
                className="string"
                {...L(boardLeft, stringY(stringIndex, stringCount), width - 8, stringY(stringIndex, stringCount))}
                strokeWidth={3.2 - stringIndex * 0.35}
              />
            ))}

            {capo > 0 ? (
              <>
                <rect
                  className="capo-dead-zone"
                  {...R(boardLeft, boardTop, capoX - boardLeft, boardFoot - boardTop)}
                  rx={6}
                />
                <line className="capo" {...L(capoX, boardTop - 3, capoX, boardFoot + 3)} />
              </>
            ) : null}

            {position && !cropped ? (
              <rect
                className="box-outline"
                {...R(
                  NUT_X + (position.startFret - 1) * FRET_WIDTH,
                  boardTop + 3,
                  (position.endFret - position.startFret + 1) * FRET_WIDTH,
                  boardFoot - boardTop - 6,
                )}
                rx={7}
              />
            ) : null}

            {/*
             * The CAGED grip as one shape: a soft, rounded area around the notes it
             * stops. The rings on each note said WHICH notes; they never said that
             * they belong together as one hand shape, which is the whole lesson.
             */}
            {cagedHull ? <polygon className="caged-shape" points={cagedHull} /> : null}

            {Array.from({ length: fretCount + 1 }, (_, fret) => fret).map((fret) => {
              const [x, y] = P(numberX(fret), boardFoot + 24);
              return (
                <text
                  key={fret}
                  className={fret < capo ? 'fret-number is-muted' : 'fret-number'}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline={vertical ? 'central' : undefined}
                >
                  {fret}
                </text>
              );
            })}

            {ghosts.map(renderNote)}
            {notes.map(renderNote)}

            {cursorRect ? <rect className="neck-cursor" {...cursorRect} rx={8} /> : null}
          </g>

          {capo > 0
            ? (() => {
                const [x, y] = vertical
                  ? P(capoX, boardFoot + 24)
                  : P(capoX, boardTop - 10);
                return (
                  <text
                    className="capo-label"
                    x={vertical ? x : lefty ? Math.min(x, width - layout.labelX - 26) : Math.max(x, layout.labelX + 26)}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline={vertical ? 'central' : undefined}
                  >
                    {vertical ? `K${capo}` : `Kapo ${capo}`}
                  </text>
                );
              })()
            : null}

          {/* Outside the clip: the names live in the margin, not on the wood. */}
          {Array.from({ length: stringCount }, (_, stringIndex) => {
            const [x, y] = P(layout.labelX, stringY(stringIndex, stringCount));
            return (
              <text
                key={stringIndex}
                className="string-label"
                x={x}
                y={y}
                textAnchor={textAnchorAcross}
                dominantBaseline="central"
              >
                {labels[stringIndex]}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Spoken where the cursor lands, for anyone who cannot see the neck. */}
      <p className="sr-only" aria-live="polite">
        {focused ? announce : ''}
      </p>

      {onHoldNote ? (
        <p className="hint fretboard-hint">
          Antippen: Ton hören und jede Stelle mit diesem Ton finden — nochmal antippen
          hebt das wieder auf. Gedrückt halten lässt ihn klingen.
          {overflows
            ? lefty
              ? ' Der Hals geht links weiter — seitlich wischen.'
              : ' Der Hals geht rechts weiter — seitlich wischen.'
            : ''}
        </p>
      ) : null}
    </>
  );
}
