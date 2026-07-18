import { describe, expect, it } from 'vitest';
import manifest from '../../public/samples/manifest.json';
import { sampleFor, stretchSemitones, type SampleSet } from './sampleSet';

/**
 * These run against the real manifest, not a fixture. The interesting failure is not
 * "the maths is wrong" — it is "the shipped set has a hole in it", and only the real
 * file can catch that. Rebuilding the samples with a coarser grid should break these.
 */
const VOICES: readonly (readonly [string, SampleSet])[] = [['electric', manifest.electric]];

/** Low E open (40) to the 24th fret of the high E (88) — everything the app can play. */
const LOWEST = 40;
const HIGHEST = 88;
/** Above here only the top few frets reach, and the grid thins out to save bytes. */
const CHORD_RANGE_TOP = 76;

describe('sampleFor', () => {
  it.each(VOICES)('covers the whole neck for %s', (_voice, set) => {
    for (let midi = LOWEST; midi <= HIGHEST; midi++) {
      expect(sampleFor(midi, set)).not.toBeNull();
    }
  });

  it.each(VOICES)('stretches %s no further than the grid allows', (_voice, set) => {
    for (let midi = LOWEST; midi <= HIGHEST; midi++) {
      // Four semitones is the worst case, and only at the very top of a 24-fret
      // neck. Beyond that a recording starts sounding like a different instrument.
      expect(stretchSemitones(midi, set), `MIDI ${midi}`).toBeLessThanOrEqual(4.001);
    }
  });

  it.each(VOICES)('keeps %s tight where chords actually live', (_voice, set) => {
    for (let midi = LOWEST; midi <= CHORD_RANGE_TOP; midi++) {
      expect(stretchSemitones(midi, set), `MIDI ${midi}`).toBeLessThanOrEqual(3.001);
    }
  });

  it('plays a recorded note at its own speed', () => {
    for (const [, set] of VOICES) {
      for (const entry of set) {
        expect(sampleFor(entry.midi, set)).toEqual({ file: entry.file, playbackRate: 1 });
      }
    }
  });

  it('takes the nearest recording, above or below', () => {
    const set: SampleSet = [
      { midi: 48, file: 'a.mp3' },
      { midi: 60, file: 'b.mp3' },
    ];

    expect(sampleFor(50, set)?.file).toBe('a.mp3');
    expect(sampleFor(58, set)?.file).toBe('b.mp3');
  });

  it('speeds up to go higher and slows down to go lower', () => {
    const set: SampleSet = [{ midi: 60, file: 'a.mp3' }];

    expect(sampleFor(72, set)?.playbackRate).toBeCloseTo(2, 6); // an octave up
    expect(sampleFor(48, set)?.playbackRate).toBeCloseTo(0.5, 6); // an octave down
    expect(sampleFor(61, set)?.playbackRate).toBeCloseTo(1.059463, 5); // one semitone
  });

  it('has nothing to offer from an empty set', () => {
    expect(sampleFor(60, [])).toBeNull();
    expect(stretchSemitones(60, [])).toBe(0);
  });

  it.each(VOICES)('names files that the manifest actually ships for %s', (_voice, set) => {
    expect(set.length).toBeGreaterThan(0);
    for (const entry of set) {
      expect(entry.file).toMatch(/^[a-z]+-\d+\.mp3$/);
      expect(Number.isInteger(entry.midi)).toBe(true);
    }
  });
});
