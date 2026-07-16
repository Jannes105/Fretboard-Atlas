import { describe, expect, it } from 'vitest';
import { Chord } from './Chord';
import { Note } from './Note';
import { defaultVoicingIndex, voicingsFor } from './ChordShape';
import {
  chordMidiTones,
  midiForPitchClass,
  midiToFrequency,
  positionsToMidi,
  scaleMidiSequence,
  voicingMidi,
} from './pitch';
import { Scale } from './Scale';
import { MAJOR, MINOR_PENTATONIC, NATURAL_MINOR } from './ScaleType';
import { Tuning } from './Tuning';

describe('midiToFrequency', () => {
  it('verankert A4 (MIDI 69) auf 440 Hz', () => {
    expect(midiToFrequency(69)).toBe(440);
  });

  it('halbiert die Frequenz je Oktave nach unten', () => {
    expect(midiToFrequency(57)).toBeCloseTo(220, 6); // A3
    expect(midiToFrequency(81)).toBeCloseTo(880, 6); // A5
  });

  it('rechnet C4 auf ~261,63 Hz', () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 2);
  });
});

describe('midiForPitchClass', () => {
  it('legt eine Tonklasse auf den tiefsten MIDI-Wert ab dem Anker', () => {
    // Anker 57 (A3): A bleibt 57, C läuft in die nächste Oktave auf 60.
    expect(midiForPitchClass(9, 57)).toBe(57);
    expect(midiForPitchClass(0, 57)).toBe(60);
    expect(midiForPitchClass(11, 57)).toBe(59);
  });

  it('gibt niemals einen Wert unterhalb des Ankers zurück', () => {
    for (let pc = 0; pc < 12; pc++) {
      const midi = midiForPitchClass(pc, 57);
      expect(midi).toBeGreaterThanOrEqual(57);
      expect(midi).toBeLessThan(57 + 12);
    }
  });
});

describe('scaleMidiSequence', () => {
  it('spielt C-Dur als [60..72]', () => {
    const cMajor = new Scale(Note.parse('C'), MAJOR);
    expect(scaleMidiSequence(cMajor, { baseMidi: 60 })).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it('schließt die Skala oben mit der Oktave des Grundtons', () => {
    const cMajor = new Scale(Note.parse('C'), MAJOR);
    const seq = scaleMidiSequence(cMajor, { baseMidi: 60 });
    expect(seq[seq.length - 1]).toBe(seq[0] + 12);
  });

  it('läuft mit descend wieder zum Grundton zurück, ohne den Gipfel zu doppeln', () => {
    const cMajor = new Scale(Note.parse('C'), MAJOR);
    expect(scaleMidiSequence(cMajor, { baseMidi: 60, descend: true })).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60,
    ]);
  });

  it('hat so viele Aufwärts-Töne wie die Skala Stufen + 1 (die Oktave)', () => {
    for (const scale of [
      new Scale(Note.parse('A'), NATURAL_MINOR),
      new Scale(Note.parse('A'), MINOR_PENTATONIC),
    ]) {
      const seq = scaleMidiSequence(scale, { baseMidi: 57 });
      expect(seq).toHaveLength(scale.type.semitones.length + 1);
    }
  });

  it('startet auf dem Grundton der Tonart', () => {
    const eMinor = new Scale(Note.parse('E'), NATURAL_MINOR);
    const seq = scaleMidiSequence(eMinor, { baseMidi: 57 });
    expect(seq[0] % 12).toBe(Note.parse('E').pitchClass);
  });
});

describe('chordMidiTones', () => {
  it('stapelt C-Dur als aufsteigende enge Lage', () => {
    const c = Chord.fromQuality(Note.parse('C'), 'major');
    // Grundton auf 60, Terz +4, Quinte +7.
    expect(chordMidiTones(c, 60)).toEqual([60, 64, 67]);
  });

  it('nimmt bei Septakkorden die Septime dazu', () => {
    const g7 = Chord.fromQuality(Note.parse('G'), 'dominant7');
    const tones = chordMidiTones(g7, 55); // Grundton G auf 55
    expect(tones).toEqual([55, 59, 62, 65]); // G B D F
  });

  it('ist immer aufsteigend, egal welche Qualität', () => {
    for (const id of ['major', 'minor', 'diminished', 'minor7b5']) {
      const chord = Chord.fromQuality(Note.parse('D'), id);
      const tones = chordMidiTones(chord, 57);
      const sorted = [...tones].sort((a, b) => a - b);
      expect(tones, id).toEqual(sorted);
    }
  });

  it('klingt jeder Ton als die richtige Tonklasse', () => {
    const a = Chord.fromQuality(Note.parse('A'), 'minor');
    const tones = chordMidiTones(a, 57);
    expect(tones.map((m) => m % 12)).toEqual([...a.pitchClasses]);
  });
});

