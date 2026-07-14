import { useEffect, useMemo, useState } from 'react';
import { FretboardView, type LabelMode } from './components/FretboardView';
import { ProgressionChord } from './components/ProgressionChord';
import {
  buildProgression,
  type ChordSize,
  diatonicChords,
  Fretboard,
  hasChordShapes,
  Note,
  progressionsFor,
  ROOT_CHOICES,
  Scale,
  SCALE_TYPES,
  scaleTypesInGroup,
  Tuning,
} from './theory';
import { type AppState, readState, writeState } from './urlState';
import './App.css';

export default function App() {
  // One object rather than a dozen useStates: it is exactly what goes in the URL,
  // so persisting it is a single effect instead of a dozen.
  const [state, setState] = useState<AppState>(() => readState(window.location.search));

  const update = <K extends keyof AppState>(key: K, value: AppState[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  const { root, scaleTypeId, labelMode, fretCount, chordSize, tuningId, capo, progressionId } =
    state;

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

  // Boxes and the highlighted chord both filter the fretboard, so both are reset
  // whenever the scale, neck or capo changes them out from under the selection.
  const boxes = useMemo(() => fretboard.scalePositions(scale), [fretboard, scale]);

  // A box number from the URL — or left over from another scale — may not exist here.
  const box = boxes.find((b) => b.number === state.boxNumber) ?? null;

  const [highlightedDegree, setHighlightedDegree] = useState<number | null>(null);
  const highlightedChord =
    highlightedDegree !== null ? (chords[highlightedDegree] ?? null) : null;

  const progressions = useMemo(() => progressionsFor(scale), [scale]);

  // The selected progression may not exist in this key — fall back to the first.
  const progression =
    progressions.find((p) => p.id === progressionId) ?? progressions[0] ?? null;

  const steps = useMemo(
    () => (progression ? buildProgression(scale, progression, chordSize) : []),
    [scale, progression, chordSize],
  );

  // Changing any of these invalidates a per-chord voicing the user picked, so it
  // goes into the ProgressionChord keys to force a remount.
  const contextKey = `${scale.name()}|${progression?.id}|${chordSize}|${chordTuning.name}`;

  // At most one voicing picker is open. Storing the full key rather than an index
  // means a change of key, progression or chord size closes it on its own.
  const [openChordKey, setOpenChordKey] = useState<string | null>(null);

  return (
    <main className="app">
      <header>
        <h1>Griffbrett</h1>
        <p className="subtitle">Tonarten und Skalen auf dem Hals sichtbar machen.</p>
      </header>

      <section className="controls">
        <label>
          <span>Grundton</span>
          <select value={root} onChange={(e) => update('root', e.target.value)}>
            {ROOT_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>

        <label>
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

        <label>
          <span>Beschriftung</span>
          <select
            value={labelMode}
            onChange={(e) => update('labelMode', e.target.value as LabelMode)}
          >
            <option value="note">Notennamen</option>
            <option value="degree">Stufen</option>
          </select>
        </label>

        <label>
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

        <label>
          <span>Bünde</span>
          <select value={fretCount} onChange={(e) => update('fretCount', Number(e.target.value))}>
            <option value={12}>12</option>
            <option value={15}>15</option>
            <option value={24}>24</option>
          </select>
        </label>

        <label>
          <span>Stimmung</span>
          <select value={tuningId} onChange={(e) => update('tuningId', e.target.value)}>
            {Tuning.ALL.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label>
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

        <label>
          <span>Akkorde</span>
          <select
            value={chordSize}
            onChange={(e) => update('chordSize', Number(e.target.value) as ChordSize)}
          >
            <option value={3}>Dreiklänge</option>
            <option value={4}>Septakkorde</option>
          </select>
        </label>
      </section>

      <section className="summary">
        <h2>{scale.name()}</h2>
        <ol className="note-list">
          {scale.notes.map((note, i) => (
            <li key={note.name()} className={i === 0 ? 'is-root' : undefined}>
              <span className="note-name">{note.name()}</span>
              <span className="note-degree">{scale.degreeLabelOf(note.pitchClass)}</span>
            </li>
          ))}
        </ol>
      </section>

      <FretboardView
        scale={scale}
        fretboard={fretboard}
        labelMode={labelMode}
        position={box}
        chord={highlightedChord}
      />

      {chords.length > 0 ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Leitereigene Akkorde</h2>
              {highlightedChord ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setHighlightedDegree(null)}
                >
                  Hervorhebung aufheben
                </button>
              ) : null}
            </div>

            <p className="hint">
              Auf einen Akkord klicken, um seine Töne im Griffbrett zu sehen — sie sind alle
              leitereigen.
            </p>

            <ol className="chord-row">
              {chords.map((chord, i) => (
                <li key={chord.name()}>
                  <button
                    type="button"
                    className={i === highlightedDegree ? 'chord-card is-active' : 'chord-card'}
                    aria-pressed={i === highlightedDegree}
                    onClick={() => setHighlightedDegree(i === highlightedDegree ? null : i)}
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

            {shapesFit ? (
              <p className="hint">
                Barré-Griffe als Vorgabe — auf einen Akkord klicken, um auf eine offene oder höhere
                Lage zu wechseln.
                {capo > 0 ? ' Die Bundlagen zählen ab dem Kapo.' : ''}
              </p>
            ) : (
              <p className="hint hint--warn">
                Die Akkordnamen stimmen — die Grifftabellen zeigt die App in {tuning.name} aber
                nicht: Die hinterlegten Formen setzen die Saitenabstände der Standardstimmung
                voraus und würden hier andere Akkorde ergeben.
              </p>
            )}

            <ol className="progression">
              {steps.map((step, i) => {
                const chordKey = `${contextKey}#${i}`;
                return (
                  <ProgressionChord
                    // Remounting on a context change resets the picked voicing.
                    key={chordKey}
                    step={step}
                    tuning={chordTuning}
                    isOpen={openChordKey === chordKey}
                    onToggle={() =>
                      setOpenChordKey((open) => (open === chordKey ? null : chordKey))
                    }
                  />
                );
              })}
            </ol>
          </section>
        </>
      ) : (
        <section className="panel">
          <p className="hint">
            {scale.type.name} hat {scale.type.semitones.length} Stufen — leitereigene Akkorde
            brauchen sieben. Wähl eine Dur-, Moll- oder Kirchentonart.
          </p>
        </section>
      )}
    </main>
  );
}
