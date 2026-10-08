import { useEffect, useMemo, useState } from 'react';
import type { ChordTones, Spelling } from '../components/FretboardView';
import { type Chord, chordIntervals, type FretPosition, pitchClassNames, type Scale } from '../theory';

/**
 * What is picked out on the neck. A chord, a scale degree and a single note are
 * the same idea — "show me these tones" — so they share one slot, and picking one
 * clears the other.
 *
 * `midi` is the exact pitch that was touched on the neck, when it was: every dot
 * of that very pitch gets a ring, so "this C" reads apart from "every C".
 */
export type Highlight =
  | { kind: 'chord'; index: number }
  | { kind: 'degree'; index: number; midi?: number }
  | { kind: 'pitch'; pitchClass: number; midi: number }
  | null;

export interface Picked {
  pitchClasses: readonly number[];
  /** Name for the neck's accessible label. */
  label: string;
  chordTones: ChordTones | null;
  unisonMidi: number | null;
}

/** "C4" — scientific pitch notation, MIDI 60 = C4. */
function withOctave(name: string, midi: number): string {
  return `${name}${Math.floor(midi / 12) - 1}`;
}

export function useHighlight(chords: readonly Chord[], scale: Scale | null, spelling: Spelling) {
  const [highlight, setHighlight] = useState<Highlight>(null);

  // A key arriving or leaving changes what every highlight means — a degree needs
  // a key, a bare pitch belongs to the keyless map — so neither survives it.
  const hasKey = scale !== null;
  useEffect(() => setHighlight(null), [hasKey]);

  const picked = useMemo<Picked | null>(() => {
    if (highlight === null) return null;

    if (highlight.kind === 'chord') {
      const chord = chords[highlight.index];
      if (!chord) return null;
      return {
        pitchClasses: chord.pitchClasses,
        label: chord.name(),
        chordTones: {
          root: chord.root.pitchClass,
          names: new Map(chord.notes.map((note) => [note.pitchClass, note.name()])),
          intervals: chordIntervals(chord),
        },
        unisonMidi: null,
      };
    }

    if (highlight.kind === 'pitch') {
      const names = pitchClassNames(highlight.pitchClass);
      const name = spelling === 'flat' && names.length > 1 ? names[1] : names[0];
      return {
        pitchClasses: [highlight.pitchClass],
        label: withOctave(name, highlight.midi),
        chordTones: null,
        unisonMidi: highlight.midi,
      };
    }

    const note = scale?.notes[highlight.index];
    if (!note) return null;
    return {
      pitchClasses: [note.pitchClass],
      label: `Stufe ${scale.degreeLabelOf(note.pitchClass)}`,
      chordTones: null,
      unisonMidi: highlight.midi ?? null,
    };
  }, [highlight, chords, scale, spelling]);

  /**
   * A dot on the neck was touched: pick out every place that note lives. Under a
   * key that is its degree, so the chip below lights up with it; without one it is
   * the bare pitch.
   *
   * Except while a chord is picked out. Playing over a chord is exactly what the
   * chord highlight is for, and every note touched would otherwise wipe it.
   */
  const pickNote = (position: FretPosition) => {
    if (highlight?.kind === 'chord') return;
    if (scale === null) {
      setHighlight({ kind: 'pitch', pitchClass: position.pitchClass, midi: position.midi });
      return;
    }
    const index = scale.notes.findIndex((note) => note.pitchClass === position.pitchClass);
    if (index >= 0) setHighlight({ kind: 'degree', index, midi: position.midi });
  };

  /**
   * Escape clears the highlight — the way out that does not depend on scrolling
   * back to a link. An open panel owns Escape first: closing a drawer must not
   * also wipe the neck. Every panel shares the `.popover` class.
   */
  useEffect(() => {
    if (highlight === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.popover')) return;
      setHighlight(null);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [highlight]);

  return {
    highlight,
    setHighlight,
    picked,
    pickNote,
    clear: () => setHighlight(null),
    isChordActive: (index: number) => highlight?.kind === 'chord' && highlight.index === index,
    isDegreeActive: (index: number) => highlight?.kind === 'degree' && highlight.index === index,
  };
}
