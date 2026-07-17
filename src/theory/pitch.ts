import type { Voicing } from './ChordShape';
import { mod } from './Note';
import type { Chord } from './Chord';
import type { Scale } from './Scale';
import type { Tuning } from './Tuning';

/**
 * Turning the music theory into something audible — but still pure. This file
 * computes MIDI numbers and frequencies; it never touches Web Audio or the DOM,
 * so it stays testable and on the theory side of the fence. The AudioContext
 * lives in src/audio.ts.
 */

/**
 * Anchor octave for playback: the lowest MIDI a played note may take. 57 = A3,
 * so scales sit roughly where a guitar sounds rather than up in a whistle range.
 */
export const DEFAULT_BASE_MIDI = 57;

/** Equal-tempered frequency of a MIDI note. 69 = A4 = 440 Hz by definition. */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** The pitch class placed on the lowest MIDI value at or above `baseMidi`. */
export function midiForPitchClass(pitchClass: number, baseMidi: number = DEFAULT_BASE_MIDI): number {
  return baseMidi + mod(pitchClass - baseMidi, 12);
}

export interface ScaleSequenceOptions {
  baseMidi?: number;
  /** Append the way back down to the root, so the scale is heard both directions. */
  descend?: boolean;
}

/**
 * The scale as a MIDI line, ascending from the root and closed with its octave —
 * C major from 60 is [60,62,64,65,67,69,71,72]. With `descend`, it walks back
 * down to the root without repeating the top note.
 */
export function scaleMidiSequence(scale: Scale, options: ScaleSequenceOptions = {}): number[] {
  const { baseMidi = DEFAULT_BASE_MIDI, descend = false } = options;

  const root = midiForPitchClass(scale.root.pitchClass, baseMidi);
  const ascending = [...scale.type.semitones.map((semitone) => root + semitone), root + 12];

  if (!descend) return ascending;
  return [...ascending, ...ascending.slice(0, -1).reverse()];
}

/**
 * The chord as a close, ascending voicing from its root — root, third, fifth and
 * (for a seventh chord) the seventh, all within one octave. A slash bass is added
 * an octave below, the way a bass player would take it, so C/G is heard as such.
 */
export function chordMidiTones(chord: Chord, baseMidi: number = DEFAULT_BASE_MIDI): number[] {
  const root = midiForPitchClass(chord.root.pitchClass, baseMidi);
  const tones = chord.notes.map(
    (note) => root + mod(note.pitchClass - chord.root.pitchClass, 12),
  );

  if (!chord.bass) return tones;
  return [midiForPitchClass(chord.bass.pitchClass, baseMidi) - 12, ...tones];
}

/** Just enough of a fretboard note to sound it: its actual pitch and pitch class. */
export interface PlayablePosition {
  readonly midi: number;
  readonly pitchClass: number;
}

/**
 * The distinct MIDI notes among `positions` whose pitch class is wanted, low to
 * high. This is how playback follows the fret: it sounds the real pitches shown
 * on the neck (in whatever box, tuning and capo are in effect) instead of a fixed
 * octave — and for a chord it plays every one of its tones that is on screen.
 */
export function positionsToMidi(
  positions: readonly PlayablePosition[],
  pitchClasses: readonly number[],
): number[] {
  const wanted = new Set(pitchClasses);
  const midis = positions.filter((p) => wanted.has(p.pitchClass)).map((p) => p.midi);
  return [...new Set(midis)].sort((a, b) => a - b);
}

/**
 * What a grip actually sounds, low string first — muted strings dropped.
 *
 * This is the honest voicing: the pitches under the fingers in the shape being
 * shown, in the tuning being used (capo included, since a capoed tuning is just
 * a tuning). Unlike chordMidiTones it doubles octaves and unisons exactly the way
 * the six strings do.
 */
export function voicingMidi(voicing: Voicing, tuning: Tuning): number[] {
  return voicing.frets
    .map((fret, stringIndex) => (fret < 0 ? null : tuning.midiAt(stringIndex, fret)))
    .filter((midi): midi is number => midi !== null);
}
