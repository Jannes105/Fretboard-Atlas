import { describe, expect, it } from 'vitest';
import { CAGED_SHAPES, cagedPlacement, cagedPlacements, type CagedForm } from './caged';
import { Chord } from './Chord';
import { Note } from './Note';
import { ROOT_CHOICES } from './Scale';
import { Tuning } from './Tuning';

/** What a placement actually sounds, muted strings dropped. */
function soundingPitchClasses(
  frets: readonly number[],
  tuning: Tuning = Tuning.STANDARD,
): Set<number> {
  const pitchClasses = frets
    .map((fret, stringIndex) => (fret < 0 ? null : tuning.pitchClassAt(stringIndex, fret)))
    .filter((pitchClass): pitchClass is number => pitchClass !== null);
  return new Set(pitchClasses);
}

describe('CAGED-Formen klingen wie der Akkord, den sie behaupten', () => {
  it('spielt jede Form auf jedem Grundton nach', () => {
    // Dieselbe Pruefung, die ChordShape.test.ts fuer die Griffe macht: die Formen
    // sind nicht auf gut Glueck abgetippt, sondern nachgerechnet.
    for (const root of ROOT_CHOICES) {
      for (const quality of ['major', 'minor'] as const) {
        const chord = Chord.fromQuality(Note.parse(root), quality);

        for (const placement of cagedPlacements(chord, { maxFret: 24 })) {
          const sounding = soundingPitchClasses(placement.frets);
          expect(
            sounding,
            `${chord.name()} ${placement.form}-Form auf Bund ${placement.baseFret}`,
          ).toEqual(new Set(chord.pitchClasses));
        }
      }
    }
  });

  it('laesst den Grundton auf der Saite liegen, die die Form dafuer vorsieht', () => {
    for (const root of ROOT_CHOICES) {
      const chord = Chord.fromQuality(Note.parse(root), 'major');

      for (const placement of cagedPlacements(chord, { maxFret: 24 })) {
        const shape = CAGED_SHAPES.find(
          (candidate) => candidate.form === placement.form && candidate.qualityId === 'major',
        )!;
        const fret = placement.frets[shape.rootString];
        expect(Tuning.STANDARD.pitchClassAt(shape.rootString, fret)).toBe(chord.root.pitchClass);
      }
    }
  });

  it('bietet fuer einen Dur-Akkord alle fuenf Formen an', () => {
    const forms = cagedPlacements(Chord.fromQuality(Note.parse('C'), 'major'), {
      maxFret: 24,
    }).map((placement) => placement.form);

    expect(new Set(forms)).toEqual(new Set<CagedForm>(['C', 'A', 'G', 'E', 'D']));
  });

  it('bietet in Moll nur die drei Formen an, die man wirklich greift', () => {
    // Cm- und Gm-Form sind herleitbar, aber als Barre-Griff spielt sie niemand.
    const forms = cagedPlacements(Chord.fromQuality(Note.parse('A'), 'minor'), {
      maxFret: 24,
    }).map((placement) => placement.form);

    expect(new Set(forms)).toEqual(new Set<CagedForm>(['A', 'E', 'D']));
  });

  it('sortiert die Formen so, wie sie den Hals hinaufliegen', () => {
    const placements = cagedPlacements(Chord.fromQuality(Note.parse('C'), 'major'), {
      maxFret: 24,
    });
    const frets = placements.map((placement) => placement.baseFret);
    expect([...frets].sort((a, b) => a - b)).toEqual(frets);
  });
});

describe('CAGED und die Stimmung', () => {
  it('schweigt in einer Stimmung mit anderen Saitenabstaenden', () => {
    // In Drop D aendern C-, G- und E-Form ihre Gestalt. Lieber keine Form zeigen
    // als eine falsche — dieselbe Regel, nach der voicingsFor dort [] liefert.
    const cMajor = Chord.fromQuality(Note.parse('C'), 'major');
    expect(cagedPlacements(cMajor, { tuning: Tuning.DROP_D })).toEqual([]);
  });

  it('gilt in Eb unveraendert, weil die Abstaende dieselben sind', () => {
    const cMajor = Chord.fromQuality(Note.parse('C'), 'major');
    expect(cagedPlacements(cMajor, { tuning: Tuning.EB })).toHaveLength(5);
  });

  it('rechnet mit Kapo die Buende ab dem Kapo — und klingt trotzdem richtig', () => {
    const capoed = Tuning.STANDARD.withCapo(2);
    const cMajor = Chord.fromQuality(Note.parse('C'), 'major');

    for (const placement of cagedPlacements(cMajor, { tuning: capoed, maxFret: 24 })) {
      expect(
        soundingPitchClasses(placement.frets, capoed),
        `${placement.form}-Form mit Kapo 2`,
      ).toEqual(new Set(cMajor.pitchClasses));
    }
  });

  it('schiebt eine Form, die hinter den Kapo fiele, eine Oktave hoch', () => {
    // Die C-Form fuer C laege mit Kapo 2 zwei Buende VOR dem Kapo, also ausser
    // Reichweite. Statt einer unspielbaren Angabe kommt dieselbe Form eine Oktave
    // hoeher — dieselbe Rechnung, die namedVoicings fuer die Griffe anstellt.
    const cMajor = Chord.fromQuality(Note.parse('C'), 'major');
    const capo2 = cagedPlacement(cMajor, 'C', { tuning: Tuning.STANDARD.withCapo(2) })!;

    expect(capo2.baseFret).toBe(10);
  });
});

describe('cagedPlacement — eine benannte Form', () => {
  it('findet die gesuchte Form', () => {
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    expect(cagedPlacement(aMajor, 'E')!.form).toBe('E');
  });

  it('gibt null, wo es die Form nicht gibt', () => {
    const aMinor = Chord.fromQuality(Note.parse('A'), 'minor');
    expect(cagedPlacement(aMinor, 'G')).toBeNull();
  });

  it('gibt null, wenn die Form nicht mehr auf den Hals passt', () => {
    const chord = Chord.fromQuality(Note.parse('G'), 'major');
    expect(cagedPlacement(chord, 'D', { maxFret: 4 })).toBeNull();
  });
});
