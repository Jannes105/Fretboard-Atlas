// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Type-only: erased at runtime, so it does not defeat the vi.mock below.
import type { ProgressionOptions } from './audio';

// The audio engine is replaced by a spy: the tests check that the UI asks for the
// right notes, without a real AudioContext (which jsdom has not got anyway).
const { player, transport } = vi.hoisted(() => {
  const transport = { stop: vi.fn() };
  return {
    transport,
    player: {
      play: vi.fn(),
      playNote: vi.fn(),
      // Typed params, so the recorded calls stay inspectable in the tests below.
      startProgression: vi.fn(
        (_chords: readonly (readonly number[])[], _options: ProgressionOptions) => transport,
      ),
      stop: vi.fn(),
      available: true,
    },
  };
});
vi.mock('./audio', () => ({ createAudioPlayer: () => player }));

import App from './App';

beforeEach(() => {
  // Each test starts from a clean URL, or App would inherit the previous state.
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});

afterEach(cleanup);

function pickedLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.note-label--picked')].map((el) => el.textContent ?? '');
}

describe('App — Grundzustand', () => {
  it('rendert den Namen der Default-Tonart', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('A-Dur (Ionisch)');
  });
});

describe('App — Hervorhebung', () => {
  it('hebt beim Klick auf einen Stufen-Chip genau diese Tonklasse hervor', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // 3. Chip = Terz von A-Dur = C#.
    const chips = container.querySelectorAll<HTMLButtonElement>('.degree-chip');
    await user.click(chips[2]);

    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
    const labels = pickedLabels(container);
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels)).toEqual(new Set(['C#']));
  });

  it('löst beim Klick auf eine Akkordkarte die Stufen-Hervorhebung ab', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const chips = container.querySelectorAll<HTMLButtonElement>('.degree-chip');
    await user.click(chips[2]); // C# als Stufe

    const cards = container.querySelectorAll<HTMLButtonElement>('.chord-card');
    await user.click(cards[0]); // I = A-Dur (A C# E)

    // Die Stufe ist nicht mehr aktiv, der Akkord schon — sie schließen sich aus.
    expect(chips[2].getAttribute('aria-pressed')).toBe('false');
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');

    // A ist der Skalengrundton und behält bewusst seine Grundton-Farbe, statt als
    // Akkordton eingefärbt zu werden — gepickt (teal) sind daher nur Terz und Quinte.
    expect(new Set(pickedLabels(container))).toEqual(new Set(['C#', 'E']));
    // Aber es gibt weiterhin Grundton-Punkte (A) auf dem Hals.
    expect(container.querySelectorAll('.note-dot--root').length).toBeGreaterThan(0);
  });

  it('löscht die Hervorhebung über „aufheben“', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]);
    expect(container.querySelectorAll('.note-dot--picked').length).toBeGreaterThan(0);

    await user.click(container.querySelector<HTMLButtonElement>('.picked-actions .link-button')!);
    expect(container.querySelectorAll('.note-dot--picked')).toHaveLength(0);
  });

  it('bleibt beim zweiten Klick hervorgehoben, statt sich wegzuschalten', async () => {
    // Unter „Klick = hören“ klickt man denselben Akkord mehrfach, um ihn mehrfach
    // zu hören — die Hervorhebung dabei zu verlieren wäre überraschend.
    const user = userEvent.setup();
    const { container } = render(<App />);

    const card = container.querySelectorAll<HTMLButtonElement>('.chord-card')[0];
    await user.click(card);
    await user.click(card);

    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(player.play).toHaveBeenCalledTimes(2);
  });
});

describe('App — Klick = hören', () => {
  it('spielt und zeigt einen Akkord mit demselben Klick — ohne eigenen ▶', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // Die Konfetti-Reihe aus Play-Kreisen unter den Karten ist weg.
    expect(container.querySelectorAll('.chord-row .play-button')).toHaveLength(0);

    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[4]); // V = E

    expect(player.play).toHaveBeenCalledTimes(1);
    const [notes, options] = player.play.mock.calls[0];
    expect(notes.length).toBeGreaterThan(3);
    expect(options).toMatchObject({ mode: 'strum', stack: true });
    // Und hervorgehoben ist er auch.
    expect(container.querySelectorAll('.chord-card')[4].getAttribute('aria-pressed')).toBe('true');
  });

  it('spielt beim Klick auf eine Stufe deren Töne', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]);

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('kommt insgesamt mit zwei Play-Buttons aus: Skala und Transport', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('.play-button')).toHaveLength(2);
  });
});

describe('App — Lage', () => {
  it('dimmt bei gewählter Lage die Töne außerhalb des Fensters', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const selects = container.querySelectorAll<HTMLSelectElement>('.toolbar select');
    // Reihenfolge: Grundton, Skala, Lage, ...
    await user.selectOptions(selects[2], '1');

    const all = container.querySelectorAll('.note-dot').length;
    const dimmed = container.querySelectorAll('.note-dot.is-dimmed').length;

    // Eine Lage zeigt nur einen Ausschnitt — es muss gedimmte Töne geben, aber
    // nicht alle.
    expect(dimmed).toBeGreaterThan(0);
    expect(dimmed).toBeLessThan(all);
  });
});

