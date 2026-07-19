/**
 * Where things sit on the drawn neck.
 *
 * Presentation, not music — which is why this lives beside the component and not
 * in `theory/`. Frets are evenly spaced: this is a scale map, not a photo of a
 * neck. Extracted from FretboardView so the view window can be worked out and
 * tested without rendering, and so the overlays drawn on top share one source of
 * truth for "where is fret 7 on string 3".
 */

/** Open-string name, far left of the board. */
export const LABEL_X = 16;
/** How far left of the nut (or capo) the open-string dots sit. */
export const OPEN_OFFSET = 32;
export const NUT_X = 74;
export const FRET_WIDTH = 58;
export const STRING_GAP = 36;
export const TOP_Y = 44;
export const DOT_RADIUS = 13;
export const ROOT_RADIUS = 16;
/** A real neck is wider than the span of its strings. */
export const BOARD_MARGIN = 18;
/**
 * Vertical offset of the two dots on octave frets. A whole STRING_GAP would put
 * them right on a string, where the note dots hide them — 0.85 lands between.
 */
export const DOUBLE_INLAY_OFFSET = STRING_GAP * 0.85;

/**
 * Room kept at the left edge of a cropped view for the string names. Without it a
 * crop that starts at fret 9 would slice them off — they sit left of the board,
 * not on it.
 */
export const LABEL_GUTTER = 46;

/** Y of a string. String 0 is the low E and sits at the bottom, as on a chart. */
export function stringY(stringIndex: number, stringCount: number): number {
  return TOP_Y + (stringCount - 1 - stringIndex) * STRING_GAP;
}

/** Middle of a fret space — where inlays and fret numbers physically belong. */
export function fretCenterX(fret: number): number {
  return NUT_X + (fret - 0.5) * FRET_WIDTH;
}

/** Where a note dot goes. The lowest playable fret is drawn as an open string. */
export function noteX(fret: number, capo: number): number {
  return fret === capo ? NUT_X + capo * FRET_WIDTH - OPEN_OFFSET : fretCenterX(fret);
}

export function numberX(fret: number): number {
  return fret === 0 ? NUT_X - OPEN_OFFSET : fretCenterX(fret);
}

/** Left edge of the drawn board — left of the nut, so open-string dots sit on wood. */
export const BOARD_LEFT = NUT_X - OPEN_OFFSET - 16;

export interface NeckLayout {
  /** Full drawing width, whatever the view window shows of it. */
  readonly width: number;
  readonly height: number;
  readonly boardTop: number;
  readonly boardBottom: number;
  readonly boardFoot: number;
  readonly inlayY: number;
  /** The `viewBox` attribute — the whole neck, or a window onto part of it. */
  readonly viewBox: string;
  /** Frets actually on screen, which drives the minimum width. */
  readonly visibleFrets: number;
  /** X where the board rect starts; moves right when a crop reserves a gutter. */
  readonly boardLeft: number;
  /** X of the string names, which follow the left edge of the window. */
  readonly labelX: number;
}

export interface CropWindow {
  readonly startFret: number;
  readonly endFret: number;
}

/**
 * The drawing box for a neck, optionally cropped to one position.
 *
 * A crop keeps one fret of air on either side of the box: those neighbours are
 * dimmed, and seeing them is a useful cue about what lies just outside the hand.
 */
export function neckLayout(
  fretCount: number,
  stringCount: number,
  crop: CropWindow | null = null,
): NeckLayout {
  const boardTop = TOP_Y - BOARD_MARGIN;
  const boardBottom = stringY(0, stringCount);
  const boardFoot = boardBottom + BOARD_MARGIN;

  const width = NUT_X + fretCount * FRET_WIDTH + 20;
  const height = boardFoot + 42;
  const inlayY = (TOP_Y + boardBottom) / 2;

  if (crop === null) {
    return {
      width,
      height,
      boardTop,
      boardBottom,
      boardFoot,
      inlayY,
      viewBox: `0 0 ${width} ${height}`,
      visibleFrets: fretCount,
      boardLeft: BOARD_LEFT,
      labelX: LABEL_X,
    };
  }

  // One fret of air either side, then the gutter the string names need.
  const firstFret = Math.max(0, crop.startFret - 1);
  const lastFret = Math.min(fretCount, crop.endFret + 1);

  const viewLeft = Math.max(0, NUT_X + (firstFret - 1) * FRET_WIDTH - LABEL_GUTTER);
  const viewRight = Math.min(width, NUT_X + lastFret * FRET_WIDTH + 12);

  return {
    width,
    height,
    boardTop,
    boardBottom,
    boardFoot,
    inlayY,
    viewBox: `${viewLeft} 0 ${viewRight - viewLeft} ${height}`,
    visibleFrets: lastFret - firstFret + 1,
    // The board must not start inside the gutter, or it would cover the names.
    boardLeft: Math.max(BOARD_LEFT, viewLeft + LABEL_GUTTER),
    labelX: viewLeft + LABEL_X,
  };
}
