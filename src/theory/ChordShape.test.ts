import { describe, expect, it } from 'vitest';
import { Chord, diatonicChords } from './Chord';
import {
  defaultVoicingIndex,
  hasChordShapes,
  SHAPE_SETS,
  shapeSetFor,
  voicingsFor,
} from './ChordShape';
import { Note } from './Note';
import { ROOT_CHOICES, Scale } from './Scale';
import { MAJOR } from './ScaleType';
import { Tuning } from './Tuning';

/** The pitch classes a voicing actually sounds in a given tuning, low string first. */
function soundingPitchClasses(tuning: Tuning, frets: readonly number[]): number[] {
  return frets
    .map((fret, stringIndex) => (fret < 0 ? null : tuning.pitchClassAt(stringIndex, fret)))
    .filter((pitchClass): pitchClass is number => pitchClass !== null);
}

/** The tuning each shape set was written for. */
const SET_TUNINGS: Record<string, Tuning> = {
  standard: Tuning.STANDARD,
  'drop-d': Tuning.DROP_D,
};

describe('Akkordformen klingen wie der Akkord, den sie behaupten', () => {
  it('spielt JEDE Form JEDES Sets auf JEDEM Grundton und prüft die klingenden Töne', () => {
    for (const set of SHAPE_SETS) {
      const tuning = SET_TUNINGS[set.id];
      expect(tuning, `keine Stimmung für Set "${set.id}"`).toBeDefined();

      for (const shape of set.shapes) {
        for (const rootName of ROOT_CHOICES) {
          const chord = Chord.fromQuality(Note.parse(rootName), shape.qualityId);
          const label = `${set.id}/${shape.name} ${chord.name()}`;

          const voicing = voicingsFor(chord, { tuning, maxFret: 24 }).find(
            (v) => v.shapeName === shape.name,
          );
          expect(voicing, label).toBeDefined();

          const sounding = new Set(soundingPitchClasses(tuning, voicing!.frets));
          const expected = new Set(chord.pitchClasses);

          // Kein fremder Ton, und kein Akkordton fehlt.
          expect([...sounding].sort((a, b) => a - b), label).toEqual(
            [...expected].sort((a, b) => a - b),
          );
        }
      }
    }
  });

  it('legt den Grundton in den Bass', () => {
    for (const set of SHAPE_SETS) {
      const tuning = SET_TUNINGS[set.id];

      for (const shape of set.shapes) {
        const chord = Chord.fromQuality(Note.parse('C'), shape.qualityId);
        const voicing = voicingsFor(chord, { tuning, maxFret: 24 }).find(
          (v) => v.shapeName === shape.name,
        )!;

        const bass = soundingPitchClasses(tuning, voicing.frets)[0];
        expect(bass, `${set.id}/${shape.name}`).toBe(chord.root.pitchClass);
      }
    }
  });

  it('dämpft alles unterhalb der Grundton-Saite und beginnt auf Relativbund 0', () => {
    for (const set of SHAPE_SETS) {
      for (const shape of set.shapes) {
        const label = `${set.id}/${shape.name} ${shape.qualityId}`;

        for (let stringIndex = 0; stringIndex < shape.rootString; stringIndex++) {
          expect(shape.frets[stringIndex], label).toBe(-1);
        }

        // Der Grundton liegt NICHT zwingend auf 0 — in Drop D sitzt er auf 2.
        // Die tiefste gegriffene Lage muss aber 0 sein, sonst stimmt baseFret nicht.
        const played = shape.frets.filter((fret) => fret >= 0);
        expect(Math.min(...played), `${label}: tiefster Relativbund`).toBe(0);
      }
    }
  });

  it('setzt die E-Form in Drop D auf der tiefen Saite zwei Bünde höher', () => {
    const standardE = shapeSetFor(Tuning.STANDARD)!.shapes.find(
      (s) => s.name === 'E-Form' && s.qualityId === 'major',
    )!;
    const dropDE = shapeSetFor(Tuning.DROP_D)!.shapes.find(
      (s) => s.name === 'E-Form' && s.qualityId === 'major',
    )!;

    // Die tiefe Saite klingt einen Ganzton tiefer, also muss der Griff dort 2 höher.
    expect(standardE.frets[0]).toBe(0);
    expect(dropDE.frets[0]).toBe(2);
    // Die Saiten darüber sind in Drop D unverändert gestimmt — identischer Griff.
    expect(dropDE.frets.slice(1)).toEqual(standardE.frets.slice(1));
  });

  it('übernimmt die A-Formen unverändert nach Drop D — sie dämpfen die tiefe Saite', () => {
    const standardA = shapeSetFor(Tuning.STANDARD)!.shapes.filter((s) => s.name === 'A-Form');
    const dropDA = shapeSetFor(Tuning.DROP_D)!.shapes.filter((s) => s.name === 'A-Form');

    expect(dropDA).toEqual(standardA);
  });
});

