// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The audio engine is replaced by a spy: the tests check that the UI asks for the
// right notes, without a real AudioContext (which jsdom has not got anyway).
const { player } = vi.hoisted(() => ({
  player: { play: vi.fn(), playChords: vi.fn(), stop: vi.fn(), available: true },
}));
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

  it('spielt die Akkordfolge als mehrere Akkorde', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.panel-title .play-button')!);

    expect(player.playChords).toHaveBeenCalledTimes(1);
    const [chords] = player.playChords.mock.calls[0];
    expect(chords.length).toBeGreaterThanOrEqual(3);
  });
});
