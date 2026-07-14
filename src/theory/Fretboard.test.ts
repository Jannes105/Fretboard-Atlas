import { describe, expect, it } from 'vitest';
import { Fretboard, type ScalePosition } from './Fretboard';
import { Note } from './Note';
import { Scale } from './Scale';
import { MAJOR, MINOR_PENTATONIC, NATURAL_MINOR } from './ScaleType';
import { Tuning } from './Tuning';

describe('Tuning', () => {
  it('kennt die Standardstimmung E-A-D-G-B-E', () => {
    // MIDI: E2=40, A2=45, D3=50, G3=55, B3=59, E4=64
    expect(Tuning.STANDARD.openStrings).toEqual([40, 45, 50, 55, 59, 64]);
    expect(Tuning.STANDARD.stringCount).toBe(6);
  });

  it('stimmt die leeren Saiten auf E A D G B E', () => {
    const names = Tuning.STANDARD.openStrings.map((_, string) =>
      Tuning.STANDARD.pitchClassAt(string, 0),
    );
    // E=4, A=9, D=2, G=7, B=11, E=4
    expect(names).toEqual([4, 9, 2, 7, 11, 4]);
  });

  it('hat Quarten zwischen den Saiten, außer G->B (große Terz)', () => {
    const strings = Tuning.STANDARD.openStrings;
    const intervals = strings.slice(1).map((midi, i) => midi - strings[i]);
    expect(intervals).toEqual([5, 5, 5, 4, 5]);
  });

  it('rechnet Bünde als Halbtonschritte', () => {
    expect(Tuning.STANDARD.midiAt(0, 0)).toBe(40);
    expect(Tuning.STANDARD.midiAt(0, 5)).toBe(45); // 5. Bund tiefe E = A
    expect(Tuning.STANDARD.midiAt(5, 24)).toBe(88); // 24. Bund hohe E
  });

  it('bildet den 12. Bund als Oktave ab', () => {
    for (let string = 0; string < 6; string++) {
      expect(Tuning.STANDARD.midiAt(string, 12)).toBe(Tuning.STANDARD.midiAt(string, 0) + 12);
      expect(Tuning.STANDARD.pitchClassAt(string, 12)).toBe(
        Tuning.STANDARD.pitchClassAt(string, 0),
      );
    }
  });

  it('verschiebt mit Kapodaster alle Saiten', () => {
    const capo3 = Tuning.STANDARD.withCapo(3);
    expect(capo3.openStrings).toEqual([43, 48, 53, 58, 62, 67]);
  });

  it('benennt die leeren Saiten aus den Tonhöhen, nicht aus einer Liste', () => {
    expect(Tuning.STANDARD.stringLabels).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
    expect(Tuning.DROP_D.stringLabels).toEqual(['D', 'A', 'D', 'G', 'B', 'E']);
  });
});

describe('Drop D', () => {
  it('lässt nur die tiefste Saite fallen, um einen Ganzton', () => {
    expect(Tuning.DROP_D.openStrings[0]).toBe(Tuning.STANDARD.openStrings[0] - 2);
    expect(Tuning.DROP_D.openStrings.slice(1)).toEqual(Tuning.STANDARD.openStrings.slice(1));
  });

  it('ändert genau ein Saiten-Intervall — deshalb tragen die A-Formen', () => {
    expect(Tuning.STANDARD.intervals).toEqual([5, 5, 5, 4, 5]);
    expect(Tuning.DROP_D.intervals).toEqual([7, 5, 5, 4, 5]);

    // Ab der A-Saite aufwärts ist alles wie in Standard gestimmt.
    expect(Tuning.DROP_D.intervals.slice(1)).toEqual(Tuning.STANDARD.intervals.slice(1));
  });

  it('legt den Grundton von D-Dur auf die leere tiefe Saite', () => {
    expect(Tuning.DROP_D.pitchClassAt(0, 0)).toBe(Note.parse('D').pitchClass);
  });

  it('lehnt ungültige Saiten und Bünde ab', () => {
    expect(() => Tuning.STANDARD.midiAt(6, 0)).toThrow();
    expect(() => Tuning.STANDARD.midiAt(-1, 0)).toThrow();
    expect(() => Tuning.STANDARD.midiAt(0, -1)).toThrow();
  });
});