describe('voicingsFor', () => {
  it('liefert offene Akkorde als Bundlage 0', () => {
    const eMajor = Chord.fromQuality(Note.parse('E'), 'major');
    const eForm = voicingsFor(eMajor).find((v) => v.shapeName === 'E-Form')!;

    expect(eForm.baseFret).toBe(0);
    expect(eForm.frets).toEqual([0, 2, 2, 1, 0, 0]);
  });

  it('verschiebt die Form für andere Grundtöne', () => {
    const gMajor = Chord.fromQuality(Note.parse('G'), 'major');
    const eForm = voicingsFor(gMajor).find((v) => v.shapeName === 'E-Form')!;

    // G liegt im 3. Bund der tiefen E-Saite.
    expect(eForm.baseFret).toBe(3);
    expect(eForm.frets).toEqual([3, 5, 5, 4, 3, 3]);
  });

  it('bietet für die meisten Akkorde E- und A-Form an', () => {
    const cMajor = Chord.fromQuality(Note.parse('C'), 'major');
    expect(voicingsFor(cMajor).map((v) => v.shapeName).sort()).toEqual(['A-Form', 'E-Form']);
  });

  it('sortiert die tiefste Lage nach vorn — die greift man wirklich', () => {
    // A gibt es offen (A-Form, Bund 0); die E-Form läge im 5. Bund.
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    expect(voicingsFor(aMajor)[0]).toMatchObject({ shapeName: 'A-Form', baseFret: 0 });

    // D: A-Form im 5. Bund statt E-Form im 10.
    const dMajor = Chord.fromQuality(Note.parse('D'), 'major');
    expect(voicingsFor(dMajor)[0]).toMatchObject({ shapeName: 'A-Form', baseFret: 5 });

    for (const rootName of ROOT_CHOICES) {
      const voicings = voicingsFor(Chord.fromQuality(Note.parse(rootName), 'major'));
      const baseFrets = voicings.map((v) => v.baseFret);
      expect([...baseFrets].sort((a, b) => a - b), rootName).toEqual(baseFrets);
    }
  });

  it('lässt Formen weg, die über den Hals hinauslaufen', () => {
    const chord = Chord.fromQuality(Note.parse('Eb'), 'major');
    expect(voicingsFor(chord, { maxFret: 5 }).every((v) => Math.max(...v.frets) <= 5)).toBe(true);
  });

  it('findet auch für Akkorde ohne hinterlegte Form einen Griff (über den Generator)', () => {
    const exotic = Chord.fromQuality(Note.parse('C'), 'augmentedMajor7');
    const voicings = voicingsFor(exotic);
    // Kein benannter Griff existiert — der Generator liefert trotzdem einen.
    expect(voicings.length).toBeGreaterThan(0);
    expect(voicings.every((v) => v.shapeName === '')).toBe(true);
  });

  it('markiert offene Lagen als nicht-Barré', () => {
    const eMajor = Chord.fromQuality(Note.parse('E'), 'major');
    const voicings = voicingsFor(eMajor);

    expect(voicings.find((v) => v.baseFret === 0)!.isBarre).toBe(false);
    expect(voicings.every((v) => v.isBarre === v.baseFret > 0)).toBe(true);
  });
});

describe('voicingsFor filtert nichts weg', () => {
  it('behält die offene Lage neben den Barré-Lagen', () => {
    // Der Picker zeigt alles; die Vorauswahl entscheidet nur, was aktiv ist.
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    const baseFrets = voicingsFor(aMajor).map((v) => v.baseFret);

    expect(baseFrets).toContain(0);
    expect(baseFrets).toContain(5);
    expect(baseFrets).toContain(12);
  });

  it('findet für jeden diatonischen Dreiklang von C-Dur mindestens eine Form', () => {
    for (const chord of diatonicChords(new Scale(Note.parse('C'), MAJOR))) {
      expect(voicingsFor(chord).length, chord.name()).toBeGreaterThan(0);
    }
  });
});

