import { describe, expect, it } from 'vitest';
import { Note } from './Note';
import { ROOT_CHOICES, Scale } from './Scale';
import {
  BLUES,
  DORIAN,
  HARMONIC_MINOR,
  MAJOR,
  MAJOR_PENTATONIC,
  MELODIC_MINOR,
  MINOR_PENTATONIC,
  MIXOLYDIAN,
  NATURAL_MINOR,
  SCALE_TYPES,
  scaleTypesInGroup,
} from './ScaleType';

/** Scale notes as names — spelling matters, so we compare strings. */
function spell(scale: Scale): string[] {
  return scale.notes.map((note) => note.name());
}

describe('Dur-Tonleitern', () => {
  it('C-Dur hat keine Vorzeichen', () => {
    expect(spell(new Scale(Note.parse('C'), MAJOR))).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  });

  it('A-Dur (Beispiel aus der Anforderung)', () => {
    expect(spell(new Scale(Note.parse('A'), MAJOR))).toEqual([
      'A',
      'B',
      'C#',
      'D',
      'E',
      'F#',
      'G#',
    ]);
  });

  it('F#-Dur braucht E#, nicht F', () => {
    expect(spell(new Scale(Note.parse('F#'), MAJOR))).toEqual([
      'F#',
      'G#',
      'A#',
      'B',
      'C#',
      'D#',
      'E#',
    ]);
  });

  it('Gb-Dur braucht Cb, nicht B', () => {
    expect(spell(new Scale(Note.parse('Gb'), MAJOR))).toEqual([
      'Gb',
      'Ab',
      'Bb',
      'Cb',
      'Db',
      'Eb',
      'F',
    ]);
  });

  it('C#-Dur braucht B#', () => {
    expect(spell(new Scale(Note.parse('C#'), MAJOR))).toEqual([
      'C#',
      'D#',
      'E#',
      'F#',
      'G#',
      'A#',
      'B#',
    ]);
  });

  it('deckt den Quintenzirkel ab', () => {
    const expected: Record<string, string[]> = {
      G: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
      D: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
      E: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
      B: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
      F: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
      Bb: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
      Eb: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
      Ab: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
      Db: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
    };

    for (const [root, notes] of Object.entries(expected)) {
      expect(spell(new Scale(Note.parse(root), MAJOR)), `${root}-Dur`).toEqual(notes);
    }
  });

  it('verwendet in jeder Dur-Tonart jeden Buchstaben genau einmal', () => {
    const roots = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

    for (const root of roots) {
      const letters = new Scale(Note.parse(root), MAJOR).notes.map((n) => n.letter);
      expect(new Set(letters).size, `${root}-Dur`).toBe(7);
    }
  });

  it('hat die Halbtonschritte 2-2-1-2-2-2-1', () => {
    const scale = new Scale(Note.parse('D'), MAJOR);
    const pcs = [...scale.pitchClasses, scale.pitchClasses[0] + 12];
    const steps = pcs.slice(1).map((pc, i) => (pc - pcs[i] + 12) % 12 || 12);
    expect(steps).toEqual([2, 2, 1, 2, 2, 2, 1]);
  });
});

describe('Moll-Tonleitern', () => {
  it('A-Moll hat keine Vorzeichen', () => {
    expect(spell(new Scale(Note.parse('A'), NATURAL_MINOR))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
    ]);
  });

  it('C#-Moll (Beispiel aus der Anforderung)', () => {
    expect(spell(new Scale(Note.parse('C#'), NATURAL_MINOR))).toEqual([
      'C#',
      'D#',
      'E',
      'F#',
      'G#',
      'A',
      'B',
    ]);
  });

  it('harmonisch Moll erhöht die 7. Stufe', () => {
    expect(spell(new Scale(Note.parse('A'), HARMONIC_MINOR))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G#',
    ]);
  });

  it('melodisch Moll erhöht die 6. und 7. Stufe', () => {
    expect(spell(new Scale(Note.parse('A'), MELODIC_MINOR))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F#',
      'G#',
    ]);
  });

  it('teilt die Töne mit der parallelen Dur-Tonart', () => {
    const aMinor = new Scale(Note.parse('A'), NATURAL_MINOR);
    const cMajor = new Scale(Note.parse('C'), MAJOR);

    expect([...aMinor.pitchClasses].sort((a, b) => a - b)).toEqual(
      [...cMajor.pitchClasses].sort((a, b) => a - b),
    );
  });
});

