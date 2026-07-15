import { useEffect, useMemo, useRef, useState } from 'react';
import { type AudioPlayer, createAudioPlayer } from './audio';
import { FretboardView, type LabelMode } from './components/FretboardView';
import { ProgressionChord } from './components/ProgressionChord';
import {
  buildProgression,
  type ChordSize,
  chordMidiTones,
  diatonicChords,
  Fretboard,
  hasChordShapes,
  midiForPitchClass,
  Note,
  progressionsFor,
  ROOT_CHOICES,
  Scale,
  scaleMidiSequence,
  SCALE_TYPES,
  scaleTypesInGroup,
  Tuning,
} from './theory';
import { type AppState, readState, writeState } from './urlState';
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

  const boxes = useMemo(() => fretboard.scalePositions(scale), [fretboard, scale]);

  // A box number from the URL — or left over from another scale — may not exist here.
  const box = boxes.find((b) => b.number === state.boxNumber) ?? null;

  const [highlight, setHighlight] = useState<Highlight>(null);

  // Resolve the highlight into what the fretboard picks out AND what to play:
  // a chord is strummed as its tones, a single degree sounds as one note.
  const picked = useMemo(() => {
    if (highlight === null) return null;

    if (highlight.kind === 'chord') {
      const chord = chords[highlight.index];
      if (!chord) return null;
      return {
        pitchClasses: chord.pitchClasses,
        label: chord.name(),
        midi: chordMidiTones(chord),
        mode: 'strum' as const,
      };
    }

    const note = scale.notes[highlight.index];
    if (!note) return null;
    return {
      pitchClasses: [note.pitchClass],
      label: `Stufe ${scale.degreeLabelOf(note.pitchClass)}`,
      midi: [midiForPitchClass(note.pitchClass)],
      mode: 'together' as const,
    };
  }, [highlight, chords, scale]);

  const isChordActive = (index: number) =>
    highlight?.kind === 'chord' && highlight.index === index;
  const isDegreeActive = (index: number) =>
    highlight?.kind === 'degree' && highlight.index === index;

  /** Clicking what is already picked clears it — the click is a toggle. */
  const toggleHighlight = (next: NonNullable<Highlight>) =>
    setHighlight((current) =>
      current?.kind === next.kind && current.index === next.index ? null : next,
    );

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

  // On a phone the secondary fields fold away, so the neck stays above the fold.
  const [moreOpen, setMoreOpen] = useState(false);

  // One player for the whole session, built lazily so no AudioContext exists
  // until the first play — browsers require a user gesture to start audio.
  const playerRef = useRef<AudioPlayer | null>(null);
  const player = () => (playerRef.current ??= createAudioPlayer());

  const playScale = () =>
    player().play(scaleMidiSequence(scale, { descend: true }), { mode: 'sequence' });

  const playPicked = () => {
    if (picked) player().play(picked.midi, { mode: picked.mode });
  };

  const playProgression = () =>
    player().playChords(steps.map((step) => chordMidiTones(step.chord)));

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
                onClick={() => toggleHighlight({ kind: 'degree', index: i })}
              >
                <span className="note-name">{note.name()}</span>
                <span className="note-degree">{scale.degreeLabelOf(note.pitchClass)}</span>
              </button>
            </li>
          ))}
        </ul>

        {picked ? (
          <span className="picked-actions">
            <button
              type="button"
              className="play-button play-button--small"
              onClick={playPicked}
              aria-label={`${picked.label} abspielen`}
              title="Anhören"
            >
              ▶
            </button>
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
      />

      {chords.length > 0 ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Leitereigene Akkorde</h2>
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
                    className={isChordActive(i) ? 'chord-card is-active' : 'chord-card'}
                    aria-pressed={isChordActive(i)}
                    onClick={() => toggleHighlight({ kind: 'chord', index: i })}
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
              <div className="panel-title">
                <h2>Akkordfolge</h2>
                <button
                  type="button"
                  className="play-button play-button--small"
                  onClick={playProgression}
                  aria-label="Akkordfolge abspielen"
                  title="Folge abspielen"
                >
                  ▶
                </button>
              </div>
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
                    onHear={(midi) => player().play(midi, { mode: 'strum' })}
                  />
                );
              })}
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
