import { describe, expect, it } from 'vitest';
import {
  customProgId,
  customProgSteps,
  customTuningId,
  customTuningNotes,
  DEFAULT_STATE,
  initialState,
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
    expect(readState('?capo=13').capo).toBe(DEFAULT_STATE.capo);
    expect(readState('?capo=-1').capo).toBe(DEFAULT_STATE.capo);
    expect(readState('?capo=12').capo).toBe(12);
  });

  it('nimmt nur Bundzahlen, die es im Regler gibt', () => {
    expect(readState('?frets=15').fretCount).toBe(15);
    expect(readState('?frets=19').fretCount).toBe(DEFAULT_STATE.fretCount);
  });
});

describe('Eigene Akkordfolge in der URL', () => {
  const step = (symbol: string, bars = 1) => ({ symbol, bars });

  it('kodiert und liest Akkorde mit Taktlängen verlustfrei — auch mit Vorzeichen', () => {
    const steps = [step('C', 2), step('G'), step('Am'), step('F#5', 3)];
    const id = customProgId(steps);
    expect(id).toBe('custom:C*2,G,Am,F#5*3'); // 1 Takt wird weggelassen
    expect(customProgSteps(id)).toEqual(steps);
  });

  it('unterscheidet eine Custom-Folge von einer Vorlage', () => {
    expect(customProgSteps('I-V-vi-IV')).toBeNull();
    expect(customProgSteps('custom:C,G')).toEqual([step('C'), step('G')]);
  });

  it('bleibt abwärtskompatibel: ein alter Link ohne Takte heißt je 1 Takt', () => {
    expect(customProgSteps('custom:C,G,Am,F')).toEqual([
      step('C'),
      step('G'),
      step('Am'),
      step('F'),
    ]);
  });

  it('übersteht eine Rundreise durch die URL, Vorzeichen und Taktlängen inklusive', () => {
    // Das # in F#5 und die *2-Länge müssen die Query-Kodierung heil überstehen.
    const state = {
      ...DEFAULT_STATE,
      progressionId: customProgId([step('G', 2), step('D'), step('Em'), step('C'), step('F#5', 4)]),
    };
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

describe('Taktart in der URL', () => {
  it('liest und schreibt die Taktart, lässt 4/4 aber weg', () => {
    expect(readState('?sig=3').beatsPerBar).toBe(3);
    expect(readState('?sig=6').beatsPerBar).toBe(6);
    expect(readState('').beatsPerBar).toBe(4);
    // Ungültige Taktart fällt zurück.
    expect(readState('?sig=5').beatsPerBar).toBe(4);
    expect(writeState({ ...DEFAULT_STATE, beatsPerBar: 4 })).toBe('');
    expect(writeState({ ...DEFAULT_STATE, beatsPerBar: 3 })).toBe('?sig=3');
  });
});

describe('Schlagmuster in der URL', () => {
  it('liest und schreibt ein Muster, lässt die Vorgabe aber weg', () => {
    expect(readState('?rhythm=dudududu').rhythm).toBe('dudududu');
    expect(readState('').rhythm).toBe('d-d-d-d-'); // Vorgabe: Abschlag auf jeden Schlag
    expect(writeState({ ...DEFAULT_STATE, rhythm: 'd-d-d-d-' })).toBe('');
    expect(writeState({ ...DEFAULT_STATE, rhythm: 'dudududu' })).toBe('?rhythm=dudududu');
  });

  it('verwirft ein Muster, dessen Länge nicht zur Taktart passt', () => {
    // 8-Slot-Muster (4/4) in einem 3/4-Takt → Vorgabe für 3/4.
    expect(readState('?sig=3&rhythm=dudududu').rhythm).toBe('d-d-d-');
  });
});

describe('Klang in der URL', () => {
  it('liest und schreibt den Sound, lässt den Default aber weg', () => {
    expect(readState('?sound=electric').sound).toBe('electric');
    expect(readState('').sound).toBe('clean');
    // Unbekannter Wert fällt zurück - auch das abgeschaffte 'soft' aus alten Links.
    expect(readState('?sound=laut').sound).toBe('clean');
    expect(readState('?sound=soft').sound).toBe('clean');
    // Default steht nicht im Link.
    expect(writeState({ ...DEFAULT_STATE, sound: 'clean' })).toBe('');
    expect(writeState({ ...DEFAULT_STATE, sound: 'electric' })).toBe('?sound=electric');
  });
});

describe('Spielweise in der URL', () => {
  it('liest und schreibt die Spielweise, lässt den Default aber weg', () => {
    expect(readState('?strum=arpeggio').strum).toBe('arpeggio');
    expect(readState('').strum).toBe('standard');
    // Unbekannter Wert fällt zurück - auch die abgeschafften Geschwindigkeitsstufen.
    expect(readState('?strum=medium').strum).toBe('standard');
    // Default steht nicht im Link.
    expect(writeState({ ...DEFAULT_STATE, strum: 'standard' })).toBe('');
    expect(writeState({ ...DEFAULT_STATE, strum: 'arpeggio' })).toBe('?strum=arpeggio');
  });
});

describe('Tonlaenge in der URL', () => {
  it('liest und schreibt die Tonlaenge, laesst den Default aber weg', () => {
    expect(readState('?sustain=stopped').sustain).toBe('stopped');
    expect(readState('').sustain).toBe('ring');
    // Unbekannter Wert faellt zurueck - auch der abgeschaffte Hall aus alten Links.
    expect(readState('?sustain=halb').sustain).toBe('ring');
    expect(writeState({ ...DEFAULT_STATE, sustain: 'ring' })).toBe('');
    expect(writeState({ ...DEFAULT_STATE, sustain: 'stopped' })).toBe('?sustain=stopped');
  });
});

describe('Klick in der URL', () => {
  it('liest und schreibt den Klick, laesst den Default aber weg', () => {
    expect(readState('?click=metronome').click).toBe('metronome');
    expect(readState('?click=countIn').click).toBe('countIn');
    expect(readState('').click).toBe('off');
    expect(readState('?click=laut').click).toBe('off');
    expect(writeState({ ...DEFAULT_STATE, click: 'off' })).toBe('');
    expect(writeState({ ...DEFAULT_STATE, click: 'metronome' })).toBe('?click=metronome');
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

describe('initialState — Startwert je nach Geraet', () => {
  it('startet auf einem schmalen Bildschirm mit zwoelf Buenden', () => {
    expect(initialState('', 375).fretCount).toBe(12);
  });

  it('laesst breite Bildschirme beim vollen Hals', () => {
    expect(initialState('', 1280).fretCount).toBe(24);
  });

  it('laesst eine ausdrueckliche Angabe in der URL immer gewinnen', () => {
    // Ein geteilter Link schlaegt den Geraetevorschlag — sonst zeigte er auf dem
    // Handy etwas anderes als beim Absender.
    expect(initialState('?frets=24', 375).fretCount).toBe(24);
    expect(initialState('?frets=15', 375).fretCount).toBe(15);
  });

  it('aendert an allem uebrigen nichts', () => {
    const { fretCount: _wide, ...wide } = initialState('?root=G', 1280);
    const { fretCount: _narrow, ...narrow } = initialState('?root=G', 375);
    expect(narrow).toEqual(wide);
  });

  it('schreibt den Geraetewert in die URL, statt ihn zu verstecken', () => {
    // writeState laesst nur Defaults weg. Der Seed weicht vom Default ab, landet
    // also im Link — der Zustand ist damit ausdruecklich, nie ein stiller Modus.
    expect(writeState(initialState('', 375))).toContain('frets=12');
  });
});
