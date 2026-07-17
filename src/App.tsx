import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AudioPlayer, createAudioPlayer, type ProgressionHandle, type Timbre } from './audio';
import { FretboardView, type LabelMode } from './components/FretboardView';
import { KeyFinder } from './components/KeyFinder';
import { ProgressionBuilder } from './components/ProgressionBuilder';
import { ProgressionChord } from './components/ProgressionChord';
import {
  buildProgression,
  Chord,
  type ChordSize,
  chordMidiTones,
  customSteps,
  defaultVoicingIndex,
  diatonicChords,
  Fretboard,
  Note,
  pitchClassName,
  positionsToMidi,
  progressionsFor,
  ROOT_CHOICES,
  Scale,
  scaleMidiSequence,
  SCALE_TYPES,
  scaleTypesInGroup,
  Tuning,
  type Voicing,
  voicingMidi,
  voicingsFor,
} from './theory';
import {
  type AppState,
  customProgId,
  customProgSymbols,
  customTuningId,
  customTuningNotes,
  MAX_BPM,
  MIN_BPM,
  readState,
  writeState,
} from './urlState';
import './App.css';

/**
 * What is currently picked out on the neck. A chord and a single scale degree are
 * the same idea — "show me these tones" — so they share one slot and one
 * mechanism, and picking one clears the other.
 */
type Highlight =
  | { kind: 'chord'; index: number }
  | { kind: 'degree'; index: number }
  | null;

/** The twelve notes offered per string in the custom-tuning editor. */
const NOTE_OPTIONS: string[] = Array.from({ length: 12 }, (_, pitchClass) =>
  pitchClassName(pitchClass),
);

