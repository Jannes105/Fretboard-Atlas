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

  it('spielt beim Druck auf einen Notenkreis dessen echte Tonhöhe', () => {
    const onHoldNote = vi.fn(() => ({ release: vi.fn() }));
    const { container } = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onHoldNote={onHoldNote}
      />,
    );

    // Die Notengruppen werden in der Reihenfolge von mapScale gezeichnet.
    const firstNote = board.mapScale(aMajor)[0];
    fireEvent.pointerDown(container.querySelector('.note')!, { pointerId: 1 });

    expect(onHoldNote).toHaveBeenCalledExactlyOnceWith(firstNote.midi);
  });

  it('markiert das Griffbrett nur als spielbar, wenn ein Handler da ist', () => {
    const { container: without } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" />,
    );
    expect(without.querySelector('.fretboard--playable')).toBeNull();

    const { container: withHandler } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" onHoldNote={() => ({ release: () => {} })} />,
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

  it('verzichtet im Ausschnitt auf den Lagen-Rahmen', () => {
    // Der Ausschnitt IST die Lage. Ein Rahmen darin saegte ein drittes Mal, was
    // der Zuschnitt und die gedimmten Nachbarbuende schon sagen.
    const { container } = render(
      <FretboardView
        scale={aMinorPentatonic}
        fretboard={board}
        labelMode="note"
        position={position}
        zoom
      />,
    );

    expect(container.querySelector('.box-outline')).toBeNull();
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
        onHoldNote={() => ({ release: () => {} })}
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
    const onHoldNote = vi.fn(() => ({ release: vi.fn() }));
    const { container } = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onHoldNote={onHoldNote}
      />,
    );

    fireEvent.pointerDown(container.querySelector('.note-hit')!, { pointerId: 1 });
    expect(onHoldNote).toHaveBeenCalledExactlyOnceWith(board.mapScale(aMajor)[0].midi);
  });
});

