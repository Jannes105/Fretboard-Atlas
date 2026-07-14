import { describe, expect, it } from 'vitest';
import { Note, pitchClassName } from './Note';

describe('Note.parse', () => {
  it('parst einfache Notennamen', () => {
    expect(Note.parse('C').pitchClass).toBe(0);
    expect(Note.parse('E').pitchClass).toBe(4);
    expect(Note.parse('G').pitchClass).toBe(7);
    expect(Note.parse('B').pitchClass).toBe(11);
  });

  it('parst Vorzeichen', () => {
    expect(Note.parse('C#').pitchClass).toBe(1);
    expect(Note.parse('Eb').pitchClass).toBe(3);
    expect(Note.parse('F#').pitchClass).toBe(6);
    expect(Note.parse('Bb').pitchClass).toBe(10);
    expect(Note.parse('C##').pitchClass).toBe(2);
    expect(Note.parse('Cb').pitchClass).toBe(11);
  });

  it('lehnt gemischte Vorzeichen und Unsinn ab', () => {
    expect(() => Note.parse('X')).toThrow();
    expect(() => Note.parse('H')).toThrow(); // deutsche Notation wird nicht unterstützt
    expect(() => Note.parse('C#b')).toThrow();
    expect(() => Note.parse('')).toThrow();
    expect(() => Note.parse('C###')).toThrow();
  });
});

describe('Note.name', () => {
  it('rendert Vorzeichen als # und b', () => {
    expect(new Note(0, 1).name()).toBe('C#');
    expect(new Note(6, -1).name()).toBe('Bb');
    expect(new Note(6, 0).name()).toBe('B');
  });

  it('ist die Umkehrung von parse', () => {
    for (const name of ['C', 'C#', 'Eb', 'F#', 'B', 'Bb', 'Ab']) {
      expect(Note.parse(name).name()).toBe(name);
    }
  });
});

describe('pitchClassName', () => {
  it('bevorzugt ohne Tonart-Kontext die b-Schreibweise', () => {
    expect(pitchClassName(1)).toBe('Db');
    expect(pitchClassName(3)).toBe('Eb');
    expect(pitchClassName(6)).toBe('Gb');
    expect(pitchClassName(10)).toBe('Bb');
  });

  it('kann auf # umgestellt werden', () => {
    expect(pitchClassName(1, false)).toBe('C#');
    expect(pitchClassName(10, false)).toBe('A#');
  });

  it('lässt Stammtöne unverändert', () => {
    expect(pitchClassName(0)).toBe('C');
    expect(pitchClassName(4)).toBe('E');
    expect(pitchClassName(11)).toBe('B');
  });
});

describe('Note.transpose', () => {
  it('behält die Buchstaben-Reihenfolge bei', () => {
    // Große Terz über C = 4 Halbtöne + 2 Buchstaben => E, niemals Fb.
    expect(Note.parse('C').transpose(4, 2).name()).toBe('E');
  });

  it('erzeugt korrekte Doppelvorzeichen statt bequemer Enharmonik', () => {
    // Große Septime über C# = 11 Halbtöne + 6 Buchstaben => B#, nicht C.
    const bSharp = Note.parse('C#').transpose(11, 6);
    expect(bSharp.name()).toBe('B#');
    expect(bSharp.pitchClass).toBe(0);
  });

  it('läuft über den Oktavrand korrekt um', () => {
    expect(Note.parse('B').transpose(1, 1).name()).toBe('C');
  });
});

describe('Note-Vergleiche', () => {
  it('unterscheidet Schreibweise von Klang', () => {
    const cSharp = Note.parse('C#');
    const dFlat = Note.parse('Db');

    expect(cSharp.equals(dFlat)).toBe(false);
    expect(cSharp.isEnharmonicWith(dFlat)).toBe(true);
  });
});