describe('positionsToMidi', () => {
  // Stellvertreter für Griffbrett-Positionen: nur Tonhöhe + Tonklasse.
  const positions = [
    { midi: 45, pitchClass: 9 }, // A2
    { midi: 48, pitchClass: 0 }, // C3
    { midi: 52, pitchClass: 4 }, // E3
    { midi: 57, pitchClass: 9 }, // A3
    { midi: 60, pitchClass: 0 }, // C4
  ];

  it('sammelt die echten Tonhöhen der gesuchten Tonklassen, tief nach hoch', () => {
    // Ein A-Moll-Dreiklang (A C E): alle passenden Positionen, aufsteigend.
    expect(positionsToMidi(positions, [9, 0, 4])).toEqual([45, 48, 52, 57, 60]);
  });

  it('spielt jede Oktave einer Tonklasse — nicht nur eine', () => {
    // A kommt zweimal vor (45, 57) — beide klingen.
    expect(positionsToMidi(positions, [9])).toEqual([45, 57]);
  });

  it('entfernt Dopplungen gleicher Tonhöhe', () => {
    const doubled = [...positions, { midi: 45, pitchClass: 9 }];
    expect(positionsToMidi(doubled, [9])).toEqual([45, 57]);
  });

  it('gibt eine leere Liste, wenn keine Position passt', () => {
    expect(positionsToMidi(positions, [6])).toEqual([]);
  });
});

describe('voicingMidi', () => {
  const eMajor = Chord.fromQuality(Note.parse('E'), 'major');
  const openE = voicingsFor(eMajor).find((v) => v.baseFret === 0)!;

  it('klingt der offene E-Dur-Griff als seine sechs echten Saiten', () => {
    // [0,2,2,1,0,0] auf E A D G B E = E2 B2 E3 G#3 B3 E4
    expect(voicingMidi(openE, Tuning.STANDARD)).toEqual([40, 47, 52, 56, 59, 64]);
  });

  it('lässt gedämpfte Saiten weg', () => {
    const cMajor = Chord.fromQuality(Note.parse('C'), 'major');
    const aForm = voicingsFor(cMajor).find((v) => v.shapeName === 'A-Form')!;

    // Die A-Form dämpft die tiefe E-Saite (-1) — sie darf nicht klingen.
    expect(aForm.frets[0]).toBe(-1);
    expect(voicingMidi(aForm, Tuning.STANDARD)).toHaveLength(
      aForm.frets.filter((f) => f >= 0).length,
    );
  });

  it('behält Oktav-Dopplungen — anders als der abstrakte Dreiklang', () => {
    const midi = voicingMidi(openE, Tuning.STANDARD);
    // Der Griff hat drei E und zwei B; chordMidiTones hätte je genau einen Ton.
    expect(midi).toHaveLength(6);
    expect(chordMidiTones(eMajor)).toHaveLength(3);
    // Aber es klingen nur Akkordtöne.
    expect(new Set(midi.map((m) => m % 12))).toEqual(new Set(eMajor.pitchClasses));
  });

  it('folgt dem Kapo, weil eine kapierte Stimmung einfach eine Stimmung ist', () => {
    const capo3 = Tuning.STANDARD.withCapo(3);
    const ohne = voicingMidi(openE, Tuning.STANDARD);
    const mit = voicingMidi(openE, capo3);

    mit.forEach((midi, i) => expect(midi).toBe(ohne[i] + 3));
  });

  it('klingt für jeden diatonischen Akkord die vorgewählte Lage', () => {
    for (const chord of [eMajor, Chord.fromQuality(Note.parse('G'), 'minor7')]) {
      const voicings = voicingsFor(chord, { tuning: Tuning.STANDARD });
      const voicing = voicings[defaultVoicingIndex(voicings)];
      const midi = voicingMidi(voicing, Tuning.STANDARD);

      expect(midi.length, chord.name()).toBeGreaterThan(0);
      expect(new Set(midi.map((m) => m % 12)), chord.name()).toEqual(new Set(chord.pitchClasses));
    }
  });
});
