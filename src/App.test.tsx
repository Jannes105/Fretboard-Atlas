// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Type-only: erased at runtime, so it does not defeat the vi.mock below.
import type { ProgressionOptions } from './audio';
import { Fretboard, MAJOR, Note, positionsAtPitch, Scale } from './theory';

// The audio engine is replaced by a spy: the tests check that the UI asks for the
// right notes, without a real AudioContext (which jsdom has not got anyway).
const { player, transport, noteHandles } = vi.hoisted(() => {
  const transport = { stop: vi.fn() };
  /** Every handle holdNote has given out, so a test can check it was let go of. */
  const noteHandles: { release: ReturnType<typeof vi.fn> }[] = [];
  return {
    transport,
    noteHandles,
    player: {
      play: vi.fn(),
      holdNote: vi.fn((_midi: number) => {
        const handle = { release: vi.fn() };
        noteHandles.push(handle);
        return handle;
      }),
      // Typed params, so the recorded calls stay inspectable in the tests below.
      startProgression: vi.fn(
        (_chords: readonly (readonly number[])[], _options: ProgressionOptions) => transport,
      ),
      stop: vi.fn(),
      setTimbre: vi.fn(),
      setAmp: vi.fn(),
      setPickup: vi.fn(),
      setTone: vi.fn(),
      setReverb: vi.fn(),
      setDelay: vi.fn(),
      setTempo: vi.fn(),
      available: true,
    },
  };
});
// Only the player is swapped out. Keeping the real constants means a new one does
// not silently break this file, and the strum speeds the UI reads stay honest.
vi.mock('./audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audio')>()),
  createAudioPlayer: () => player,
  prefetchSamples: vi.fn(() => Promise.resolve(new Map<string, ArrayBuffer>())),
}));

import App from './App';

beforeEach(() => {
  /*
   * Each test starts from a clean URL, or App would inherit the previous state.
   *
   * WITH a key on it, though: the app itself opens on "alle Töne", where there is
   * no root and so no degrees, no positions, no diatonic chords and no
   * progression. Almost everything below is about those, so they say which key
   * they are in rather than leaning on whatever the default happens to be. The
   * opening state has its own tests, and they set their own URL.
   */
  window.history.replaceState(null, '', '/?scale=major');
  vi.clearAllMocks();
  // clearAllMocks resets the spies but not the array they pushed into.
  noteHandles.length = 0;
});

afterEach(cleanup);

function pickedLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.note-label--picked')].map((el) => el.textContent ?? '');
}

type SheetName = 'Tonart' | 'Akkorde' | 'Folge' | 'Ansicht';

/**
 * Open a sheet from the bottom bar — everything but the key and the neck lives in
 * one. Synchronous, so it fits fireEvent and userEvent tests alike.
 */
function openSheet(container: HTMLElement, name: SheetName) {
  const tab = [...container.querySelectorAll<HTMLButtonElement>('.bottom-tab')].find(
    (button) => button.textContent === name,
  )!;
  if (tab.getAttribute('aria-expanded') !== 'true') fireEvent.click(tab);
}

/** The ✕ in the info bar: the one way back from a highlight. */
const clearButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('.info-bar-clear');

/** The instrument's own selects in the „Ansicht" sheet: tuning and capo. */
const instrumentSelects = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLSelectElement>('section[aria-label="Instrument"] select')];

describe('App — Grundzustand', () => {
  it('rendert den Namen der gewählten Tonart', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('A-Dur (Ionisch)');
  });
});

describe('App — Alle Töne', () => {
  /** The opening state: no key in the URL at all. */
  const openApp = () => {
    window.history.replaceState(null, '', '/');
    return render(<App />);
  };

  it('öffnet ohne Tonart, mit jedem Ton auf dem Hals', () => {
    const { container } = openApp();

    expect(container.querySelector('.scale-title h2')?.textContent).toBe('Alle Töne');

    // Sechs Saiten über 24 Bünde plus die leeren Saiten — lückenlos.
    const board = new Fretboard(undefined, 24);
    expect(container.querySelectorAll('.note-dot')).toHaveLength(board.allPositions().length);
  });

  it('nennt jeden Bund mit einem Namen — lesbar statt zweizeilig', () => {
    const { container } = openApp();

    // Zwei Namen je schwarzer Taste waren korrekt, aber 9-px-Schrift auf dem
    // allerersten Bildschirm. Der zweite Name steht weiterhin im Titel.
    expect(container.querySelectorAll('.note-label--stacked')).toHaveLength(0);
    const titles = [...container.querySelectorAll('.fretboard .note title')].map(
      (title) => title.textContent ?? '',
    );
    expect(titles.some((title) => title.startsWith('F♯ oder G♭') || title.startsWith('F# oder Gb'))).toBe(true);
  });

  it('verschweigt alles, was einen Grundton braucht', () => {
    const { container } = openApp();

    // Ohne Tonika gibt es keine Stufen, keine Lagen, keine Stufenakkorde — und
    // damit auch keine Akkordfolge und keinen Transport.
    expect(container.querySelector('.degree-chips')).toBeNull();
    expect(container.querySelector('.neck-bar')).toBeNull();
    expect(container.querySelector('[aria-label="Lage"]')).toBeNull();
    expect(container.querySelectorAll('.chord-card')).toHaveLength(0);
    expect(container.querySelectorAll('.play-button')).toHaveLength(0);
  });

  it('beginnt mit dem Hals und einem einzigen Satz, statt mit Startkarten', () => {
    const { container } = openApp();

    // Der Start ist der Hals: ein Ton ist ein Tipp entfernt, und genau das sagt
    // die Info-Leiste — einmal, ohne ✕, weil es nichts aufzuheben gibt.
    expect(container.querySelector('.start-card')).toBeNull();
    expect(container.querySelector('.info-bar')?.textContent).toContain('Tippe einen Ton an');
    expect(clearButton(container)).toBeNull();
  });

  it('sagt auf dem Knopf, was er tut: „Tonart wählen"', () => {
    const { container } = openApp();
    expect(container.querySelector('.key-trigger')?.textContent).toContain('Tonart wählen');
  });

  it('macht aus einem Grundton allein gleich eine Tonart — Dur', async () => {
    const user = userEvent.setup();
    const { container } = openApp();

    await openKeyPicker(user, container);
    await user.click(rootButton(container, 'G'));

    expect(container.querySelector('.scale-title h2')?.textContent).toBe('G-Dur (Ionisch)');
    openSheet(container, 'Akkorde');
    expect(container.querySelectorAll('.chord-card')).toHaveLength(7);
    expect(container.querySelector('.neck-bar')).not.toBeNull();
    expect(window.location.search).toContain('scale=major');
  });

  it('holt mit einer gewählten Skala alles zurück, was daran hängt', async () => {
    const user = userEvent.setup();
    const { container } = openApp();

    await openKeyPicker(user, container);
    await user.click(scaleButton(container, 'Dur (Ionisch)'));

    expect(container.querySelector('.scale-title h2')?.textContent).toBe('A-Dur (Ionisch)');
    openSheet(container, 'Akkorde');
    expect(container.querySelectorAll('.chord-card')).toHaveLength(7);
    expect(container.querySelector('.neck-bar')).not.toBeNull();
    expect(window.location.search).toContain('scale=major');
  });

  it('führt über „Keine Tonart" auch wieder zurück', async () => {
    const user = userEvent.setup();
    // Startet in einer Tonart, die nicht der Default-Grundton ist.
    window.history.replaceState(null, '', '/?root=Eb&scale=minor-pentatonic');
    const { container } = render(<App />);

    await openKeyPicker(user, container);
    await user.click(
      [...container.querySelectorAll<HTMLButtonElement>('.key-picker .link-button')].find((b) =>
        b.textContent?.includes('Keine Tonart'),
      )!,
    );

    expect(container.querySelector('.scale-title h2')?.textContent).toBe('Alle Töne');
    // Der Grundton bleibt gemerkt, statt beim Zurückschalten verloren zu gehen.
    expect(window.location.search).toContain('root=Eb');
    expect(window.location.search).not.toContain('scale=');
  });

  it('führt über den Reiter im Tonart-Blatt zum Erkennen aus Akkorden', async () => {
    const user = userEvent.setup();
    const { container } = openApp();

    await openFinder(user, container);
    expect(container.querySelector('.keyfinder-field input')).not.toBeNull();
  });
  it('führt von „Akkorde" ohne Tonart dorthin, wo man eine wählt', () => {
    const { container } = openApp();

    // Ohne Tonart gibt es keine Stufenakkorde — ein leeres Blatt wäre eine Sackgasse.
    openSheet(container, 'Akkorde');
    expect(container.querySelector('.sheet')?.getAttribute('aria-label')).toBe('Tonart');
  });
});

