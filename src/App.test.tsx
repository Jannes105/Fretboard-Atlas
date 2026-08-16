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

    // Sechs Saiten über fünfzehn Bünde plus die leeren Saiten — lückenlos.
    const board = new Fretboard(undefined, 15);
    expect(container.querySelectorAll('.note-dot')).toHaveLength(board.allPositions().length);
  });

  it('nennt die schwarzen Tasten mit beiden Schreibweisen', () => {
    const { container } = openApp();

    const stacked = [...container.querySelectorAll('.note-label--stacked')];
    expect(stacked.length).toBeGreaterThan(0);
    // Fünf von zwölf Tonklassen haben zwei Namen, die Stammtöne genau einen.
    expect(stacked.length).toBeLessThan(container.querySelectorAll('.note-label').length);
    // Der erste ist der 2. Bund der tiefen E-Saite — F♯ und G♭ sind derselbe Bund.
    expect(stacked[0].textContent).toBe('F♯G♭');
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
    expect(container.querySelector('.empty')).not.toBeNull();
  });

  it('bietet keinen Grundton an, solange keine Skala gewählt ist', () => {
    const { container } = openApp();

    // Ein Grundton ohne Skala wäre eine Tonika für einen Hals, der keine hat.
    expect(container.querySelector('[aria-label="Grundton"]')).toBeNull();
    expect(container.querySelector('[aria-label="Skala"]')).not.toBeNull();
  });

  it('holt mit einer gewählten Skala alles zurück, was daran hängt', async () => {
    const user = userEvent.setup();
    const { container } = openApp();

    await user.selectOptions(
      container.querySelector<HTMLSelectElement>('[aria-label="Skala"]')!,
      'major',
    );

    expect(container.querySelector('.scale-title h2')?.textContent).toBe('A-Dur (Ionisch)');
    expect(container.querySelectorAll('.chord-card')).toHaveLength(7);
    expect(container.querySelector('[aria-label="Grundton"]')).not.toBeNull();
    expect(container.querySelector('.neck-bar')).not.toBeNull();
    expect(window.location.search).toContain('scale=major');
  });

  it('führt über „Alle Töne“ auch wieder zurück', async () => {
    const user = userEvent.setup();
    // Startet in einer Tonart, die nicht der Default-Grundton ist.
    window.history.replaceState(null, '', '/?root=Eb&scale=minor-pentatonic');
    const { container } = render(<App />);

    await user.selectOptions(container.querySelector<HTMLSelectElement>('[aria-label="Skala"]')!, '');

    expect(container.querySelector('.scale-title h2')?.textContent).toBe('Alle Töne');
    // Der Grundton bleibt gemerkt, statt beim Zurückschalten verloren zu gehen.
    expect(window.location.search).toContain('root=Eb');
    expect(window.location.search).not.toContain('scale=');
  });
});