describe('Fretboard', () => {
  const board = new Fretboard(Tuning.STANDARD, 24);

  it('hat 6 Saiten x 25 Positionen (Bund 0..24)', () => {
    expect(board.allPositions()).toHaveLength(6 * 25);
  });

  it('kennt die Note an einer Position', () => {
    // 3. Bund auf der A-Saite (String 1) = C
    const position = board.noteAt(1, 3);
    expect(position.midi).toBe(48);
    expect(position.pitchClass).toBe(Note.parse('C').pitchClass);
  });

  it('setzt die Bundmarkierungen an die üblichen Stellen', () => {
    const inlays = board.inlayFrets();

    expect(inlays.map((i) => i.fret)).toEqual([3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);
    expect(inlays.filter((i) => i.double).map((i) => i.fret)).toEqual([12, 24]);
  });
});

describe('Kapodaster', () => {
  it('ändert keine einzige Tonhöhe — er sperrt nur den Hals darunter', () => {
    const plain = new Fretboard(Tuning.STANDARD, 24, 0);
    const capo5 = new Fretboard(Tuning.STANDARD, 24, 5);

    // Der Ton im 7. Bund ist mit und ohne Kapo derselbe.
    for (let string = 0; string < 6; string++) {
      expect(capo5.noteAt(string, 7).midi).toBe(plain.noteAt(string, 7).midi);
    }
  });

  it('macht die Bünde unterhalb des Kapos unerreichbar', () => {
    const capo5 = new Fretboard(Tuning.STANDARD, 24, 5);
    const frets = capo5.allPositions().map((p) => p.fret);

    expect(Math.min(...frets)).toBe(5);
    expect(capo5.lowestFret).toBe(5);
  });

  it('lässt den Kapo-Bund selbst als neue Leersaite gelten', () => {
    const capo3 = new Fretboard(Tuning.STANDARD, 24, 3);
    const scale = new Scale(Note.parse('G'), MAJOR);

    // G-Dur: die tiefe E-Saite im 3. Bund ist ein G — mit Kapo 3 die neue Leersaite.
    const lowest = capo3.mapScale(scale).find((p) => p.stringIndex === 0)!;
    expect(lowest.fret).toBe(3);
    expect(lowest.note.name()).toBe('G');
  });

  it('lehnt einen Kapo jenseits des Halses ab', () => {
    expect(() => new Fretboard(Tuning.STANDARD, 12, 13)).toThrow(/Hals/);
    expect(() => new Fretboard(Tuning.STANDARD, 24, -1)).toThrow();
  });
});

describe('Skalen-Lagen (Boxen)', () => {
  const board = new Fretboard(Tuning.STANDARD, 24);
  const aMinorPentatonic = new Scale(Note.parse('A'), MINOR_PENTATONIC);

  /** Bünde je Saite innerhalb einer Lage, tiefe E-Saite zuerst. */
  function boxFrets(scale: Scale, position: ScalePosition, on = board): number[][] {
    return Array.from({ length: 6 }, (_, stringIndex) =>
      on
        .mapScale(scale)
        .filter(
          (p) =>
            p.stringIndex === stringIndex &&
            p.fret >= position.startFret &&
            p.fret <= position.endFret,
        )
        .map((p) => p.fret)
        .sort((a, b) => a - b),
    );
  }

  it('legt die 5 Lagen der A-Moll-Pentatonik auf die Bünde 5, 8, 10, 12, 15', () => {
    const positions = board.scalePositions(aMinorPentatonic);

    expect(positions.map((p) => p.anchorFret)).toEqual([5, 8, 10, 12, 15]);
    expect(positions.map((p) => p.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ergibt Box 1 exakt so, wie sie jeder Gitarrist greift', () => {
    const box1 = board.scalePositions(aMinorPentatonic)[0];

    // e|--5--8--   B|--5--8--   G|--5--7--
    // D|--5--7--   A|--5--7--   E|--5--8--
    expect(boxFrets(aMinorPentatonic, box1)).toEqual([
      [5, 8], // tiefe E
      [5, 7], // A
      [5, 7], // D
      [5, 7], // G
      [5, 8], // B
      [5, 8], // hohe e
    ]);
  });

  it('ergibt Box 2 und 3 exakt so, wie man sie lernt', () => {
    const [, box2, box3] = board.scalePositions(aMinorPentatonic);

    expect(boxFrets(aMinorPentatonic, box2)).toEqual([
      [8, 10],
      [7, 10],
      [7, 10],
      [7, 9],
      [8, 10],
      [8, 10],
    ]);

    expect(boxFrets(aMinorPentatonic, box3)).toEqual([
      [10, 12],
      [10, 12],
      [10, 12],
      [9, 12],
      [10, 13],
      [10, 12],
    ]);
  });

  it('ergibt Box 4 exakt so, wie man sie lernt', () => {
    const box4 = board.scalePositions(aMinorPentatonic)[3];

    expect(boxFrets(aMinorPentatonic, box4)).toEqual([
      [12, 15],
      [12, 15],
      [12, 14],
      [12, 14],
      [13, 15],
      [12, 15],
    ]);
  });

  it('lässt jede Lage bequem greifbar: max. 2 Töne pro Saite bei Pentatonik', () => {
    for (const position of board.scalePositions(aMinorPentatonic)) {
      for (const frets of boxFrets(aMinorPentatonic, position)) {
        expect(frets.length, `Lage ${position.number}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('gibt bei 7-stufigen Skalen 7 Lagen mit max. 3 Tönen pro Saite', () => {
    const cMajor = new Scale(Note.parse('C'), MAJOR);
    const positions = board.scalePositions(cMajor);

    expect(positions).toHaveLength(7);

    for (const position of positions) {
      for (const frets of boxFrets(cMajor, position)) {
        expect(frets.length, `Lage ${position.number}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('enthält jede Lage den Grundton auf der tiefsten Saite ihrer Stufe', () => {
    const positions = board.scalePositions(aMinorPentatonic);

    for (const position of positions) {
      const degree = aMinorPentatonic.pitchClasses[position.number - 1];
      expect(Tuning.STANDARD.pitchClassAt(0, position.anchorFret)).toBe(degree);
    }
  });

  it('schiebt die Lagen mit dem Kapo mit', () => {
    const capo3 = new Fretboard(Tuning.STANDARD, 24, 3);
    const cMinorPentatonic = new Scale(Note.parse('C'), MINOR_PENTATONIC);

    // C liegt im 8. Bund der tiefen E-Saite — die erste Lage beginnt dort.
    expect(capo3.scalePositions(cMinorPentatonic)[0].anchorFret).toBe(8);
    // Keine Lage reicht hinter den Kapo.
    for (const position of capo3.scalePositions(cMinorPentatonic)) {
      expect(position.startFret).toBeGreaterThanOrEqual(3);
    }
  });

  it('lässt Lagen weg, die nicht mehr auf den Hals passen', () => {
    const short = new Fretboard(Tuning.STANDARD, 12);
    const positions = short.scalePositions(aMinorPentatonic);

    // Lage 5 läge im 15. Bund — die gibt es auf einem 12-Bund-Hals nicht.
    expect(positions.map((p) => p.anchorFret)).toEqual([5, 8, 10, 12]);
    for (const position of positions) {
      expect(position.endFret).toBeLessThanOrEqual(12);
    }
  });
});

describe('Fretboard.mapScale', () => {
  const board = new Fretboard(Tuning.STANDARD, 24);

  it('liefert nur Töne, die in der Skala liegen', () => {
    const scale = new Scale(Note.parse('G'), MAJOR);
    const positions = board.mapScale(scale);

    expect(positions.length).toBeGreaterThan(0);
    for (const position of positions) {
      expect(scale.contains(position.pitchClass)).toBe(true);
    }
  });

  it('markiert die Grundtöne', () => {
    const scale = new Scale(Note.parse('C'), MAJOR);
    const roots = board.mapScale(scale).filter((p) => p.isRoot);

    // C liegt auf jeder Saite zweimal zwischen Bund 0 und 24.
    expect(roots).toHaveLength(12);
    for (const root of roots) {
      expect(root.pitchClass).toBe(0);
      expect(root.degree).toBe('1');
      expect(root.note.name()).toBe('C');
    }
  });

  it('findet C-Dur auf allen Saiten (alle leeren Saiten sind skaleneigen)', () => {
    const scale = new Scale(Note.parse('C'), MAJOR);
    // Pro Saite: 7 Töne je Oktave x 2 Oktaven (Bund 0..23) + Bund 24 = Bund 0.
    expect(board.mapScale(scale)).toHaveLength(6 * 15);
  });

  it('buchstabiert die Töne passend zur Tonart', () => {
    const scale = new Scale(Note.parse('C#'), NATURAL_MINOR);
    const names = new Set(board.mapScale(scale).map((p) => p.note.name()));

    expect([...names].sort()).toEqual(['A', 'B', 'C#', 'D#', 'E', 'F#', 'G#']);
  });

  it('erkennt die leeren Saiten als spielbare Skalentöne', () => {
    const scale = new Scale(Note.parse('E'), NATURAL_MINOR);
    const openStrings = board.mapScale(scale).filter((p) => p.fret === 0);

    // E-Moll: E F# G A B C D — alle sechs leeren Saiten liegen in der Skala.
    expect(openStrings).toHaveLength(6);
  });

  it('respektiert eine kürzere Bundzahl', () => {
    const short = new Fretboard(Tuning.STANDARD, 12);
    const scale = new Scale(Note.parse('C'), MAJOR);

    expect(short.mapScale(scale).every((p) => p.fret <= 12)).toBe(true);
    expect(short.mapScale(scale).length).toBeLessThan(board.mapScale(scale).length);
  });
});