describe('App — Audio-Verdrahtung', () => {
  it('spielt beim Skala-▶ die volle auf- und absteigende Tonleiter (15 Töne)', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.scale-title .play-button')!);

    expect(player.play).toHaveBeenCalledTimes(1);
    const [notes, options] = player.play.mock.calls[0];
    // A-Dur: 8 hoch + 7 runter.
    expect(notes).toHaveLength(15);
    expect(options).toMatchObject({ mode: 'sequence' });
  });

  it('spielt bei einem hervorgehobenen Akkord alle sichtbaren Töne, nicht nur drei', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[0]); // I = A

    const [notes, options] = player.play.mock.calls.at(-1)!;
    // Ein Dreiklang über den ganzen 24-Bund-Hals hat weit mehr als drei Positionen.
    expect(notes.length).toBeGreaterThan(3);
    // Und aufsteigend sortiert (tief nach hoch).
    expect([...notes]).toEqual([...notes].sort((a: number, b: number) => a - b));
    // Akkorde stapeln sich, statt den vorigen abzuwürgen.
    expect(options).toMatchObject({ stack: true });
  });

  it('lässt eine hohe Lage höher klingen als eine tiefe — die Tonhöhe folgt dem Bund', () => {
    const lowestNoteAt = (search: string): number => {
      window.history.replaceState(null, '', search);
      const { container, unmount } = render(<App />);
      player.play.mockClear();
      container.querySelector<HTMLButtonElement>('.scale-title .play-button')!.click();
      const notes = player.play.mock.calls[0][0] as number[];
      unmount();
      return Math.min(...notes);
    };

    const lage1 = lowestNoteAt('/?root=A&scale=minor-pentatonic&box=1');
    const lage4 = lowestNoteAt('/?root=A&scale=minor-pentatonic&box=4');

    // Weiter oben am Hals gegriffen heißt höher gestimmt — eine ganze Oktave hier.
    expect(lage4).toBeGreaterThan(lage1);
  });

  it('lässt die Skala dagegen ersetzen statt stapeln — zwei Läufe übereinander wären Matsch', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.scale-title .play-button')!);

    const [, options] = player.play.mock.calls[0];
    expect(options?.stack).toBeFalsy();
  });

  it('spielt beim Klick auf einen Notenkreis dessen einzelne Tonhöhe', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<SVGGElement>('.fretboard .note')!);

    expect(player.playNote).toHaveBeenCalledTimes(1);
    expect(typeof player.playNote.mock.calls[0][0]).toBe('number');
  });
});

describe('App — Transport der Akkordfolge', () => {
  const transportButton = (container: HTMLElement) =>
    container.querySelector<HTMLButtonElement>('.transport .play-button')!;

  /** The marker callback the app handed the player, so tests can drive playback. */
  const onChordOf = (call: number) => {
    const onChord = player.startProgression.mock.calls[call][1].onChord;
    if (!onChord) throw new Error('App hat keinen onChord-Rückruf übergeben');
    return onChord;
  };

  it('spielt die GEZEIGTEN Griffe, nicht einen abstrakten Dreiklang', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(transportButton(container));

    expect(player.startProgression).toHaveBeenCalledTimes(1);
    const [chords] = player.startProgression.mock.calls[0];

    // Ein gegriffener Akkord klingt über mehrere Saiten mit Oktav-Dopplungen;
    // chordMidiTones hätte je genau drei Töne geliefert.
    expect(chords).toHaveLength(4); // I – V – vi – IV
    expect(chords.some((chord) => chord.length > 3)).toBe(true);
  });

  it('leitet das Tempo als ein Takt pro Akkord ab', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?bpm=120');
    const { container } = render(<App />);

    await user.click(transportButton(container));

    const [, options] = player.startProgression.mock.calls[0];
    // 120 BPM, 4 Schläge je Takt => 2 s pro Akkord.
    expect(options.secondsPerChord).toBeCloseTo(2, 5);
    expect(options.loop).toBe(true);
  });

  it('stoppt beim zweiten Klick', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(transportButton(container));
    // Der Player meldet den laufenden Akkord zurück — das schaltet auf ■.
    act(() => onChordOf(0)(0));

    await user.click(transportButton(container));
    expect(transport.stop).toHaveBeenCalled();
  });

  it('nimmt eine Tempoänderung während der Wiedergabe sofort auf, statt abzubrechen', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(transportButton(container));
    act(() => onChordOf(0)(0)); // läuft

    fireEvent.change(container.querySelector<HTMLInputElement>('.tempo input')!, {
      target: { value: '60' },
    });

    // Neu gestartet — mit dem neuen Tempo, nicht gestoppt.
    expect(player.startProgression).toHaveBeenCalledTimes(2);
    expect(player.startProgression.mock.calls[1][1].secondsPerChord).toBeCloseTo(4, 5);
  });

  it('startet nichts, wenn nach einem beendeten Durchlauf das Tempo verstellt wird', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(transportButton(container));
    // Der Durchlauf endet von selbst (kein Loop): der Player meldet null.
    act(() => onChordOf(0)(null));

    fireEvent.change(container.querySelector<HTMLInputElement>('.tempo input')!, {
      target: { value: '60' },
    });

    // Es darf NICHT aus dem Nichts wieder losspielen.
    expect(player.startProgression).toHaveBeenCalledTimes(1);
  });

  it('markiert den gerade klingenden Akkord', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(transportButton(container));
    const onChord = onChordOf(0);

    act(() => onChord(2));
    const marked = container.querySelectorAll('.progression-chord.is-playing');
    expect(marked).toHaveLength(1);
    expect(marked[0].querySelector('.chord-symbol')?.textContent).toBe('F#m'); // vi in A-Dur

    // Ende der Wiedergabe räumt die Markierung ab.
    act(() => onChord(null));
    expect(container.querySelectorAll('.progression-chord.is-playing')).toHaveLength(0);
  });
});
