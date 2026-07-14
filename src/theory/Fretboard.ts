import { mod, type Note } from './Note';
import type { Scale } from './Scale';
import { Tuning } from './Tuning';

/** One playable position on the neck. */
export interface FretPosition {
  /** 0 = lowest string (6th/thickest). */
  readonly stringIndex: number;
  /** 0 = open string. */
  readonly fret: number;
  readonly midi: number;
  readonly pitchClass: number;
}

/**
 * One playing position — a "box" — of a scale: a stretch of neck you can cover
 * without shifting the hand.
 *
 * A box is nothing more than a five-fret window. The famous box 1 of the A minor
 * pentatonic (5th fret) is exactly "every scale note between fret 4 and 8"; box 2
 * is the window 7..11, and so on. The windows sit where the scale degrees fall on
 * the lowest string, which is what scalePositions computes.
 */
export interface ScalePosition {
  /** 1-based, the way guitarists number boxes. */
  readonly number: number;
  /** Fret the scale degree anchoring this box sits on, on the lowest string. */
  readonly anchorFret: number;
  readonly startFret: number;
  readonly endFret: number;
}

/**
 * How far a box reaches around its anchor. Five frets is what a hand covers, and
 * it is what makes the numbers come out right: two notes per string for a
 * pentatonic, three for a seven-note scale — never more.
 */
const BOX_BELOW = 1;
const BOX_ABOVE = 3;

/** A fret position that belongs to a given scale, carrying its role in that scale. */
export interface ScaleFretPosition extends FretPosition {
  /** The scale note sounding here, correctly spelled for the key. */
  readonly note: Note;
  /** Index of the note within the scale (0 = root). */
  readonly degreeIndex: number;
  /** Degree label relative to major, e.g. "1", "b3", "5". */
  readonly degree: string;
  /** True for the tonic — the visualisation highlights these differently. */
  readonly isRoot: boolean;
}

/**
 * The neck: a tuning plus a fret count. Turns a Scale into the set of positions
 * where it can be played, which is what the SVG view renders.
 */
export class Fretboard {
  readonly tuning: Tuning;
  /** Highest fret; 24 covers a two-octave neck. Fret 0 (open) is always included. */
  readonly fretCount: number;
  /** Fret the capo is clamped on; 0 = none. */
  readonly capo: number;

  constructor(tuning: Tuning = Tuning.STANDARD, fretCount: number = 24, capo: number = 0) {
    if (fretCount < 0) throw new Error(`fretCount ${fretCount} ist ungültig.`);
    if (capo < 0 || capo > fretCount) {
      throw new Error(`Kapo auf Bund ${capo} liegt nicht auf dem Hals (0..${fretCount}).`);
    }

    this.tuning = tuning;
    this.fretCount = fretCount;
    this.capo = capo;
  }

  get stringCount(): number {
    return this.tuning.stringCount;
  }

  /**
   * Lowest playable fret. A capo does not change any pitch — the note at fret 7 is
   * the same note with or without it. It only shortens the neck: everything below
   * the bar is out of reach, and the fret under the bar becomes the new "open".
   */
  get lowestFret(): number {
    return this.capo;
  }

  noteAt(stringIndex: number, fret: number): FretPosition {
    return {
      stringIndex,
      fret,
      midi: this.tuning.midiAt(stringIndex, fret),
      pitchClass: this.tuning.pitchClassAt(stringIndex, fret),
    };
  }

  /** Every reachable position: from the capo (or the nut) up to the last fret. */
  allPositions(): FretPosition[] {
    const positions: FretPosition[] = [];
    for (let stringIndex = 0; stringIndex < this.stringCount; stringIndex++) {
      for (let fret = this.lowestFret; fret <= this.fretCount; fret++) {
        positions.push(this.noteAt(stringIndex, fret));
      }
    }
    return positions;
  }

  /**
   * The playing positions ("boxes") of a scale, low to high.
   *
   * A scale with n notes has n boxes, and each one is anchored where one of its
   * degrees lands on the lowest string: box 1 on the root, box 2 on the second
   * degree, and so on up the neck. Because the degrees rise in order, so do the
   * boxes — for A minor pentatonic this lands on frets 5, 8, 10, 12 and 15, which
   * are precisely the five shapes every guitarist learns.
   *
   * Boxes running off the end of the neck are dropped; the last one may be clipped.
   */
  scalePositions(scale: Scale): ScalePosition[] {
    const openPitchClass = this.tuning.pitchClassAt(0, this.lowestFret);
    const rootPitchClass = scale.root.pitchClass;

    // Where the root sits on the lowest string, at or above the capo.
    const rootFret = this.lowestFret + mod(rootPitchClass - openPitchClass, 12);

    const positions: ScalePosition[] = [];

    scale.pitchClasses.forEach((pitchClass, degreeIndex) => {
      // Each degree, counted upwards from the root — so the anchors ascend.
      const anchorFret = rootFret + mod(pitchClass - rootPitchClass, 12);
      if (anchorFret > this.fretCount) return;

      positions.push({
        number: degreeIndex + 1,
        anchorFret,
        startFret: Math.max(anchorFret - BOX_BELOW, this.lowestFret),
        endFret: Math.min(anchorFret + BOX_ABOVE, this.fretCount),
      });
    });

    return positions;
  }

  /** Every position where a note of the scale sounds, annotated with its scale degree. */
  mapScale(scale: Scale): ScaleFretPosition[] {
    const result: ScaleFretPosition[] = [];

    for (const position of this.allPositions()) {
      const degreeIndex = scale.degreeIndexOf(position.pitchClass);
      if (degreeIndex === null) continue;

      result.push({
        ...position,
        note: scale.notes[degreeIndex],
        degreeIndex,
        degree: scale.degreeLabelOf(position.pitchClass)!,
        isRoot: scale.isRoot(position.pitchClass),
      });
    }

    return result;
  }

  /**
   * Frets carrying inlay dots. 12 and 24 are octave markers and get a double dot;
   * the view decides how to draw that.
   */
  inlayFrets(): { fret: number; double: boolean }[] {
    const singles = [3, 5, 7, 9];
    const inlays: { fret: number; double: boolean }[] = [];

    for (let fret = 1; fret <= this.fretCount; fret++) {
      const withinOctave = ((fret - 1) % 12) + 1;
      if (withinOctave === 12) {
        inlays.push({ fret, double: true });
      } else if (singles.includes(withinOctave)) {
        inlays.push({ fret, double: false });
      }
    }

    return inlays;
  }
}