export default function App() {
  // One object rather than a dozen useStates: it is exactly what goes in the URL,
  // so persisting it is a single effect instead of a dozen.
  const [state, setState] = useState<AppState>(() => readState(window.location.search));

  const update = <K extends keyof AppState>(key: K, value: AppState[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  const {
    root,
    scaleTypeId,
    labelMode,
    fretCount,
    chordSize,
    tuningId,
    capo,
    progressionId,
    bpm,
    loop,
    sound,
    beatsPerBar,
  } = state;

  // Replace rather than push, so the back button does not walk through every
  // twiddle of a dropdown.
  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${writeState(state)}`);
  }, [state]);

  const scale = useMemo(() => {
    const type = SCALE_TYPES.find((t) => t.id === scaleTypeId) ?? SCALE_TYPES[0];
    return new Scale(Note.parse(root), type);
  }, [root, scaleTypeId]);

  const tuning = useMemo(() => {
    const notes = customTuningNotes(tuningId);
    if (notes) {
      try {
        return Tuning.fromNoteNames(notes);
      } catch {
        return Tuning.STANDARD; // a mistyped custom tuning should not crash the app
      }
    }
    return Tuning.byId(tuningId);
  }, [tuningId]);

  const isCustomTuning = customTuningNotes(tuningId) !== null;

  const fretboard = useMemo(
    () => new Fretboard(tuning, fretCount, Math.min(capo, fretCount)),
    [tuning, fretCount, capo],
  );

  /**
   * Chord shapes are fretted relative to the capo, so the capo goes into the
   * tuning we hand to the voicing search rather than into the fret numbers.
   */
  const chordTuning = useMemo(() => tuning.withCapo(capo), [tuning, capo]);

  const chords = useMemo(
    () => (scale.type.isHeptatonic ? diatonicChords(scale, chordSize) : []),
    [scale, chordSize],
  );

  const boxes = useMemo(() => fretboard.scalePositions(scale), [fretboard, scale]);

  // A box number from the URL — or left over from another scale — may not exist here.
  const box = boxes.find((b) => b.number === state.boxNumber) ?? null;

  // The notes currently on screen, with their real pitches (tuning + capo baked
  // in). Playback derives from these, so what you hear matches what you see —
  // a box up the neck sounds higher, a capo raises everything.
  const visiblePositions = useMemo(() => {
    const all = fretboard.mapScale(scale);
    return box ? all.filter((p) => p.fret >= box.startFret && p.fret <= box.endFret) : all;
  }, [fretboard, scale, box]);

  const lowestMidi = useMemo(
    () => visiblePositions.reduce((min, p) => Math.min(min, p.midi), Number.POSITIVE_INFINITY),
    [visiblePositions],
  );

  const [highlight, setHighlight] = useState<Highlight>(null);

  // Resolve the highlight into what the fretboard picks out AND what to play. The
  // pitch classes drive the visual highlight; the MIDI notes are the real fretted
  // pitches of every shown position — for a chord, all of its tones on screen.
  const picked = useMemo(() => {
    if (highlight === null) return null;

    if (highlight.kind === 'chord') {
      const chord = chords[highlight.index];
      if (!chord) return null;
      return {
        pitchClasses: chord.pitchClasses,
        label: chord.name(),
        midi: positionsToMidi(visiblePositions, chord.pitchClasses),
      };
    }

    const note = scale.notes[highlight.index];
    if (!note) return null;
    return {
      pitchClasses: [note.pitchClass],
      label: `Stufe ${scale.degreeLabelOf(note.pitchClass)}`,
      midi: positionsToMidi(visiblePositions, [note.pitchClass]),
    };
  }, [highlight, chords, scale, visiblePositions]);

  const isChordActive = (index: number) =>
    highlight?.kind === 'chord' && highlight.index === index;
  const isDegreeActive = (index: number) =>
    highlight?.kind === 'degree' && highlight.index === index;

  const progressions = useMemo(() => progressionsFor(scale), [scale]);

  // A self-built progression rides in the same slot, marked by a "custom:" prefix.
  const customChordSymbols = customProgSymbols(progressionId);
  const isCustom = customChordSymbols !== null;

  // The selected preset may not exist in this key — fall back to the first.
  const preset = isCustom
    ? null
    : (progressions.find((p) => p.id === progressionId) ?? progressions[0] ?? null);

  const steps = useMemo(() => {
    const symbols = customProgSymbols(progressionId);
    if (symbols !== null) {
      // Skip anything unparseable, so a mistyped URL degrades rather than throws.
      const parsed = symbols.flatMap((symbol) => {
        try {
          return [Chord.parse(symbol)];
        } catch {
          return [];
        }
      });
      return customSteps(scale, parsed);
    }
    const chosen = progressions.find((p) => p.id === progressionId) ?? progressions[0] ?? null;
    return chosen ? buildProgression(scale, chosen, chordSize) : [];
  }, [progressionId, progressions, scale, chordSize]);

  /**
   * The grips available per step, and which one is chosen. This lives here rather
   * than inside ProgressionChord because the transport has to play the very shapes
   * on screen — that was the whole point of lifting it.
   */
  const stepVoicings = useMemo(
    () => steps.map((step) => voicingsFor(step.chord, { tuning: chordTuning })),
    [steps, chordTuning],
  );

  const [chosenVoicings, setChosenVoicings] = useState<number[]>([]);

  // A different key, progression, chord size or tuning means different grips, so
  // any earlier choice is meaningless — fall back to the barre default.
  useEffect(() => {
    setChosenVoicings(stepVoicings.map(defaultVoicingIndex));
  }, [stepVoicings]);

  const voicingIndex = (step: number) =>
    chosenVoicings[step] ?? defaultVoicingIndex(stepVoicings[step] ?? []);

  // At most one voicing picker is open.
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  /**
   * Tuning, capo and fret count are set once and then left alone, so they live
   * behind a trigger that spells out the current setup rather than eight
   * dropdowns competing with the key. Deliberately not URL state: sharing a link
   * with a panel hanging open makes no sense.
   */
  const [setupOpen, setSetupOpen] = useState(false);
  const setupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!setupOpen) return;

    const onDown = (event: MouseEvent) => {
      if (!setupRef.current?.contains(event.target as Node)) setSetupOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSetupOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [setupOpen]);

  // The trigger's label: the setup is readable without opening anything. A capo
  // only earns a mention when there is one — the normal case is no capo, and
  // saying so every time is noise on a phone-width line.
  const setupSummary = [
    // A custom tuning shows its notes; a preset just its name.
    isCustomTuning ? tuning.description : tuning.name,
    capo > 0 ? `Kapo ${capo}. Bund` : null,
    `${fretCount} Bünde`,
  ]
    .filter(Boolean)
    .join(' · ');

  // One player for the whole session, built lazily so no AudioContext exists
  // until the first play — browsers require a user gesture to start audio.
  const playerRef = useRef<AudioPlayer | null>(null);
  const player = () => (playerRef.current ??= createAudioPlayer());

  // Push the chosen voice to the player. player() only builds the wrapper, not an
  // AudioContext, so this is safe before the first gesture.
  useEffect(() => {
    player().setTimbre(sound);
  }, [sound]);

  /**
   * Anchored to the register the scale actually occupies on screen, so a capo or
   * a box up the neck is heard rather than flattened to a fixed octave.
   *
   * Over the whole neck that lands low — A major starts on A2, 110 Hz, which a
   * phone speaker can barely reproduce. Raising it an octave would sound better,
   * and was considered and rejected: it would break the very thing this is for.
   * Mapping the fret wins over being easy to hear. App.test.tsx guards it
   * ("lässt eine hohe Lage höher klingen als eine tiefe").
   */
  const playScale = () =>
    player().play(scaleMidiSequence(scale, { baseMidi: lowestMidi, descend: true }), {
      mode: 'sequence',
    });

  /**
   * The app's one rule: click a thing and you hear it. Clicking a chord sounds it
   * at the pitches it has on screen AND shows it on the neck — no separate button,
   * and no toggling off, because you want to click the same chord twice to hear it
   * twice. The "aufheben" link is what clears.
   */
  const pickChord = (index: number) => {
    setHighlight({ kind: 'chord', index });
    const chord = chords[index];
    if (chord) {
      player().play(positionsToMidi(visiblePositions, chord.pitchClasses), {
        mode: 'strum',
        stack: true,
      });
    }
  };

  const pickDegree = (index: number) => {
    setHighlight({ kind: 'degree', index });
    const note = scale.notes[index];
    if (note) {
      player().play(positionsToMidi(visiblePositions, [note.pitchClass]), {
        mode: 'strum',
        stack: true,
      });
    }
  };

  /** Sound a grip exactly as drawn — the real strings under the fingers. */
  const hearVoicing = (voicing: Voicing) =>
    player().play(voicingMidi(voicing, chordTuning), { mode: 'strum', stack: true });

  // ---- Progression transport ----

  const [playingStep, setPlayingStep] = useState<number | null>(null);
  const transportRef = useRef<ProgressionHandle | null>(null);

  const stopProgression = useCallback(() => {
    transportRef.current?.stop();
    transportRef.current = null;
    setPlayingStep(null);
  }, []);

  const startProgression = () => {
    // Play the grips actually on screen; only fall back to an abstract voicing
    // where no shape exists for this tuning.
    const chordNotes = steps.map((step, i) => {
      const voicing = stepVoicings[i]?.[voicingIndex(i)];
      return voicing ? voicingMidi(voicing, chordTuning) : chordMidiTones(step.chord);
    });

    transportRef.current = player().startProgression(chordNotes, {
      // One chord is one bar; a bar is beatsPerBar beats at the current tempo.
      secondsPerChord: (beatsPerBar * 60) / bpm,
      loop,
      onChord: (index) => {
        setPlayingStep(index);
        // A run that ends on its own must clear the handle too, or the tempo
        // knob below would "restart" a take that already finished.
        if (index === null) transportRef.current = null;
      },
    });
  };

  const isPlaying = playingStep !== null;
  const toggleProgression = () => (isPlaying ? stopProgression() : startProgression());

  // Leaving the page with a loop still armed would keep scheduling forever.
  useEffect(() => stopProgression, [stopProgression]);

  // Different material (key, grips, tuning) — the loop would otherwise carry on
  // with chords that are no longer on screen.
  useEffect(() => {
    stopProgression();
  }, [steps, chordTuning, chosenVoicings, stopProgression]);

  // Tempo and loop are the knobs you reach for WHILE practising, so those pick up
  // straight away instead of stopping the take.
  const restartRef = useRef(startProgression);
  restartRef.current = startProgression;
  useEffect(() => {
    if (transportRef.current) restartRef.current();
  }, [bpm, loop, beatsPerBar]);

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Fretboard Atlas</h1>
          <p className="subtitle">Tonarten und Skalen auf dem Hals sichtbar machen.</p>
        </div>

        {/* The instrument itself: set once, so it states its value and keeps the
            controls one click away rather than competing with the key. */}
        <div className="setup" ref={setupRef}>
          <button
            type="button"
            className={setupOpen ? 'setup-trigger is-open' : 'setup-trigger'}
            aria-expanded={setupOpen}
            onClick={() => setSetupOpen((open) => !open)}
          >
            <span>{setupSummary}</span>
            <span className="setup-caret" aria-hidden="true">
              ▾
            </span>
          </button>

          {setupOpen ? (
            <div className="setup-panel">
              <label className="field">
                <span>Stimmung</span>
                <select
                  value={isCustomTuning ? 'custom' : tuningId}
                  onChange={(e) =>
                    update(
                      'tuningId',
                      // Switching to custom seeds the editor from the current tuning.
                      e.target.value === 'custom'
                        ? customTuningId(tuning.stringLabels)
                        : e.target.value,
                    )
                  }
                >
                  {Tuning.ALL.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.description}
                    </option>
                  ))}
                  <option value="custom">Eigene Stimmung</option>
                </select>
              </label>

              {isCustomTuning ? (
                <div className="tuning-strings" role="group" aria-label="Saiten stimmen">
                  {tuning.stringLabels.map((label, i) => (
                    <select
                      // Strings never reorder, so the index is a stable key.
                      // eslint-disable-next-line react/no-array-index-key
                      key={i}
                      aria-label={`Saite ${tuning.stringLabels.length - i}`}
                      value={label}
                      onChange={(e) => {
                        const notes = [...tuning.stringLabels];
                        notes[i] = e.target.value;
                        update('tuningId', customTuningId(notes));
                      }}
                    >
                      {NOTE_OPTIONS.map((note) => (
                        <option key={note} value={note}>
                          {note}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              ) : null}

              <label className="field">
                <span>Kapo</span>
                <select value={capo} onChange={(e) => update('capo', Number(e.target.value))}>
                  <option value={0}>ohne</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((fret) => (
                    <option key={fret} value={fret}>
                      {fret}. Bund
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Bünde</span>
                <select
                  value={fretCount}
                  onChange={(e) => update('fretCount', Number(e.target.value))}
                >
                  <option value={12}>12</option>
                  <option value={15}>15</option>
                  <option value={24}>24</option>
                </select>
              </label>

              <label className="field">
                <span>Klang</span>
                <select value={sound} onChange={(e) => update('sound', e.target.value as Timbre)}>
                  <option value="soft">Weich</option>
                  <option value="clean">Clean</option>
                  <option value="electric">Overdrive</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </header>

      <section className="scale-strip">
        <div className="scale-title">
          {/*
           * The key IS the heading — the two selects below spell it out, so a
           * separate line of text saying the same thing was pure duplication.
           * The heading stays for screen readers and the document outline.
           */}
          <h2 className="sr-only">{scale.name()}</h2>

          {/*
           * The visible text sizes the control and the select lies invisibly on
           * top of it: a select is as wide as its LONGEST option, which for a
           * headline leaves the underline and caret trailing off into space.
           */}
          <span className="key-select key-select--root">
            <span className="key-select-text" aria-hidden="true">{root}</span>
            <select aria-label="Grundton" value={root} onChange={(e) => update('root', e.target.value)}>
              {ROOT_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </span>

          <span className="key-select">
            <span className="key-select-text" aria-hidden="true">{scale.type.name}</span>
            <select
              aria-label="Skala"
              value={scaleTypeId}
              onChange={(e) => update('scaleTypeId', e.target.value)}
            >
              <optgroup label="Grundlagen">
                {scaleTypesInGroup('basics').map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Weitere">
                {scaleTypesInGroup('more').map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </span>

          <button
            type="button"
            className="play-button"
            onClick={playScale}
            aria-label={`${scale.name()} abspielen`}
            title="Skala abspielen"
          >
            ▶
          </button>

          <KeyFinder
            onPick={(pickedRoot, pickedScaleTypeId) =>
              setState((previous) => ({
                ...previous,
                root: pickedRoot,
                scaleTypeId: pickedScaleTypeId,
              }))
            }
            onAdopt={(symbols, pickedRoot, pickedScaleTypeId) =>
              setState((previous) => ({
                ...previous,
                root: pickedRoot,
                scaleTypeId: pickedScaleTypeId,
                progressionId: customProgId(symbols),
              }))
            }
          />
        </div>

        <ul className="degree-chips">
          {scale.notes.map((note, i) => (
            <li key={note.name()}>
              <button
                type="button"
                className={[
                  'degree-chip',
                  i === 0 ? 'is-root' : '',
                  isDegreeActive(i) ? 'is-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={isDegreeActive(i)}
                onClick={() => pickDegree(i)}
              >
                <span className="note-name">{note.name()}</span>
                <span className="note-degree">{scale.degreeLabelOf(note.pitchClass)}</span>
              </button>
            </li>
          ))}
        </ul>

        {picked ? (
          <span className="picked-actions">
            <button type="button" className="link-button" onClick={() => setHighlight(null)}>
              {picked.label} hervorgehoben — aufheben
            </button>
          </span>
        ) : null}
      </section>

      {/* Both of these change only what the neck shows, so they sit on the neck. */}
      <div className="neck-bar">
        <label className="field field--inline">
          <span>Lage</span>
          <select
            aria-label="Lage"
            value={box ? state.boxNumber : 0}
            onChange={(e) => update('boxNumber', Number(e.target.value))}
          >
            <option value={0}>Ganzer Hals</option>
            {boxes.map((option) => (
              <option key={option.number} value={option.number}>
                Lage {option.number} ({option.anchorFret}. Bund)
              </option>
            ))}
          </select>
        </label>

        <label className="field field--inline">
          <span>Beschriftung</span>
          <select
            aria-label="Beschriftung"
            value={labelMode}
            onChange={(e) => update('labelMode', e.target.value as LabelMode)}
          >
            <option value="note">Notennamen</option>
            <option value="degree">Stufen</option>
          </select>
        </label>
      </div>

      <FretboardView
        scale={scale}
        fretboard={fretboard}
        labelMode={labelMode}
        position={box}
        highlight={picked?.pitchClasses ?? null}
        highlightLabel={picked?.label ?? null}
        onPlayNote={(midi) => player().playNote(midi)}
      />

      {chords.length > 0 ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Leitereigene Akkorde</h2>
              <select
                className="select"
                aria-label="Akkordgröße"
                value={chordSize}
                onChange={(e) => update('chordSize', Number(e.target.value) as ChordSize)}
              >
                <option value={3}>Dreiklänge</option>
                <option value={4}>Septakkorde</option>
              </select>
            </div>

            <p className="hint">Anklicken: du hörst den Akkord und siehst seine Töne im Hals.</p>

            <ol className="chord-row">
              {chords.map((chord, i) => (
                <li key={chord.name()}>
                  <button
                    type="button"
                    className={isChordActive(i) ? 'chord-card is-active' : 'chord-card'}
                    aria-pressed={isChordActive(i)}
                    onClick={() => pickChord(i)}
                  >
                    <span className="roman">{chord.romanNumeral(i)}</span>
                    <span className="chord-symbol">{chord.name()}</span>
                    <span className="chord-notes">
                      {chord.notes.map((note) => note.name()).join(' ')}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Akkordfolge</h2>
              <select
                className="select"
                value={isCustom ? 'custom' : (preset?.id ?? '')}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    // Seed the builder with what is on screen, so it is never blank.
                    update('progressionId', customProgId(steps.map((s) => s.chord.name())));
                  } else {
                    update('progressionId', e.target.value);
                  }
                }}
              >
                {progressions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="custom">Eigene Folge</option>
              </select>
            </div>

            {isCustom ? (
              <ProgressionBuilder
                diatonic={chords}
                symbols={customChordSymbols ?? []}
                onChange={(symbols) => update('progressionId', customProgId(symbols))}
              />
            ) : preset?.hint ? (
              <p className="hint">{preset.hint}</p>
            ) : null}

            <div className="transport">
              <button
                type="button"
                className={isPlaying ? 'play-button is-playing' : 'play-button'}
                onClick={toggleProgression}
                aria-label={isPlaying ? 'Akkordfolge stoppen' : 'Akkordfolge abspielen'}
              >
                {isPlaying ? '■' : '▶'}
              </button>

              <label className="tempo">
                <span>
                  Tempo <output>{bpm}</output> BPM
                </span>
                {/* Single BPM steps: pushing a passage up by two is how tempo
                    practice actually works. Arrow keys nudge exactly one. */}
                <input
                  type="range"
                  min={MIN_BPM}
                  max={MAX_BPM}
                  step={1}
                  value={bpm}
                  onChange={(e) => update('bpm', Number(e.target.value))}
                />
              </label>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => update('loop', e.target.checked)}
                />
                <span>Wiederholen</span>
              </label>

              <label className="field field--inline">
                <span>Takt</span>
                <select
                  aria-label="Taktart"
                  value={beatsPerBar}
                  onChange={(e) => update('beatsPerBar', Number(e.target.value))}
                >
                  <option value={4}>4/4</option>
                  <option value={3}>3/4</option>
                  <option value={6}>6/8</option>
                  <option value={2}>2/4</option>
                </select>
              </label>
            </div>

            <ol className="progression">
              {steps.map((step, i) => (
                <ProgressionChord
                  key={`${step.chord.name()}#${i}`}
                  step={step}
                  voicings={stepVoicings[i] ?? []}
                  selected={voicingIndex(i)}
                  onSelect={(index) =>
                    setChosenVoicings((current) => {
                      const next = [...current];
                      next[i] = index;
                      return next;
                    })
                  }
                  isOpen={openPicker === i}
                  onToggle={() => setOpenPicker((open) => (open === i ? null : i))}
                  onHear={hearVoicing}
                  isPlaying={playingStep === i}
                />
              ))}
            </ol>
          </section>
        </>
      ) : (
        <p className="empty">
          {scale.type.name} hat {scale.notes.length} Stufen — leitereigene Akkorde brauchen sieben.
          Wähl eine Dur-, Moll- oder Kirchentonart.
        </p>
      )}
    </main>
  );
}