/** Open the key picker on its first tab. */
async function openKeyPicker(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await user.click(container.querySelector<HTMLButtonElement>('.key-trigger')!);
}

/** Open the key picker on the chord-lookup tab. */
async function openFinder(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await openKeyPicker(user, container);
  await user.click(
    [...container.querySelectorAll<HTMLButtonElement>('.key-tabs button')].find((b) =>
      b.textContent?.includes('erkennen'),
    )!,
  );
}

function rootButton(container: HTMLElement, root: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    `.root-grid button[aria-label="${root}"]`,
  )!;
}

function scaleButton(container: HTMLElement, name: string): HTMLButtonElement {
  return [...container.querySelectorAll<HTMLButtonElement>('.key-option')].find(
    (b) => b.textContent === name,
  )!;
}

describe('App — Tonart finden', () => {
  it('setzt Grundton und Skala aus den eingegebenen Akkorden', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await openFinder(user, container);
    await user.type(container.querySelector<HTMLInputElement>('.keyfinder-field input')!, 'Am F C G');

    // Am F C G ist mehrdeutig — es müssen mehrere Kandidaten erscheinen.
    const results = [...container.querySelectorAll<HTMLButtonElement>('.keyfinder-result')];
    expect(results.length).toBeGreaterThan(1);

    const cMajor = results.find((r) => r.textContent?.startsWith('C-Dur'))!;
    await user.click(cMajor);

    // Der Klick stellt die ganze App auf C-Dur und schließt das Blatt.
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('C-Dur (Ionisch)');
    expect(container.querySelectorAll('.key-picker')).toHaveLength(0);
  });

  it('meldet ein nicht erkanntes Token, statt still zu schlucken', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await openFinder(user, container);
    // H gibt es in der internationalen Notation nicht.
    await user.type(container.querySelector<HTMLInputElement>('.keyfinder-field input')!, 'G H');

    expect(container.querySelector('.keyfinder-note--warn')?.textContent).toContain('H');
  });

  it('übernimmt die getippten Akkorde als spielbare Folge in der gefundenen Tonart', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await openFinder(user, container);
    await user.type(container.querySelector<HTMLInputElement>('.keyfinder-field input')!, 'G D Em C');
    await user.click(container.querySelector<HTMLButtonElement>('.keyfinder-adopt')!);

    // Der Kreis schließt sich: Tonart gesetzt UND die Folge im Builder.
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('G-Dur (Ionisch)');
    expect(chipSymbols(container)).toEqual(['G', 'D', 'Em', 'C']);
    // Und die Folge zeigt sich: ihr Blatt geht auf, statt dass der Klick im Nichts landet.
    expect(container.querySelector('.sheet')?.getAttribute('aria-label')).toBe('Akkordfolge');
  });

  it('greift G – D – Em – C mit den offenen Griffen, die man zuerst lernt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await openFinder(user, container);
    await user.type(container.querySelector<HTMLInputElement>('.keyfinder-field input')!, 'G D Em C');
    await user.click(container.querySelector<HTMLButtonElement>('.keyfinder-adopt')!);

    const captions = [...container.querySelectorAll('.progression .voicing-switch, .progression .voicing-caption')].map(
      (el) => el.textContent ?? '',
    );
    expect(captions.every((caption) => caption.includes('offen'))).toBe(true);
  });
});

/** The chords in the builder, read off the remove buttons' labels. */
function chipSymbols(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.builder-remove')].map((button) =>
    (button.getAttribute('aria-label') ?? '').replace(' entfernen', ''),
  );
}

describe('App — Eigene Akkordfolge', () => {
  const progressionSelect = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLSelectElement>('.panel-head select')].find((select) =>
      [...select.options].some((option) => option.value === 'custom'),
    )!;

  it('öffnet den Builder vorbefüllt mit der gerade gezeigten Folge', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.selectOptions(progressionSelect(container), 'custom');

    // A-Dur-Default ist I–V–vi–IV = A E F#m D.
    expect(chipSymbols(container)).toEqual(['A', 'E', 'F#m', 'D']);
  });

  it('hängt einen Akkord auch aus einer Vorlage heraus an und macht daraus die eigene Folge', async () => {
    // Vorher war das „+“ unsichtbar, bis man „Eigene Folge“ unten im Dropdown
    // gefunden hatte — eine Hürde vor genau der Funktion, für die es da ist.
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    // Kein „+“ an jeder Karte mehr: eines, für den Akkord, den man gewählt hat.
    expect(container.querySelector('.chord-append')).toBeNull();
    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[2]); // iii = C#m
    await user.click(container.querySelector<HTMLButtonElement>('.chord-append')!);

    openSheet(container, 'Folge');
    expect(chipSymbols(container)).toEqual(['A', 'E', 'F#m', 'D', 'C#m']);
    expect(window.location.search).toContain('prog=custom');
  });

  it('zeigt zum gewählten Akkord seinen Griff, und die anderen einen Schritt weiter', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=C&scale=major');
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    expect(container.querySelector('.chord-detail')).toBeNull();
    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[0]); // C

    const caption = () => container.querySelector('.chord-detail .chord-diagram')?.textContent ?? '';
    // Der erste Griff ist der, den man zuerst lernt.
    expect(caption()).toContain('offen');

    player.play.mockClear();
    const before = caption();
    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Nächster Griff"]')!);
    expect(caption()).not.toBe(before);
    // Ein anderer Griff klingt gleich mit — anklicken heißt hören.
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('stellt die Akkordgröße mit einem Tipp um', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    await user.click(
      [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Akkordgröße"] button')].find(
        (button) => button.textContent === 'Sept',
      )!,
    );
    expect(container.querySelector('.chord-card .chord-symbol')?.textContent).toBe('Amaj7');
  });
  it('hängt einen getippten Powerchord an und normalisiert seine Schreibung', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C,G');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.type(container.querySelector<HTMLInputElement>('.builder-type input')!, 'e5');
    await user.click(container.querySelector<HTMLButtonElement>('.builder-type-add')!);

    expect(chipSymbols(container)).toEqual(['C', 'G', 'E5']);
  });

  it('weist einen unsinnigen Akkord ab, ohne ihn aufzunehmen', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.type(container.querySelector<HTMLInputElement>('.builder-type input')!, 'Xyz');
    await user.click(container.querySelector<HTMLButtonElement>('.builder-type-add')!);

    expect(container.querySelector('.builder-error')).not.toBeNull();
    expect(chipSymbols(container)).toEqual(['C']);
  });

  it('spielt die eigene Folge über den Transport, nicht eine Vorlage', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C,G,Am,F');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('.transport .play-button')!);

    const [chords] = player.startProgression.mock.calls[0];
    expect(chords).toHaveLength(4); // C G Am F, nicht die vierteilige Default-Vorlage zufällig
  });

  it('spielt einen Slash-Akkord über seinen Griff, mit dem Bass unten', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C/G');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    // Der Slash-Akkord bekommt jetzt einen echten Griff (Diagramm), keinen Leerhinweis.
    expect(container.querySelector('.progression .chord-diagram')).not.toBeNull();
    expect(container.querySelector('.progression .no-shape')).toBeNull();

    await user.click(container.querySelector<HTMLButtonElement>('.transport .play-button')!);

    const [chords] = player.startProgression.mock.calls[0];
    // Der gespielte Griff hat den Bass G als tiefsten Ton.
    expect(chords[0][0]).toBe(Math.min(...chords[0]));
    expect(chords[0][0] % 12).toBe(7); // G
  });

  it('gibt Taktart und Schlagmuster an den Transport weiter', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C,G&sig=3&rhythm=dud-du');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('.transport .play-button')!);
    const [, options] = player.startProgression.mock.calls[0];
    expect(options.beatsPerBar).toBe(3);
    // Das Muster kommt als geparste Slots an — sechs für 3/4.
    expect(options.pattern).toEqual(['down', 'up', 'down', null, 'down', 'up']);
  });

  it('hält Takt und Schlagmuster hinter einem Auslöser, der ihren Wert nennt', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C,G');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    // Zugeklappt: der Auslöser spricht den Wert aus, das Gitter liegt nicht offen.
    const trigger = container.querySelector<HTMLButtonElement>('.rhythm-trigger')!;
    expect(trigger.textContent).toContain('4/4');
    expect(trigger.textContent).toContain('Viertel');
    expect(container.querySelectorAll('.rhythm-cell')).toHaveLength(0);

    await user.click(trigger);

    // Slot 1 (erster Abschlag) auf Aufschlag klicken: d → u.
    await user.click(container.querySelectorAll<HTMLButtonElement>('.rhythm-cell')[0]);
    expect(window.location.search).toContain('rhythm=u-d-d-d-');
    // Der Auslöser meldet jetzt ein eigenes Muster statt eines Presets.
    expect(container.querySelector('.rhythm-trigger')?.textContent).toContain('Eigenes');
  });

  it('lässt die Länge je Akkord in Takten einstellen', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C,G');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    // Ein Klick auf den Takt-Knopf des ersten Akkords: 1 → 2 Takte.
    await user.click(container.querySelectorAll<HTMLButtonElement>('.builder-bars')[0]);

    // Steht in der URL und geht an den Transport.
    expect(window.location.search).toContain('prog=custom%3AC*2%2CG');

    await user.click(container.querySelector<HTMLButtonElement>('.transport .play-button')!);
    const [, options] = player.startProgression.mock.calls[0];
    expect(options.chordBars).toEqual([2, 1]);
  });
});

