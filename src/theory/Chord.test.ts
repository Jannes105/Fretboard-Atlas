import { describe, expect, it } from 'vitest';
import { Chord, diatonicChords, qualitySignatures } from './Chord';
import { Note } from './Note';
import { ROOT_CHOICES, Scale } from './Scale';
import {
  HARMONIC_MINOR,
  MAJOR,
  MAJOR_PENTATONIC,
  NATURAL_MINOR,
  SCALE_TYPES,
} from './ScaleType';

const cMajor = new Scale(Note.parse('C'), MAJOR);
const aMinor = new Scale(Note.parse('A'), NATURAL_MINOR);

function symbols(chords: Chord[]): string[] {
  return chords.map((chord) => chord.name());
}

function romans(chords: Chord[]): string[] {
  return chords.map((chord, i) => chord.romanNumeral(i));
}

describe('Akkorderkennung', () => {
  it('gibt keine zwei Qualitäten mit derselben Signatur', () => {
    // Die Absicherung für jede neue Qualität in der Tabelle: zwei gleiche
    // Signaturen machen eine davon unerreichbar, und welche, entschiede die
    // Reihenfolge der Deklaration.
    const signatures = qualitySignatures();
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('erkennt einen Akkord unabhängig von der Reihenfolge seiner Töne', () => {
    const root = Note.parse('C');
    const inOrder = [root, Note.parse('E'), Note.parse('G'), Note.parse('B')];

    // Der Konstruktor ist öffentlich, und vorher hing die Erkennung daran, dass
    // die Töne aufsteigend ankamen — sonst blieb quality still null.
    const shuffled = new Chord(root, [inOrder[2], inOrder[0], inOrder[3], inOrder[1]]);

    expect(shuffled.quality?.id).toBe('major7');
    expect(shuffled.name()).toBe('Cmaj7');
  });

  it('kennt jeden Neunklang jeder angebotenen Skala', () => {
    // Die Qualitätentabelle wurde nicht nach Geschmack gefüllt, sondern gegen
    // diesen Test: jede 7-stufige Skala auf jedem Grundton, fünf Töne gestapelt.
    // Ein unbekannter Stapel hieße "?" auf der Akkordkarte und keine Griffe.
    const unnamed: string[] = [];

    for (const type of SCALE_TYPES.filter((t) => t.isHeptatonic)) {
      for (const rootName of ROOT_CHOICES) {
        const scale = new Scale(Note.parse(rootName), type);
        diatonicChords(scale, 5).forEach((chord, degree) => {
          if (!chord.quality) {
            unnamed.push(
              `${scale.name()} Stufe ${degree + 1}: ${chord.notes.map((n) => n.name()).join(' ')}`,
            );
          }
        });
      }
    }

    expect(unnamed).toEqual([]);
  });

  it('bleibt bei einem Stapel ohne bekannte Qualität still null', () => {
    // C-Db-D: nichts, was die Tabelle kennt. Das darf nicht werfen — die
    // Akkordkarten zeigen dann einfach kein Symbol.
    const exotic = new Chord(Note.parse('C'), [
      Note.parse('C'),
      Note.parse('Db'),
      Note.parse('D'),
    ]);
    expect(exotic.quality).toBeNull();
  });
});

describe('Diatonische Dreiklänge', () => {
  it('C-Dur: C Dm Em F G Am Bdim', () => {
    expect(symbols(diatonicChords(cMajor))).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  });

  it('liefert in Dur die Stufen I ii iii IV V vi vii°', () => {
    expect(romans(diatonicChords(cMajor))).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  });

  it('A-Moll: Am Bdim C Dm Em F G', () => {
    expect(symbols(diatonicChords(aMinor))).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  });

  it('liefert in Moll die Stufen i ii° III iv v VI VII', () => {
    expect(romans(diatonicChords(aMinor))).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  });

  it('macht die V. Stufe in harmonisch Moll zu Dur', () => {
    const scale = new Scale(Note.parse('A'), HARMONIC_MINOR);
    const chords = diatonicChords(scale);

    // Der erhöhte Leitton G# macht aus Em ein E und aus G ein G#dim.
    expect(chords[4].name()).toBe('E');
    expect(chords[4].romanNumeral(4)).toBe('V');
    expect(chords[6].name()).toBe('G#dim');
    expect(chords[2].name()).toBe('Caug');
  });

  it('buchstabiert die Akkordtöne passend zur Tonart', () => {
    const scale = new Scale(Note.parse('F#'), MAJOR);
    const chords = diatonicChords(scale);

    // F#-Dur enthält E#, also heißt die III. Stufe A#m — nicht Bbm.
    expect(chords[2].name()).toBe('A#m');
    expect(chords[6].name()).toBe('E#dim');
  });

  it('baut die Akkorde nur aus Skalentönen', () => {
    for (const chord of diatonicChords(cMajor)) {
      for (const pitchClass of chord.pitchClasses) {
        expect(cMajor.contains(pitchClass)).toBe(true);
      }
    }
  });

  it('lehnt Skalen ohne 7 Stufen ab', () => {
    const pentatonic = new Scale(Note.parse('C'), MAJOR_PENTATONIC);
    expect(() => diatonicChords(pentatonic)).toThrow(/7-stufige/);
  });
});

describe('Diatonische Septakkorde', () => {
  it('C-Dur: Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5', () => {
    expect(symbols(diatonicChords(cMajor, 4))).toEqual([
      'Cmaj7',
      'Dm7',
      'Em7',
      'Fmaj7',
      'G7',
      'Am7',
      'Bm7b5',
    ]);
  });

  it('hat genau einen Dominantseptakkord auf der V. Stufe', () => {
    const sevenths = diatonicChords(cMajor, 4);
    const dominants = sevenths.filter((chord) => chord.quality?.id === 'dominant7');

    expect(dominants).toHaveLength(1);
    expect(dominants[0].name()).toBe('G7');
  });

  it('liefert die Stufen mit Septim-Symbolik', () => {
    expect(romans(diatonicChords(cMajor, 4))).toEqual([
      'Imaj7',
      'ii7',
      'iii7',
      'IVmaj7',
      'V7',
      'vi7',
      'viiø7',
    ]);
  });

  it('erzeugt in harmonisch Moll einen verminderten Septakkord', () => {
    const scale = new Scale(Note.parse('A'), HARMONIC_MINOR);
    expect(diatonicChords(scale, 4)[6].name()).toBe('G#dim7');
  });
});

describe('Chord.fromQuality', () => {
  it('baut einen Dominantseptakkord aus dem Grundton', () => {
    const chord = Chord.fromQuality(Note.parse('A'), 'dominant7');
    expect(chord.name()).toBe('A7');
    expect(chord.notes.map((n) => n.name())).toEqual(['A', 'C#', 'E', 'G']);
  });

  it('lehnt unbekannte Qualitäten ab', () => {
    expect(() => Chord.fromQuality(Note.parse('A'), 'quantenakkord')).toThrow();
  });
});

describe('Erkennung der Akkordqualität', () => {
  it('erkennt die Qualität aus den Intervallen, nicht aus der Stufe', () => {
    const cMajorTriad = new Chord(Note.parse('C'), [
      Note.parse('C'),
      Note.parse('E'),
      Note.parse('G'),
    ]);
    expect(cMajorTriad.quality?.id).toBe('major');

    const cDim = new Chord(Note.parse('C'), [
      Note.parse('C'),
      Note.parse('Eb'),
      Note.parse('Gb'),
    ]);
    expect(cDim.quality?.id).toBe('diminished');
  });

  it('gibt null für einen Stapel, der kein bekannter Akkord ist', () => {
    const nonsense = new Chord(Note.parse('C'), [
      Note.parse('C'),
      Note.parse('Db'),
      Note.parse('D'),
    ]);
    expect(nonsense.quality).toBeNull();
    expect(nonsense.name()).toBe('C?');
  });
});

describe('Chord.parse', () => {
  it('liest die geläufigen Symbole aus einem Tab', () => {
    expect(Chord.parse('C').name()).toBe('C');
    expect(Chord.parse('Em').name()).toBe('Em');
    expect(Chord.parse('G7').name()).toBe('G7');
    expect(Chord.parse('Bbmaj7').name()).toBe('Bbmaj7');
    expect(Chord.parse('F#m7b5').name()).toBe('F#m7b5');
  });

  it('trennt Grundton und Typ auch bei mehreren Vorzeichen richtig', () => {
    // Das b gehört zum Grundton (Eb), nicht zum Typ — "Eb" + "m", nie "E" + "bm".
    const ebm = Chord.parse('Ebm');
    expect(ebm.root.name()).toBe('Eb');
    expect(ebm.quality?.id).toBe('minor');
  });

  it('akzeptiert verschiedene Schreibweisen desselben Typs', () => {
    expect(Chord.parse('Am').quality?.id).toBe('minor');
    expect(Chord.parse('Amin').quality?.id).toBe('minor');
    expect(Chord.parse('A-').quality?.id).toBe('minor');
    expect(Chord.parse('Adim').quality?.id).toBe('diminished');
    expect(Chord.parse('A°').quality?.id).toBe('diminished');
    // Groß-/Kleinschreibung entscheidet: M7 ist Dur7, m7 ist Moll7.
    expect(Chord.parse('CM7').quality?.id).toBe('major7');
    expect(Chord.parse('Cm7').quality?.id).toBe('minor7');
  });

  it('wirft mit klarer Meldung bei Unbekanntem', () => {
    // H gibt es in der internationalen Notation nicht (das ist B).
    expect(() => Chord.parse('H')).toThrow();
    expect(() => Chord.parse('Xm')).toThrow();
    // Bekannter Grundton, aber ein Typ, den die App nicht führt.
    expect(() => Chord.parse('Cm7b9')).toThrow(/Cm7b9/);
  });

  it('liest Powerchords und Suspensions aus echten Tabs', () => {
    const e5 = Chord.parse('E5');
    expect(e5.quality?.id).toBe('power');
    expect(e5.name()).toBe('E5');
    expect(e5.notes.map((n) => n.name())).toEqual(['E', 'B']); // Grundton + Quinte, keine Terz

    expect(Chord.parse('Dsus4').notes.map((n) => n.name())).toEqual(['D', 'G', 'A']);
    expect(Chord.parse('Asus2').notes.map((n) => n.name())).toEqual(['A', 'B', 'E']);
    expect(Chord.parse('Csus').quality?.id).toBe('sus4'); // sus allein = sus4
    expect(Chord.parse('C6').notes.map((n) => n.name())).toEqual(['C', 'E', 'G', 'A']);
    expect(Chord.parse('Am6').quality?.id).toBe('minor6');
  });

  it('liest Slash-Akkorde mit abweichendem Bass', () => {
    const cOverG = Chord.parse('C/G');
    expect(cOverG.name()).toBe('C/G');
    expect(cOverG.quality?.id).toBe('major'); // der Bass ändert die Qualität nicht
    expect(cOverG.bass?.name()).toBe('G');

    expect(Chord.parse('D/F#').bass?.name()).toBe('F#');
    expect(Chord.parse('Am/C').name()).toBe('Am/C');
    // Der Bass fließt in die klingenden Tonklassen ein, auch wenn er kein Akkordton ist.
    expect(Chord.parse('C/D').pitchClasses).toContain(Note.parse('D').pitchClass);
  });

  it('behandelt einen Bass gleich dem Grundton nicht als Slash', () => {
    const c = Chord.parse('C/C');
    expect(c.bass).toBeNull();
    expect(c.name()).toBe('C');
  });

  it('wirft bei leerem oder unsinnigem Bass', () => {
    expect(() => Chord.parse('C/')).toThrow();
    expect(() => Chord.parse('C/H')).toThrow();
  });

  it('buchstabiert die Quinte als Quinte, nicht als dreifaches Kreuz', () => {
    // Der Beweis, dass die Terz-Annahme wirklich weg ist: ein terzgeschichtetes
    // Modell hätte die Quinte von E5 vier Halbtöne über der (nicht vorhandenen)
    // Terz gestapelt und E### geschrieben — Tonhöhe richtig, Schreibung absurd.
    for (const symbol of ['E5', 'F#5', 'Bb5', 'C5']) {
      const chord = Chord.parse(symbol);
      const fifth = chord.notes[1];
      // Die Quinte liegt immer vier Buchstaben über dem Grundton, mit höchstens
      // einem einfachen Vorzeichen.
      expect(Math.abs(fifth.alter), symbol).toBeLessThanOrEqual(1);
    }
    expect(Chord.parse('E5').notes[1].name()).toBe('B');
  });
});
