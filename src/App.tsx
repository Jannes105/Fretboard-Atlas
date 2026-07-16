import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AudioPlayer, createAudioPlayer, type ProgressionHandle } from './audio';
import { FretboardView, type LabelMode } from './components/FretboardView';
import { ProgressionChord } from './components/ProgressionChord';
import {
  buildProgression,
  type ChordSize,
  chordMidiTones,
  defaultVoicingIndex,
  diatonicChords,
  Fretboard,
  hasChordShapes,
  Note,
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
import { type AppState, MAX_BPM, MIN_BPM, readState, writeState } from './urlState';
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

  const tuning = useMemo(() => Tuning.byId(tuningId), [tuningId]);

  const fretboard = useMemo(
    () => new Fretboard(tuning, fretCount, Math.min(capo, fretCount)),
    [tuning, fretCount, capo],
  );

  /**
   * Chord shapes are fretted relative to the capo, so the capo goes into the
   * tuning we hand to the voicing search rather than into the fret numbers.
   */
  const chordTuning = useMemo(() => tuning.withCapo(capo), [tuning, capo]);
  const shapesFit = hasChordShapes(chordTuning);

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

  // The selected progression may not exist in this key — fall back to the first.
  const progression =
    progressions.find((p) => p.id === progressionId) ?? progressions[0] ?? null;

  const steps = useMemo(
    () => (progression ? buildProgression(scale, progression, chordSize) : []),
    [scale, progression, chordSize],
  );

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

  // On a phone the secondary fields fold away, so the neck stays above the fold.
  const [moreOpen, setMoreOpen] = useState(false);

  // One player for the whole session, built lazily so no AudioContext exists
  // until the first play — browsers require a user gesture to start audio.
  const playerRef = useRef<AudioPlayer | null>(null);
  const player = () => (playerRef.current ??= createAudioPlayer());

  // Anchor the scale run to the register it actually occupies on screen, so a
  // capo or a box up the neck is heard, not flattened to a fixed octave.
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
      // One chord is one bar of 4/4.
      secondsPerChord: (4 * 60) / bpm,
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
  }, [bpm, loop]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>Fretboard Atlas</h1>
        <p className="subtitle">Tonarten und Skalen auf dem Hals sichtbar machen.</p>
      </header>

      <section className="toolbar" aria-label="Einstellungen">
        <label className="field">
          <span>Grundton</span>
          <select value={root} onChange={(e) => update('root', e.target.value)}>
            {ROOT_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Skala</span>
          <select value={scaleTypeId} onChange={(e) => update('scaleTypeId', e.target.value)}>
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
        </label>

        <label className="field">
          <span>Lage</span>
          <select
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

        <button
          type="button"
          className="toolbar-toggle"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          {moreOpen ? 'Weniger Einstellungen ▴' : 'Weitere Einstellungen ▾'}
        </button>

        <div className={moreOpen ? 'toolbar-more is-open' : 'toolbar-more'}>
          <label className="field">
            <span>Beschriftung</span>
            <select
              value={labelMode}
              onChange={(e) => update('labelMode', e.target.value as LabelMode)}
            >
              <option value="note">Notennamen</option>
              <option value="degree">Stufen</option>
            </select>
          </label>

          <label className="field">
            <span>Bünde</span>
            <select value={fretCount} onChange={(e) => update('fretCount', Number(e.target.value))}>
              <option value={12}>12</option>
              <option value={15}>15</option>
              <option value={24}>24</option>
            </select>
          </label>

          <label className="field">
            <span>Stimmung</span>
            <select value={tuningId} onChange={(e) => update('tuningId', e.target.value)}>
              {Tuning.ALL.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

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
            <span>Akkorde</span>
            <select
              value={chordSize}
              onChange={(e) => update('chordSize', Number(e.target.value) as ChordSize)}
            >
              <option value={3}>Dreiklänge</option>
              <option value={4}>Septakkorde</option>
            </select>
          </label>
        </div>
      </section>

      <section className="scale-strip">
        <div className="scale-title">
          <h2>{scale.name()}</h2>
          <button
            type="button"
            className="play-button"
            onClick={playScale}
            aria-label={`${scale.name()} abspielen`}
            title="Skala abspielen"
          >
            ▶
          </button>
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
                value={progression?.id ?? ''}
                onChange={(e) => update('progressionId', e.target.value)}
              >
                {progressions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {progression?.hint ? <p className="hint">{progression.hint}</p> : null}

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

              <span className="transport-note">Ein Akkord = ein Takt</span>
            </div>

            {!shapesFit ? (
              <p className="hint hint--warn">
                Die Akkordnamen stimmen — die Grifftabellen zeigt die App in {tuning.name} aber
                nicht: Die hinterlegten Formen setzen die Saitenabstände der Standardstimmung
                voraus und würden hier andere Akkorde ergeben.
              </p>
            ) : null}

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
