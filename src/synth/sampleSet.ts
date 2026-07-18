/**
 * Picking the right recording for a note.
 *
 * The app ships a dozen recorded notes per voice, not one per fret — the gaps are
 * covered by playing the nearest recording faster or slower. This is the whole of
 * that decision, kept as a pure function so it can be checked without an
 * AudioContext: which file, and at what rate.
 */

/** One recorded note: the pitch it was played at, and the file holding it. */
export interface SampleEntry {
  readonly midi: number;
  readonly file: string;
}

/** Every recording of one voice, as loaded from public/samples/manifest.json. */
export type SampleSet = readonly SampleEntry[];

export interface SampleChoice {
  readonly file: string;
  /**
   * How much to speed the recording up or down. 1 plays it as recorded; 2 is an
   * octave up. Web Audio changes pitch and tempo together here, exactly like
   * speeding up a record — which is why the stretch has to stay small.
   */
  readonly playbackRate: number;
}

/**
 * The recording closest in pitch to `midi`, and the rate that lands it on target.
 *
 * Closest rather than nearest-below, because stretching is least audible when it is
 * smallest, and a semitone up sounds no worse than a semitone down.
 */
export function sampleFor(midi: number, set: SampleSet): SampleChoice | null {
  if (set.length === 0) return null;

  let best = set[0];
  for (const entry of set) {
    if (Math.abs(entry.midi - midi) < Math.abs(best.midi - midi)) best = entry;
  }

  return {
    file: best.file,
    // Twelve equal semitones to the octave, so each one is a factor of 2^(1/12).
    playbackRate: Math.pow(2, (midi - best.midi) / 12),
  };
}

/** How far a note has to be stretched from its recording, in semitones. */
export function stretchSemitones(midi: number, set: SampleSet): number {
  const choice = sampleFor(midi, set);
  return choice === null ? 0 : Math.abs(12 * Math.log2(choice.playbackRate));
}
