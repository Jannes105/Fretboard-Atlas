import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioPlayer, ProgressionHandle } from '../audio';
import { type NoteLength, parsePattern, type StrumStyle } from '../theory';

export interface TransportOptions {
  /** The notes of each chord, ready to play — already the grips shown on screen. */
  chordNotes: readonly (readonly number[])[];
  /** Bars each chord is held, aligned with chordNotes. */
  chordBars: readonly number[];
  bpm: number;
  beatsPerBar: number;
  /** Strum pattern as a d/u/- string. */
  rhythm: string;
  /** Brushed together, or walked across the whole bar. */
  style: StrumStyle;
  /** Left to ring on, or cut off after each strum. */
  length: NoteLength;
  loop: boolean;
  /** Lazily built, so no AudioContext exists before the first gesture. */
  player: () => AudioPlayer;
  /**
   * Anything that changes the material being played — new key, new grips, new
   * tuning. A running loop must stop rather than carry on with chords that are no
   * longer on screen.
   */
  material: readonly unknown[];
}

export interface TransportHandle {
  /** Index of the chord sounding right now, or null when stopped. */
  playingStep: number | null;
  isPlaying: boolean;
  toggle: () => void;
  stop: () => void;
}

/**
 * Drives the progression transport: start, stop, and the three rules that keep it
 * honest — stop on unmount, stop when the material changes, but pick up tempo and
 * rhythm changes mid-take instead of cutting the take off.
 */
export function useTransport({
  chordNotes,
  chordBars,
  bpm,
  beatsPerBar,
  rhythm,
  style,
  length,
  loop,
  player,
  material,
}: TransportOptions): TransportHandle {
  const [playingStep, setPlayingStep] = useState<number | null>(null);
  const handleRef = useRef<ProgressionHandle | null>(null);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPlayingStep(null);
  }, []);

  const start = () => {
    handleRef.current = player().startProgression(chordNotes, {
      // A bar is beatsPerBar beats at the current tempo; each chord holds its bars.
      secondsPerBar: (beatsPerBar * 60) / bpm,
      beatsPerBar,
      pattern: parsePattern(rhythm, beatsPerBar),
      chordBars,
      style,
      length,
      loop,
      onChord: (index) => {
        setPlayingStep(index);
        // A run that ends on its own must clear the handle too, or a nudge of the
        // tempo would "restart" a take that already finished.
        if (index === null) handleRef.current = null;
      },
    });
  };

  // Leaving the page with a loop still armed would keep scheduling forever.
  useEffect(() => stop, [stop]);

  // Different material — the loop would otherwise carry on with chords that are
  // no longer on screen.
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...material, stop]);

  // Tempo, meter and rhythm are the knobs you reach for WHILE practising, so those
  // pick up straight away instead of stopping the take.
  const restartRef = useRef(start);
  restartRef.current = start;
  useEffect(() => {
    if (handleRef.current) restartRef.current();
  }, [bpm, loop, beatsPerBar, rhythm, style, length]);

  const isPlaying = playingStep !== null;

  return {
    playingStep,
    isPlaying,
    toggle: () => (isPlaying ? stop() : start()),
    stop,
  };
}