describe('FretboardView — Halten und Loslassen', () => {
  /** Renders a neck and hands back the handles it has given out. */
  function playable() {
    const handles: { release: ReturnType<typeof vi.fn> }[] = [];
    const onHoldNote = vi.fn(() => {
      const handle = { release: vi.fn() };
      handles.push(handle);
      return handle;
    });

    const view = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onHoldNote={onHoldNote}
      />,
    );

    return { ...view, handles, onHoldNote, notes: [...view.container.querySelectorAll('.note')] };
  }

  it('laesst den Ton los, wenn der Finger hochgeht', () => {
    const { notes, handles } = playable();

    fireEvent.pointerDown(notes[0], { pointerId: 1 });
    expect(handles[0].release).not.toHaveBeenCalled();

    fireEvent.pointerUp(notes[0], { pointerId: 1 });
    expect(handles[0].release).toHaveBeenCalledOnce();
  });

  it('laesst genau einmal los, egal wie viele Ereignisse dasselbe Anheben melden', () => {
    // pointerup und lostpointercapture kommen fuer ein Anheben regulaer beide, weil
    // die Erfassung danach implizit faellt. Ein zweites release waere ein zweites
    // Ausblenden auf einem Ton, den es nicht mehr gibt.
    const { notes, handles } = playable();

    fireEvent.pointerDown(notes[0], { pointerId: 1 });
    fireEvent.pointerUp(notes[0], { pointerId: 1 });
    fireEvent.lostPointerCapture(notes[0], { pointerId: 1 });
    fireEvent.pointerCancel(notes[0], { pointerId: 1 });

    expect(handles[0].release).toHaveBeenCalledOnce();
  });

  it('haelt mehrere Toene gleichzeitig, einen je Finger', () => {
    const { notes, handles, onHoldNote } = playable();

    fireEvent.pointerDown(notes[0], { pointerId: 1 });
    fireEvent.pointerDown(notes[1], { pointerId: 2 });
    expect(onHoldNote).toHaveBeenCalledTimes(2);

    // Ein Finger geht hoch und nimmt nur seinen eigenen Ton mit.
    fireEvent.pointerUp(notes[0], { pointerId: 1 });
    expect(handles[0].release).toHaveBeenCalledOnce();
    expect(handles[1].release).not.toHaveBeenCalled();
  });

  it('schneidet den Ton ab, wenn der Browser die Geste als Wischen abbricht', () => {
    // Der Hals scrollt seitlich, also beginnt manche Wischgeste auf einem Punkt.
    // Kurz abgeschnitten hinterlaesst das ein Klicken statt eines Tons.
    const { notes, handles } = playable();

    fireEvent.pointerDown(notes[0], { pointerId: 1 });
    fireEvent.pointerCancel(notes[0], { pointerId: 1 });

    expect(handles[0].release).toHaveBeenCalledOnce();
    // Kuerzer als das Ausblenden beim gewollten Loslassen.
    expect(handles[0].release.mock.calls[0][0]).toBeLessThan(0.05);
  });

  it('laesst beim Verschwinden des Halses alles los, was noch gehalten wird', () => {
    const { notes, handles, unmount } = playable();

    fireEvent.pointerDown(notes[0], { pointerId: 1 });
    unmount();

    expect(handles[0].release).toHaveBeenCalledOnce();
  });

  it('spielt den Ton auch, wenn die Pointer-Erfassung fehlschlaegt', () => {
    /*
     * setPointerCapture wirft NotFoundError, sobald der Zeiger zum Zeitpunkt des
     * Handlers nicht mehr aktiv ist. Stand der Aufruf vor dem Ton, fiel damit der
     * ganze Ton aus — ein stummer Punkt ist weit schlimmer als ein pointerup, das
     * woanders ankommt.
     */
    const { notes, onHoldNote, handles } = playable();
    Object.defineProperty(notes[0], 'setPointerCapture', {
      configurable: true,
      value: () => {
        throw new Error('NotFoundError');
      },
    });

    expect(() => fireEvent.pointerDown(notes[0], { pointerId: 1 })).not.toThrow();
    expect(onHoldNote).toHaveBeenCalledOnce();

    // Und er laesst sich danach ganz normal wieder los.
    fireEvent.pointerUp(notes[0], { pointerId: 1 });
    expect(handles[0].release).toHaveBeenCalledOnce();
  });

  it('kommt ohne Pointer-Erfassung aus', () => {
    // jsdom hat weder setPointerCapture noch releasePointerCapture noch
    // hasPointerCapture. Ungeprueft aufgerufen stirbt der Handler beim ersten
    // Finger — genau die Umgebung, in der diese Tests laufen.
    const { notes } = playable();

    expect(
      (notes[0] as SVGGElement & { setPointerCapture?: unknown }).setPointerCapture,
    ).toBeUndefined();
    expect(() => fireEvent.pointerDown(notes[0], { pointerId: 1 })).not.toThrow();
  });
});

describe('FretboardView — Hinweis unter dem Hals', () => {
  it('sagt unter dem Hals, dass ein gehaltener Ton klingt', () => {
    // Bis hierhin verriet das nur ein Hover-Title — und ein Finger schwebt nicht.
    const { container } = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onHoldNote={vi.fn(() => ({ release: vi.fn() }))}
      />,
    );

    expect(container.querySelector('.fretboard-hint')?.textContent).toContain('halten');
  });

  it('schweigt, wo es nichts abzuspielen gibt', () => {
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" />,
    );
    expect(container.querySelector('.fretboard-hint')).toBeNull();
  });

  it('verschweigt den Wisch-Hinweis, solange nichts abgeschnitten ist', () => {
    // jsdom rechnet kein Layout: scrollWidth ist 0, also laeuft nichts ueber —
    // genau der ruhige Fall, den der Hinweis nicht kommentieren soll.
    const { container } = render(
      <FretboardView
        scale={aMajor}
        fretboard={board}
        labelMode="note"
        onHoldNote={vi.fn(() => ({ release: vi.fn() }))}
      />,
    );

    expect(container.querySelector('.fretboard-hint')?.textContent).not.toContain('wischen');
    expect(container.querySelector('.fretboard-scroll--more')).toBeNull();
  });
});

