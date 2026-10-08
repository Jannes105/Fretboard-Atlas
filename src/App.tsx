import { useEffect, useMemo, useRef, useState } from 'react';
import { type AudioPlayer, createAudioPlayer, LOOSE_ARPEGGIO_GAP, prefetchSamples } from './audio';
import { type ChordTones, FretboardView } from './components/FretboardView';
import { KeyPicker, type KeyPickerRequest, type KeyPickerTab } from './components/KeyPicker';
import { NeckViewPanel } from './components/NeckViewPanel';
import { positionKey } from './components/neckGeometry';
import { NoteText } from './components/NoteText';
import { ProgressionPanel } from './components/ProgressionPanel';
import { SetupPanel } from './components/SetupPanel';
import { SoundPanel } from './components/SoundPanel';
import { TransportDock } from './components/TransportDock';
import { useAppState } from './hooks/useAppState';
import { type ThemeChoice, useTheme } from './hooks/useTheme';
import { useTransport } from './hooks/useTransport';
import { type NeckOrientation, useViewPrefs } from './hooks/useViewPrefs';
import {
  buildProgression,
  cagedPlacements,
  characteristicTone,
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
  transposeSymbol,
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
 * The neck with no key on it — where the app opens. Named once because it is both
 * the heading and the option that leads back to it.
 */
const ALL_NOTES_LABEL = 'Alle Töne';

/** The interval of a major scale on each letter step — the yardstick for "b3", "#5". */
const MAJOR_REFERENCE = [0, 2, 4, 5, 7, 9, 11];

/**
 * What each tone of a chord is, counted from the chord's own root: "1", "b3", "5",
 * "b7", "9". The neck's degree labels count from the KEY, which tells you where a
 * chord sits in the key — but to learn the chord itself you want its own numbers.
 */
function chordIntervals(chord: Chord): Map<number, string> {
  const intervals = new Map<number, string>();
  const isExtended = chord.notes.length >= 5;
  for (const note of chord.notes) {
    const semitones = (note.pitchClass - chord.root.pitchClass + 12) % 12;
    const step = (note.letter - chord.root.letter + 7) % 7;
    let alter = semitones - MAJOR_REFERENCE[step];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    const accidental = alter === 0 ? '' : alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter);
    // A second in a five-note stack is a ninth.
    const number = step === 1 && isExtended ? 9 : step + 1;
    intervals.set(note.pitchClass, `${accidental}${number}`);
  }
  return intervals;
}