describe('App — Einstellungen', () => {
  it('schließt ein Blatt mit einem zweiten Tipp auf seinen Reiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    expect(container.querySelector('.sheet')?.getAttribute('aria-label')).toBe('Ansicht');

    await user.click(
      [...container.querySelectorAll<HTMLButtonElement>('.bottom-tab')].find(
        (tab) => tab.textContent === 'Ansicht',
      )!,
    );
    expect(container.querySelector('.sheet')).toBeNull();
  });

  it('macht die Tonart selbst bedienbar, statt sie daneben noch einmal auszuschreiben', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await openKeyPicker(user, container);
    await user.click(rootButton(container, 'C'));

    // Die Überschrift bleibt für Screenreader und folgt der Auswahl.
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('C-Dur (Ionisch)');
    // Der Knopf selbst nennt die neue Tonart.
    expect(container.querySelector('.key-trigger')?.textContent).toContain('Dur (Ionisch)');
  });

  it('hält den Kopf frei: oben ein einziger Tonart-Knopf, der Rest wartet in den Blättern', () => {
    const { container } = render(<App />);

    // Vorher waren es acht gleichrangige Dropdowns in einem Block, dann zwei
    // unsichtbare Selects über einer Überschrift, dann zwei Auslöser daneben.
    expect(container.querySelectorAll('.shell-top select')).toHaveLength(0);
    expect(container.querySelectorAll('.shell-top .key-trigger')).toHaveLength(1);
    // Kein Blatt ist offen, bevor man danach fragt.
    expect(container.querySelector('.sheet')).toBeNull();
  });
  it('zeigt Stimmung, Kapo und Bünde im Ansicht-Blatt so, wie der Link sie setzt', () => {
    window.history.replaceState(null, '', '/?scale=major&tuning=drop-d&capo=3&frets=12');
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    expect(instrumentSelects(container).map((select) => select.value)).toEqual(['drop-d', '3']);
    expect(
      container.querySelector('[aria-label="Bünde"] [aria-pressed="true"]')?.textContent,
    ).toBe('12');
  });
  it('öffnet „Ansicht" und schließt es mit Escape', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    // Stimmung und Kapo beschreiben das Instrument. Die Bünde sagen, wie viel
    // Hals zu sehen ist, und stehen deshalb beim Hals.
    expect(instrumentSelects(container)).toHaveLength(2);
    expect(container.querySelector('section[aria-label="Hals"] [aria-label="Bünde"]')).not.toBeNull();
    expect(container.querySelector('.app-footer select')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(container.querySelector('.sheet')).toBeNull();
  });
  it('bietet den Kapo bis zum 12. Bund an', () => {
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    // Kapo ist das zweite Feld: „ohne" plus zwölf Bünde.
    const capoSelect = instrumentSelects(container)[1];
    expect(capoSelect.querySelectorAll('option')).toHaveLength(13);
    expect(capoSelect.querySelectorAll('option')[12].textContent).toBe('12. Bund');
  });
});

describe('App — Ansicht-Blatt', () => {
  it('stellt Hals und Gerät nach vorn und klappt Instrument und Klang zu', () => {
    const { container } = render(<App />);
    openSheet(container, 'Ansicht');

    const sections = [...container.querySelectorAll('.sheet-section')].map((section) =>
      section.getAttribute('aria-label'),
    );
    expect(sections).toEqual(['Hals', 'Auf diesem Gerät', 'Instrument', 'Klang']);

    const folds = [...container.querySelectorAll<HTMLDetailsElement>('.sheet-fold')];
    expect(folds).toHaveLength(2);
    expect(folds.every((fold) => !fold.open)).toBe(true);
  });

  it('nennt auf der zugeklappten Zeile, worauf Instrument und Klang stehen', () => {
    window.history.replaceState(null, '', '/?scale=major&tuning=drop-d&capo=3');
    const { container } = render(<App />);
    openSheet(container, 'Ansicht');

    const values = [...container.querySelectorAll('.sheet-fold-value')].map((el) => el.textContent);
    expect(values).toEqual(['Drop D · Kapo 3. Bund', 'Clean']);
  });
});

describe('App — Grundton-Raster', () => {
  const blackKey = (container: HTMLElement, name: string) =>
    container.querySelector<HTMLButtonElement>(`.root-grid button[aria-label^="${name}"]`)!;

  it('nennt schwarze Tasten mit beiden Namen, den eingestellten zuerst', () => {
    window.localStorage.removeItem('fretboard:view');
    const { container } = render(<App />);
    openSheet(container, 'Tonart');

    expect(blackKey(container, 'C♯').getAttribute('aria-label')).toBe('C♯ oder D♭');
    window.localStorage.removeItem('fretboard:view');
  });

  it('schreibt Dur auf einer schwarzen Taste mit B — G♯ wird A♭-Dur', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />); // A-Dur
    openSheet(container, 'Tonart');

    await user.click(blackKey(container, 'G♯'));
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('Ab-Dur (Ionisch)');
    // Gedrückt ist die Taste trotzdem: dieselbe Tonhöhe, nur anders geschrieben.
    expect(blackKey(container, 'G♯').getAttribute('aria-pressed')).toBe('true');
  });

  it('schreibt Moll dort mit Kreuz, wo es weniger Vorzeichen braucht', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=natural-minor');
    const { container } = render(<App />);
    openSheet(container, 'Tonart');

    await user.click(blackKey(container, 'C♯'));
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('C#-Moll (Äolisch)');
    expect(window.location.search).toContain('root=C%23');
  });

  it('schreibt den Grundton neu, wenn die Skala ihn anders braucht', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=Db&scale=major');
    const { container } = render(<App />);
    openSheet(container, 'Tonart');

    await user.click(scaleButton(container, 'Moll (Äolisch)'));
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('C#-Moll (Äolisch)');
  });

  it('transponiert über eine schwarze Taste hinweg', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=F%23&scale=major');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Einen Halbton höher"]')!);
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('G-Dur (Ionisch)');
    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Einen Halbton höher"]')!);
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('Ab-Dur (Ionisch)');
  });
});

describe('App — Bünde', () => {
  it('zeigt alle 24 Bünde, solange der Link nichts anderes sagt', () => {
    const { container } = render(<App />);
    const numbers = [...container.querySelectorAll('.fret-number')].map((el) => el.textContent);
    expect(numbers.at(-1)).toBe('24');
  });

  it('kürzt den Hals unter „Ansicht" mit einem Tipp — auch ohne Tonart', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/');
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    await user.click(
      [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Bünde"] button')].find(
        (button) => button.textContent === '12',
      )!,
    );

    expect(window.location.search).toContain('frets=12');
    expect([...container.querySelectorAll('.fret-number')].at(-1)?.textContent).toBe('12');
  });
});

