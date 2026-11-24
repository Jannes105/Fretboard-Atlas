import { useState } from 'react';
import { LOOSE_ARPEGGIO_GAP } from './audio';
import { AppFooter } from './components/AppFooter';
import { AppShell } from './components/AppShell';
import { BottomTabs, type SheetId } from './components/BottomTabs';
import { ChordRow } from './components/ChordRow';
import { FretboardView } from './components/FretboardView';
import { KeyButton, KeyPicker, type KeyPickerTab } from './components/KeyPicker';
import { NeckLegend } from './components/NeckLegend';
import { NeckViewPanel } from './components/NeckViewPanel';
import { ProgressionPanel } from './components/ProgressionPanel';
import { SetupPanel } from './components/SetupPanel';
import { Sheet } from './components/Sheet';
import { SoundPanel } from './components/SoundPanel';
import { StartScreen } from './components/StartScreen';
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

const SHEET_TITLES: Record<SheetId, string> = {
  key: 'Tonart',
  chords: 'Akkorde',
  progression: 'Akkordfolge',
  view: 'Ansicht',
};

/**
 * The key on top, the neck in the middle, and everything else in four sheets
 * that rise from the bottom bar. Everything derived lives in the hooks; this
 * file only says what goes where and what a click does.
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

  // ---- Sheets ----

  /** Which sheet is up. Page state, not the link: a link carries the music. */
  const [sheet, setSheet] = useState<SheetId | null>(null);
  /** The tab the key sheet opens on — a start card can ask for the lookup. */
  const [keyTab, setKeyTab] = useState<KeyPickerTab>('choose');

  const openKeySheet = (tab: KeyPickerTab) => {
    setKeyTab(tab);
    setSheet('key');
  };

  /**
   * A tab opens its sheet, or shuts it when it is already up. Chords and the
   * progression need a key; without one, they lead to where a key is chosen.
   */
  const toggleSheet = (id: SheetId) => {
    if (sheet === id) {
      setSheet(null);
      return;
    }
    if (id === 'key' || ((id === 'chords' || id === 'progression') && scale === null)) {
      openKeySheet('choose');
      return;
    }
    setSheet(id);
  };

  const closeSheet = () => setSheet(null);

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
          label: picked.noteName ?? picked.label,
          places: fretboard
            .allPositions()
            .filter((p) => p.pitchClass === picked.pitchClasses[0]).length,
          hasUnison: picked.unisonMidi !== null,
        }
      : null;

  const top = (
    <>
      <h1 className="sr-only">Fretboard Atlas</h1>
      <div className="scale-title">
        {/* The button names the key; the heading carries it for screen readers
            and the document outline. */}
        <h2 className="sr-only">{scale ? scale.name() : ALL_NOTES_LABEL}</h2>

        <KeyButton
          scale={scale}
          root={root}
          expanded={sheet === 'key'}
          onClick={() => toggleSheet('key')}
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
           * it names — it changes what you read.
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

      {/* Where on the neck you are: one tap per position. Needs a key. */}
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
        </div>
      ) : null}
    </>
  );

  const sheets = (
    <>
      <Sheet id="sheet-key" title={SHEET_TITLES.key} open={sheet === 'key'} onClose={closeSheet}>
        <KeyPicker
          // A start card asking for the other tab opens it afresh.
          key={keyTab}
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
            // Land on the progression it just made, so the click visibly goes
            // somewhere.
            setSheet('progression');
          }}
          initialTab={keyTab}
          // A plain match is a finished answer: close and show the neck.
          onDone={closeSheet}
        />
      </Sheet>

      <Sheet
        id="sheet-chords"
        title={SHEET_TITLES.chords}
        open={sheet === 'chords'}
        onClose={closeSheet}
      >
        {chords.length > 0 ? (
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
        ) : scale ? (
          /*
           * Unreachable today: every scale on offer either has seven degrees of its
           * own or names the key it borrows from.
           */
          <p className="empty">
            {scale.type.name} hat {scale.notes.length} Stufen und keine Tonart, aus der sich
            Stufenakkorde borgen ließen. Wähl eine Dur-, Moll- oder Kirchentonart.
          </p>
        ) : null}
      </Sheet>

      <Sheet
        id="sheet-progression"
        title={SHEET_TITLES.progression}
        open={sheet === 'progression'}
        onClose={closeSheet}
      >
        {chords.length > 0 ? (
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
          />
        ) : null}
      </Sheet>

      <Sheet id="sheet-view" title={SHEET_TITLES.view} open={sheet === 'view'} onClose={closeSheet}>
        <section className="sheet-section" aria-label="Hals">
          <h3>Hals</h3>
          <NeckViewPanel
            fretCount={state.fretCount}
            onFretCountChange={(next) => update('fretCount', next)}
            hasScale={scale !== null}
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
        </section>

        <section className="sheet-section" aria-label="Instrument">
          <h3>Instrument</h3>
          <SetupPanel
            tuning={neck.tuning}
            tuningId={state.tuningId}
            isCustomTuning={neck.isCustomTuning}
            capo={state.capo}
            fretCount={state.fretCount}
            onTuningIdChange={(next) => update('tuningId', next)}
            onCapoChange={(next) => update('capo', next)}
          />
        </section>

        <section className="sheet-section" aria-label="Klang">
          <h3>Klang</h3>
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
        </section>

        <section className="sheet-section" aria-label="Auf diesem Gerät">
          <h3>Auf diesem Gerät</h3>
          <AppFooter
            theme={theme}
            onThemeChange={setTheme}
            prefs={viewPrefs}
            onOrientationChange={setOrientation}
            onLeftyChange={setLefty}
          />
        </section>
      </Sheet>
    </>
  );

  return (
    <AppShell
      top={top}
      sheets={sheets}
      tabs={<BottomTabs open={sheet} onSelect={toggleSheet} playing={transport.isPlaying} />}
    >
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

      {scale === null ? (
        <StartScreen
          onOpenKeyPicker={openKeySheet}
          onQuickStart={(quickRoot, scaleTypeId) =>
            patch((previous) => ({ ...previous, root: quickRoot, scaleTypeId }))
          }
        />
      ) : null}
    </AppShell>
  );
}