describe('Kirchentonarten und Pentatonik', () => {
  it('D-Dorisch', () => {
    expect(spell(new Scale(Note.parse('D'), DORIAN))).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
  });

  it('G-Mixolydisch', () => {
    expect(spell(new Scale(Note.parse('G'), MIXOLYDIAN))).toEqual([
      'G',
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
  });

  it('C-Dur-Pentatonik lässt die 4. und 7. Stufe weg', () => {
    expect(spell(new Scale(Note.parse('C'), MAJOR_PENTATONIC))).toEqual(['C', 'D', 'E', 'G', 'A']);
  });

  it('A-Moll-Pentatonik', () => {
    expect(spell(new Scale(Note.parse('A'), MINOR_PENTATONIC))).toEqual(['A', 'C', 'D', 'E', 'G']);
  });

  it('A-Blues fügt die b5 als Blue Note hinzu', () => {
    expect(spell(new Scale(Note.parse('A'), BLUES))).toEqual(['A', 'C', 'D', 'Eb', 'E', 'G']);
  });
});

describe('Stufenbezeichnungen', () => {
  it('beschriftet Dur als 1..7', () => {
    const scale = new Scale(Note.parse('C'), MAJOR);
    expect(scale.pitchClasses.map((pc) => scale.degreeLabelOf(pc))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
  });

  it('beschriftet Moll mit b3, b6, b7', () => {
    const scale = new Scale(Note.parse('A'), NATURAL_MINOR);
    expect(scale.pitchClasses.map((pc) => scale.degreeLabelOf(pc))).toEqual([
      '1',
      '2',
      'b3',
      '4',
      '5',
      'b6',
      'b7',
    ]);
  });

  it('beschriftet Blues mit der b5', () => {
    const scale = new Scale(Note.parse('A'), BLUES);
    expect(scale.pitchClasses.map((pc) => scale.degreeLabelOf(pc))).toEqual([
      '1',
      'b3',
      '4',
      'b5',
      '5',
      'b7',
    ]);
  });
});

describe('Skalen-Abfragen', () => {
  const cMajor = new Scale(Note.parse('C'), MAJOR);

  it('erkennt enthaltene und fremde Töne', () => {
    expect(cMajor.contains(Note.parse('E').pitchClass)).toBe(true);
    expect(cMajor.contains(Note.parse('F#').pitchClass)).toBe(false);
  });

  it('erkennt den Grundton', () => {
    expect(cMajor.isRoot(0)).toBe(true);
    expect(cMajor.isRoot(4)).toBe(false);
  });

  it('gibt null für skalenfremde Töne', () => {
    expect(cMajor.degreeIndexOf(Note.parse('F#').pitchClass)).toBeNull();
    expect(cMajor.degreeLabelOf(Note.parse('F#').pitchClass)).toBeNull();
  });
});

describe('Scale.parse', () => {
  it('parst die Eingabeformate des Users', () => {
    expect(Scale.parse('A-Dur').name()).toBe('A-Dur (Ionisch)');
    expect(Scale.parse('C#-Moll').name()).toBe('C#-Moll (Äolisch)');
    expect(Scale.parse('Bb major').root.pitchClass).toBe(10);
    expect(Scale.parse('D dorisch').type).toBe(DORIAN);
  });

  it('nimmt einen nackten Grundton als Dur', () => {
    expect(Scale.parse('E').type).toBe(MAJOR);
  });

  it('lehnt unbekannte Tonarten ab', () => {
    expect(() => Scale.parse('A-Klingonisch')).toThrow();
    expect(() => Scale.parse('X-Dur')).toThrow();
  });
});

describe('ROOT_CHOICES', () => {
  it('bietet 12 Grundtöne in b-Schreibweise an', () => {
    expect(ROOT_CHOICES).toHaveLength(12);
    expect(ROOT_CHOICES).toContain('Eb');
    expect(ROOT_CHOICES).not.toContain('D#');
  });

  it('ist vollständig parsebar und deckt alle 12 Halbtöne ab', () => {
    const pitchClasses = ROOT_CHOICES.map((name) => Note.parse(name).pitchClass);
    expect(new Set(pitchClasses).size).toBe(12);
  });
});

describe('Skalen-Gruppen', () => {
  it('steckt jede Skala in genau eine Gruppe — keine fällt aus dem Dropdown', () => {
    const grouped = [...scaleTypesInGroup('basics'), ...scaleTypesInGroup('more')];

    expect(grouped).toHaveLength(SCALE_TYPES.length);
    expect(new Set(grouped.map((t) => t.id)).size).toBe(SCALE_TYPES.length);
  });

  it('führt unter "Grundlagen" das, was man zum Spielen und Solieren braucht', () => {
    expect(scaleTypesInGroup('basics').map((t) => t.id)).toEqual([
      'major',
      'natural-minor',
      'minor-pentatonic',
      'blues',
    ]);
  });
});

describe('Invarianten über alle Skalentypen', () => {
  it('startet jede Skala auf ihrem Grundton', () => {
    for (const type of SCALE_TYPES) {
      const root = Note.parse('A');
      expect(new Scale(root, type).notes[0].name(), type.id).toBe(root.name());
    }
  });

  it('erzeugt nur Töne mit vernünftigen Vorzeichen (max. doppelt)', () => {
    const roots = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab'];

    for (const type of SCALE_TYPES) {
      for (const root of roots) {
        const scale = new Scale(Note.parse(root), type);
        for (const note of scale.notes) {
          expect(Math.abs(note.alter), `${root} ${type.id} => ${note.name()}`).toBeLessThanOrEqual(
            2,
          );
        }
      }
    }
  });

  it('erzeugt so viele Töne, wie der Typ Stufen hat, ohne Klang-Dopplung', () => {
    for (const type of SCALE_TYPES) {
      const scale = new Scale(Note.parse('A'), type);
      expect(scale.notes.length, type.id).toBe(type.semitones.length);
      expect(new Set(scale.pitchClasses).size, type.id).toBe(type.semitones.length);
    }
  });
});