describe('App — Eigene Stimmung', () => {
  const tuningSelect = (container: HTMLElement) => instrumentSelects(container)[0];

  it('zeigt bei „Eigene Stimmung" sechs Saiten-Dropdowns, aus der aktuellen Stimmung befüllt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    await user.selectOptions(tuningSelect(container), 'custom');

    const strings = [...container.querySelectorAll<HTMLSelectElement>('.tuning-strings select')];
    expect(strings).toHaveLength(6);
    // Vorbefüllt aus der Standardstimmung: E A D G B E.
    expect(strings.map((s) => s.value)).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
  });

  it('stimmt eine Saite um und schreibt die eigene Stimmung in die URL', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&tuning=custom:E,A,D,G,B,E');
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    const strings = [...container.querySelectorAll<HTMLSelectElement>('.tuning-strings select')];
    // Tiefe Saite (Index 0) auf D — das ergibt Drop D.
    await user.selectOptions(strings[0], 'D');

    expect(window.location.search).toContain('tuning=custom%3AD%2CA%2CD%2CG%2CB%2CE');
  });
});

describe('App — Klang', () => {
  it('gibt den gewählten Sound an den Player weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // Beim Start wird der Default gesetzt.
    expect(player.setTimbre).toHaveBeenCalledWith('clean');

    openSheet(container, 'Ansicht');
    const soundSelect = [...container.querySelectorAll<HTMLSelectElement>('.sound-panel select')].find(
      (select) => [...select.options].some((option) => option.value === 'electric'),
    )!;
    await user.selectOptions(soundSelect, 'electric');

    expect(player.setTimbre).toHaveBeenCalledWith('electric');
    expect(window.location.search).toContain('sound=electric');
  });

  it('stellt mit einer Voreinstellung den ganzen Klang auf einmal', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    openSheet(container, 'Ansicht');
    const presets = [...container.querySelectorAll<HTMLButtonElement>('.sound-panel .preset-button')];
    // Die Vorgabe der App IST „Clean" — und steht deshalb als gewählt da.
    expect(presets.find((b) => b.textContent === 'Clean')?.getAttribute('aria-pressed')).toBe('true');

    await user.click(presets.find((b) => b.textContent === 'Crunch')!);
    expect(player.setTimbre).toHaveBeenCalledWith('electric');
    expect(player.setAmp).toHaveBeenCalledWith('british-crunch');
    expect(presets.find((b) => b.textContent === 'Crunch')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('bietet die Verstärkerwahl erst zum Overdrive an und gibt sie weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const openSound = () => openSheet(container, 'Ansicht');
    const ampSelect = () =>
      [...container.querySelectorAll<HTMLSelectElement>('.sound-panel select')].find((select) =>
        [...select.options].some((option) => option.value === 'modern-high-gain'),
      );

    // Clean geht gar nicht durch den Verstärker — ein Wahlschalter dafür wäre tot.
    openSound();
    expect(ampSelect()).toBeUndefined();

    // Die Verzerrung steht im selben Fach, in der Feinabstimmung.
    const soundSelect = [...container.querySelectorAll<HTMLSelectElement>('.sound-panel select')].find(
      (select) => [...select.options].some((option) => option.value === 'electric'),
    )!;
    await user.selectOptions(soundSelect, 'electric');

    await user.selectOptions(ampSelect()!, 'modern-high-gain');

    expect(player.setAmp).toHaveBeenCalledWith('modern-high-gain');
    expect(window.location.search).toContain('amp=modern-high-gain');
  });

  it('gibt Tonabnehmer, Hall und Delay an den Player weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // Beim Start stehen alle drei auf ihrer Vorgabe — und die Vorgabe ist
    // durchsichtig, siehe src/synth/pickup.ts und reverb.ts.
    expect(player.setPickup).toHaveBeenCalledWith('recorded');
    expect(player.setReverb).toHaveBeenCalledWith('off');
    expect(player.setDelay).toHaveBeenCalledWith('off');

    openSheet(container, 'Ansicht');
    const selectFor = (value: string) =>
      [...container.querySelectorAll<HTMLSelectElement>('.sound-panel select')].find((select) =>
        [...select.options].some((option) => option.value === value),
      )!;

    await user.selectOptions(selectFor('bridge'), 'bridge');
    expect(player.setPickup).toHaveBeenCalledWith('bridge');
    expect(window.location.search).toContain('pickup=bridge');

    await user.selectOptions(selectFor('hall'), 'hall');
    expect(player.setReverb).toHaveBeenCalledWith('hall');
    expect(window.location.search).toContain('reverb=hall');

    await user.selectOptions(selectFor('dotted8'), 'dotted8');
    expect(player.setDelay).toHaveBeenCalledWith('dotted8');
    expect(window.location.search).toContain('delay=dotted8');
  });

  it('gibt die drei Klangregler weiter und lässt sie flach beginnen', () => {
    const { container } = render(<App />);

    expect(player.setTone).toHaveBeenCalledWith({ bass: 0, mid: 0, treble: 0 });

    openSheet(container, 'Ansicht');
    const bass = container.querySelector<HTMLInputElement>('.tone-stack input[type="range"]')!;

    // fireEvent statt userEvent: ein Slider auf einen bestimmten Wert zu ziehen
    // ist eine Mausgeste, die jsdom nicht hat — der Wert selbst ist der Punkt.
    fireEvent.change(bass, { target: { value: '-4' } });

    expect(player.setTone).toHaveBeenCalledWith({ bass: -4, mid: 0, treble: 0 });
    expect(window.location.search).toContain('bass=-4');
  });

  it('bindet das Delay an das Tempo, damit auch ein einzelner Akkord im Takt hallt', () => {
    const { container } = render(<App />);

    expect(player.setTempo).toHaveBeenCalledWith(90);

    openSheet(container, 'Folge');
    const tempo = container.querySelector<HTMLInputElement>('.tempo input[type="range"]')!;
    fireEvent.change(tempo, { target: { value: '140' } });

    openSheet(container, 'Ansicht');
    expect(player.setTempo).toHaveBeenCalledWith(140);
  });
});

describe('App — Tonlänge', () => {
  it('gibt die gewählte Tonlänge an den Transport weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('.rhythm-trigger')!);
    const lengthSelect = container.querySelector<HTMLSelectElement>('[aria-label="Tonlänge"]')!;
    await user.selectOptions(lengthSelect, 'stopped');

    expect(window.location.search).toContain('sustain=stopped');

    // Und der Transport spielt danach wirklich abgestoppt. Der erste .play-button
    // gehoert der Skala, deshalb ueber das Label.
    const transport = [...container.querySelectorAll<HTMLButtonElement>('.play-button')].find(
      (button) => /Akkordfolge/.test(button.getAttribute('aria-label') ?? ''),
    )!;
    await user.click(transport);
    const options = player.startProgression.mock.calls.at(-1)?.[1];
    expect(options?.length).toBe('stopped');
  });
});

describe('App — Klick', () => {
  it('stellt den Klick zu Tempo und Wiederholen, statt ihn im Rhythmus zu vergraben', async () => {
    // Ein Metronom sucht keiner hinter „4/4 · Viertel“.
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    expect(container.querySelector('.transport [aria-label="Klick"]')).not.toBeNull();

    await user.click(container.querySelector<HTMLButtonElement>('.rhythm-trigger')!);
    expect(container.querySelector('.rhythm-panel [aria-label="Klick"]')).toBeNull();
  });

  it('gibt den gewählten Klick an den Transport weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.selectOptions(
      container.querySelector<HTMLSelectElement>('[aria-label="Klick"]')!,
      'metronome',
    );
    expect(window.location.search).toContain('click=metronome');

    const transport = [...container.querySelectorAll<HTMLButtonElement>('.play-button')].find(
      (button) => /Akkordfolge/.test(button.getAttribute('aria-label') ?? ''),
    )!;
    await user.click(transport);

    expect(player.startProgression.mock.calls.at(-1)?.[1]?.click).toBe('metronome');
  });
});

