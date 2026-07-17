import { describe, expect, it } from 'vitest';
import { Chord } from './Chord';
import { voicingsFor } from './ChordShape';
import { mod, Note } from './Note';
import { ROOT_CHOICES } from './Scale';
import { Tuning } from './Tuning';
import { generateVoicings } from './voicingSearch';

/** The pitch classes a grip actually sounds, low string first. */
function soundingPitchClasses(tuning: Tuning, frets: readonly number[]): number[] {
  return frets
    .map((fret, string) => (fret < 0 ? null : tuning.pitchClassAt(string, fret)))
    .filter((pitchClass): pitchClass is number => pitchClass !== null);
}

/** Every chord quality the app can build — including the ones without a hand shape. */
const QUALITY_IDS = [
  'major',
  'minor',
  'diminished',
  'augmented',
  'major7',
  'dominant7',
  'minor7',
  'minor7b5',
  'diminished7',
  'minorMajor7',
  'augmentedMajor7',
  'power',
  'sus2',
  'sus4',
  'sixth',
  'minor6',
];

const MAX_FRET = 15;

/**
 * Asserts a grip is honest: it sounds no foreign note, carries the bass on its
 * lowest string, keeps every chord tone but (at most) the fifth, and fits a hand.
 */
function expectPlayable(chord: Chord, tuning: Tuning, frets: readonly number[], label: string) {
  const sounding = soundingPitchClasses(tuning, frets);
  const allowed = new Set(chord.pitchClasses);

  // No foreign tone.
  for (const pitchClass of sounding) {
    expect(allowed.has(pitchClass), `${label}: fremder Ton ${pitchClass}`).toBe(true);
  }

  // The bass sits on the lowest sounding string.
  const bassPitchClass = (chord.bass ?? chord.root).pitchClass;
  expect(sounding[0], `${label}: Bass unten`).toBe(bassPitchClass);

  // Every chord tone present, except the fifth may be dropped for a hard grip.
  const fifth = mod(chord.root.pitchClass + 7, 12);
  const heard = new Set(sounding);
  for (const pitchClass of allowed) {
    if (pitchClass === fifth && pitchClass !== bassPitchClass) continue;
    expect(heard.has(pitchClass), `${label}: fehlender Akkordton ${pitchClass}`).toBe(true);
  }

  // Fits the five-fret diagram window and the neck.
  const fretted = frets.filter((fret) => fret > 0);
  expect(Math.max(...fretted) - Math.min(...fretted), `${label}: Spanne`).toBeLessThanOrEqual(4);
  expect(Math.max(...frets), `${label}: im Griffbrett`).toBeLessThanOrEqual(MAX_FRET);
  expect(frets.filter((fret) => fret >= 0).length, `${label}: genug Saiten`).toBeGreaterThanOrEqual(3);
}

describe('generateVoicings — jeder Akkord ist spielbar und klingt richtig', () => {
  for (const tuning of [Tuning.STANDARD, Tuning.DROP_D]) {
    it(`findet für jede Qualität auf jedem Grundton einen korrekten Griff (${tuning.name})`, () => {
      for (const qualityId of QUALITY_IDS) {
        for (const rootName of ROOT_CHOICES) {
          const chord = Chord.fromQuality(Note.parse(rootName), qualityId);
          const voicings = generateVoicings(chord, tuning, MAX_FRET);
          const label = `${tuning.id}/${chord.name()}`;

          expect(voicings.length, `${label}: mindestens ein Griff`).toBeGreaterThan(0);
          for (const voicing of voicings) {
            expectPlayable(chord, tuning, voicing.frets, label);
          }
        }
      }
    });
  }
});

describe('generateVoicings — Slash-Akkorde bekommen einen Griff mit Bass unten', () => {
  const SLASH = ['C/G', 'D/F#', 'G/B', 'F/A', 'Am/C', 'Dm/F', 'C/E', 'G/D'];

  it('legt bei jedem Slash-Akkord den Fremdbass auf die tiefste Saite', () => {
    for (const symbol of SLASH) {
      const chord = Chord.parse(symbol);
      const voicings = generateVoicings(chord, Tuning.STANDARD, MAX_FRET);

      expect(voicings.length, `${symbol}: mindestens ein Griff`).toBeGreaterThan(0);
      for (const voicing of voicings) {
        expectPlayable(chord, Tuning.STANDARD, voicing.frets, symbol);
      }
    }
  });
});

describe('voicingsFor — Verteiler zwischen Hand-Formen und Generator', () => {
  it('lässt die geläufigen Akkorde bei ihren benannten Formen', () => {
    const cMajor = voicingsFor(Chord.parse('C'));
    expect(cMajor.length).toBeGreaterThan(0);
    // Hand-Formen tragen einen Namen; generierte Griffe nicht.
    expect(cMajor.every((v) => v.shapeName !== '')).toBe(true);
  });

  it('greift für Akkorde ohne Hand-Form auf den Generator zurück', () => {
    const cSix = voicingsFor(Chord.parse('C6'));
    expect(cSix.length).toBeGreaterThan(0);
    expect(cSix.every((v) => v.shapeName === '')).toBe(true);

    // Slash-Akkorde haben jetzt einen Griff, statt leer zu bleiben.
    const cOverG = voicingsFor(Chord.parse('C/G'));
    expect(cOverG.length).toBeGreaterThan(0);
    expect(cOverG[0].shapeName).toBe('');
  });
});
