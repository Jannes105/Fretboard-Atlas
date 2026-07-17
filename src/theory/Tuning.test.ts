import { describe, expect, it } from 'vitest';
import { Tuning } from './Tuning';

describe('Tuning — Beschreibung', () => {
  it('leitet die Saitennamen aus den Tonhöhen ab, statt sie im Namen zu wiederholen', () => {
    expect(Tuning.STANDARD.description).toBe('Standard (E-A-D-G-B-E)');
    expect(Tuning.DROP_D.description).toBe('Drop D (D-A-D-G-B-E)');
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
