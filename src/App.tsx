import { useRef, useState } from 'react';
import { LOOSE_ARPEGGIO_GAP } from './audio';
import { AppFooter } from './components/AppFooter';
import { ChordRow } from './components/ChordRow';
import { FretboardView } from './components/FretboardView';
import { KeyPicker, type KeyPickerRequest, type KeyPickerTab } from './components/KeyPicker';
import { NeckLegend } from './components/NeckLegend';
import { NeckViewPanel } from './components/NeckViewPanel';
import { ProgressionPanel } from './components/ProgressionPanel';
import { SetupPanel } from './components/SetupPanel';
import { SoundPanel } from './components/SoundPanel';
import { StartScreen } from './components/StartScreen';
import { TransportDock } from './components/TransportDock';
import { useAppState } from './hooks/useAppState';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useHighlight } from './hooks/useHighlight';
import { useNeckModel } from './hooks/useNeckModel';
import { useProgression } from './hooks/useProgression';
import { useScaleRun } from './hooks/useScaleRun';
import { useTheme } from './hooks/useTheme';
import { useTransport } from './hooks/useTransport';
import { useViewPrefs } from './hooks/useViewPrefs';
import {
  chordMidiTones,
  defaultPattern,
  Note,
  positionsToMidi,
  ROOT_CHOICES,
  serializePattern,
  STANDARD_STRUM_GAP,
  transposeSymbol,
  type Voicing,
  voicingMidi,
} from './theory';
import { customProgId } from './urlState';
import './App.css';

/** The neck with no key on it — where the app opens. */
const ALL_NOTES_LABEL = 'Alle Töne';

/**
 * The page, top to bottom: key, neck, what the neck shows, the key's chords, the
 * progression. Everything derived lives in the hooks; this file only says what
 * goes where and what a click does.
 */