/** Keys worth one tap from the opening screen: where most people start. */
const QUICK_STARTS: readonly { root: string; scaleTypeId: string; label: string }[] = [
  { root: 'A', scaleTypeId: 'minor-pentatonic', label: 'A-Moll-Pentatonik' },
  { root: 'E', scaleTypeId: 'minor-pentatonic', label: 'E-Moll-Pentatonik' },
  { root: 'G', scaleTypeId: 'major', label: 'G-Dur' },
  { root: 'C', scaleTypeId: 'major', label: 'C-Dur' },
  { root: 'A', scaleTypeId: 'blues', label: 'A-Blues' },
];

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
  // Also the reader's, for the same reason: handedness and screen shape.
  const { prefs: viewPrefs, vertical, setLefty, setOrientation } = useViewPrefs();

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
    pickup,
    tone,
    reverb,
    delay,
    beatsPerBar,
    rhythm,
    strum,
    feel,
    sustain,
    click,
    grips,
  } = state;

  /**
   * The key on the neck — or null, which is the app's opening state: every note
   * named, nothing picked out. Everything that needs a root hangs off this being
   * non-null, and there is a lot of it: degrees, boxes, CAGED, the diatonic chords
   * and with them the whole progression half of the page.
   */
  const scale = useMemo(() => {
    if (scaleTypeId === null) return null;
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
  const chordScale = useMemo(() => scale?.chordSource() ?? null, [scale]);

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

  // No key, no boxes: a position is a window onto a scale, and there is none.
  const boxes = useMemo(
    () => (scale ? fretboard.scalePositions(scale) : []),
    [fretboard, scale],
  );

  // A box number from the URL — or left over from another scale — may not exist here.
  const box = boxes.find((b) => b.number === state.boxNumber) ?? null;

  // The notes currently on screen, with their real pitches (tuning + capo baked
  // in). Playback derives from these, so what you hear matches what you see —
  // a box up the neck sounds higher, a capo raises everything.
  const visiblePositions = useMemo(() => {
    if (scale === null) return [];
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
      const chordTones: ChordTones = {
        root: chord.root.pitchClass,
        names: new Map(chord.notes.map((note) => [note.pitchClass, note.name()])),
        intervals: chordIntervals(chord),
      };
      return { pitchClasses: chord.pitchClasses, label: chord.name(), chordTones };
    }

    const note = scale?.notes[highlight.index];
    if (!note) return null;
    return {
      pitchClasses: [note.pitchClass],
      label: `Stufe ${scale.degreeLabelOf(note.pitchClass)}`,
      chordTones: null,
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
      // Without a key there is nothing to number against, so a self-built sequence
      // is only reachable once one is chosen.
      const key = chordScale ?? scale;
      return { steps: key ? customSteps(key, chords) : [], chordBars: key ? bars : [] };
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
  // not one by one — and by default with a pull towards the nut, so G–D–Em–C
  // comes out as the four open chords everyone learns first, not as four barres
  // at the 7th fret. "Kürzeste Wege" switches that pull off.
  useEffect(() => {
    setChosenVoicings(voicingPath(stepVoicings, { preferOpen: grips === 'open' }));
  }, [stepVoicings, grips]);

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

  // The rest of the signal chain, one effect per concern for the same reason: each
  // of these is legal and silent when the thing it points at is not in use, and
  // the choice is still there when it comes back.
  useEffect(() => {
    player().setPickup(pickup);
  }, [pickup]);

  useEffect(() => {
    player().setTone(tone);
  }, [tone]);

  useEffect(() => {
    player().setReverb(reverb);
  }, [reverb]);

  useEffect(() => {
    player().setDelay(delay);
  }, [delay]);

  // The delay divides the tempo, so it has to be told about it from here rather
  // than from useTransport: a single chord clicked on the neck never goes through
  // the transport, and it should still echo in time.
  useEffect(() => {
    player().setTempo(bpm);
  }, [bpm]);


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
    () => (scale ? scaleMidiSequence(scale, { baseMidi: lowestMidi, descend: true }) : []),
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
   * pentatonic would make the VI a two-note fragment. The neck shows the missing
   * tones too, hollow — on the neck and playable, but visibly not in the scale.
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
    const note = scale?.notes[index];
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

  // ---- Ways in, and ways to land ----

  /** Opening the key picker from elsewhere — the start cards. */
  const [keyPickerRequest, setKeyPickerRequest] = useState<KeyPickerRequest | null>(null);
  const openKeyPicker = (tab: KeyPickerTab) =>
    setKeyPickerRequest((previous) => ({ tab, serial: (previous?.serial ?? 0) + 1 }));

  /** Bumped when a progression is adopted, so the panel can show where it went. */
  const [revealSerial, setRevealSerial] = useState(0);
  const transportRef = useRef<HTMLDivElement>(null);

  /**
   * Move the key by a semitone, and a self-built progression with it. A preset
   * needs nothing: it is built from degrees, so it follows the root on its own.
   */
  const transpose = (semitones: 1 | -1) => {
    const index = ROOT_CHOICES.indexOf(root);
    const nextRoot = ROOT_CHOICES[(index + semitones + ROOT_CHOICES.length) % ROOT_CHOICES.length];
    patch((previous) => ({
      ...previous,
      root: nextRoot,
      progressionId: customChordSteps
        ? customProgId(
            customChordSteps.map((step) => ({
              symbol: transposeSymbol(step.symbol, Note.parse(previous.root), Note.parse(nextRoot)),
              bars: step.bars,
            })),
          )
        : previous.progressionId,
    }));
  };

  /** What each preset spells out in this key, for the dropdown. */
  const presetChords = useMemo(() => {
    const names = new Map<string, string>();
    if (chordScale === null) return names;
    for (const progression of progressions) {
      const built = buildProgression(chordScale, progression, chordSize);
      // Long forms (the twelve-bar blues) are named by their distinct chords.
      const distinct = [...new Set(built.map((step) => step.chord.name()))];
      const list = (built.length > 6 ? distinct : built.map((step) => step.chord.name()))
        .map(withAccidentals)
        .join(' – ');
      names.set(progression.id, built.length > 6 ? `${progression.name}: ${list}` : list);
    }
    return names;
  }, [chordScale, progressions, chordSize]);

  /** The tone this mode is recognised by, if it has one. */
  const characteristic = useMemo(() => {
    if (scale === null) return null;
    const tone = characteristicTone(scale.type);
    if (tone === null) return null;
    const note = scale.notes[tone.index];
    return note ? { index: tone.index, note, why: tone.why } : null;
  }, [scale]);

  const isMinorTonic = tonicChord?.quality?.id.startsWith('minor') ?? false;

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Fretboard Atlas</h1>
          <p className="subtitle">Tonarten und Skalen auf dem Hals sichtbar machen.</p>
        </div>

        <div className="setup-group">
          <SetupPanel
            tuning={tuning}
            tuningId={tuningId}
            isCustomTuning={isCustomTuning}
            capo={capo}
            fretCount={fretCount}
            onTuningIdChange={(next) => update('tuningId', next)}
            onCapoChange={(next) => update('capo', next)}
            onFretCountChange={(next) => update('fretCount', next)}
          />

          <SoundPanel
            sound={sound}
            amp={amp}
            pickup={pickup}
            tone={tone}
            reverb={reverb}
            delay={delay}
            onSoundChange={(next) => update('sound', next)}
            onApplyPreset={(settings) => patch((previous) => ({ ...previous, ...settings }))}
            onAmpChange={(next) => update('amp', next)}
            onPickupChange={(next) => update('pickup', next)}
            onToneChange={(next) => update('tone', next)}
            onReverbChange={(next) => update('reverb', next)}
            onDelayChange={(next) => update('delay', next)}
          />
        </div>
      </header>

      <section className="scale-strip">
        <div className="scale-title">
          {/* The picker's button names the key; the heading carries it for screen
              readers and the document outline. */}
          <h2 className="sr-only">{scale ? scale.name() : ALL_NOTES_LABEL}</h2>

          <KeyPicker
            scale={scale}
            root={root}
            onRootChange={(next) => update('root', next)}
            onScaleTypeChange={(next) => update('scaleTypeId', next)}
            onPickKey={(pickedRoot, pickedScaleTypeId) =>
              patch((previous) => ({
                ...previous,
                root: pickedRoot,
                scaleTypeId: pickedScaleTypeId,
              }))
            }
            onAdopt={(symbols, pickedRoot, pickedScaleTypeId) => {
              patch((previous) => ({
                ...previous,
                root: pickedRoot,
                scaleTypeId: pickedScaleTypeId,
                // Adopted chords start at one bar each.
                progressionId: customProgId(symbols.map((symbol) => ({ symbol, bars: 1 }))),
              }));
              setRevealSerial((serial) => serial + 1);
            }}
            request={keyPickerRequest}
          />

          {scale ? (
            <button
              type="button"
              className="play-button"
              onClick={playScale}
              aria-label={`${scale.name()} abspielen`}
              title="Skala abspielen"
            >
              ▶
            </button>
          ) : null}
        </div>
      </section>

      {/*
       * Above the neck: where on it you are, and how it is drawn. The positions
       * stay out in the open — they are how you move around the neck, and one tap
       * each. Everything that only changes how the same notes are drawn sits
       * behind „Ansicht".
       *
       * The whole row goes with the key: there are no positions without a scale
       * to window, and nothing for „Stufen" to count from.
       */}
      {scale ? (
        <div className="neck-bar">
          <span className="neck-bar-label" aria-hidden="true">
            Lage
          </span>
          <div className="segmented box-picker" role="group" aria-label="Lage">
            <button
              type="button"
              aria-pressed={box === null}
              onClick={() => update('boxNumber', 0)}
            >
              Ganzer Hals
            </button>
            {boxes.map((option) => (
              <button
                key={option.number}
                type="button"
                aria-pressed={box?.number === option.number}
                aria-label={`Lage ${option.number}, ab ${option.anchorFret}. Bund`}
                title={`Lage ${option.number} (${option.anchorFret}. Bund)`}
                onClick={() => update('boxNumber', option.number)}
              >
                {option.number}
              </button>
            ))}
          </div>

          <NeckViewPanel
            labelMode={labelMode}
            onLabelModeChange={(next) => update('labelMode', next)}
            hasBox={box !== null}
            boxZoom={state.boxZoom}
            onBoxZoomChange={(next) => update('boxZoom', next)}
            cagedForms={cagedForms}
            cagedForm={state.cagedForm}
            onCagedFormChange={(next) => update('cagedForm', next)}
            minorTonic={isMinorTonic}
          />
        </div>
      ) : null}

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
        chordTones={picked?.chordTones ?? null}
        characteristic={characteristic?.note.pitchClass ?? null}
        vertical={vertical}
        lefty={viewPrefs.lefty}
        onHoldNote={(midi) => player().holdNote(midi)}
      />

      {/*
       * The neck's legend, below it: the same notes in the same roles as the dots,
       * and clicking one picks that tone out up there.
       */}
      {scale ? (
        <section className="neck-legend" aria-label="Töne der Tonart">
          <ul className="degree-chips">
            {scale.notes.map((note, i) => (
              <li key={note.name()}>
                <button
                  type="button"
                  className={[
                    'degree-chip',
                    i === 0 ? 'is-root' : '',
                    characteristic?.index === i ? 'is-characteristic' : '',
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
           * The one tone that makes this mode sound like itself. Six of its seven
           * notes are the neighbour's too; without this line the neck shows two
           * pictures nobody can tell apart.
           */}
          {characteristic ? (
            <p className="characteristic-hint">
              <span className="characteristic-mark" aria-hidden="true" />
              Charakterton{' '}
              <strong>
                <NoteText name={characteristic.note.name()} />
              </strong>{' '}
              ({withAccidentals(scale.degreeLabelOf(characteristic.note.pitchClass) ?? '')}):{' '}
              {characteristic.why}.{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => pickDegree(characteristic.index)}
              >
                Im Hals zeigen
              </button>
            </p>
          ) : null}

          {/* Only for a highlight that STARTED here; the chord panel has its own. */}
          {highlight?.kind === 'degree' && picked ? (
            <p className="picked-actions">
              <button type="button" className="link-button" onClick={() => setHighlight(null)}>
                Hervorhebung aufheben
              </button>
            </p>
          ) : null}
        </section>
      ) : null}

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
                ? `${scale?.type.name} hat keine eigenen Stufenakkorde — diese kommen aus ${chordScale.name()}, der Tonart dahinter. Anklicken: du hörst den Akkord und siehst ihn im Hals; Töne außerhalb der Skala sind hohl gezeichnet.`
                : 'Anklicken: du hörst den Akkord und siehst seine Töne im Hals. „+" hängt ihn an die Akkordfolge an.'}
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

                  {/* One set of cards, two actions: hear it, or append it. */}
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
            presetChords={presetChords}
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
            onApplyStyle={(settings) => patch((previous) => ({ ...previous, ...settings }))}
            grips={grips}
            onGripsChange={(next) => update('grips', next)}
            onTranspose={transpose}
            transportRef={transportRef}
            revealSerial={revealSerial}
          />

          <TransportDock
            anchor={transportRef}
            steps={steps}
            isPlaying={isPlaying}
            playingStep={playingStep}
            bpm={bpm}
            onToggle={transport.toggle}
          />
        </>
      ) : scale === null ? (
        /*
         * The opening state: three ways in, named by what someone came to do, and
         * a handful of keys one tap away. It used to be a sentence telling you to
         * „choose a key above" — next to no control by that name.
         */
        <section className="empty start" aria-labelledby="start-heading">
          <h2 id="start-heading">Womit möchtest du anfangen?</h2>
          <div className="start-cards">
            <button type="button" className="start-card" onClick={() => openKeyPicker('choose')}>
              <strong>Eine Tonart erkunden</strong>
              <span>Grundton und Skala wählen — Lagen, Akkorde und Akkordfolgen kommen dazu.</span>
            </button>
            <button type="button" className="start-card" onClick={() => openKeyPicker('detect')}>
              <strong>Akkorde zu einem Song</strong>
              <span>Akkorde eintippen, die Tonart erkennen lassen und die Folge mitspielen.</span>
            </button>
            <div className="start-card start-card--note">
              <strong>Den Hals kennenlernen</strong>
              <span>Oben steht jeder Ton. Tippe einen an, um ihn zu hören.</span>
            </div>
          </div>
          <p className="quick-starts">
            <span>Schnellstart:</span>
            {QUICK_STARTS.map((entry) => (
              <button
                key={entry.label}
                type="button"
                className="quick-start"
                onClick={() =>
                  patch((previous) => ({
                    ...previous,
                    root: entry.root,
                    scaleTypeId: entry.scaleTypeId,
                  }))
                }
              >
                {entry.label}
              </button>
            ))}
          </p>
        </section>
      ) : (
        /*
         * Unreachable today: every scale on offer either has seven degrees of its
         * own or names the key it borrows from.
         */
        <p className="empty">
          {scale.type.name} hat {scale.notes.length} Stufen und keine Tonart, aus der sich
          Stufenakkorde borgen ließen. Wähl eine Dur-, Moll- oder Kirchentonart.
        </p>
      )}

      {/*
       * The settings that are about the READER, not the music: colours, which hand
       * plays, how the neck lies on this screen. Kept on the device, never in the
       * link — see useTheme and useViewPrefs.
       */}
      <footer className="app-footer">
        <label className="field field--inline">
          <span>Hals</span>
          <select
            value={viewPrefs.orientation}
            onChange={(e) => setOrientation(e.target.value as NeckOrientation)}
          >
            <option value="auto">Automatisch</option>
            <option value="horizontal">Waagerecht</option>
            <option value="vertical">Senkrecht</option>
          </select>
        </label>
        <label className="toggle footer-toggle">
          <input
            type="checkbox"
            checked={viewPrefs.lefty}
            onChange={(e) => setLefty(e.target.checked)}
          />
          <span>Linkshänder</span>
        </label>
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
