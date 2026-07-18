import { describe, expect, it } from 'vitest';
import {
  defaultPattern,
  isDefaultPattern,
  parsePattern,
  PATTERN_PRESETS,
  strumOffsets,
  strumRing,
  serializePattern,
} from './rhythm';

describe('rhythm — Muster ⇄ String', () => {
  it('serialisiert und liest ein Muster verlustfrei', () => {
    const pattern = parsePattern('d-du-udu', 4);
    expect(serializePattern(pattern)).toBe('d-du-udu');
    expect(pattern).toEqual(['down', null, 'down', 'up', null, 'up', 'down', 'up']);
  });

  it('hat pro Schlag zwei Slots — die Länge folgt der Taktart', () => {
    expect(defaultPattern(4)).toHaveLength(8);
    expect(defaultPattern(3)).toHaveLength(6);
    expect(defaultPattern(6)).toHaveLength(12);
  });

  it('gibt als Vorgabe einen Abschlag auf jeden Schlag', () => {
    expect(serializePattern(defaultPattern(4))).toBe('d-d-d-d-');
    expect(serializePattern(defaultPattern(3))).toBe('d-d-d-');
  });

  it('fällt bei falscher Länge auf die Vorgabe zurück (Taktart hat sich geändert)', () => {
    // Ein 4/4-Muster in einem 3/4-Takt: Länge passt nicht → Vorgabe für 3/4.
    expect(parsePattern('d-d-d-d-', 3)).toEqual(defaultPattern(3));
  });

  it('erkennt die Vorgabe, damit sie nicht in die URL wandert', () => {
    expect(isDefaultPattern('d-d-d-d-', 4)).toBe(true);
    expect(isDefaultPattern('dudududu', 4)).toBe(false);
  });

  it('baut jedes Preset auf die richtige Länge für die Taktart', () => {
    for (const preset of PATTERN_PRESETS) {
      expect(preset.build(4), preset.id).toHaveLength(8);
      expect(preset.build(3), preset.id).toHaveLength(6);
    }
    // Gehalten = ein Abschlag, dann Pausen.
    const held = PATTERN_PRESETS.find((p) => p.id === 'held')!;
    expect(serializePattern(held.build(4))).toBe('d-------');
  });
});

describe('strumOffsets', () => {
  it('bürstet die Saiten beim normalen Anschlag fast gleichzeitig', () => {
    const offsets = strumOffsets(6, 'standard', 2.67);

    expect(offsets).toHaveLength(6);
    expect(offsets[0]).toBe(0);
    // Ein Griff ist in unter 100 ms durch — ein echter Anschlag liegt bei 30–90 ms.
    expect(offsets[5]).toBeLessThan(0.1);
    // Und er hängt nicht am Tempo: ein Anschlag ist eine Handbewegung, kein Notenwert.
    expect(strumOffsets(6, 'standard', 1.2)).toEqual(offsets);
  });

  it('zieht das Arpeggio über genau einen Takt', () => {
    const secondsPerBar = 2.67;
    const offsets = strumOffsets(6, 'arpeggio', secondsPerBar);

    expect(offsets[0]).toBe(0);
    // Der letzte Ton bekommt seinen eigenen Anteil und fällt nicht auf die Eins des
    // nächsten Taktes.
    expect(offsets[5]).toBeCloseTo(secondsPerBar * (5 / 6), 6);
    expect(offsets[5]).toBeLessThan(secondsPerBar);
  });

  it('passt das Arpeggio an Tempo und Tonanzahl an', () => {
    // Halbe Taktlänge → halbe Abstände.
    expect(strumOffsets(4, 'arpeggio', 1)[1]).toBeCloseTo(0.25, 6);
    expect(strumOffsets(4, 'arpeggio', 2)[1]).toBeCloseTo(0.5, 6);
    // Mehr Töne → engere Abstände, aber derselbe Takt.
    expect(strumOffsets(8, 'arpeggio', 2)[7]).toBeCloseTo(1.75, 6);
  });

  it('kommt mit einem leeren Akkord klar', () => {
    expect(strumOffsets(0, 'arpeggio', 2)).toEqual([]);
  });
});

describe('strumRing', () => {
  it('lässt Arpeggio-Töne mindestens bis zum Taktende stehen', () => {
    // Sonst ist der erste Ton verstummt, bevor der letzte kommt — dann hört man
    // eine Tonfolge und nie einen Akkord.
    expect(strumRing('arpeggio', 2.67, 0.9)).toBe(2.67);
    // Klingt er ohnehin länger, bleibt es dabei.
    expect(strumRing('arpeggio', 2.67, 3)).toBe(3);
  });

  it('lässt den normalen Anschlag unangetastet', () => {
    expect(strumRing('standard', 2.67, 0.9)).toBe(0.9);
  });
});
