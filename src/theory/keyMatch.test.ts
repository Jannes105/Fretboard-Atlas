import { describe, expect, it } from 'vitest';
import { Chord } from './Chord';
import { type KeyMatch, matchKeys } from './keyMatch';

/** Parses a space-separated chord line the way a user would paste it from a tab. */
function chords(line: string): Chord[] {
  return line.split(/\s+/).map((token) => Chord.parse(token));
}

/** A short key label like "G-Dur" or "A-Moll", so tests need not spell the mode out. */
function label(match: KeyMatch): string {
  return `${match.scale.root.name()}-${match.scale.type.name.split(' ')[0]}`;
}

/** Just the key labels of the results, best first. */
function keys(line: string): string[] {
  return matchKeys(chords(line)).map(label);
}

function find(line: string, key: string): KeyMatch {
  const match = matchKeys(chords(line)).find((m) => label(m) === key);
  if (!match) throw new Error(`${key} nicht unter den Kandidaten für "${line}"`);
  return match;
}

describe('matchKeys — echte Songs', () => {
  it('G D Em C ist G-Dur, alle vier leitereigen', () => {
    const gMajor = find('G D Em C', 'G-Dur');

    // I V vi IV — keine Außenseiter.
    expect(gMajor.degrees).toEqual([0, 4, 5, 3]);
    expect(gMajor.outsiders).toHaveLength(0);
    // G-Dur steht vorn (beginnt auf der I).
    expect(keys('G D Em C')[0]).toBe('G-Dur');
  });

  it('C F G7 ist C-Dur; das G7 trifft die V. Stufe als Vierklang', () => {
    const cMajor = find('C F G7', 'C-Dur');

    expect(cMajor.degrees).toEqual([0, 3, 4]);
    expect(cMajor.outsiders).toHaveLength(0);
  });

  it('Am Dm E7 ist A-Moll — über die Dur-Dominante auf der V', () => {
    const aMinor = find('Am Dm E7', 'A-Moll');

    // E7 gehört nicht zu reinem A-Moll, zählt aber als V.
    expect(aMinor.degrees).toEqual([0, 3, 4]);
    expect(aMinor.outsiders).toHaveLength(0);
    expect(keys('Am Dm E7')[0]).toBe('A-Moll');
  });

  it('Am F C G ist mehrdeutig — C-Dur UND A-Moll müssen beide erscheinen', () => {
    const names = keys('Am F C G');

    expect(names).toContain('C-Dur');
    expect(names).toContain('A-Moll');
    // Beide enthalten genau dieselben Akkorde: keiner darf fehlen.
    expect(find('Am F C G', 'C-Dur').outsiders).toHaveLength(0);
  });

  it('G D Em C F# bleibt G-Dur; das F# steht als Außenseiter da', () => {
    const gMajor = find('G D Em C F#', 'G-Dur');

    expect(gMajor.degrees).toEqual([0, 4, 5, 3, null]);
    expect(gMajor.outsiders.map((c) => c.name())).toEqual(['F#']);
  });

  it('gibt nichts zurück, wenn kein einziger Akkord passt', () => {
    // Drei entfernte Dur-Dreiklänge, die in keiner Dur/Moll-Tonart zusammenstehen.
    expect(matchKeys(chords('C F# Bb')).every((m) => m.degrees.includes(null))).toBe(true);
  });

  it('zählt einen wiederholten Akkord nicht doppelt', () => {
    // Sonst gewänne eine Tonart allein durch Wiederholung.
    const results = matchKeys(chords('C C C C'));
    // C kommt in mehreren Tonarten vor; keine darf durch die Wiederholung
    // einen künstlich hohen Score bekommen — alle Kandidaten haben Score 1.
    expect(results.length).toBeGreaterThan(0);
    expect(keys('C C C C')[0]).toBe('C-Dur'); // beginnt und endet auf der I
  });

  it('leere Eingabe ergibt keine Kandidaten', () => {
    expect(matchKeys([])).toEqual([]);
  });

  it('erkennt Powerchords und Suspensions als leitereigen', () => {
    // C5 sind C+G, beide in C-Dur — ein Powerchord ist tonartneutral, aber er passt.
    const cMajor = find('C G Am F C5', 'C-Dur');
    expect(cMajor.outsiders).toHaveLength(0);
    expect(cMajor.degrees[4]).toBe(0); // C5 sitzt auf der I

    // Dsus4 (D G A) liegt komplett in G-Dur.
    const gMajor = find('Em C G D Dsus4', 'G-Dur');
    expect(gMajor.outsiders).toHaveLength(0);
  });

  it('verwirft einen Powerchord, dessen Quinte gegen die Tonart läuft', () => {
    // B5 ist B+F#; in C-Dur gibt es kein F#, also gehört B5 nicht hinein.
    const cMajor = find('C F G B5', 'C-Dur');
    expect(cMajor.outsiders.map((c) => c.name())).toEqual(['B5']);
  });
});