describe('App — Auslöser', () => {
  it('nennt die vier Bereiche unten beim Namen', () => {
    // Ein Symbol allein sagt nicht, was dahinter liegt — der Name steht immer dabei.
    const { container } = render(<App />);
    const tabs = [...container.querySelectorAll('.bottom-tab')].map((tab) => tab.textContent);

    expect(tabs).toEqual(['Tonart', 'Akkorde', 'Folge', 'Ansicht']);
  });
  it('nennt auch den Rhythmus-Auslöser beim Namen', () => {
    const { container } = render(<App />);
    openSheet(container, 'Folge');
    const trigger = container.querySelector('.rhythm-trigger')!;

    expect(trigger.textContent).toContain('Rhythmus');
    expect(trigger.textContent).toContain('4/4');
  });

  it('gibt den beiden ▶ unterscheidbare Beschriftungen', () => {
    const { container } = render(<App />);
    openSheet(container, 'Folge');
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.play-button')];

    // Gleiches Dreieck, verschiedene Aufgabe — der Unterschied muss aus der
    // Beschriftung kommen, nicht aus der Position auf der Seite.
    const labels = buttons.map((b) => b.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(buttons.length);
    expect(buttons.every((b) => (b.title ?? '') !== '')).toBe(true);
  });
});

describe('App — Hervorhebung', () => {
  it('hebt beim Klick auf einen Stufen-Chip genau diese Tonklasse hervor', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Tonart');

    // 3. Chip = Terz von A-Dur = C#. Auf dem Hals steht sie als C♯ — die ASCII-
    // Schreibweise bleibt der URL vorbehalten, siehe theory/format.ts.
    const chips = container.querySelectorAll<HTMLButtonElement>('.degree-chip');
    await user.click(chips[2]);

    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
    const labels = pickedLabels(container);
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels)).toEqual(new Set(['C♯']));
  });
  it('löst beim Klick auf eine Akkordkarte die Stufen-Hervorhebung ab', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    openSheet(container, 'Tonart');
    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]); // C# als Stufe

    openSheet(container, 'Akkorde');
    const cards = container.querySelectorAll<HTMLButtonElement>('.chord-card');
    await user.click(cards[0]); // I = A-Dur (A C# E)
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');

    // Der ganze Akkord in einer Farbe — auch das A, obwohl es der Skalengrundton
    // ist. Vorher blieb es orange, und der Akkord sah aus wie zwei Dinge.
    expect(new Set(pickedLabels(container))).toEqual(new Set(['A', 'C♯', 'E']));
    // Sein Grundton ist der große Punkt: der Grundton des AKKORDS.
    expect(container.querySelectorAll('.note-dot--chord-root').length).toBeGreaterThan(0);
    // Das A gehört hier zum Akkord, also steht kein Punkt mehr in Tonart-Orange.
    expect(container.querySelectorAll('.note-dot--root')).toHaveLength(0);

    // Die Stufe ist nicht mehr aktiv, der Akkord schon — sie schließen sich aus.
    openSheet(container, 'Tonart');
    expect(container.querySelectorAll('.degree-chip')[2].getAttribute('aria-pressed')).toBe('false');
  });
  it('löscht die Hervorhebung über das ✕ der Info-Leiste', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    openSheet(container, 'Tonart');
    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]);
    // Unter einem Blatt schweigt die Leiste: das Blatt zeigt selbst, was gewählt ist.
    expect(container.querySelector('.info-bar')).toBeNull();

    fireEvent.click(container.querySelector<HTMLButtonElement>('.sheet-done')!);
    expect(container.querySelectorAll('.note-dot--picked').length).toBeGreaterThan(0);

    await user.click(clearButton(container)!);
    expect(container.querySelectorAll('.note-dot--picked')).toHaveLength(0);
  });
  it('bleibt beim zweiten Klick hervorgehoben, statt sich wegzuschalten', async () => {
    // Unter „Klick = hören“ klickt man denselben Akkord mehrfach, um ihn mehrfach
    // zu hören — die Hervorhebung dabei zu verlieren wäre überraschend.
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    const card = container.querySelectorAll<HTMLButtonElement>('.chord-card')[0];
    await user.click(card);
    await user.click(card);

    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('hebt die Hervorhebung mit Escape auf — nach dem Blatt, das darüber liegt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[3]);
    expect(container.querySelectorAll('.note-dot--picked').length).toBeGreaterThan(0);

    // Ein Escape, eine Wirkung: erst geht das Blatt zu, der Hals bleibt wie er war …
    await user.keyboard('{Escape}');
    expect(container.querySelector('.sheet')).toBeNull();
    expect(container.querySelectorAll('.note-dot--picked').length).toBeGreaterThan(0);

    // … und das nächste hebt die Hervorhebung auf.
    await user.keyboard('{Escape}');
    expect(container.querySelectorAll('.note-dot--picked')).toHaveLength(0);
  });
  it('nennt einen gewählten Akkord in der Info-Leiste — Stufe, Name, Töne', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[3]); // IV = D
    fireEvent.click(container.querySelector<HTMLButtonElement>('.sheet-done')!);

    const bar = container.querySelector('.info-bar')!;
    expect(bar.querySelector('.info-bar-roman')?.textContent).toBe('IV');
    expect(bar.textContent).toContain('D');
    expect(bar.querySelector('.info-bar-text')?.textContent).toBe('D F♯ A');

    await user.click(clearButton(container)!);
    expect(container.querySelectorAll('.note-dot--picked')).toHaveLength(0);
  });
  it('zeigt genau einen Weg zurück: das ✕ in der Info-Leiste', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // Kein Link „Hervorhebung aufheben" mehr, an keiner Stelle — zwei davon für
    // einen Zustand lasen sich wie zwei verschiedene Aktionen.
    const undos = () =>
      [...container.querySelectorAll('button')].filter(
        (button) =>
          button.textContent?.includes('aufheben') ||
          button.getAttribute('aria-label') === 'Hervorhebung aufheben',
      );
    expect(undos()).toHaveLength(0);

    openSheet(container, 'Akkorde');
    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[2]);
    fireEvent.click(container.querySelector<HTMLButtonElement>('.sheet-done')!);
    expect(undos()).toEqual([clearButton(container)]);
  });
  it('stellt die Stufen-Chips ins Tonart-Blatt, über den Wähler', () => {
    const { container } = render(<App />);

    // Unter einem aufrechten 24-Bund-Hals lagen sie zwei Bildschirme unter dem
    // Bild, das sie erklären. Im Blatt liegt der Hals darüber.
    expect(container.querySelector('.degree-chips')).toBeNull();
    openSheet(container, 'Tonart');
    const chips = container.querySelector('.sheet .degree-chips')!;
    const picker = container.querySelector('.sheet .key-picker')!;
    expect(chips.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('lässt Escape bei offenem Blatt nur das Blatt schließen, die Hervorhebung bleibt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    openSheet(container, 'Tonart');
    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]);
    openSheet(container, 'Ansicht');

    await user.keyboard('{Escape}');

    // Ein Escape, eine Wirkung: das Blatt geht zu, der Hals bleibt wie er war.
    expect(container.querySelector('.sheet')).toBeNull();
    expect(container.querySelectorAll('.note-dot--picked').length).toBeGreaterThan(0);
  });

  it('schließt das Blatt mit Escape, auch wenn darin ein Fach offen ist', async () => {
    // Das Rhythmus-Fach klappt im Blatt auf, statt darüber zu schweben — es ist
    // kein eigenes Fenster, das Escape zuerst für sich beanspruchen müsste.
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('.rhythm-trigger')!);
    expect(container.querySelector('.rhythm-panel')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(container.querySelector('.sheet')).toBeNull();
  });
});

describe('App — Klick = hören', () => {
  it('spielt und zeigt einen Akkord mit demselben Klick — ohne eigenen ▶', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

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
    openSheet(container, 'Tonart');

    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]);

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play.mock.calls[0][0].length).toBeGreaterThan(0);
  });
  it('kommt insgesamt mit zwei Play-Buttons aus: Skala und Transport', () => {
    const { container } = render(<App />);
    openSheet(container, 'Folge');
    expect(container.querySelectorAll('.play-button')).toHaveLength(2);
  });
});

