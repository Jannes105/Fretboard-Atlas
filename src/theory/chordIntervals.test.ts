import { describe, expect, it } from 'vitest';
import { Chord } from './Chord';
import { chordIntervals } from './chordIntervals';
import { Note } from './Note';

const labels = (symbol: string) => {
  const chord = Chord.parse(symbol);
  const intervals = chordIntervals(chord);
  return chord.notes.map((note) => intervals.get(note.pitchClass));
};

describe('chordIntervals', () => {
  it('zählt vom Akkordgrundton, nicht von der Tonart', () => {
    expect(labels('F')).toEqual(['1', '3', '5']);
    expect(labels('Am')).toEqual(['1', 'b3', '5']);
  });

  it('buchstabiert verminderte Quinten als b5, nie als #4', () => {
    expect(labels('Bdim')).toEqual(['1', 'b3', 'b5']);
    expect(labels('Bm7b5')).toEqual(['1', 'b3', 'b5', 'b7']);
  });

  it('nennt die Sekunde eines Fünfklangs None', () => {
    const chord = Chord.fromQuality(Note.parse('C'), 'major9');
    const intervals = chordIntervals(chord);
    expect(intervals.get(Note.parse('D').pitchClass)).toBe('9');
  });
});
