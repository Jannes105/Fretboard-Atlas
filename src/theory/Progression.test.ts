import { describe, expect, it } from 'vitest';
import { Chord } from './Chord';
import { Note } from './Note';
import { buildProgression, customSteps, PROGRESSIONS, progressionsFor } from './Progression';
import { Scale } from './Scale';
import { MAJOR, MAJOR_PENTATONIC, NATURAL_MINOR } from './ScaleType';

const cMajor = new Scale(Note.parse('C'), MAJOR);
const aMinor = new Scale(Note.parse('A'), NATURAL_MINOR);

function byId(id: string) {
  return PROGRESSIONS.find((p) => p.id === id)!;
}

function chords(scale: Scale, id: string, size: 3 | 4 = 3): string[] {
  return buildProgression(scale, byId(id), size).map((step) => step.chord.name());
}

describe('Progressionen in Dur', () => {
  it('I-V-vi-IV in C-Dur ist C G Am F', () => {
    expect(chords(cMajor, 'I-V-vi-IV')).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('I-V-vi-IV in G-Dur ist G D Em C', () => {
    const gMajor = new Scale(Note.parse('G'), MAJOR);
    expect(chords(gMajor, 'I-V-vi-IV')).toEqual(['G', 'D', 'Em', 'C']);
  });

  it('ii-V-I in C-Dur ist Dm G C', () => {
    expect(chords(cMajor, 'ii-V-I')).toEqual(['Dm', 'G', 'C']);
  });

  it('ii-V-I als Septakkorde ist Dm7 G7 Cmaj7', () => {
    expect(chords(cMajor, 'ii-V-I', 4)).toEqual(['Dm7', 'G7', 'Cmaj7']);
  });

  it('liefert die Stufensymbole mit', () => {
    const steps = buildProgression(cMajor, byId('I-V-vi-IV'));
    expect(steps.map((step) => step.roman)).toEqual(['I', 'V', 'vi', 'IV']);
  });
});

describe('Progressionen in Moll', () => {
  it('i-VI-III-VII in A-Moll ist Am F C G', () => {
    expect(chords(aMinor, 'i-VI-III-VII')).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('i-iv-v in A-Moll ist Am Dm Em', () => {
    expect(chords(aMinor, 'i-iv-v')).toEqual(['Am', 'Dm', 'Em']);
  });
});

describe('12-Bar-Blues', () => {
  it('hat zwölf Takte', () => {
    expect(buildProgression(cMajor, byId('12-bar-blues'))).toHaveLength(12);
  });

  it('spielt I, IV und V als Dominantseptakkorde', () => {
    // In C: C7 F7 G7 — F7 und C7 sind bewusst NICHT leitereigen.
    expect(chords(cMajor, '12-bar-blues')).toEqual([
      'C7',
      'C7',
      'C7',
      'C7',
      'F7',
      'F7',
      'C7',
      'C7',
      'G7',
      'F7',
      'C7',
      'G7',
    ]);
  });

  it('folgt dem Standardschema I-I-I-I-IV-IV-I-I-V-IV-I-V', () => {
    const steps = buildProgression(cMajor, byId('12-bar-blues'));
    expect(steps.map((step) => step.degreeIndex)).toEqual([0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4]);
  });
});

describe('progressionsFor', () => {
  it('bietet in Dur die Dur-Progressionen an', () => {
    const ids = progressionsFor(cMajor).map((p) => p.id);

    expect(ids).toContain('I-V-vi-IV');
    expect(ids).toContain('12-bar-blues');
    expect(ids).not.toContain('i-iv-v');
  });

  it('bietet in Moll die Moll-Progressionen an', () => {
    const ids = progressionsFor(aMinor).map((p) => p.id);

    expect(ids).toContain('i-iv-v');
    expect(ids).toContain('12-bar-blues');
    expect(ids).not.toContain('I-V-vi-IV');
  });

  it('erkennt Kirchentonarten anhand ihrer Terz', () => {
    // Dorisch hat eine kleine Terz, gilt also als Moll-Klang.
    const dDorian = Scale.parse('D dorisch');
    expect(progressionsFor(dDorian).map((p) => p.id)).toContain('i-iv-v');

    // Mixolydisch hat eine große Terz.
    const gMixo = Scale.parse('G mixolydisch');
    expect(progressionsFor(gMixo).map((p) => p.id)).toContain('I-V-vi-IV');
  });

  it('bietet für Skalen ohne 7 Stufen nichts an', () => {
    const pentatonic = new Scale(Note.parse('C'), MAJOR_PENTATONIC);
    expect(progressionsFor(pentatonic)).toEqual([]);
  });
});

describe('customSteps', () => {
  const parse = (symbols: string[]) => symbols.map((s) => Chord.parse(s));

  it('nummeriert leitereigene Akkorde mit ihrer Stufe in der Tonart', () => {
    const steps = customSteps(cMajor, parse(['C', 'G', 'Am', 'F']));
    expect(steps.map((s) => s.roman)).toEqual(['I', 'V', 'vi', 'IV']);
    expect(steps.map((s) => s.chord.name())).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('trägt beliebige Akkorde, auch Powerchords, und behält ihre echte Schreibung', () => {
    const steps = customSteps(cMajor, parse(['C5', 'F', 'G']));
    expect(steps[0].chord.name()).toBe('C5');
    // C5 ist leitereigen (C, G), bekommt also eine Stufe.
    expect(steps[0].roman).toBe('I5');
  });

  it('lässt die Stufe eines tonartfremden Akkords leer, statt sie zu erfinden', () => {
    // D-Dur (mit F#) gehört nicht zu C-Dur.
    const steps = customSteps(cMajor, parse(['C', 'D', 'G']));
    expect(steps[1].roman).toBe('');
    // Der Name bleibt trotzdem korrekt — die Anzeige zeigt ihn separat.
    expect(steps[1].chord.name()).toBe('D');
  });
});
