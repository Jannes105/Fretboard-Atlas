import { useEffect, useMemo, useRef, useState } from 'react';
import { type AudioPlayer, createAudioPlayer, LOOSE_ARPEGGIO_GAP, prefetchSamples } from './audio';
import { FretboardView, type LabelMode } from './components/FretboardView';
import { positionKey } from './components/neckGeometry';
import { KeyFinder } from './components/KeyFinder';
import { ProgressionPanel } from './components/ProgressionPanel';
import { SetupPanel } from './components/SetupPanel';
import { useAppState } from './hooks/useAppState';
import { useTheme } from './hooks/useTheme';
import { useTransport } from './hooks/useTransport';
import {
  buildProgression,
  Chord,
  type ChordSize,
  chordMidiTones,
  customSteps,
  defaultPattern,
  defaultVoicingIndex,
  diatonicChords,
  Fretboard,
  serializePattern,
  STANDARD_STRUM_GAP,
  Note,
  positionsAtPitch,
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
  customProgId,
  customProgSteps,
  customTuningNotes,
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

export default function App() {
  const { state, update, patch } = useAppState();
  // Deliberately not part of `state`: the theme belongs to the reader, not to the
  // link. See useTheme.
  const { theme, setTheme } = useTheme();

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
    rhythm,
    strum,
    sustain,
    click,
  } = state;

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

  /**
   * The key the harmony comes from. For a seven-note scale that is the scale
   * itself; a pentatonic or the blues scale borrows from the key behind it, on the
   * same root. Everything chord-shaped hangs off this rather than off `scale`,
   * which is why a pentatonic now has chords, a progression and a transport at all.
   */
  const chordScale = useMemo(() => scale.chordSource(), [scale]);

  const chords = useMemo(
    () => (chordScale ? diatonicChords(chordScale, chordSize) : []),
    [chordScale, chordSize],
  );

  /** True when the chords on screen are not the scale's own. */
  const isBorrowedHarmony = chordScale !== null && chordScale !== scale;

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

  /**
   * Positions to sound a CHORD from. Not the same set as `visiblePositions`: that
   * one holds scale notes only, and a borrowed chord reaches outside the scale —
   * the VI of A minor pentatonic is F–A–C, and there is no F on a pentatonic neck.
   * Sounding it from the scale map would give a bare A/C dyad and quietly break the
   * app's one rule, that clicking a thing lets you hear it.
   *
   * Still filtered by the box, so a chord keeps the register of the position you
   * are looking at.
   */
  const chordPositions = useMemo(() => {
    if (chordScale === null || chordScale === scale) return visiblePositions;
    const all = fretboard.mapScale(chordScale);
    return box ? all.filter((p) => p.fret >= box.startFret && p.fret <= box.endFret) : all;
  }, [fretboard, chordScale, scale, box, visiblePositions]);

  const lowestMidi = useMemo(
    () => visiblePositions.reduce((min, p) => Math.min(min, p.midi), Number.POSITIVE_INFINITY),
    [visiblePositions],
  );

  const [highlight, setHighlight] = useState<Highlight>(null);

  // Resolve the highlight into what the fretboard picks out: the pitch classes to
  // pick out, and a name for them. What to PLAY is worked out where the click
  // happens (pickChord, pickDegree) — a chord and a scale tone draw from different
  // position sets, and carrying an unread `midi` here once hid that difference.
  const picked = useMemo(() => {
    if (highlight === null) return null;

    if (highlight.kind === 'chord') {
      const chord = chords[highlight.index];
      if (!chord) return null;
      return { pitchClasses: chord.pitchClasses, label: chord.name() };
    }

    const note = scale.notes[highlight.index];
    if (!note) return null;
    return {
      pitchClasses: [note.pitchClass],
      label: `Stufe ${scale.degreeLabelOf(note.pitchClass)}`,
    };
  }, [highlight, chords, scale]);

  const isChordActive = (index: number) =>
    highlight?.kind === 'chord' && highlight.index === index;
  const isDegreeActive = (index: number) =>
    highlight?.kind === 'degree' && highlight.index === index;

  const progressions = useMemo(
    () => (chordScale ? progressionsFor(chordScale) : []),
    [chordScale],
  );

  // A self-built progression rides in the same slot, marked by a "custom:" prefix.
  const customChordSteps = customProgSteps(progressionId);
  const isCustom = customChordSteps !== null;

  // The selected preset may not exist in this key — fall back to the first.
  const preset = isCustom
    ? null
    : (progressions.find((p) => p.id === progressionId) ?? progressions[0] ?? null);

  // steps and their bar counts are built together, so skipping an unparseable
  // custom chord drops its duration too and the two stay aligned.
  const { steps, chordBars } = useMemo(() => {
    const custom = customProgSteps(progressionId);
    if (custom !== null) {
      const chords: Chord[] = [];
      const bars: number[] = [];
      for (const entry of custom) {
        try {
          chords.push(Chord.parse(entry.symbol)); // a mistyped URL degrades, not throws
          bars.push(entry.bars);
        } catch {
          // skip
        }
      }
      // Roman numerals are measured against the key the harmony lives in, so a
      // self-built sequence over a pentatonic is numbered from its parent key.
      return { steps: customSteps(chordScale ?? scale, chords), chordBars: bars };
    }
    const chosen = progressions.find((p) => p.id === progressionId) ?? progressions[0] ?? null;
    const built = chosen && chordScale ? buildProgression(chordScale, chosen, chordSize) : [];
    return { steps: built, chordBars: built.map(() => 1) };
  }, [progressionId, progressions, scale, chordScale, chordSize]);

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

  // One player for the whole session, built lazily so no AudioContext exists
  // until the first play — browsers require a user gesture to start audio.
  const playerRef = useRef<AudioPlayer | null>(null);
  const player = () => (playerRef.current ??= createAudioPlayer());

  // Push the chosen voice to the player. player() only builds the wrapper, not an
  // AudioContext, so this is safe before the first gesture.
  useEffect(() => {
    player().setTimbre(sound);
  }, [sound]);


  // A one-off chord has no bar to spread across, so an arpeggio there just walks the
  // strings at a leisurely pace.
  const strumGapNow = strum === 'arpeggio' ? LOOSE_ARPEGGIO_GAP : STANDARD_STRUM_GAP;
  // A one-off chord has no bar either, so "stopped" just means a short, cut note.
  const chordSeconds = sustain === 'stopped' ? 0.3 : 1.9;

  // Start pulling the guitar recordings down as soon as the app is on screen. A
  // fetch needs neither a gesture nor an AudioContext, so by the first click the
  // ~380 KB is usually already there and only needs decoding.
  useEffect(() => {
    void prefetchSamples();
  }, []);

  // Silence the player when the app goes away. useTransport only ever stopped the
  // progression, so a scale run's timers used to outlive the component.
  useEffect(() => () => playerRef.current?.stop(), []);

  /**
   * Which note of the scale run is sounding, as an index into the sequence below.
   * Only the index is kept: turning it into positions needs the sequence, which is
   * derived, so storing the positions too would be a second copy that can go stale.
   */
  const [soundingIndex, setSoundingIndex] = useState<number | null>(null);

  const scaleSequence = useMemo(
    () => scaleMidiSequence(scale, { baseMidi: lowestMidi, descend: true }),
    [scale, lowestMidi],
  );

  // A pitch usually sits on several positions at once, and all of them light up —
  // it is the same note, playable in more than one place.
  const soundingKeys = useMemo(() => {
    if (soundingIndex === null) return null;
    const midi = scaleSequence[soundingIndex];
    if (midi === undefined) return null;
    return new Set(positionsAtPitch(visiblePositions, midi).map(positionKey));
  }, [soundingIndex, scaleSequence, visiblePositions]);

  // A run that is no longer playable — the key changed mid-run — must not leave
  // its marker behind.
  useEffect(() => setSoundingIndex(null), [scaleSequence]);

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
    player().play(scaleSequence, {
      mode: 'sequence',
      // Lights each note on the neck as it sounds; null when the run is over.
      onNote: setSoundingIndex,
    });

  /**
   * The app's one rule: click a thing and you hear it. Clicking a chord sounds it
   * at the pitches it has on screen AND shows it on the neck — no separate button,
   * and no toggling off, because you want to click the same chord twice to hear it
   * twice. The "aufheben" link is what clears.
   *
   * Sounded from chordPositions, not from the scale map: a borrowed chord has tones
   * the scale does not, and playing only the ones that happen to be in the
   * pentatonic would make the VI a two-note fragment. The neck still highlights
   * only scale tones — that gap is the lesson, not a bug.
   */
  const pickChord = (index: number) => {
    setHighlight({ kind: 'chord', index });
    const chord = chords[index];
    if (chord) {
      player().play(positionsToMidi(chordPositions, chord.pitchClasses), {
        mode: 'strum',
        stack: true,
        gap: strumGapNow, duration: chordSeconds,
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
        gap: strumGapNow, duration: chordSeconds,
      });
    }
  };

  /** Sound a grip exactly as drawn — the real strings under the fingers. */
  const hearVoicing = (voicing: Voicing) =>
    player().play(voicingMidi(voicing, chordTuning), { mode: 'strum', stack: true, gap: strumGapNow, duration: chordSeconds });

  // ---- Progression transport ----

  // Play the grips actually on screen; only fall back to an abstract voicing where
  // no shape exists for this tuning.
  const chordNotes = steps.map((step, i) => {
    const voicing = stepVoicings[i]?.[voicingIndex(i)];
    return voicing ? voicingMidi(voicing, chordTuning) : chordMidiTones(step.chord);
  });

  const transport = useTransport({
    chordNotes,
    chordBars,
    bpm,
    beatsPerBar,
    rhythm,
    style: strum,
    length: sustain,
    click,
    loop,
    player,
    material: [steps, chordTuning, chosenVoicings],
  });

  const { playingStep, isPlaying } = transport;

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Fretboard Atlas</h1>
          <p className="subtitle">Tonarten und Skalen auf dem Hals sichtbar machen.</p>
        </div>

        <SetupPanel
          tuning={tuning}
          tuningId={tuningId}
          isCustomTuning={isCustomTuning}
          capo={capo}
          fretCount={fretCount}
          sound={sound}
          theme={theme}
          onTuningIdChange={(next) => update('tuningId', next)}
          onCapoChange={(next) => update('capo', next)}
          onFretCountChange={(next) => update('fretCount', next)}
          onSoundChange={(next) => update('sound', next)}
          onThemeChange={setTheme}
        />
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
              patch((previous) => ({
                ...previous,
                root: pickedRoot,
                scaleTypeId: pickedScaleTypeId,
              }))
            }
            onAdopt={(symbols, pickedRoot, pickedScaleTypeId) =>
              patch((previous) => ({
                ...previous,
                root: pickedRoot,
                scaleTypeId: pickedScaleTypeId,
                // Adopted chords start at one bar each.
                progressionId: customProgId(symbols.map((symbol) => ({ symbol, bars: 1 }))),
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

        {/* Only meaningful with a position selected — there is nothing else to
            crop to, and offering it on the whole neck would be a dead control. */}
        {box ? (
          <label className="toggle">
            <input
              type="checkbox"
              checked={!state.boxZoom}
              onChange={(e) => update('boxZoom', !e.target.checked)}
            />
            <span>Ganzen Hals zeigen</span>
          </label>
        ) : null}

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
        zoom={state.boxZoom}
        sounding={soundingKeys}
        highlight={picked?.pitchClasses ?? null}
        highlightLabel={picked?.label ?? null}
        onPlayNote={(midi) => player().playNote(midi)}
      />

      {chords.length > 0 ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>
                Leitereigene Akkorde
                {isBorrowedHarmony ? (
                  <span className="panel-source">aus {chordScale.name()}</span>
                ) : null}
              </h2>
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

            <p className="hint">
              {isBorrowedHarmony
                ? `${scale.type.name} hat keine eigenen Stufenakkorde — diese kommen aus ${chordScale.name()}, der Tonart dahinter. Anklicken: du hörst den Akkord und siehst, welche seiner Töne im Hals liegen.`
                : 'Anklicken: du hörst den Akkord und siehst seine Töne im Hals.'}
            </p>

            <ol className="chord-row">
              {chords.map((chord, i) => (
                <li key={chord.name()} className="chord-slot">
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

                  {/* These seven chords used to be drawn a second time inside the
                      builder just to add them. One set, two actions instead. */}
                  {isCustom ? (
                    <button
                      type="button"
                      className="chord-add"
                      aria-label={`${chord.name()} an die Folge anhängen`}
                      title="An die Folge anhängen"
                      onClick={() =>
                        update(
                          'progressionId',
                          customProgId([
                            ...(customChordSteps ?? []),
                            { symbol: chord.name(), bars: 1 },
                          ]),
                        )
                      }
                    >
                      +
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <ProgressionPanel
            progressions={progressions}
            preset={preset}
            isCustom={isCustom}
            customChordSteps={customChordSteps}
            onProgressionIdChange={(next) => update('progressionId', next)}
            steps={steps}
            stepVoicings={stepVoicings}
            voicingIndex={voicingIndex}
            onSelectVoicing={(step, voicing) =>
              setChosenVoicings((current) => {
                const next = [...current];
                next[step] = voicing;
                return next;
              })
            }
            openPicker={openPicker}
            onTogglePicker={(step) => setOpenPicker((open) => (open === step ? null : step))}
            onHearVoicing={hearVoicing}
            isPlaying={isPlaying}
            playingStep={playingStep}
            onToggleTransport={transport.toggle}
            bpm={bpm}
            onBpmChange={(next) => update('bpm', next)}
            loop={loop}
            onLoopChange={(next) => update('loop', next)}
            beatsPerBar={beatsPerBar}
            rhythm={rhythm}
            strum={strum}
            sustain={sustain}
            click={click}
            onBeatsPerBarChange={(nextBeats) =>
              // The pattern length follows the meter, so a new meter resets it.
              patch((previous) => ({
                ...previous,
                beatsPerBar: nextBeats,
                rhythm: serializePattern(defaultPattern(nextBeats)),
              }))
            }
            onRhythmChange={(next) => update('rhythm', next)}
            onStrumChange={(next) => update('strum', next)}
            onSustainChange={(next) => update('sustain', next)}
            onClickChange={(next) => update('click', next)}
          />
        </>
      ) : (
        /*
         * Unreachable today: every scale on offer either has seven degrees of its
         * own or names the key it borrows from. It stays as the honest answer for
         * a future scale that has neither — a whole-tone scale, say.
         */
        <p className="empty">
          {scale.type.name} hat {scale.notes.length} Stufen und keine Tonart, aus der sich
          Stufenakkorde borgen ließen. Wähl eine Dur-, Moll- oder Kirchentonart.
        </p>
      )}
    </main>
  );
}
