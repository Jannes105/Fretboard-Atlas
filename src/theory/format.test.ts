import { describe, expect, it } from 'vitest';
import { Chord } from './Chord';
import { Note } from './Note';
import { splitAccidental, withAccidentals } from './format';

describe('withAccidentals — was auf dem Schirm steht', () => {
  it('setzt Kreuz und B als echte Zeichen', () => {
    expect(withAccidentals('F#')).toBe('F♯');
    expect(withAccidentals('Bb')).toBe('B♭');
  });

  it('lässt einen Ton ohne Vorzeichen in Ruhe', () => {
    expect(withAccidentals('C')).toBe('C');
    expect(withAccidentals('E')).toBe('E');
  });

  it('kann doppelte Vorzeichen', () => {
    expect(withAccidentals('F##')).toBe('F♯♯');
    expect(withAccidentals('Bbb')).toBe('B♭♭');
  });

  it('rührt den Akkordzusatz hinter dem Grundton nicht an', () => {
    // Das m von Moll ist kein Vorzeichen, das dim von vermindert auch nicht.
    expect(withAccidentals('C#m')).toBe('C♯m');
    expect(withAccidentals('G#dim')).toBe('G♯dim');
    expect(withAccidentals('Bbm7')).toBe('B♭m7');
    expect(withAccidentals('Absus4')).toBe('A♭sus4');
  });

  it('nimmt auch die alterierte Quinte im Zusatz mit', () => {
    // Das b5 von halbvermindert IST ein Vorzeichen — es alteriert die Quinte.
    expect(withAccidentals('Bm7b5')).toBe('Bm7♭5');
    expect(withAccidentals('Ebm7b5')).toBe('E♭m7♭5');
    expect(withAccidentals('Cmaj7#5')).toBe('Cmaj7♯5');
  });

  it('setzt Stufenbezeichnungen, die mit dem Vorzeichen anfangen', () => {
    expect(withAccidentals('b3')).toBe('♭3');
    expect(withAccidentals('#4')).toBe('♯4');
    expect(withAccidentals('5')).toBe('5');
  });

  it('lässt alles stehen, was gar kein Tonname ist', () => {
    // Römische Ziffern haben nichts umzusetzen — das ° ist schon ein echtes Zeichen.
    expect(withAccidentals('vii°')).toBe('vii°');
    expect(withAccidentals('IV')).toBe('IV');
    expect(withAccidentals('Standard · 15 Bünde')).toBe('Standard · 15 Bünde');
  });
});

describe('splitAccidental — die Teile für das Markup', () => {
  it('trennt das Vorzeichen vom Buchstaben, damit es kleiner gesetzt werden kann', () => {
    expect(splitAccidental('Bbm7')).toEqual([
      { text: 'B', isAccidental: false },
      { text: '♭', isAccidental: true },
      { text: 'm7', isAccidental: false },
    ]);
  });

  it('gibt einen Namen ohne Vorzeichen als ein einziges Teil zurück', () => {
    expect(splitAccidental('Am')).toEqual([{ text: 'Am', isAccidental: false }]);
  });
});

describe('die ASCII-Schreibweise bleibt unangetastet', () => {
  /*
   * Der eigentliche Punkt der ganzen Schicht: name() speist die URL
   * (?root=Eb, prog=custom:C,G,Am,F) und wird von parse() wieder eingelesen.
   * Wäre ♭ dort gelandet, wäre jeder geteilte Link kaputt.
   */
  it('name() liefert weiter # und b', () => {
    expect(Note.parse('Bb').name()).toBe('Bb');
    expect(Chord.parse('C#m').name()).toBe('C#m');
  });

  it('parse() versteht, was name() geschrieben hat — hin und zurück', () => {
    for (const ascii of ['Bb', 'F#', 'C', 'Ebb', 'G##']) {
      expect(Note.parse(Note.parse(ascii).name()).name()).toBe(ascii);
    }
  });

  it('parse() nimmt die Anzeigeform bewusst NICHT an', () => {
    expect(() => Note.parse('B♭')).toThrow();
  });
});