describe('Oktavlagen', () => {
  it('bietet dieselbe Form 12 Bünde höher noch einmal an', () => {
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    const voicings = voicingsFor(aMajor);

    // A-Form offen (0), E-Form (5), A-Form eine Oktave höher (12).
    expect(voicings.map((v) => [v.shapeName, v.baseFret])).toEqual([
      ['A-Form', 0],
      ['E-Form', 5],
      ['A-Form', 12],
    ]);
  });

  it('klingt die Oktavlage wie derselbe Akkord', () => {
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    const octave = voicingsFor(aMajor).find((v) => v.baseFret === 12)!;

    expect(new Set(soundingPitchClasses(Tuning.STANDARD, octave.frets))).toEqual(
      new Set(aMajor.pitchClasses),
    );
  });

  it('läuft nicht über den Hals hinaus', () => {
    for (const rootName of ROOT_CHOICES) {
      const chord = Chord.fromQuality(Note.parse(rootName), 'major');
      for (const voicing of voicingsFor(chord, { maxFret: 15 })) {
        expect(Math.max(...voicing.frets), `${chord.name()} @ ${voicing.baseFret}`).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('Formen-Sets werden über die Saiten-Intervalle zugeordnet', () => {
  const cMajor = Chord.fromQuality(Note.parse('C'), 'major');

  it('hat für beide angebotenen Stimmungen ein Set', () => {
    for (const tuning of Tuning.ALL) {
      expect(hasChordShapes(tuning), tuning.name).toBe(true);
    }
    expect(shapeSetFor(Tuning.STANDARD)!.id).toBe('standard');
    expect(shapeSetFor(Tuning.DROP_D)!.id).toBe('drop-d');
  });

  it('behält das Set unter dem Kapo — der verschiebt alle Saiten gleich', () => {
    expect(shapeSetFor(Tuning.STANDARD.withCapo(4))!.id).toBe('standard');
    expect(shapeSetFor(Tuning.DROP_D.withCapo(3))!.id).toBe('drop-d');
  });

  it('findet auch in einer Stimmung ohne Formen-Set korrekte Griffe (generiert)', () => {
    // Open G — hier stimmen die Saitenabstände mit keinem Set überein, also gibt
    // es keine benannte Form. Der Generator sucht die Griffe direkt in dieser
    // Stimmung, statt eine Standardform aufzuzwingen, die falsch klänge.
    const openG = new Tuning('open-g', 'Open G', [38, 43, 50, 55, 59, 62]);
    expect(hasChordShapes(openG)).toBe(false);

    const voicings = voicingsFor(cMajor, { tuning: openG });
    expect(voicings.length).toBeGreaterThan(0);
    for (const voicing of voicings) {
      const sounding = voicing.frets
        .map((fret, string) => (fret < 0 ? null : openG.pitchClassAt(string, fret)))
        .filter((pitchClass): pitchClass is number => pitchClass !== null);
      // Nur Akkordtöne, kein fremder — und der Grundton im Bass.
      expect(new Set(sounding)).toEqual(new Set(cMajor.pitchClasses));
      expect(sounding[0]).toBe(cMajor.root.pitchClass);
    }
  });

  it('greift dieselben Formen in Eb einen Bund höher', () => {
    // Eb verschiebt alle sechs Saiten gleich weit, lässt die Intervalle also in
    // Ruhe und erbt dadurch das Standard-Set. Derselbe klingende Akkord will dann
    // aber einen Bund weiter oben gegriffen werden — die Form wandert, sie ändert
    // sich nicht. Gedämpfte Saiten bleiben gedämpft.
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    const standard = voicingsFor(aMajor);
    const eb = voicingsFor(aMajor, { tuning: Tuning.EB });

    expect(eb.map((v) => v.shapeName)).toEqual(standard.map((v) => v.shapeName));
    expect(eb.map((v) => v.frets)).toEqual(
      standard.map((v) => v.frets.map((fret) => (fret < 0 ? fret : fret + 1))),
    );
  });

  it('rechnet mit Kapo die Bünde ab dem Kapo', () => {
    // Mit Kapo 2 liegt D zwei Bünde über dem Kapo auf der A-Saite.
    const dMajor = Chord.fromQuality(Note.parse('D'), 'major');
    const capo2 = voicingsFor(dMajor, { tuning: Tuning.STANDARD.withCapo(2) });

    expect(capo2.find((v) => v.shapeName === 'A-Form')!.baseFret).toBe(3);
    expect(capo2.find((v) => v.shapeName === 'E-Form')!.baseFret).toBe(8);
  });
});

describe('Drop D in der Praxis', () => {
  it('greift D-Dur mit den drei tiefen Saiten leer — der Grund für Drop D', () => {
    const dMajor = Chord.fromQuality(Note.parse('D'), 'major');
    const shape = voicingsFor(dMajor, { tuning: Tuning.DROP_D }).find(
      (v) => v.shapeName === 'D-Form',
    )!;

    expect(shape.baseFret).toBe(0);
    expect(shape.frets).toEqual([0, 0, 0, 2, 3, 2]);
    // Die leere tiefe Saite trägt den Grundton.
    expect(Tuning.DROP_D.pitchClassAt(0, 0)).toBe(dMajor.root.pitchClass);
  });

  it('ergibt für G-Dur den bekannten Drop-D-Barré im 3. Bund', () => {
    const gMajor = Chord.fromQuality(Note.parse('G'), 'major');
    const shape = voicingsFor(gMajor, { tuning: Tuning.DROP_D }).find(
      (v) => v.shapeName === 'E-Form',
    )!;

    // Standard wäre [3,5,5,4,3,3]; in Drop D wandert nur die tiefe Saite auf 5.
    expect(shape.frets).toEqual([5, 5, 5, 4, 3, 3]);
    expect(shape.baseFret).toBe(3);
  });

  it('bietet die D-Form auf jedem Grundton an — sie kommt bis Bund 0 herunter', () => {
    for (const rootName of ROOT_CHOICES) {
      const chord = Chord.fromQuality(Note.parse(rootName), 'major');
      const dForm = voicingsFor(chord, { tuning: Tuning.DROP_D }).find(
        (v) => v.shapeName === 'D-Form',
      );

      expect(dForm, `${chord.name()} D-Form`).toBeDefined();
      // Der Grundton liegt auf dem Barré selbst.
      expect(Tuning.DROP_D.pitchClassAt(0, dForm!.baseFret)).toBe(chord.root.pitchClass);
    }
  });

  it('findet für jeden diatonischen Dreiklang von D-Dur einen Griff', () => {
    for (const chord of diatonicChords(new Scale(Note.parse('D'), MAJOR))) {
      const voicings = voicingsFor(chord, { tuning: Tuning.DROP_D });
      expect(voicings.length, chord.name()).toBeGreaterThan(0);
    }
  });
});

describe('defaultVoicingIndex', () => {
  const QUALITIES_WITH_SHAPES = [
    ...new Set(shapeSetFor(Tuning.STANDARD)!.shapes.map((shape) => shape.qualityId)),
  ];

  it('wählt die tiefste Barré-Lage statt der offenen', () => {
    // A gäbe es offen (A-Form, Bund 0) — vorausgewählt wird trotzdem die E-Form im 5.
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    const aVoicings = voicingsFor(aMajor);
    expect(aVoicings[defaultVoicingIndex(aVoicings)]).toMatchObject({
      shapeName: 'E-Form',
      baseFret: 5,
    });

    // E offen (E-Form, Bund 0) — vorausgewählt wird die A-Form im 7.
    const eMajor = Chord.fromQuality(Note.parse('E'), 'major');
    const eVoicings = voicingsFor(eMajor);
    expect(eVoicings[defaultVoicingIndex(eVoicings)]).toMatchObject({
      shapeName: 'A-Form',
      baseFret: 7,
    });
  });

  it('nimmt bei Akkorden ohne offene Lage schlicht die tiefste', () => {
    const cMajor = Chord.fromQuality(Note.parse('C'), 'major');
    const voicings = voicingsFor(cMajor);

    expect(defaultVoicingIndex(voicings)).toBe(0);
    expect(voicings[0]).toMatchObject({ shapeName: 'A-Form', baseFret: 3 });
  });

  it('findet für JEDE Qualität auf JEDEM Grundton eine Barré-Lage', () => {
    // Der Grundton kann nicht gleichzeitig auf Bund 0 der E- und der A-Saite
    // liegen — eine der beiden Formen ist also immer vom Sattel weg.
    for (const qualityId of QUALITIES_WITH_SHAPES) {
      for (const rootName of ROOT_CHOICES) {
        const chord = Chord.fromQuality(Note.parse(rootName), qualityId);
        const voicings = voicingsFor(chord);
        const selected = voicings[defaultVoicingIndex(voicings)];

        expect(selected?.isBarre, `${chord.name()} (${qualityId})`).toBe(true);
      }
    }
  });

  it('fällt auf die erste Lage zurück, wenn es gar keine gegriffene gibt', () => {
    const aMajor = Chord.fromQuality(Note.parse('A'), 'major');
    const onlyOpen = voicingsFor(aMajor, { maxFret: 4 });

    expect(onlyOpen.every((v) => !v.isBarre)).toBe(true);
    expect(defaultVoicingIndex(onlyOpen)).toBe(0);
  });
});
