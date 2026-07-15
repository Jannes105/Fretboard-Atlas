// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Fretboard, Note, Scale, MAJOR, MINOR_PENTATONIC } from '../theory';
import { FretboardView } from './FretboardView';

const board = new Fretboard(undefined, 15);
const aMajor = new Scale(Note.parse('A'), MAJOR);

function dots(container: HTMLElement) {
  return [...container.querySelectorAll('.note-dot')];
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FretboardView', () => {
  it('zeichnet genau einen Punkt je Skalen-Position', () => {
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" />,
    );
    expect(dots(container)).toHaveLength(board.mapScale(aMajor).length);
  });

  it('markiert die Grundtöne als root', () => {
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" />,
    );
    const roots = board.mapScale(aMajor).filter((p) => p.isRoot).length;
    expect(container.querySelectorAll('.note-dot--root')).toHaveLength(roots);
  });

  it('hebt die gepickten Tonklassen hervor und dimmt den Rest', () => {
    // Die Terz von A-Dur ist C# (Tonklasse 1).
    const cSharp = Note.parse('C#').pitchClass;
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" highlight={[cSharp]} />,
    );

    const picked = container.querySelectorAll('.note-dot--picked');
    const pickedCount = board.mapScale(aMajor).filter((p) => p.pitchClass === cSharp).length;

    expect(picked).toHaveLength(pickedCount);
    // Alles andere ist gedimmt.
    const dimmed = container.querySelectorAll('.note-dot.is-dimmed').length;
    expect(dimmed).toBe(dots(container).length - pickedCount);
  });

  it('dimmt bei gewählter Lage die Töne außerhalb des Fensters', () => {
    const pent = new Scale(Note.parse('A'), MINOR_PENTATONIC);
    const box = board.scalePositions(pent)[0]; // Lage 1, Fenster um Bund 5

    const { container } = render(
      <FretboardView scale={pent} fretboard={board} labelMode="degree" position={box} />,
    );

    const inBox = board
      .mapScale(pent)
      .filter((p) => p.fret >= box.startFret && p.fret <= box.endFret).length;
    const undimmed = dots(container).filter((d) => !d.classList.contains('is-dimmed')).length;

    expect(undimmed).toBe(inBox);
  });
});