describe('App — Tonart finden', () => {
  it('setzt Grundton und Skala aus den eingegebenen Akkorden', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.keyfinder-trigger')!);
    await user.type(container.querySelector<HTMLInputElement>('.keyfinder-field input')!, 'Am F C G');

    // Am F C G ist mehrdeutig — es müssen mehrere Kandidaten erscheinen.
    const results = [...container.querySelectorAll<HTMLButtonElement>('.keyfinder-result')];
    expect(results.length).toBeGreaterThan(1);

    const cMajor = results.find((r) => r.textContent?.startsWith('C-Dur'))!;
    await user.click(cMajor);

    // Der Klick stellt die ganze App auf C-Dur und schließt das Panel.
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('C-Dur (Ionisch)');
    expect(container.querySelectorAll('.keyfinder-panel')).toHaveLength(0);
  });

  it('meldet ein nicht erkanntes Token, statt still zu schlucken', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.keyfinder-trigger')!);
    // H gibt es in der internationalen Notation nicht.
    await user.type(container.querySelector<HTMLInputElement>('.keyfinder-field input')!, 'G H');

    expect(container.querySelector('.keyfinder-note--warn')?.textContent).toContain('H');
  });

  it('übernimmt die getippten Akkorde als spielbare Folge in der gefundenen Tonart', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.keyfinder-trigger')!);
    await user.type(container.querySelector<HTMLInputElement>('.keyfinder-field input')!, 'G D Em C');
    await user.click(container.querySelector<HTMLButtonElement>('.keyfinder-adopt')!);

    // Der Kreis schließt sich: Tonart gesetzt UND die Folge im Builder.
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('G-Dur (Ionisch)');
    expect(chipSymbols(container)).toEqual(['G', 'D', 'Em', 'C']);
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

    await user.selectOptions(progressionSelect(container), 'custom');

    // A-Dur-Default ist I–V–vi–IV = A E F#m D.
    expect(chipSymbols(container)).toEqual(['A', 'E', 'F#m', 'D']);
  });

  it('hängt einen Akkord auch aus einer Vorlage heraus an und macht daraus die eigene Folge', async () => {
    // Vorher war das „+“ unsichtbar, bis man „Eigene Folge“ unten im Dropdown
    // gefunden hatte — eine Hürde vor genau der Funktion, für die es da ist.
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(container.querySelectorAll('.chord-add')).toHaveLength(7);

    // Die dritte Karte ist iii = C#m.
    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-add')[2]);

    expect(chipSymbols(container)).toEqual(['A', 'E', 'F#m', 'D', 'C#m']);
    expect(window.location.search).toContain('prog=custom');
  });

  it('hängt einen getippten Powerchord an und normalisiert seine Schreibung', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C,G');
    const { container } = render(<App />);

    await user.type(container.querySelector<HTMLInputElement>('.builder-type input')!, 'e5');
    await user.click(container.querySelector<HTMLButtonElement>('.builder-type-add')!);

    expect(chipSymbols(container)).toEqual(['C', 'G', 'E5']);
  });

  it('weist einen unsinnigen Akkord ab, ohne ihn aufzunehmen', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C');
    const { container } = render(<App />);

    await user.type(container.querySelector<HTMLInputElement>('.builder-type input')!, 'Xyz');
    await user.click(container.querySelector<HTMLButtonElement>('.builder-type-add')!);

    expect(container.querySelector('.builder-error')).not.toBeNull();
    expect(chipSymbols(container)).toEqual(['C']);
  });

  it('spielt die eigene Folge über den Transport, nicht eine Vorlage', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C,G,Am,F');
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.transport .play-button')!);

    const [chords] = player.startProgression.mock.calls[0];
    expect(chords).toHaveLength(4); // C G Am F, nicht die vierteilige Default-Vorlage zufällig
  });

  it('spielt einen Slash-Akkord über seinen Griff, mit dem Bass unten', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&prog=custom:C/G');
    const { container } = render(<App />);

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
  it('macht die Tonart selbst bedienbar, statt sie daneben noch einmal auszuschreiben', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const rootSelect = container.querySelector<HTMLSelectElement>('[aria-label="Grundton"]')!;
    await user.selectOptions(rootSelect, 'C');

    // Die Überschrift bleibt für Screenreader und folgt der Auswahl.
    expect(container.querySelector('.scale-title h2')?.textContent).toBe('C-Dur (Ionisch)');
  });

  it('hält den Kopf frei: über dem Hals stehen nur Grundton und Skala', () => {
    const { container } = render(<App />);

    // Vorher waren es acht gleichrangige Dropdowns in einem Block.
    expect(container.querySelectorAll('.scale-strip select')).toHaveLength(2);
    // Und das Setup steht als Text da, statt als Regler aufzuklappen.
    expect(container.querySelectorAll('.setup-panel')).toHaveLength(0);
  });

  it('nennt Stimmung, Kapo und Bünde im Auslöser, ohne dass man ihn öffnen muss', () => {
    window.history.replaceState(null, '', '/?scale=major&tuning=drop-d&capo=3&frets=12');
    const { container } = render(<App />);

    expect(container.querySelector('.setup-trigger .trigger-value')?.textContent).toBe(
      'Drop D · Kapo 3. Bund · 12 Bünde',
    );
  });

  it('schweigt über den Kapo, solange keiner drauf ist — der Normalfall ist keine Meldung wert', () => {
    const { container } = render(<App />);

    expect(container.querySelector('.setup-trigger .trigger-value')?.textContent).toBe(
      'Standard · 15 Bünde',
    );
  });

  it('öffnet das Setup und schließt es mit Escape', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.setup-trigger')!);
    // Stimmung, Kapo, Bünde, Klang — vier, und alle vier beschreiben das
    // Instrument. Die Darstellung ist raus: sie beschreibt den Betrachter und
    // steht jetzt im Fuß der Seite.
    expect(container.querySelectorAll('.setup-panel select')).toHaveLength(4);
    expect(container.querySelector('.app-footer select')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(container.querySelectorAll('.setup-panel')).toHaveLength(0);
  });

  it('bietet den Kapo bis zum 12. Bund an', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.setup-trigger')!);
    // Kapo ist das zweite Feld: „ohne" plus zwölf Bünde.
    const capoSelect = container.querySelectorAll('.setup-panel select')[1];
    expect(capoSelect.querySelectorAll('option')).toHaveLength(13);
    expect(capoSelect.querySelectorAll('option')[12].textContent).toBe('12. Bund');
  });
});

