import { describe, expect, it } from 'vitest';
import {
  customProgId,
  customProgSymbols,
  customTuningId,
  customTuningNotes,
  DEFAULT_STATE,
  readState,
  writeState,
} from './urlState';

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

  it('liest Tempo und Loop', () => {
    expect(readState('?bpm=120&loop=0')).toMatchObject({ bpm: 120, loop: false });
    expect(readState('?loop=1').loop).toBe(true);
  });

  it('lehnt ein Tempo außerhalb des Reglers ab', () => {
    expect(readState('?bpm=10').bpm).toBe(DEFAULT_STATE.bpm);
    expect(readState('?bpm=9000').bpm).toBe(DEFAULT_STATE.bpm);
    expect(readState('?bpm=40').bpm).toBe(40);
    expect(readState('?bpm=200').bpm).toBe(200);
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

describe('Eigene Akkordfolge in der URL', () => {
  it('kodiert und liest eine Symbolliste verlustfrei — auch mit Vorzeichen', () => {
    const id = customProgId(['C', 'G', 'Am', 'F#5']);
    expect(customProgSymbols(id)).toEqual(['C', 'G', 'Am', 'F#5']);
  });

  it('unterscheidet eine Custom-Folge von einer Vorlage', () => {
    expect(customProgSymbols('I-V-vi-IV')).toBeNull();
    expect(customProgSymbols('custom:C,G')).toEqual(['C', 'G']);
  });

  it('übersteht eine Rundreise durch die URL, Vorzeichen inklusive', () => {
    // Das # in F#5 muss die Query-Kodierung heil überstehen.
    const state = { ...DEFAULT_STATE, progressionId: customProgId(['G', 'D', 'Em', 'C', 'F#5']) };
    expect(readState(writeState(state))).toEqual(state);
  });
});

describe('Eigene Stimmung in der URL', () => {
  it('kodiert und liest sechs Saitennamen verlustfrei — auch mit Vorzeichen', () => {
    const id = customTuningId(['D', 'A', 'D', 'G', 'B', 'F#']);
    expect(customTuningNotes(id)).toEqual(['D', 'A', 'D', 'G', 'B', 'F#']);
  });

  it('unterscheidet eine eigene Stimmung von einer Vorlage', () => {
    expect(customTuningNotes('standard')).toBeNull();
    expect(customTuningNotes('custom:D,A,D,G,B,E')).toEqual(['D', 'A', 'D', 'G', 'B', 'E']);
  });

  it('lehnt eine unvollständige oder unsinnige Stimmung ab', () => {
    expect(customTuningNotes('custom:D,A,D')).toBeNull(); // nicht 6 Saiten
    expect(customTuningNotes('custom:D,A,D,G,B,H')).toBeNull(); // H ist keine Note
  });

  it('nimmt eine gültige eigene Stimmung aus der URL an, sonst Standard', () => {
    expect(readState('?tuning=custom:D,A,D,G,B,E').tuningId).toBe('custom:D,A,D,G,B,E');
    expect(readState('?tuning=custom:kaputt').tuningId).toBe(DEFAULT_STATE.tuningId);
    // Voller Roundtrip mit eigener Stimmung.
    const state = { ...DEFAULT_STATE, tuningId: customTuningId(['D', 'A', 'D', 'G', 'A', 'D']) };
    expect(readState(writeState(state))).toEqual(state);
  });
});

describe('Klang in der URL', () => {
  it('liest und schreibt den Sound, lässt den Default aber weg', () => {
    expect(readState('?sound=electric').sound).toBe('electric');
    expect(readState('?sound=clean').sound).toBe('clean');
    expect(readState('').sound).toBe('soft');
    // Unbekannter Wert fällt zurück.
    expect(readState('?sound=laut').sound).toBe('soft');
    // Default steht nicht im Link.
    expect(writeState({ ...DEFAULT_STATE, sound: 'soft' })).toBe('');
    expect(writeState({ ...DEFAULT_STATE, sound: 'electric' })).toBe('?sound=electric');
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
      bpm: 120,
      loop: false,
    };

    expect(readState(writeState(state))).toEqual(state);
  });
});