export default function App() {
  const { state, update, patch } = useAppState();
  // Deliberately not part of `state`: these belong to the reader, not to the link.
  const { theme, setTheme } = useTheme();
  const { prefs: viewPrefs, vertical, setLefty, setOrientation, setSpelling } = useViewPrefs();

  const { root, labelMode, bpm, loop, beatsPerBar, rhythm, strum, feel, sustain, click } = state;

  const neck = useNeckModel(state);
  const { scale, fretboard, chordTuning, chordScale, chords, box, boxes } = neck;

  const player = useAudioPlayer(state);
  const { highlight, picked, pickNote, clear, isChordActive, isDegreeActive, setHighlight } =
    useHighlight(chords, scale, viewPrefs.spelling);
  const { soundingKeys, playScale } = useScaleRun(scale, neck.visiblePositions, player);

  const progression = useProgression({
    progressionId: state.progressionId,
    scale,
    chordScale,
    chordSize: state.chordSize,
    chordTuning,
    grips: state.grips,
  });
  const { steps, stepVoicings, voicingIndex, customChordSteps } = progression;

  // At most one voicing picker is open.
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  // A one-off chord has no bar to spread across: an arpeggio walks the strings at
  // a leisurely pace, and "stopped" means a short, cut note.
  const strumGapNow = strum === 'arpeggio' ? LOOSE_ARPEGGIO_GAP : STANDARD_STRUM_GAP;
  const chordSeconds = sustain === 'stopped' ? 0.3 : 1.9;
  const strumOnce = (midi: number[]) =>
    player().play(midi, { mode: 'strum', stack: true, gap: strumGapNow, duration: chordSeconds });

  /**
   * The app's one rule: click a thing and you hear it. A chord sounds at the
   * pitches it has on screen AND shows on the neck; clicking it again sounds it
   * again rather than switching it off — "aufheben" is what clears.
   */
  const pickChord = (index: number) => {
    setHighlight({ kind: 'chord', index });
    const chord = chords[index];
    if (chord) strumOnce(positionsToMidi(neck.chordPositions, chord.pitchClasses));
  };

  const pickDegree = (index: number) => {
    setHighlight({ kind: 'degree', index });
    const note = scale?.notes[index];
    if (note) strumOnce(positionsToMidi(neck.visiblePositions, [note.pitchClass]));
  };

  /** Sound a grip exactly as drawn — the real strings under the fingers. */
  const hearVoicing = (voicing: Voicing) => strumOnce(voicingMidi(voicing, chordTuning));

  // ---- Progression transport ----

  // Play the grips actually on screen; an abstract voicing only where no shape exists.
  const chordNotes = steps.map((step, i) => {
    const voicing = stepVoicings[i]?.[voicingIndex(i)];
    return voicing ? voicingMidi(voicing, chordTuning) : chordMidiTones(step.chord);
  });

  const transport = useTransport({
    chordNotes,
    chordBars: progression.chordBars,
    bpm,
    beatsPerBar,
    rhythm,
    style: strum,
    feel,
    length: sustain,
    click,
    loop,
    player,
    material: [steps, chordTuning, progression.chosenVoicings],
  });

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

  /** What a note touched on the neck (or a chip) picked out, for the legend. */
  const pickedNote =
    highlight && highlight.kind !== 'chord' && picked
      ? {
          label: picked.label,
          places: fretboard
            .allPositions()
            .filter((p) => p.pitchClass === picked.pitchClasses[0]).length,
          hasUnison: picked.unisonMidi !== null,
        }
      : null;

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Fretboard Atlas</h1>
          <p className="subtitle">Tonarten und Skalen auf dem Hals sichtbar machen.</p>
        </div>

        <div className="setup-group">
          <SetupPanel
            tuning={neck.tuning}
            tuningId={state.tuningId}
            isCustomTuning={neck.isCustomTuning}
            capo={state.capo}
            fretCount={state.fretCount}
            onTuningIdChange={(next) => update('tuningId', next)}
            onCapoChange={(next) => update('capo', next)}
            onFretCountChange={(next) => update('fretCount', next)}
          />

          <SoundPanel
            sound={state.sound}
            amp={state.amp}
            pickup={state.pickup}
            tone={state.tone}
            reverb={state.reverb}
            delay={state.delay}
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
              patch((previous) => ({ ...previous, root: pickedRoot, scaleTypeId: pickedScaleTypeId }))
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
          ) : (
            /*
             * Only on the keyless map: under a key, the key spells every note, and
             * a choice here would be overruled on every dot. Right beside the neck
             * it names, rather than down in the footer — it changes what you read.
             */
            <div className="segmented spelling" role="group" aria-label="Schreibweise">
              <button
                type="button"
                aria-pressed={viewPrefs.spelling === 'sharp'}
                aria-label="Mit Kreuz (♯)"
                onClick={() => setSpelling('sharp')}
              >
                ♯
              </button>
              <button
                type="button"
                aria-pressed={viewPrefs.spelling === 'flat'}
                aria-label="Mit B (♭)"
                onClick={() => setSpelling('flat')}
              >
                ♭
              </button>
            </div>
          )}
        </div>
      </section>

      {/*
       * Above the neck: where on it you are, and how it is drawn. The positions stay
       * out in the open — one tap each; everything that only changes how the same
       * notes are drawn sits behind „Ansicht". The whole row needs a key.
       */}
      {scale ? (
        <div className="neck-bar">
          <span className="neck-bar-label" aria-hidden="true">
            Lage
          </span>
          <div className="segmented box-picker" role="group" aria-label="Lage">
            <button type="button" aria-pressed={box === null} onClick={() => update('boxNumber', 0)}>
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
            cagedForms={neck.cagedForms}
            cagedForm={state.cagedForm}
            onCagedFormChange={(next) => update('cagedForm', next)}
            minorTonic={neck.isMinorTonic}
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
        caged={neck.caged}
        highlight={picked?.pitchClasses ?? null}
        highlightLabel={picked?.label ?? null}
        chordTones={picked?.chordTones ?? null}
        unisonMidi={picked?.unisonMidi ?? null}
        characteristic={neck.characteristic?.note.pitchClass ?? null}
        spelling={viewPrefs.spelling}
        vertical={vertical}
        lefty={viewPrefs.lefty}
        onHoldNote={(midi) => player().holdNote(midi)}
        onPickNote={pickNote}
      />

      <NeckLegend
        scale={scale}
        characteristic={neck.characteristic}
        isDegreeActive={isDegreeActive}
        onPickDegree={pickDegree}
        pickedNote={pickedNote}
        onClear={clear}
      />

      {chords.length > 0 ? (
        <>
          <ChordRow
            chords={chords}
            scale={scale}
            borrowedFrom={neck.isBorrowedHarmony ? chordScale : null}
            chordSize={state.chordSize}
            onChordSizeChange={(next) => update('chordSize', next)}
            isChordActive={isChordActive}
            onPickChord={pickChord}
            onAppend={(chord) =>
              update(
                'progressionId',
                customProgId([
                  ...(customChordSteps ??
                    steps.map((step) => ({ symbol: step.chord.name(), bars: 1 }))),
                  { symbol: chord.name(), bars: 1 },
                ]),
              )
            }
            showClear={highlight?.kind === 'chord'}
            onClear={clear}
          />

          <ProgressionPanel
            progressions={progression.progressions}
            presetChords={progression.presetChords}
            preset={progression.preset}
            isCustom={progression.isCustom}
            customChordSteps={customChordSteps}
            onProgressionIdChange={(next) => update('progressionId', next)}
            steps={steps}
            stepVoicings={stepVoicings}
            voicingIndex={voicingIndex}
            onSelectVoicing={progression.selectVoicing}
            openPicker={openPicker}
            onTogglePicker={(step) => setOpenPicker((open) => (open === step ? null : step))}
            onHearVoicing={hearVoicing}
            isPlaying={transport.isPlaying}
            playingStep={transport.playingStep}
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
            grips={state.grips}
            onGripsChange={(next) => update('grips', next)}
            onTranspose={transpose}
            transportRef={transportRef}
            revealSerial={revealSerial}
          />

          <TransportDock
            anchor={transportRef}
            steps={steps}
            isPlaying={transport.isPlaying}
            playingStep={transport.playingStep}
            bpm={bpm}
            onToggle={transport.toggle}
          />
        </>
      ) : scale === null ? (
        <StartScreen
          onOpenKeyPicker={openKeyPicker}
          onQuickStart={(quickRoot, scaleTypeId) =>
            patch((previous) => ({ ...previous, root: quickRoot, scaleTypeId }))
          }
        />
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

      <AppFooter
        theme={theme}
        onThemeChange={setTheme}
        prefs={viewPrefs}
        onOrientationChange={setOrientation}
        onLeftyChange={setLefty}
      />
    </main>
  );
}
