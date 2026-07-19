import { describe, expect, it } from 'vitest';
import { Tuning } from './Tuning';

describe('Tuning — Beschreibung', () => {
  it('leitet die Saitennamen aus den Tonhöhen ab, statt sie im Namen zu wiederholen', () => {
    expect(Tuning.STANDARD.description).toBe('Standard (E-A-D-G-B-E)');
    expect(Tuning.DROP_D.description).toBe('Drop D (D-A-D-G-B-E)');
    expect(Tuning.EB.description).toBe('Eb Standard (Eb-Ab-Db-Gb-Bb-Eb)');
  });

  it('gibt Eb dieselben Saitenabstände wie Standard — daher dieselben Griffe', () => {
    // Nicht die Tonhöhen entscheiden über die Akkordformen, sondern die Abstände
    // zwischen den Saiten. Eb verschiebt alle sechs gleich, wie ein Kapo nach unten.
    expect(Tuning.EB.intervals).toEqual(Tuning.STANDARD.intervals);
    expect(Tuning.EB.openStrings.map((midi) => midi + 1)).toEqual([
      ...Tuning.STANDARD.openStrings,
    ]);
  });

  it('beschreibt auch eine gekapodete Stimmung mit den Tönen, die dann wirklich klingen', () => {
    // Kapo im 3. Bund: aus E-A-D-G-B-E wird G-C-F-Bb-D-G. Ein von Hand gepflegter
    // Name hätte hier weiter die offenen Saiten behauptet.
    expect(Tuning.STANDARD.withCapo(3).description).toBe('Standard + Kapo 3 (G-C-F-Bb-D-G)');
  });

  it('hält den Namen kurz genug, um ihn nebenbei anzuzeigen', () => {
    for (const tuning of Tuning.ALL) {
      expect(tuning.name.length, tuning.name).toBeLessThanOrEqual(12);
    }
  });
});

describe('Tuning.fromNoteNames — eigene Stimmung', () => {
  it('leitet die Oktave aus der Standard-Nachbarschaft ab', () => {
    // Drop D als eigene Stimmung ergibt exakt die Drop-D-Tonhöhen.
    expect(Tuning.fromNoteNames(['D', 'A', 'D', 'G', 'B', 'E']).openStrings).toEqual([
      38, 45, 50, 55, 59, 64,
    ]);

    // DADGAD: die hohen Saiten rutschen auf die nächste Oktave zur Standardsaite.
    expect(Tuning.fromNoteNames(['D', 'A', 'D', 'G', 'A', 'D']).openStrings).toEqual([
      38, 45, 50, 55, 57, 62,
    ]);
  });

  it('lässt die Standardstimmung unverändert, wenn man ihre Noten eingibt', () => {
    expect(Tuning.fromNoteNames(['E', 'A', 'D', 'G', 'B', 'E']).openStrings).toEqual(
      [...Tuning.STANDARD.openStrings],
    );
  });

  it('wählt die nächste Oktave, nicht immer die höhere', () => {
    // C auf der tiefen E-Saite (Standard E2=40): C2=36 (−4) ist näher als C3=48 (+8).
    expect(Tuning.fromNoteNames(['C', 'A', 'D', 'G', 'B', 'E']).openStrings[0]).toBe(36);
  });

  it('wirft bei einem Namen, der keine Note ist', () => {
    expect(() => Tuning.fromNoteNames(['H', 'A', 'D', 'G', 'B', 'E'])).toThrow();
  });
});