describe('App — Lage', () => {
  it('dimmt bei gewählter Lage die Töne außerhalb des Fensters', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // Über das Label statt über die Position: ein Layout-Umbau darf diesen Test
    // nicht brechen — genau das ist hier schon einmal passiert.
    await user.click(boxButton(container, 1));
    // Ganzer Hals statt Ausschnitt, damit es überhaupt etwas zu dimmen gibt.
    openView(container);
    await user.click(container.querySelector<HTMLInputElement>('.view-panel input[type="checkbox"]')!);

    const all = container.querySelectorAll('.note-dot').length;
    const dimmed = container.querySelectorAll('.note-dot.is-dimmed').length;

    // Eine Lage zeigt nur einen Ausschnitt — es muss gedimmte Töne geben, aber
    // nicht alle.
    expect(dimmed).toBeGreaterThan(0);
    expect(dimmed).toBeLessThan(all);
  });

  it('wählt eine Lage mit einem Tipp und markiert sie als gewählt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(boxButton(container, 1));
    expect(boxButton(container, 1).getAttribute('aria-pressed')).toBe('true');
    expect(window.location.search).toContain('box=1');
  });

  it('bietet den Ausschnitt nur an, wenn eine Lage gewählt ist', () => {
    const { container } = render(<App />);

    openView(container);
    expect(container.querySelector('.view-panel input[type="checkbox"]')).toBeNull();
  });
});

function boxButton(container: HTMLElement, number: number): HTMLButtonElement {
  return [...container.querySelectorAll<HTMLButtonElement>('.box-picker button')].find(
    (b) => b.textContent === String(number),
  )!;
}

function openView(container: HTMLElement) {
  openSheet(container, 'Ansicht');
}

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
    openSheet(container, 'Akkorde');

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

  it('haelt beim Druck auf einen Notenkreis dessen einzelne Tonhöhe und laesst sie wieder los', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // user.click feuert pointerdown und pointerup — also genau ein kurz
    // gehaltener Ton, vom Anfassen bis zum Loslassen.
    await user.click(container.querySelector<SVGGElement>('.fretboard .note')!);

    expect(player.holdNote).toHaveBeenCalledTimes(1);
    expect(typeof player.holdNote.mock.calls[0][0]).toBe('number');
    expect(noteHandles).toHaveLength(1);
    expect(noteHandles[0].release).toHaveBeenCalledOnce();
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
    openSheet(container, 'Folge');

    await user.click(transportButton(container));

    expect(player.startProgression).toHaveBeenCalledTimes(1);
    const [chords] = player.startProgression.mock.calls[0];

    // Ein gegriffener Akkord klingt über mehrere Saiten mit Oktav-Dopplungen;
    // chordMidiTones hätte je genau drei Töne geliefert.
    expect(chords).toHaveLength(4); // I – V – vi – IV
    expect(chords.some((chord) => chord.length > 3)).toBe(true);
  });

  it('lässt das Tempo in Einzelschritten regeln — Tempoarbeit geht in 2-BPM-Schritten', () => {
    const { container } = render(<App />);
    openSheet(container, 'Folge');
    const slider = container.querySelector<HTMLInputElement>('.tempo input')!;

    expect(slider.step).toBe('1');
    expect(slider.min).toBe('40');
    expect(slider.max).toBe('200');
  });

  it('nimmt auch krumme Tempi an', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&bpm=92');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    expect(container.querySelector('.tempo output')?.textContent).toBe('92');

    await user.click(transportButton(container));
    const [, options] = player.startProgression.mock.calls[0];
    expect(options.secondsPerBar).toBeCloseTo((4 * 60) / 92, 5);
  });

  it('leitet die Taktlänge aus Tempo und Taktart ab', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&bpm=120');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(transportButton(container));

    const [, options] = player.startProgression.mock.calls[0];
    // 120 BPM, 4 Schläge je Takt => 2 s pro Takt.
    expect(options.secondsPerBar).toBeCloseTo(2, 5);
    expect(options.loop).toBe(true);
  });

  it('stoppt beim zweiten Klick', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(transportButton(container));
    // Der Player meldet den laufenden Akkord zurück — das schaltet auf ■.
    act(() => onChordOf(0)(0));

    await user.click(transportButton(container));
    expect(transport.stop).toHaveBeenCalled();
  });

  it('nimmt eine Tempoänderung während der Wiedergabe sofort auf, statt abzubrechen', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(transportButton(container));
    act(() => onChordOf(0)(0)); // läuft

    fireEvent.change(container.querySelector<HTMLInputElement>('.tempo input')!, {
      target: { value: '60' },
    });

    // Neu gestartet — mit dem neuen Tempo, nicht gestoppt.
    expect(player.startProgression).toHaveBeenCalledTimes(2);
    expect(player.startProgression.mock.calls[1][1].secondsPerBar).toBeCloseTo(4, 5);
  });

  it('startet nichts, wenn nach einem beendeten Durchlauf das Tempo verstellt wird', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(transportButton(container));
    // Der Durchlauf endet von selbst (kein Loop): der Player meldet null.
    act(() => onChordOf(0)(null));

    fireEvent.change(container.querySelector<HTMLInputElement>('.tempo input')!, {
      target: { value: '60' },
    });

    // Es darf NICHT aus dem Nichts wieder losspielen.
    expect(player.startProgression).toHaveBeenCalledTimes(1);
  });

  it('nennt den klingenden Akkord in der Info-Leiste und stoppt von dort', async () => {
    // Das Blatt zu, der Hals frei — und trotzdem sieht man, was spielt, und
    // kommt mit einem Tipp wieder heraus.
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(transportButton(container));
    act(() => onChordOf(0)(1)); // V = E in A-Dur
    fireEvent.click(container.querySelector<HTMLButtonElement>('.sheet-done')!);

    expect(container.querySelector('.info-bar-title')?.textContent).toBe('E');
    expect(container.querySelector('.info-bar-text')?.textContent).toBe('2 / 4');

    await user.click(container.querySelector<HTMLButtonElement>('.info-bar-stop')!);
    expect(transport.stop).toHaveBeenCalled();
  });

  it('markiert den gerade klingenden Akkord', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(transportButton(container));
    const onChord = onChordOf(0);

    act(() => onChord(2));
    const marked = container.querySelectorAll('.progression-chord.is-playing');
    expect(marked).toHaveLength(1);
    expect(marked[0].querySelector('.chord-symbol')?.textContent).toBe('F♯m'); // vi in A-Dur

    // Ende der Wiedergabe räumt die Markierung ab.
    act(() => onChord(null));
    expect(container.querySelectorAll('.progression-chord.is-playing')).toHaveLength(0);
  });
});

