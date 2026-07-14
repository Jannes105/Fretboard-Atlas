import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, readState, writeState } from './urlState';

describe('readState', () => {
  it('liefert ohne Parameter die Defaults', () => {
    expect(readState('')).toEqual(DEFAULT_STATE);
  });

  it('liest gültige Parameter', () => {
    const state = readState('?root=Eb&scale=blues&tuning=drop-d&capo=3&frets=12&box=2');

    expect(state).toMatchObject({
      root: 'Eb',
      scaleTypeId: 'blues',
      tuningId: 'drop-d',
      capo: 3,
      fretCount: 12,
      boxNumber: 2,
    });
  });

  it('fällt bei Unsinn auf die Defaults zurück, statt zu werfen', () => {
    // Eine URL ist vom User editierbar — sie wird zwangsläufig irgendwann kaputt sein.
    const state = readState('?root=H&scale=klingonisch&tuning=open-g&capo=99&frets=7&chords=5');

    expect(state).toEqual(DEFAULT_STATE);
  });

  it('lehnt einen Kapo jenseits des Reglers ab', () => {
    expect(readState('?capo=8').capo).toBe(DEFAULT_STATE.capo);
    expect(readState('?capo=-1').capo).toBe(DEFAULT_STATE.capo);
    expect(readState('?capo=7').capo).toBe(7);
  });

  it('nimmt nur Bundzahlen, die es im Regler gibt', () => {
    expect(readState('?frets=15').fretCount).toBe(15);
    expect(readState('?frets=19').fretCount).toBe(DEFAULT_STATE.fretCount);
  });
});

describe('writeState', () => {
  it('schreibt gar nichts, solange alles auf Default steht', () => {
    expect(writeState(DEFAULT_STATE)).toBe('');
  });

  it('schreibt nur, was vom Default abweicht — kurze, lesbare Links', () => {
    const query = writeState({ ...DEFAULT_STATE, root: 'G', capo: 3 });

    expect(query).toBe('?root=G&capo=3');
  });

  it('ist die Umkehrung von readState', () => {
    const state = {
      ...DEFAULT_STATE,
      root: 'Bb',
      scaleTypeId: 'dorian',
      tuningId: 'drop-d',
      capo: 5,
      fretCount: 15,
      labelMode: 'degree' as const,
      chordSize: 4 as const,
      progressionId: 'ii-V-I',
      boxNumber: 3,
    };

    expect(readState(writeState(state))).toEqual(state);
  });
});