describe('App — Eigene Stimmung', () => {
  const tuningSelect = (container: HTMLElement) =>
    container.querySelector<HTMLSelectElement>('.setup-panel select')!;

  it('zeigt bei „Eigene Stimmung" sechs Saiten-Dropdowns, aus der aktuellen Stimmung befüllt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('.setup-trigger')!);
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

    await user.click(container.querySelector<HTMLButtonElement>('.setup-trigger')!);
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

    await user.click(container.querySelector<HTMLButtonElement>('.setup-trigger')!);
    const soundSelect = [...container.querySelectorAll<HTMLSelectElement>('.setup-panel select')].find(
      (select) => [...select.options].some((option) => option.value === 'electric'),
    )!;
    await user.selectOptions(soundSelect, 'electric');

    expect(player.setTimbre).toHaveBeenCalledWith('electric');
    expect(window.location.search).toContain('sound=electric');
  });

  it('bietet die Verstärkerwahl erst zum Overdrive an und gibt sie weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const openSound = async () =>
      user.click(container.querySelector<HTMLButtonElement>('.sound-trigger')!);
    const ampSelect = () =>
      [...container.querySelectorAll<HTMLSelectElement>('.sound-panel select')].find((select) =>
        [...select.options].some((option) => option.value === 'modern-high-gain'),
      );

    // Clean geht gar nicht durch den Verstärker — ein Wahlschalter dafür wäre tot.
    await openSound();
    expect(ampSelect()).toBeUndefined();

    // Die Stimme selbst bleibt im Instrument-Fach, weil sie entscheidet, ob es
    // überhaupt einen Verstärker gibt.
    await user.click(container.querySelector<HTMLButtonElement>('.setup-trigger')!);
    const soundSelect = [...container.querySelectorAll<HTMLSelectElement>('.setup-panel select')].find(
      (select) => [...select.options].some((option) => option.value === 'electric'),
    )!;
    await user.selectOptions(soundSelect, 'electric');

    await openSound();
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

    await user.click(container.querySelector<HTMLButtonElement>('.sound-trigger')!);
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

  it('gibt die drei Klangregler weiter und lässt sie flach beginnen', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(player.setTone).toHaveBeenCalledWith({ bass: 0, mid: 0, treble: 0 });

    await user.click(container.querySelector<HTMLButtonElement>('.sound-trigger')!);
    const bass = container.querySelector<HTMLInputElement>('.tone-stack input[type="range"]')!;

    // fireEvent statt userEvent: ein Slider auf einen bestimmten Wert zu ziehen
    // ist eine Mausgeste, die jsdom nicht hat — der Wert selbst ist der Punkt.
    fireEvent.change(bass, { target: { value: '-4' } });

    expect(player.setTone).toHaveBeenCalledWith({ bass: -4, mid: 0, treble: 0 });
    expect(window.location.search).toContain('bass=-4');
  });

  it('bindet das Delay an das Tempo, damit auch ein einzelner Akkord im Takt hallt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(player.setTempo).toHaveBeenCalledWith(90);

    const tempo = container.querySelector<HTMLInputElement>('.tempo input[type="range"]')!;
    fireEvent.change(tempo, { target: { value: '140' } });

    await user.click(container.querySelector<HTMLButtonElement>('.sound-trigger')!);
    expect(player.setTempo).toHaveBeenCalledWith(140);
  });
});