describe('App — Pentatonik borgt sich die Harmonie', () => {
  const chordSymbols = (container: HTMLElement) =>
    [...container.querySelectorAll('.chord-card .chord-symbol')].map((el) => el.textContent);

  it('zeigt der Moll-Pentatonik die Akkorde ihrer Molltonart statt gar keiner', () => {
    window.history.replaceState(null, '', '/?root=A&scale=minor-pentatonic');
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    // Frueher stand hier die Absage „braucht sieben Stufen" und sonst nichts.
    expect(container.querySelector('.empty')).toBeNull();
    expect(chordSymbols(container)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(container.querySelector('.panel-source')?.textContent).toBe('aus A-Moll (Äolisch)');

    // Und damit gibt es auch wieder etwas abzuspielen.
    openSheet(container, 'Folge');
    expect(container.querySelector('.transport .play-button')).not.toBeNull();
  });

  it('laesst eine siebenstufige Skala unberuehrt — kein Hinweis, wo nichts geborgt ist', () => {
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');
    expect(container.querySelector('.panel-source')).toBeNull();
  });

  it('klingt ein geborgter Akkord vollstaendig, auch wenn seine Toene nicht in der Skala liegen', () => {
    // Die Falle: die VI-Stufe von A-Moll ist F-A-C, und ein F liegt nirgends auf
    // einem Pentatonik-Hals. Wuerde der Akkord aus den sichtbaren Skalentoenen
    // gespielt, kaeme eine nackte A/C-Doppel heraus statt eines Akkords.
    window.history.replaceState(null, '', '/?root=A&scale=minor-pentatonic');
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    const sixth = [...container.querySelectorAll<HTMLButtonElement>('.chord-card')].find(
      (card) => card.querySelector('.chord-symbol')?.textContent === 'F',
    )!;
    fireEvent.click(sixth);

    const midi = player.play.mock.calls.at(-1)![0] as number[];
    const pitchClasses = new Set(midi.map((m) => m % 12));
    // F = 5, A = 9, C = 0 — alle drei, nicht nur die beiden aus der Pentatonik.
    expect([...pitchClasses].sort((a, b) => a - b)).toEqual([0, 5, 9]);
  });

  it('haelt die Bluesskala in Moll und liefert den 12-Bar-Blues als Septakkorde', () => {
    window.history.replaceState(null, '', '/?root=A&scale=blues&prog=12-bar-blues');
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    expect(container.querySelector('.panel-source')?.textContent).toBe('aus A-Moll (Äolisch)');
    // Die Progression erzwingt die Dominantseptime selbst, unabhaengig davon, dass
    // die Elterntonart Moll ist: I, IV und V haben in A-Dur und A-Moll dieselben
    // Grundtoene.
    openSheet(container, 'Folge');
    const steps = [...container.querySelectorAll('.progression .chord-symbol')].map(
      (el) => el.textContent,
    );
    expect(new Set(steps)).toEqual(new Set(['A7', 'D7', 'E7']));
  });
});

describe('App — Marker beim Abspielen der Skala', () => {
  const scalePlayButton = (container: HTMLElement) =>
    container.querySelector<HTMLButtonElement>('.scale-title .play-button')!;

  /** Der onNote-Callback, den App dem Player beim Abspielen mitgibt. */
  const onNoteOf = (call: number) => player.play.mock.calls[call][1].onNote as (
    index: number | null,
  ) => void;

  it('laesst waehrend des Laufs genau die klingenden Stellen leuchten', () => {
    const { container } = render(<App />);
    fireEvent.click(scalePlayButton(container));

    const sequence = player.play.mock.calls[0][0] as number[];
    const onNote = onNoteOf(0);

    act(() => onNote(3));
    const halos = container.querySelectorAll('.note-halo');
    // Dieselbe Tonhoehe liegt mehrfach auf dem Hals — alle Stellen leuchten.
    expect(halos.length).toBeGreaterThan(0);

    // Und zwar genau die Stellen dieser Tonhoehe.
    const board = new Fretboard(undefined, 24);
    const expected = positionsAtPitch(board.mapScale(new Scale(Note.parse('A'), MAJOR)), sequence[3]);
    expect(halos).toHaveLength(expected.length);
  });

  it('raeumt den Marker weg, wenn der Lauf endet', () => {
    const { container } = render(<App />);
    fireEvent.click(scalePlayButton(container));

    const onNote = onNoteOf(0);
    act(() => onNote(2));
    expect(container.querySelectorAll('.note-halo').length).toBeGreaterThan(0);

    act(() => onNote(null));
    expect(container.querySelectorAll('.note-halo')).toHaveLength(0);
  });

  it('startet bei erneutem Druck einen neuen Lauf', () => {
    // Das Unterbrechen ist Sache des Players (play() ruft stop()), hier zaehlt
    // nur, dass die App wirklich neu anfragt statt den alten Lauf weiterlaufen
    // zu lassen.
    const { container } = render(<App />);
    fireEvent.click(scalePlayButton(container));
    fireEvent.click(scalePlayButton(container));

    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('stoppt den Player, wenn die App verschwindet', () => {
    const view = render(<App />);
    fireEvent.click(scalePlayButton(view.container));

    view.unmount();
    expect(player.stop).toHaveBeenCalled();
  });
});

describe('App — CAGED-Overlay', () => {
  const picker = (container: HTMLElement) =>
    container.querySelector<HTMLSelectElement>('[aria-label="CAGED-Form"]');

  it('legt die gewaehlte Form ueber den Hals', () => {
    window.history.replaceState(null, '', '/?root=A&scale=major&caged=E');
    const { container } = render(<App />);

    // Die Form hat keinen eigenen Rahmen mehr — die Ringe auf den gegriffenen
    // Toenen sagen genauer, wo der Griff liegt, als ein Bundfenster es koennte.
    // Die E-Form von A ist der Barre-Griff im 5. Bund.
    expect(container.querySelectorAll('.note-caged').length).toBeGreaterThan(0);
  });

  it('legt die Form auch als eine Fläche unter die Hand', () => {
    window.history.replaceState(null, '', '/?root=A&scale=major&caged=E');
    const { container } = render(<App />);
    expect(container.querySelectorAll('.caged-shape')).toHaveLength(1);
  });

  it('zeigt ohne Auswahl kein Overlay, aber den Picker', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('.note-caged')).toHaveLength(0);
    openView(container);
    expect(picker(container)).not.toBeNull();
  });

  it('verschweigt den Picker in einer Stimmung, in der die Formen nicht gelten', () => {
    // Lieber kein Angebot als ein falsches — dieselbe Regel wie bei den Griffen.
    window.history.replaceState(null, '', '/?scale=major&tuning=drop-d');
    const { container } = render(<App />);

    openView(container);
    expect(picker(container)).toBeNull();
    expect(container.querySelectorAll('.note-caged')).toHaveLength(0);
  });

  it('ignoriert eine unbekannte Form aus der URL, statt zu stolpern', () => {
    window.history.replaceState(null, '', '/?scale=major&caged=Z');
    const { container } = render(<App />);
    expect(container.querySelectorAll('.note-caged')).toHaveLength(0);
  });

  it('bietet in einer Molltonart nur die drei greifbaren Formen an — und sagt warum', () => {
    window.history.replaceState(null, '', '/?root=A&scale=natural-minor');
    const { container } = render(<App />);

    openView(container);
    expect(container.querySelector('.view-hint')?.textContent).toContain('In Moll');
    const forms = [...picker(container)!.querySelectorAll('option')]
      .map((option) => option.value)
      .filter(Boolean);
    expect(new Set(forms)).toEqual(new Set(['A', 'E', 'D']));
  });
});

describe('App — Neues aus dem UX-Review', () => {
  it('nennt die Vorlagen mit Akkordnamen statt nur mit römischen Ziffern', () => {
    window.history.replaceState(null, '', '/?root=G&scale=major');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    const select = [...container.querySelectorAll<HTMLSelectElement>('.panel-head select')].find((s) =>
      [...s.options].some((o) => o.value === 'custom'),
    )!;
    const first = [...select.options].find((o) => o.value === 'I-V-vi-IV')!;
    expect(first.textContent).toBe('G – D – Em – C');
  });

  it('transponiert eine eigene Folge mit der Tonart', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=G&scale=major&prog=custom:G,D,Em,C');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Einen Halbton höher"]')!);
    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Einen Halbton höher"]')!);

    expect(container.querySelector('.scale-title h2')?.textContent).toBe('A-Dur (Ionisch)');
    expect(chipSymbols(container)).toEqual(['A', 'E', 'F#m', 'D']);
  });

  it('schaltet zwischen offenen Griffen und kürzesten Wegen um', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=G&scale=major');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    const captions = () =>
      [...container.querySelectorAll('.progression .voicing-switch, .progression .voicing-caption')].map(
        (el) => el.textContent ?? '',
      );
    expect(captions().every((c) => c.includes('offen'))).toBe(true);

    await user.click(
      [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Griffe"] button')].find((b) =>
        b.textContent?.includes('Kürzeste'),
      )!,
    );
    expect(window.location.search).toContain('grips=near');
  });

  it('zeigt bei einem Modus den Ton, an dem man ihn erkennt', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=D&scale=dorian');
    const { container } = render(<App />);
    openSheet(container, 'Tonart');

    // D-Dorisch: die große Sexte, B.
    const hint = container.querySelector('.characteristic-hint')!;
    expect(hint.textContent).toContain('B');
    expect(hint.textContent).toContain('Dorisch von Moll');
    expect(container.querySelectorAll('.note-characteristic').length).toBeGreaterThan(0);

    await user.click(hint.querySelector<HTMLButtonElement>('.link-button')!);
    expect(new Set(pickedLabels(container))).toEqual(new Set(['B']));
  });

  it('schweigt über einen Charakterton, wo es keinen gibt', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.characteristic-hint')).toBeNull();
  });

  it('stellt mit einem Rhythmus-Stil alle vier Regler auf einmal', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('.rhythm-trigger')!);
    await user.click(
      [...container.querySelectorAll<HTMLButtonElement>('.rhythm-panel .preset-button')].find(
        (b) => b.textContent === 'Blues-Shuffle',
      )!,
    );

    expect(window.location.search).toContain('feel=shuffle');
    expect(container.querySelector('.rhythm-trigger .trigger-value')?.textContent).toContain(
      'Blues-Shuffle',
    );
  });

  it('merkt sich Linkshänder auf dem Gerät, nicht im Link', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('fretboard:view');
    const { container } = render(<App />);
    openSheet(container, 'Ansicht');

    await user.click(container.querySelector<HTMLInputElement>('.footer-toggle input')!);

    expect(window.location.search).not.toContain('lefty');
    expect(window.localStorage.getItem('fretboard:view')).toContain('"lefty":true');
    window.localStorage.removeItem('fretboard:view');
  });
});

