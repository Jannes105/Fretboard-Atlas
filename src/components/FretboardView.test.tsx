// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Fretboard, Note, Scale, MAJOR, MINOR_PENTATONIC } from '../theory';
import { FretboardView } from './FretboardView';

const board = new Fretboard(undefined, 15);
const aMajor = new Scale(Note.parse('A'), MAJOR);
const aMinorPentatonic = new Scale(Note.parse('A'), MINOR_PENTATONIC);

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

  it('spielt beim Klick auf einen Notenkreis dessen echte Tonhöhe', () => {
    const onPlayNote = vi.fn();
    const { container } = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onPlayNote={onPlayNote}
      />,
    );

    // Die Notengruppen werden in der Reihenfolge von mapScale gezeichnet.
    const firstNote = board.mapScale(aMajor)[0];
    fireEvent.click(container.querySelector('.note')!);

    expect(onPlayNote).toHaveBeenCalledExactlyOnceWith(firstNote.midi);
  });

  it('markiert das Griffbrett nur als spielbar, wenn ein Handler da ist', () => {
    const { container: without } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" />,
    );
    expect(without.querySelector('.fretboard--playable')).toBeNull();

    const { container: withHandler } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" onPlayNote={() => {}} />,
    );
    expect(withHandler.querySelector('.fretboard--playable')).not.toBeNull();
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

describe('FretboardView — Lage im Ausschnitt', () => {
  const viewWidth = (container: HTMLElement) =>
    Number(container.querySelector('svg.fretboard')!.getAttribute('viewBox')!.split(' ')[2]);

  const position = { number: 1, anchorFret: 5, startFret: 4, endFret: 8 };

  it('beschneidet die Zeichnung auf die Lage, statt den ganzen Hals zu zeigen', () => {
    const { container: full } = render(
      <FretboardView scale={aMinorPentatonic} fretboard={board} labelMode="note" />,
    );
    const wide = viewWidth(full);
    document.body.innerHTML = '';

    const { container: zoomed } = render(
      <FretboardView
        scale={aMinorPentatonic}
        fretboard={board}
        labelMode="note"
        position={position}
        zoom
      />,
    );

    expect(viewWidth(zoomed)).toBeLessThan(wide);
    // Die Toene bleiben im DOM und werden nur vom Ausschnitt abgeschnitten — die
    // gedimmten Nachbarn sind weiterhin Teil des Bildes.
    expect(zoomed.querySelectorAll('.note-dot')).toHaveLength(
      board.mapScale(aMinorPentatonic).length,
    );
  });

  it('zeigt ohne zoom den ganzen Hals, die Lage aber weiterhin umrandet', () => {
    const { container } = render(
      <FretboardView
        scale={aMinorPentatonic}
        fretboard={board}
        labelMode="note"
        position={position}
        zoom={false}
      />,
    );

    const { container: plain } = render(
      <FretboardView scale={aMinorPentatonic} fretboard={board} labelMode="note" />,
    );

    expect(viewWidth(container)).toBe(viewWidth(plain));
    expect(container.querySelector('.box-outline')).not.toBeNull();
  });

  it('behaelt im Ausschnitt die Saitennamen', () => {
    const { container } = render(
      <FretboardView
        scale={aMinorPentatonic}
        fretboard={board}
        labelMode="note"
        position={{ number: 4, anchorFret: 12, startFret: 11, endFret: 15 }}
        zoom
      />,
    );

    expect(container.querySelectorAll('.string-label')).toHaveLength(6);
  });
});

describe('FretboardView — Scrollen zur Lage', () => {
  it('wirft nicht, wenn die Umgebung kein Layout hat', () => {
    // jsdom rechnet kein Layout: scrollWidth ist 0 und scrollTo fehlt. Der Effekt
    // muss das aushalten, statt beim Rendern zu sterben. Das echte Verhalten laesst
    // sich hier nicht pruefen — es haengt an genau den Zahlen, die jsdom nicht hat.
    expect(() =>
      render(
        <FretboardView
          scale={aMinorPentatonic}
          fretboard={board}
          labelMode="note"
          position={{ number: 4, anchorFret: 12, startFret: 11, endFret: 15 }}
          zoom={false}
        />,
      ),
    ).not.toThrow();
  });
});

describe('FretboardView — Trefferflaeche fuer den Finger', () => {
  it('legt unter jede spielbare Note eine unsichtbare Flaeche', () => {
    const { container } = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onPlayNote={() => {}}
      />,
    );
    expect(container.querySelectorAll('.note-hit')).toHaveLength(
      container.querySelectorAll('.note').length,
    );
  });

  it('laesst sie weg, wo nichts zu spielen ist', () => {
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" />,
    );
    expect(container.querySelectorAll('.note-hit')).toHaveLength(0);
  });

  it('spielt beim Treffer der Flaeche denselben Ton wie beim Treffer des Punktes', () => {
    const onPlayNote = vi.fn();
    const { container } = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onPlayNote={onPlayNote}
      />,
    );

    fireEvent.click(container.querySelector('.note-hit')!);
    expect(onPlayNote).toHaveBeenCalledExactlyOnceWith(board.mapScale(aMajor)[0].midi);
  });
});