describe('FretboardView — Lage des Halses', () => {
  const firstDot = (container: HTMLElement) => {
    const nut = container.querySelector('.nut')!;
    return {
      nutX: Number(nut.getAttribute('x1')),
      nutY: Number(nut.getAttribute('y1')),
      viewBox: container.querySelector('svg.fretboard')!.getAttribute('viewBox')!.split(' ').map(Number),
    };
  };

  it('legt den Hals aufrecht: der Sattel liegt quer oben', () => {
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" vertical />,
    );
    const nut = container.querySelector('.nut')!;
    // Quer: beide Enden auf derselben Höhe.
    expect(nut.getAttribute('y1')).toBe(nut.getAttribute('y2'));
    const { viewBox } = firstDot(container);
    // Höher als breit — ein aufrechter Hals.
    expect(viewBox[3]).toBeGreaterThan(viewBox[2]);
  });

  it('spiegelt den Hals für Linkshänder: der Sattel steht rechts', () => {
    const right = render(<FretboardView scale={aMajor} fretboard={board} labelMode="note" />);
    const rightNut = firstDot(right.container).nutX;
    right.unmount();

    const left = render(<FretboardView scale={aMajor} fretboard={board} labelMode="note" lefty />);
    const { nutX, viewBox } = firstDot(left.container);
    expect(nutX).toBeGreaterThan(viewBox[0] + viewBox[2] / 2);
    expect(rightNut).toBeLessThan(viewBox[2] / 2);
  });

  it('zeichnet in jeder Lage gleich viele Punkte — nur an anderer Stelle', () => {
    const counts = [false, true].flatMap((vertical) =>
      [false, true].map((lefty) => {
        const { container, unmount } = render(
          <FretboardView scale={aMajor} fretboard={board} labelMode="note" vertical={vertical} lefty={lefty} />,
        );
        const n = dots(container).length;
        unmount();
        return n;
      }),
    );
    expect(new Set(counts).size).toBe(1);
  });
});

describe('FretboardView — Akkordtöne außerhalb der Skala', () => {
  // F-Dur in A-Moll-Pentatonik: A und C liegen in der Skala, F nicht.
  const f = Note.parse('F').pitchClass;
  const a = Note.parse('A').pitchClass;
  const c = Note.parse('C').pitchClass;
  const chordTones = {
    root: f,
    names: new Map([
      [f, 'F'],
      [a, 'A'],
      [c, 'C'],
    ]),
    intervals: new Map([
      [f, '1'],
      [a, '3'],
      [c, '5'],
    ]),
  };

  it('zeichnet den fehlenden Ton hohl, statt den Akkord zum Zweiklang zu machen', () => {
    const { container } = render(
      <FretboardView
        scale={aMinorPentatonic}
        fretboard={board}
        labelMode="note"
        highlight={[f, a, c]}
        chordTones={chordTones}
      />,
    );
    const ghosts = container.querySelectorAll('.note-dot--ghost');
    const fPositions = board.allPositions().filter((p) => p.pitchClass === f).length;
    expect(ghosts).toHaveLength(fPositions);
    // Die Skala selbst bleibt unberührt: ein Punkt je Skalenposition.
    expect(container.querySelectorAll('.note-dot:not(.note-dot--ghost)')).toHaveLength(
      board.mapScale(aMinorPentatonic).length,
    );
  });

  it('beschriftet im Stufen-Modus vom Akkordgrundton aus', () => {
    const { container } = render(
      <FretboardView
        scale={aMinorPentatonic}
        fretboard={board}
        labelMode="degree"
        highlight={[f, a, c]}
        chordTones={chordTones}
      />,
    );
    const picked = new Set(
      [...container.querySelectorAll('.note-label--picked')].map((el) => el.textContent),
    );
    // A ist die Terz von F, C die Quinte — nicht „1" und „b3" der Tonart A-Moll.
    expect(picked).toEqual(new Set(['3', '5']));
  });
});

describe('FretboardView — Tastatur', () => {
  it('wandert mit den Pfeiltasten und spielt mit der Leertaste', () => {
    const release = vi.fn();
    const onHoldNote = vi.fn(() => ({ release }));
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" onHoldNote={onHoldNote} />,
    );
    const svg = container.querySelector('svg.fretboard')!;

    fireEvent.focus(svg);
    // Vom leeren tiefen E zwei Bünde nach rechts: F#.
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    fireEvent.keyDown(svg, { key: ' ' });

    expect(onHoldNote).toHaveBeenCalledWith(40 + 2);
    fireEvent.keyUp(svg, { key: ' ' });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('sagt an, wo der Cursor steht', () => {
    const { container } = render(
      <FretboardView scale={aMajor} fretboard={board} labelMode="note" onHoldNote={() => ({ release() {} })} />,
    );
    const svg = container.querySelector('svg.fretboard')!;
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });

    expect(container.querySelector('[aria-live]')?.textContent).toContain('1. Bund');
  });
});
