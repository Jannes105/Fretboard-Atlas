import { mod } from './Note';
import type { Chord } from './Chord';
import type { Scale } from './Scale';

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
 * (for a seventh chord) the seventh, all within one octave.
 */
export function chordMidiTones(chord: Chord, baseMidi: number = DEFAULT_BASE_MIDI): number[] {
  const root = midiForPitchClass(chord.root.pitchClass, baseMidi);
  return chord.pitchClasses.map((pitchClass) => root + mod(pitchClass - chord.root.pitchClass, 12));
}
