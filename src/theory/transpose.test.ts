import { describe, expect, it } from 'vitest';
import { Note } from './Note';
import { transposeSymbol } from './transpose';

const move = (symbols: string[], from: string, to: string) =>
  symbols.map((symbol) => transposeSymbol(symbol, Note.parse(from), Note.parse(to)));

describe('transposeSymbol', () => {
  it('verschiebt eine Folge in eine andere Tonart', () => {
    expect(move(['G', 'D', 'Em', 'C'], 'G', 'A')).toEqual(['A', 'E', 'F#m', 'D']);
  });

  it('buchstabiert so, wie die neue Tonart schreibt', () => {
    expect(move(['C', 'F', 'G7'], 'C', 'Eb')).toEqual(['Eb', 'Ab', 'Bb7']);
    expect(move(['Em', 'B7'], 'E', 'F#')).toEqual(['F#m', 'C#7']);
  });

  it('nimmt den Bass eines Slash-Akkords mit', () => {
    expect(move(['C/E'], 'C', 'D')).toEqual(['D/F#']);
  });

  it('gibt Unlesbares unverändert zurück, statt es zu verlieren', () => {
    expect(move(['Xyz'], 'C', 'D')).toEqual(['Xyz']);
  });
});
