import { useMemo } from 'react';
import {
  cagedPlacements,
  characteristicTone,
  diatonicChords,
  Fretboard,
  Note,
  Scale,
  SCALE_TYPES,
  Tuning,
} from '../theory';
import { type AppState, customTuningNotes } from '../urlState';

type NeckInputs = Pick<
  AppState,
  'root' | 'scaleTypeId' | 'tuningId' | 'fretCount' | 'capo' | 'chordSize' | 'cagedForm' | 'boxNumber'
>;

/**
 * Everything the URL state implies about the neck and the key on it — derived
 * values only, no state of their own.
 *
 * Lifted out of App so App reads as what is on the page rather than as two
 * hundred lines of memo before the first element.
 */
export function useNeckModel({
  root,
  scaleTypeId,
  tuningId,
  fretCount,
  capo,
  chordSize,
  cagedForm,
  boxNumber,
}: NeckInputs) {
  /**
   * The key on the neck — or null, which is the app's opening state: every note
   * named, nothing picked out. Everything that needs a root hangs off this being
   * non-null: degrees, boxes, CAGED, the diatonic chords and with them the whole
   * progression half of the page.
   */
  const scale = useMemo(() => {
    if (scaleTypeId === null) return null;
    const type = SCALE_TYPES.find((t) => t.id === scaleTypeId) ?? SCALE_TYPES[0];
    return new Scale(Note.parse(root), type);
  }, [root, scaleTypeId]);

  const tuning = useMemo(() => {
    const notes = customTuningNotes(tuningId);
    if (notes) {
      try {
        return Tuning.fromNoteNames(notes);
      } catch {
        return Tuning.STANDARD; // a mistyped custom tuning should not crash the app
      }
    }
    return Tuning.byId(tuningId);
  }, [tuningId]);

  const isCustomTuning = customTuningNotes(tuningId) !== null;

  const fretboard = useMemo(
    () => new Fretboard(tuning, fretCount, Math.min(capo, fretCount)),
    [tuning, fretCount, capo],
  );

  /**
   * Chord shapes are fretted relative to the capo, so the capo goes into the
   * tuning handed to the voicing search rather than into the fret numbers.
   */
  const chordTuning = useMemo(() => tuning.withCapo(capo), [tuning, capo]);

  /**
   * The key the harmony comes from. For a seven-note scale that is the scale
   * itself; a pentatonic or the blues scale borrows from the key behind it, on the
   * same root. Everything chord-shaped hangs off this rather than off `scale`.
   */
  const chordScale = useMemo(() => scale?.chordSource() ?? null, [scale]);

  const chords = useMemo(
    () => (chordScale ? diatonicChords(chordScale, chordSize) : []),
    [chordScale, chordSize],
  );

  /** True when the chords on screen are not the scale's own. */
  const isBorrowedHarmony = chordScale !== null && chordScale !== scale;

  /**
   * The CAGED forms of the key's tonic chord — "the box you are in is the E-shape
   * of A". Empty outside standard-interval tunings, where the forms would be wrong.
   */
  const tonicChord = chords[0] ?? null;

  const cagedForms = useMemo(
    () =>
      tonicChord ? cagedPlacements(tonicChord, { tuning: chordTuning, maxFret: fretCount }) : [],
    [tonicChord, chordTuning, fretCount],
  );

  const caged = cagedForms.find((placement) => placement.form === cagedForm) ?? null;

  // No key, no boxes: a position is a window onto a scale, and there is none.
  const boxes = useMemo(() => (scale ? fretboard.scalePositions(scale) : []), [fretboard, scale]);

  // A box number from the URL — or left over from another scale — may not exist here.
  const box = boxes.find((b) => b.number === boxNumber) ?? null;

  // The notes on screen with their real pitches (tuning + capo baked in). Playback
  // derives from these, so what you hear matches what you see.
  const visiblePositions = useMemo(() => {
    if (scale === null) return [];
    const all = fretboard.mapScale(scale);
    return box ? all.filter((p) => p.fret >= box.startFret && p.fret <= box.endFret) : all;
  }, [fretboard, scale, box]);

  /**
   * Positions to sound a CHORD from. A borrowed chord reaches outside the scale —
   * the VI of A minor pentatonic is F–A–C, and there is no F on a pentatonic neck —
   * so it sounds from its parent key's map. Still filtered by the box, so a chord
   * keeps the register of the position you are looking at.
   */
  const chordPositions = useMemo(() => {
    if (chordScale === null || chordScale === scale) return visiblePositions;
    const all = fretboard.mapScale(chordScale);
    return box ? all.filter((p) => p.fret >= box.startFret && p.fret <= box.endFret) : all;
  }, [fretboard, chordScale, scale, box, visiblePositions]);

  /** The tone this mode is recognised by, if it has one. */
  const characteristic = useMemo(() => {
    if (scale === null) return null;
    const tone = characteristicTone(scale.type);
    if (tone === null) return null;
    const note = scale.notes[tone.index];
    return note ? { index: tone.index, note, why: tone.why } : null;
  }, [scale]);

  const isMinorTonic = tonicChord?.quality?.id.startsWith('minor') ?? false;

  return {
    scale,
    tuning,
    isCustomTuning,
    fretboard,
    chordTuning,
    chordScale,
    chords,
    isBorrowedHarmony,
    cagedForms,
    caged,
    isMinorTonic,
    boxes,
    box,
    visiblePositions,
    chordPositions,
    characteristic,
  };
}