describe('App — Tonlänge', () => {
  it('gibt die gewählte Tonlänge an den Transport weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

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

    expect(container.querySelector('.transport [aria-label="Klick"]')).not.toBeNull();

    await user.click(container.querySelector<HTMLButtonElement>('.rhythm-trigger')!);
    expect(container.querySelector('.rhythm-panel [aria-label="Klick"]')).toBeNull();
  });

  it('gibt den gewählten Klick an den Transport weiter', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

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
  it('nennt den Einstellungs-Auslöser beim Namen', () => {
    // „Standard · 15 Bünde“ allein verrät nie, dass hell/dunkel dahinter liegt,
    // also steht der Name immer da. Der Wert steht nicht mehr daneben: mit ihm
    // war der Auslöser 351px breit und damit das schwerste Element im Header,
    // schwerer als die Tonart darunter. Er wohnt jetzt im Panel (siehe App.css).
    const { container } = render(<App />);
    const trigger = container.querySelector('.setup-trigger')!;

    expect(trigger.textContent).toContain('Instrument');
  });

  it('nennt auch den Rhythmus-Auslöser beim Namen', () => {
    const { container } = render(<App />);
    const trigger = container.querySelector('.rhythm-trigger')!;

    expect(trigger.textContent).toContain('Rhythmus');
    expect(trigger.textContent).toContain('4/4');
  });

  it('gibt den beiden ▶ unterscheidbare Beschriftungen', () => {
    const { container } = render(<App />);
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

    const chips = container.querySelectorAll<HTMLButtonElement>('.degree-chip');
    await user.click(chips[2]); // C# als Stufe

    const cards = container.querySelectorAll<HTMLButtonElement>('.chord-card');
    await user.click(cards[0]); // I = A-Dur (A C# E)

    // Die Stufe ist nicht mehr aktiv, der Akkord schon — sie schließen sich aus.
    expect(chips[2].getAttribute('aria-pressed')).toBe('false');
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');

    // A ist der Skalengrundton und behält bewusst seine Grundton-Farbe, statt als
    // Akkordton eingefärbt zu werden — gepickt (teal) sind daher nur Terz und Quinte.
    expect(new Set(pickedLabels(container))).toEqual(new Set(['C♯', 'E']));
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

  it('hebt die Hervorhebung mit Escape auf', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[3]);
    expect(container.querySelectorAll('.note-dot--picked').length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(container.querySelectorAll('.note-dot--picked')).toHaveLength(0);
  });

  it('bietet das Aufheben auch unten bei den Akkordkarten an, nicht nur über dem Hals', async () => {
    // Der Link über dem Hals ist vom Klick auf eine Karte weit weg — auf dem
    // Handy steht er außerhalb des Bildes.
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(container.querySelector('.chord-row-actions')).toBeNull();

    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[3]);
    await user.click(container.querySelector<HTMLButtonElement>('.chord-row-actions .link-button')!);

    expect(container.querySelectorAll('.note-dot--picked')).toHaveLength(0);
  });

  it('zeigt genau einen Weg zurück, und zwar dort, wo geklickt wurde', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const undos = () => container.querySelectorAll('.link-button');

    expect(undos()).toHaveLength(0);

    // Eine Stufe wird an der Legende unter dem Hals aufgehoben …
    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]);
    expect(undos()).toHaveLength(1);
    expect(container.querySelector('.neck-legend .link-button')).not.toBeNull();

    // … ein Akkord bei den Karten, die ihn ausgelöst haben. Nie beide zugleich:
    // zwei Links für einen Zustand lasen sich wie zwei verschiedene Aktionen.
    await user.click(container.querySelectorAll<HTMLButtonElement>('.chord-card')[2]);
    expect(undos()).toHaveLength(1);
    expect(container.querySelector('.chord-row-actions .link-button')).not.toBeNull();
    expect(container.querySelector('.neck-legend .link-button')).toBeNull();
  });

  it('stellt die Stufen-Chips unter den Hals, nicht darüber', async () => {
    const { container } = render(<App />);

    // Die Chips sind die Legende des Halses: gleiche Töne, gleiche Rollen, und
    // ein Klick greift oben ins Bild. Eine Legende steht bei ihrem Bild.
    const neck = container.querySelector('.fretboard-scroll')!;
    const chips = container.querySelector('.degree-chips')!;

    expect(container.querySelector('.scale-strip .degree-chips')).toBeNull();
    expect(neck.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lässt Escape bei offenem Setup nur das Panel schließen, die Hervorhebung bleibt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(container.querySelectorAll<HTMLButtonElement>('.degree-chip')[2]);
    await user.click(container.querySelector<HTMLButtonElement>('.setup-trigger')!);

    await user.keyboard('{Escape}');

    // Ein Escape, eine Wirkung: das Panel geht zu, der Hals bleibt wie er war.
    expect(container.querySelectorAll('.setup-panel')).toHaveLength(0);
    expect(container.querySelectorAll('.note-dot--picked').length).toBeGreaterThan(0);
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

    // Über das Label statt über die Position: ein Layout-Umbau darf diesen Test
    // nicht brechen — genau das ist hier schon einmal passiert.
    await user.selectOptions(container.querySelector<HTMLSelectElement>('[aria-label="Lage"]')!, '1');

    const all = container.querySelectorAll('.note-dot').length;
    const dimmed = container.querySelectorAll('.note-dot.is-dimmed').length;

    // Eine Lage zeigt nur einen Ausschnitt — es muss gedimmte Töne geben, aber
    // nicht alle.
    expect(dimmed).toBeGreaterThan(0);
    expect(dimmed).toBeLessThan(all);
  });

  it('sagt am Lupen-Knopf, was der nächste Klick tut, statt immer dasselbe zu behaupten', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.selectOptions(container.querySelector<HTMLSelectElement>('[aria-label="Lage"]')!, '1');

    // Frisch gewählt ist die Lage beschnitten, der Knopf bietet also den ganzen Hals an.
    const zoom = () => container.querySelector<HTMLButtonElement>('.icon-toggle')!;
    expect(zoom().title).toBe('Ganzen Hals zeigen');

    await user.click(zoom());

    // Jetzt liegt der ganze Hals offen — und der Knopf bietet den Weg zurück an,
    // statt weiter zu versprechen, was schon zu sehen ist.
    expect(zoom().title).toBe('Nur die Lage zeigen');
    expect(zoom().getAttribute('aria-label')).toBe('Nur die Lage zeigen');
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
    const slider = container.querySelector<HTMLInputElement>('.tempo input')!;

    expect(slider.step).toBe('1');
    expect(slider.min).toBe('40');
    expect(slider.max).toBe('200');
  });

  it('nimmt auch krumme Tempi an', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&bpm=92');
    const { container } = render(<App />);

    expect(container.querySelector('.tempo output')?.textContent).toBe('92');

    await user.click(transportButton(container));
    const [, options] = player.startProgression.mock.calls[0];
    expect(options.secondsPerBar).toBeCloseTo((4 * 60) / 92, 5);
  });

  it('leitet die Taktlänge aus Tempo und Taktart ab', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?scale=major&bpm=120');
    const { container } = render(<App />);

    await user.click(transportButton(container));

    const [, options] = player.startProgression.mock.calls[0];
    // 120 BPM, 4 Schläge je Takt => 2 s pro Takt.
    expect(options.secondsPerBar).toBeCloseTo(2, 5);
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
    expect(player.startProgression.mock.calls[1][1].secondsPerBar).toBeCloseTo(4, 5);
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

    // Frueher stand hier die Absage „braucht sieben Stufen" und sonst nichts.
    expect(container.querySelector('.empty')).toBeNull();
    expect(chordSymbols(container)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(container.querySelector('.panel-source')?.textContent).toBe('aus A-Moll (Äolisch)');

    // Und damit gibt es auch wieder etwas abzuspielen.
    expect(container.querySelector('.transport .play-button')).not.toBeNull();
  });

  it('laesst eine siebenstufige Skala unberuehrt — kein Hinweis, wo nichts geborgt ist', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.panel-source')).toBeNull();
  });

  it('klingt ein geborgter Akkord vollstaendig, auch wenn seine Toene nicht in der Skala liegen', () => {
    // Die Falle: die VI-Stufe von A-Moll ist F-A-C, und ein F liegt nirgends auf
    // einem Pentatonik-Hals. Wuerde der Akkord aus den sichtbaren Skalentoenen
    // gespielt, kaeme eine nackte A/C-Doppel heraus statt eines Akkords.
    window.history.replaceState(null, '', '/?root=A&scale=minor-pentatonic');
    const { container } = render(<App />);

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

    expect(container.querySelector('.panel-source')?.textContent).toBe('aus A-Moll (Äolisch)');
    // Die Progression erzwingt die Dominantseptime selbst, unabhaengig davon, dass
    // die Elterntonart Moll ist: I, IV und V haben in A-Dur und A-Moll dieselben
    // Grundtoene.
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

  it('zeigt ohne Auswahl kein Overlay, aber den Picker', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('.note-caged')).toHaveLength(0);
    expect(picker(container)).not.toBeNull();
  });

  it('verschweigt den Picker in einer Stimmung, in der die Formen nicht gelten', () => {
    // Lieber kein Angebot als ein falsches — dieselbe Regel wie bei den Griffen.
    window.history.replaceState(null, '', '/?scale=major&tuning=drop-d');
    const { container } = render(<App />);

    expect(picker(container)).toBeNull();
    expect(container.querySelectorAll('.note-caged')).toHaveLength(0);
  });

  it('ignoriert eine unbekannte Form aus der URL, statt zu stolpern', () => {
    window.history.replaceState(null, '', '/?scale=major&caged=Z');
    const { container } = render(<App />);
    expect(container.querySelectorAll('.note-caged')).toHaveLength(0);
  });

  it('bietet in einer Molltonart nur die drei greifbaren Formen an', () => {
    window.history.replaceState(null, '', '/?root=A&scale=natural-minor');
    const { container } = render(<App />);

    const forms = [...picker(container)!.querySelectorAll('option')]
      .map((option) => option.value)
      .filter(Boolean);
    expect(new Set(forms)).toEqual(new Set(['A', 'E', 'D']));
  });
});