describe('App — Noten finden', () => {
  const openKeyless = () => {
    window.history.replaceState(null, '', '/');
    return render(<App />);
  };

  /** The dot drawn at one string and fret, by its position on the board. */
  const dotAt = (container: HTMLElement, label: string, nth = 0) =>
    [...container.querySelectorAll<SVGGElement>('.fretboard .note')].filter(
      (g) => g.querySelector('.note-label')?.textContent === label,
    )[nth];

  it('hebt beim Antippen jede Stelle mit demselben Ton hervor', () => {
    const { container } = openKeyless();

    fireEvent.pointerDown(dotAt(container, 'C'), { pointerId: 1 });
    fireEvent.pointerUp(dotAt(container, 'C'), { pointerId: 1 });

    const picked = pickedLabels(container);
    const board = new Fretboard(undefined, 24);
    expect(picked).toHaveLength(board.allPositions().filter((p) => p.pitchClass === 0).length);
    expect(new Set(picked)).toEqual(new Set(['C']));
    // Und die Info-Leiste sagt, wie viele Stellen es sind.
    expect(container.querySelector('.info-bar')?.textContent).toContain(
      `${picked.length} Stellen`,
    );
  });

  it('umrandet nur die Stellen mit genau derselben Tonhöhe', () => {
    const { container } = openKeyless();

    // Das erste C ist das tiefste: A-Saite, 3. Bund (C3, MIDI 48).
    fireEvent.pointerDown(dotAt(container, 'C'), { pointerId: 1 });

    const rings = container.querySelectorAll('.note-unison').length;
    expect(rings).toBeGreaterThan(0);
    // Nicht jedes C hat dieselbe Tonhöhe — andere Oktaven bleiben ohne Ring.
    expect(rings).toBeLessThan(pickedLabels(container).length);
    expect(container.querySelector('.info-bar-title')?.textContent).toMatch(/^C\d$/);
  });

  it('wählt unter einer Tonart beim Antippen die passende Stufe', () => {
    const { container } = render(<App />); // A-Dur

    fireEvent.pointerDown(dotAt(container, 'E'), { pointerId: 1 });

    openSheet(container, 'Tonart');
    const chips = [...container.querySelectorAll<HTMLButtonElement>('.degree-chip')];
    expect(chips[4].getAttribute('aria-pressed')).toBe('true'); // E = 5. Stufe
  });

  it('lässt eine Akkord-Hervorhebung stehen, während man darüber spielt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    openSheet(container, 'Akkorde');

    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[0]);
    fireEvent.pointerDown(dotAt(container, 'B'), { pointerId: 1 });

    expect(container.querySelectorAll('.chord-card')[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('schaltet die Schreibweise der schwarzen Tasten um', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('fretboard:view');
    const { container } = openKeyless();

    const labels = () =>
      new Set([...container.querySelectorAll('.note-label')].map((el) => el.textContent));
    expect(labels().has('F♯')).toBe(true);

    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Mit B (♭)"]')!);
    expect(labels().has('G♭')).toBe(true);
    expect(labels().has('F♯')).toBe(false);
    window.localStorage.removeItem('fretboard:view');
  });
});

describe('App — Eigene Folge bearbeiten', () => {
  it('macht „Leeren" rückgängig', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=G&scale=major&prog=custom:G,D,Em,C');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelector<HTMLButtonElement>('.builder-clear')!);
    expect(chipSymbols(container)).toEqual([]);

    await user.click(container.querySelector<HTMLButtonElement>('.builder-undo .link-button')!);
    expect(chipSymbols(container)).toEqual(['G', 'D', 'Em', 'C']);
  });

  it('bietet das Rückgängig nicht mehr an, wenn sich danach etwas anderes geändert hat', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?root=G&scale=major&prog=custom:G,D,Em,C');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    await user.click(container.querySelectorAll<HTMLButtonElement>('.builder-remove')[1]);
    expect(container.querySelector('.builder-undo')).not.toBeNull();

    // Transponieren ändert die Folge — Rückgängig würde das mitnehmen.
    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Einen Halbton höher"]')!);
    expect(container.querySelector('.builder-undo')).toBeNull();
  });

  it('verschiebt einen Akkord mit den Pfeiltasten', () => {
    window.history.replaceState(null, '', '/?root=G&scale=major&prog=custom:G,D,Em,C');
    const { container } = render(<App />);
    openSheet(container, 'Folge');

    const handles = container.querySelectorAll<HTMLButtonElement>('.builder-handle');
    fireEvent.keyDown(handles[0], { key: 'ArrowRight' });

    expect(chipSymbols(container)).toEqual(['D', 'G', 'Em', 'C']);
  });
});

describe('App — Noten finden, zweiter Durchgang', () => {
  const dotAt = (container: HTMLElement, label: string, nth = 0) =>
    [...container.querySelectorAll<SVGGElement>('.fretboard .note')].filter(
      (g) => g.querySelector('.note-label')?.textContent === label,
    )[nth];

  it('hebt die Hervorhebung auf, wenn man denselben Ton noch einmal antippt', () => {
    window.history.replaceState(null, '', '/');
    const { container } = render(<App />);

    fireEvent.pointerDown(dotAt(container, 'C'), { pointerId: 1 });
    expect(pickedLabels(container).length).toBeGreaterThan(0);

    // Ein anderes C — derselbe Ton, eine andere Stelle.
    fireEvent.pointerDown(dotAt(container, 'C', 2), { pointerId: 2 });
    expect(pickedLabels(container)).toHaveLength(0);
  });

  it('wechselt bei einem anderen Ton direkt zu diesem', () => {
    window.history.replaceState(null, '', '/');
    const { container } = render(<App />);

    fireEvent.pointerDown(dotAt(container, 'C'), { pointerId: 1 });
    fireEvent.pointerDown(dotAt(container, 'G'), { pointerId: 2 });
    expect(new Set(pickedLabels(container))).toEqual(new Set(['G']));
  });

  it('nennt auch unter einer Tonart Ton, Oktave und Anzahl der Stellen', () => {
    const { container } = render(<App />); // A-Dur
    fireEvent.pointerDown(dotAt(container, 'E'), { pointerId: 1 });

    expect(container.querySelector('.info-bar-title')?.textContent).toMatch(/^E\d$/);
    expect(container.querySelector('.info-bar-text')?.textContent).toMatch(/^\d+ Stellen/);
  });

  it('zeichnet die schwarzen Tasten der Karte dunkler', () => {
    window.history.replaceState(null, '', '/');
    const { container } = render(<App />);

    const black = [...container.querySelectorAll('.note-dot--black')].length;
    const board = new Fretboard(undefined, 24);
    const blackKeys = new Set([1, 3, 6, 8, 10]);
    expect(black).toBe(board.allPositions().filter((p) => blackKeys.has(p.pitchClass)).length);
  });

  it('zeigt einen gefundenen Ton auch außerhalb der gewählten Lage', () => {
    window.history.replaceState(null, '', '/?scale=major&box=1&zoom=0');
    const { container } = render(<App />);

    fireEvent.pointerDown(dotAt(container, 'E'), { pointerId: 1 });
    // Die Treffer außerhalb der Lage sind leiser, aber nicht weggedimmt.
    expect(container.querySelectorAll('.note-dot--picked.is-faint').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.note-dot--picked.is-dimmed')).toHaveLength(0);
  });
});
