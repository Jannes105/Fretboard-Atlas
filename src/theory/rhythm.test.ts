import { describe, expect, it } from 'vitest';
import {
  defaultPattern,
  isDefaultPattern,
  parsePattern,
  PATTERN_PRESETS,
  arpeggioStringCount,
  clickTimes,
  countInBars,
  dropHighest,
  strumOffsets,
  noteSeconds,
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

describe('noteSeconds', () => {
  const BAR = 2.67;      // ein 4/4-Takt bei 90 BPM
  const SLOT = BAR / 8;  // eine Achtel

  it('laesst Anschlaege ineinander klingen, wenn sie klingen sollen', () => {
    const { seconds } = noteSeconds('standard', 'ring', BAR, SLOT);
    // Laenger als der Abstand zum naechsten Schlag: sie ueberlappen.
    expect(seconds).toBeGreaterThan(SLOT);
  });

  it('laesst beim Abstoppen eine hoerbare Luecke', () => {
    const { seconds, release } = noteSeconds('standard', 'stopped', BAR, SLOT);
    // Der Punkt ist nicht nur ein kuerzerer Ton, sondern Stille bis zum naechsten.
    expect(seconds).toBeLessThan(SLOT * 0.6);
    // Und er wird abgeschnitten, nicht ausgeblendet.
    expect(release).toBeLessThan(0.02);
  });

  it('haelt Arpeggio-Toene beim Klingen bis zum Taktende', () => {
    // Sonst ist der erste Ton verstummt, bevor der letzte kommt - dann hoert man
    // eine Tonfolge und nie einen Akkord.
    const gap = BAR / 5;
    expect(noteSeconds('arpeggio', 'ring', BAR, gap).seconds).toBe(BAR);
  });

  it('trennt auch Arpeggio-Toene ab, wenn abgestoppt ist', () => {
    const gap = BAR / 5;
    const { seconds } = noteSeconds('arpeggio', 'stopped', BAR, gap);
    expect(seconds).toBeLessThan(gap);
  });

  it('haengt am Tempo, nicht an festen Sekunden', () => {
    // Doppeltes Tempo, halber Takt: alles halbiert sich mit.
    const slow = noteSeconds('standard', 'stopped', BAR, SLOT).seconds;
    const fast = noteSeconds('standard', 'stopped', BAR / 2, SLOT / 2).seconds;
    expect(fast).toBeCloseTo(slow / 2, 6);
  });
});

describe('Arpeggio über eine ganze Folge', () => {
  it('nimmt die Saitenzahl des kleinsten Akkords', () => {
    // Sonst pulsiert es je Akkord anders: Takt geteilt durch 6 gegen geteilt durch 5.
    expect(arpeggioStringCount([[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6]])).toBe(5);
    expect(arpeggioStringCount([[1, 2, 3, 4]])).toBe(4);
    expect(arpeggioStringCount([])).toBe(0);
  });

  it('lässt oben weg, nicht unten — der Bass trägt den Akkord', () => {
    expect(dropHighest([40, 47, 52, 56, 59, 64], 4)).toEqual([40, 47, 52, 56]);
    // Kürzer als verlangt bleibt unverändert, statt zu erfinden.
    expect(dropHighest([40, 47, 52], 5)).toEqual([40, 47, 52]);
    expect(dropHighest([40, 47, 52], 0)).toEqual([]);
  });

  it('gibt allen Akkorden derselben Folge dieselben Einsatzzeiten', () => {
    const chords = [
      [40, 47, 52, 56, 59, 64],
      [45, 52, 57, 61, 64],
      [43, 50, 55, 59, 62, 67],
    ];
    const count = arpeggioStringCount(chords);
    const secondsPerBar = 2.67;

    const times = chords.map((chord) =>
      strumOffsets(dropHighest(chord, count).length, 'arpeggio', secondsPerBar),
    );

    expect(times[0]).toHaveLength(5);
    expect(times[1]).toEqual(times[0]);
    expect(times[2]).toEqual(times[0]);
  });

  it('behält bei jedem Akkord den Bass', () => {
    const chords = [
      [40, 47, 52, 56, 59, 64],
      [45, 52, 57, 61, 64],
    ];
    const count = arpeggioStringCount(chords);

    for (const chord of chords) {
      expect(dropHighest(chord, count)[0]).toBe(chord[0]);
    }
  });
});

describe('clickTimes', () => {
  const BAR = 2.67; // ein 4/4-Takt bei 90 BPM

  it('legt einen Klick auf jeden Schlag', () => {
    const clicks = clickTimes(4, BAR, 1);

    expect(clicks).toHaveLength(4);
    expect(clicks.map((c) => +c.at.toFixed(4))).toEqual([0, 0.6675, 1.335, 2.0025]);
  });

  it('betont die Eins, sonst wäre 3/4 nicht von 4/4 zu unterscheiden', () => {
    expect(clickTimes(3, BAR, 2).map((c) => c.accent)).toEqual([
      true, false, false,
      true, false, false,
    ]);
  });

  it('setzt bei einem Versatz an, damit der Einzähler vorne liegt', () => {
    const [first] = clickTimes(4, BAR, 1, 10);
    expect(first.at).toBe(10);
  });

  it('folgt Tempo und Taktart', () => {
    // Halbe Taktlänge, halbe Abstände.
    expect(clickTimes(4, BAR / 2, 1)[1].at).toBeCloseTo(BAR / 8, 6);
    // Mehr Schläge, engere Abstände im selben Takt.
    expect(clickTimes(6, BAR, 1)).toHaveLength(6);
  });

  it('gibt bei Unsinn nichts zurück, statt zu werfen', () => {
    expect(clickTimes(0, BAR, 1)).toEqual([]);
    expect(clickTimes(4, BAR, 0)).toEqual([]);
  });
});

describe('countInBars', () => {
  it('zählt ein, sobald überhaupt geklickt wird', () => {
    // Ein Metronom, das auf derselben Eins startet wie die Musik, gibt einem nichts,
    // worauf man einsetzen kann.
    expect(countInBars('metronome')).toBe(1);
    expect(countInBars('countIn')).toBe(1);
    expect(countInBars('off')).toBe(0);
  });
});
