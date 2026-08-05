import { describe, expect, it } from 'vitest';
import { buildProgression, PROGRESSIONS } from './Progression';
import { defaultVoicingIndex, voicingsFor, type Voicing } from './ChordShape';
import { Note } from './Note';
import { Scale } from './Scale';
import { scaleTypeById } from './ScaleType';
import { Tuning } from './Tuning';
import { voicingPath } from './voicingPath';

/** Where the hand sits — the same measure voicingPath prices its edges with. */
function position(voicing: Voicing): number {
  const fretted = voicing.frets.filter((fret) => fret > 0);
  return fretted.length === 0 ? 0 : Math.min(...fretted);
}

/** Total frets the hand travels across a whole progression. */
function travel(lists: readonly (readonly Voicing[])[], picks: readonly number[]): number {
  const chosen = lists.map((list, i) => list[picks[i]]).filter((v): v is Voicing => v !== undefined);

  let total = 0;
  for (let i = 1; i < chosen.length; i++) {
    total += Math.abs(position(chosen[i]) - position(chosen[i - 1]));
  }
  return total;
}

function gripsFor(progressionId: string, rootName: string, scaleTypeId: string) {
  const scale = new Scale(Note.parse(rootName), scaleTypeById(scaleTypeId));
  const progression = PROGRESSIONS.find((p) => p.id === progressionId)!;
  return buildProgression(scale, progression, 3).map((step) =>
    voicingsFor(step.chord, { tuning: Tuning.STANDARD }),
  );
}

const ROOTS = ['C', 'G', 'A', 'E', 'D', 'F'] as const;

/** Every preset in every key — the whole surface the change is claimed to improve. */
function everyProgression() {
  return PROGRESSIONS.flatMap((progression) =>
    ROOTS.map((root) => ({
      label: `${progression.id} in ${root}`,
      lists: gripsFor(
        progression.id,
        root,
        progression.fits === 'minor' ? 'natural-minor' : 'major',
      ),
    })),
  );
}

describe('voicingPath', () => {
  it('lässt die Hand nirgends weiter wandern als die Wahl Akkord für Akkord', () => {
    // Die Behauptung des Umbaus, gemessen statt geglaubt — und ohne Ausnahme.
    // Genau daran hing COMFORT_WEIGHT: bei 0,25 verschlechterte sich der 12-Takt-
    // Blues in A von 6 auf 15 Bünde, weil A7 und E7 einen offenen Griff haben und
    // D7 keinen. Der Test ist der Grund, dass das nicht unbemerkt zurückkommt.
    for (const { label, lists } of everyProgression()) {
      const perChord = travel(lists, lists.map(defaultVoicingIndex));
      const asPath = travel(lists, voicingPath(lists));

      expect(asPath, label).toBeLessThanOrEqual(perChord);
    }
  });

  it('spart über alle Presets hinweg deutlich, nicht nur im Einzelfall', () => {
    let perChord = 0;
    let asPath = 0;
    for (const { lists } of everyProgression()) {
      perChord += travel(lists, lists.map(defaultVoicingIndex));
      asPath += travel(lists, voicingPath(lists));
    }

    // Gemessen 240 → 128. Die Schranke lässt Luft für neue Presets und Griffe,
    // schlägt aber an, wenn die Kostenfunktion ihren Zweck verliert.
    expect(asPath).toBeLessThan(perChord * 0.75);
  });

  it('liefert für jeden Schritt einen gültigen Index', () => {
    for (const progression of PROGRESSIONS) {
      const scaleTypeId = progression.fits === 'minor' ? 'natural-minor' : 'major';
      const lists = gripsFor(progression.id, 'A', scaleTypeId);
      const picks = voicingPath(lists);

      expect(picks).toHaveLength(lists.length);
      picks.forEach((pick, i) => {
        expect(pick, progression.id).toBeGreaterThanOrEqual(0);
        // Eine leere Liste liefert 0 — es gibt dann nichts auszuwählen.
        expect(pick, progression.id).toBeLessThan(Math.max(1, lists[i].length));
      });
    }
  });

  it('bricht an einem Akkord ohne Griffe nicht ab', () => {
    // Eine Stimmung ohne Formen-Set liefert für manche Akkorde []. Der Schritt
    // bekommt 0 und die Kette läuft über ihn hinweg weiter.
    const lists = gripsFor('I-V-vi-IV', 'C', 'major');
    const withGap = [lists[0], [], lists[2], lists[3]];

    const picks = voicingPath(withGap);
    expect(picks).toHaveLength(4);
    expect(picks[1]).toBe(0);
    expect(picks[2]).toBeLessThan(lists[2].length);
  });

  it('kommt mit einer leeren Folge klar', () => {
    expect(voicingPath([])).toEqual([]);
    expect(voicingPath([[], []])).toEqual([0, 0]);
  });
});
