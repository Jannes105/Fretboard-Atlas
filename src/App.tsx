import { useEffect, useMemo, useRef, useState } from 'react';
import { type AudioPlayer, createAudioPlayer, LOOSE_ARPEGGIO_GAP, prefetchSamples } from './audio';
import { FretboardView } from './components/FretboardView';
import { positionKey } from './components/neckGeometry';
import { KeyFinder } from './components/KeyFinder';
import { NoteText } from './components/NoteText';
import { ProgressionPanel } from './components/ProgressionPanel';
import { SetupPanel } from './components/SetupPanel';
import { useAppState } from './hooks/useAppState';
import { type ThemeChoice, useTheme } from './hooks/useTheme';
import { useTransport } from './hooks/useTransport';
import {
  buildProgression,
  cagedPlacements,
  type CagedForm,
  Chord,
  type ChordSize,
  chordMidiTones,
  customSteps,
  defaultPattern,
  defaultVoicingIndex,
  voicingPath,
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
  withAccidentals,
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
    amp,
    beatsPerBar,
    rhythm,
    strum,
    feel,
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

  /**
   * The CAGED form laid over the neck, placed on the key's tonic chord.
   *
   * The tonic is what makes the lesson land — "the box you are in is the E-shape
   * of A". Empty outside standard-interval tunings, where the forms would be
   * wrong; the picker hides itself then rather than offering a dead control.
   */
  const tonicChord = useMemo(() => chords[0] ?? null, [chords]);

  const cagedForms = useMemo(
    () => (tonicChord ? cagedPlacements(tonicChord, { tuning: chordTuning, maxFret: fretCount }) : []),
    [tonicChord, chordTuning, fretCount],
  );

  const caged = cagedForms.find((placement) => placement.form === state.cagedForm) ?? null;

  const boxes = useMemo(() => fretboard.scalePositions(scale), [fretboard, scale]);

  // A box number from the URL — or left over from another scale — may not exist here.
  const box = boxes.find((b) => b.number === state.boxNumber) ?? null;

  // boxZoom true means the drawing is cropped to the box, so that is when the
  // button offers the whole neck.
  const zoomAction = state.boxZoom ? 'Ganzen Hals zeigen' : 'Nur die Lage zeigen';

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
  // any earlier choice is meaningless. The replacements are chosen as a sequence,
  // not one by one: the opening grip is still the barre default, and the rest are
  // the ones that keep the hand where it already is.
  useEffect(() => {
    setChosenVoicings(voicingPath(stepVoicings));
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

  // Same again for the amplifier. Separate from the voice on purpose: switching
  // amplifier while `clean` is selected is legal and silent, and the choice is
  // still there when the overdrive is switched back on.
  useEffect(() => {
    player().setAmp(amp);
  }, [amp]);


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
   * Escape clears the highlight — the way out that does not depend on scrolling
   * back up to the link above the neck.
   *
   * An open panel owns Escape first: closing the setup must not also wipe the
   * neck. `defaultPrevented` cannot carry that, because the panels only register
   * their listener when they open, so this one always runs first. All three
   * panels share the `.popover` class, which makes one look enough.
   */
  useEffect(() => {
    if (highlight === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.popover')) return;
      setHighlight(null);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [highlight]);

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
    feel,
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
          amp={amp}
          onTuningIdChange={(next) => update('tuningId', next)}
          onCapoChange={(next) => update('capo', next)}
          onFretCountChange={(next) => update('fretCount', next)}
          onSoundChange={(next) => update('sound', next)}
          onAmpChange={(next) => update('amp', next)}
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
            <span className="key-select-text" aria-hidden="true">
              <NoteText name={root} />
            </span>
            <select aria-label="Grundton" value={root} onChange={(e) => update('root', e.target.value)}>
              {ROOT_CHOICES.map((choice) => (
                // The value stays ASCII — it is the state, and it is what lands
                // in the URL. Only what the reader sees gets the real accidental.
                <option key={choice} value={choice}>
                  {withAccidentals(choice)}
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
      </section>

      {/*
       * These all change only what the neck shows, so they sit on the neck.
       *
       * No visible labels: every value says what it is ("Ganzer Hals",
       * "Notennamen", "CAGED aus"), and three uppercase captions weighed more than
       * the controls they named. The aria-labels carry the names for anyone who
       * cannot see the values — which is also how the phone layout already worked.
       */}
      <div className="neck-bar">
        {/* The zoom belongs TO the position, not beside it, so the two sit in one
            group and the button is visibly the smaller of the pair. */}
        <div className="control-pair">
          <label className="field field--inline">
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
            /*
             * The button names the NEXT click, not the current state — which is
             * why it carries no aria-pressed: "Nur die Lage zeigen, pressed"
             * says two things at once. Where you are is visible on the neck.
             */
            <button
              type="button"
              className="icon-toggle"
              aria-label={zoomAction}
              title={zoomAction}
              onClick={() => update('boxZoom', !state.boxZoom)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                {state.boxZoom ? (
                  /* Arrows pushing outward: widen the view past the box. */
                  <path d="M6.5 3.5 3 8l3.5 4.5M9.5 3.5 13 8l-3.5 4.5" />
                ) : (
                  /* And inward: pull it back to the box. */
                  <path d="M3 3.5 6.5 8 3 12.5M13 3.5 9.5 8 13 12.5" />
                )}
              </svg>
            </button>
          ) : null}
        </div>

        {/* Hidden where the forms would not hold — a wrong grip beats no grip
            nowhere, and that rule applies to a teaching overlay too. */}
        {cagedForms.length > 0 ? (
          <label className="field field--inline">
            <select
              aria-label="CAGED-Form"
              value={state.cagedForm ?? ''}
              onChange={(e) =>
                update('cagedForm', e.target.value === '' ? null : (e.target.value as CagedForm))
              }
            >
              {/*
               * The options carry the word, since no caption does any more — but
               * only the form's letter after it. A select is as wide as its
               * longest option, and "CAGED E-Form (5. Bund)" pushed the row onto
               * a third line on a phone. In CAGED the letter IS the name.
               */}
              <option value="">CAGED aus</option>
              {cagedForms.map((placement) => (
                <option key={placement.form} value={placement.form}>
                  CAGED {placement.form} ({placement.startFret}. Bund)
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {/* Two options are not worth a dropdown: both fit side by side, and the
            choice is then one click rather than two. */}
        <div className="segmented" role="group" aria-label="Beschriftung">
          <button
            type="button"
            aria-pressed={labelMode === 'note'}
            onClick={() => update('labelMode', 'note')}
          >
            Notennamen
          </button>
          <button
            type="button"
            aria-pressed={labelMode === 'degree'}
            onClick={() => update('labelMode', 'degree')}
          >
            Stufen
          </button>
        </div>
      </div>

      <FretboardView
        scale={scale}
        fretboard={fretboard}
        labelMode={labelMode}
        position={box}
        zoom={state.boxZoom}
        sounding={soundingKeys}
        caged={caged}
        highlight={picked?.pitchClasses ?? null}
        highlightLabel={picked?.label ?? null}
        onHoldNote={(midi) => player().holdNote(midi)}
      />

      {/*
       * The neck's legend, and below it rather than above.
       *
       * These chips show the same notes in the same roles as the dots on the
       * board, and clicking one picks that tone out up there — so they explain
       * the picture and they act on it. A legend belongs beside the thing it
       * explains; up in the key line they were separated from it by the whole
       * neck bar, and they put a third row of controls between the headline and
       * the instrument.
       */}
      <section className="neck-legend" aria-label="Töne der Tonart">
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
                <span className="note-name">
                  <NoteText name={note.name()} />
                </span>
                <span className="note-degree">
                  <NoteText name={scale.degreeLabelOf(note.pitchClass) ?? ''} />
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/*
         * Only for a highlight that STARTED here. The chord panel further down
         * carries its own way out, and showing both at once meant two links for
         * one state — 765 px apart and worded differently, so they did not even
         * read as the same action. Each now sits where the click happened.
         */}
        {highlight?.kind === 'degree' && picked ? (
          <p className="picked-actions">
            <button type="button" className="link-button" onClick={() => setHighlight(null)}>
              Hervorhebung aufheben
            </button>
          </p>
        ) : null}
      </section>

      {chords.length > 0 ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>
                Leitereigene Akkorde
                {isBorrowedHarmony ? (
                  <span className="panel-source">aus {withAccidentals(chordScale.name())}</span>
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
                <option value={5}>Nonakkorde</option>
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
                    <span className="chord-symbol">
                      <NoteText name={chord.name()} />
                    </span>
                    <span className="chord-notes">
                      {chord.notes.map((note) => note.name()).map(withAccidentals).join(' ')}
                    </span>
                  </button>

                  {/*
                   * These seven chords used to be drawn a second time inside the
                   * builder just to add them. One set, two actions instead.
                   *
                   * Always here, not only once a self-built progression is open:
                   * hiding it put a discovery gate — an option at the bottom of a
                   * dropdown — in front of the very feature it serves. From a
                   * preset the click adopts what is on screen and appends to it,
                   * seeded exactly as ProgressionPanel seeds "Eigene Folge", so
                   * the two paths agree by construction.
                   */}
                  <button
                    type="button"
                    className="chord-add tap-target"
                    aria-label={`${chord.name()} an die Folge anhängen`}
                    title="An die Folge anhängen"
                    onClick={() =>
                      update(
                        'progressionId',
                        customProgId([
                          ...(customChordSteps ??
                            steps.map((step) => ({ symbol: step.chord.name(), bars: 1 }))),
                          { symbol: chord.name(), bars: 1 },
                        ]),
                      )
                    }
                  >
                    +
                  </button>
                </li>
              ))}
            </ol>

            {/* The way back belongs where the click happened — and only there.
                Same wording as the one under the neck, because it is the same
                action; only one of the two is ever on screen. */}
            {highlight?.kind === 'chord' ? (
              <p className="chord-row-actions">
                <button type="button" className="link-button" onClick={() => setHighlight(null)}>
                  Hervorhebung aufheben
                </button>
              </p>
            ) : null}
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
            feel={feel}
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
            onFeelChange={(next) => update('feel', next)}
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

      {/*
       * The one setting that is not about the music.
       *
       * It used to sit in the setup drawer between the tuning and the fret count,
       * which is the very distinction this app draws everywhere else: every field
       * in AppState describes the instrument or the music, and the theme is the
       * only preference that describes the READER — which is exactly why it lives
       * in localStorage and not in the shareable URL. Filing it with the tuning
       * contradicted that, and forced the drawer to be called "Instrument &
       * Darstellung" to cover it.
       *
       * Down here rather than in the header: it is set once per device and never
       * again, and the top of this page belongs to the neck. The foot of a page is
       * also where people look for it.
       */}
      <footer className="app-footer">
        <label className="field field--inline">
          <span>Darstellung</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)}>
            <option value="system">Automatisch</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </select>
        </label>
      </footer>
    </main>
  );
}
