import { useState } from 'react';
// First: the shared base, so every component's own sheet can build on it.
import './App.css';
import { LOOSE_ARPEGGIO_GAP } from './audio';
import { AppFooter } from './components/AppFooter';
import { AppShell } from './components/AppShell';
import { BottomTabs, type SheetId } from './components/BottomTabs';
import { ChordRow, ChordStrip } from './components/ChordRow';
import { FretboardView } from './components/FretboardView';
import { type Info, InfoBar } from './components/InfoBar';
import { KeyPicker, KeyTitle } from './components/KeyPicker';
import { NeedsKey } from './components/NeedsKey';
import { NeckViewPanel } from './components/NeckViewPanel';
import { ProgressionPanel } from './components/ProgressionPanel';
import { ScaleTones } from './components/ScaleTones';
import { SetupPanel } from './components/SetupPanel';
import { Sheet } from './components/Sheet';
import { SoundPanel } from './components/SoundPanel';
import { useAppState } from './hooks/useAppState';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { chordPicked, useHighlight } from './hooks/useHighlight';
import { useNeckModel } from './hooks/useNeckModel';
import { useProgression } from './hooks/useProgression';
import { useScaleRun } from './hooks/useScaleRun';
import { useSheetHistory } from './hooks/useSheetHistory';
import { useTheme } from './hooks/useTheme';
import { useTransport } from './hooks/useTransport';
import { useViewPrefs } from './hooks/useViewPrefs';
import {
  chordMidiTones,
  defaultPattern,
  Note,
  positionsToMidi,
  serializePattern,
  spellRoot,
  STANDARD_STRUM_GAP,
  transposeSymbol,
  type Voicing,
  voicingMidi,
  voicingsFor,
  withAccidentals,
} from './theory';
import { customProgId, writeState } from './urlState';

/** Where a position sits: „am Sattel" rather than „ab 0. Bund". */
const fretPhrase = (fret: number) => (fret === 0 ? 'am Sattel' : `ab ${fret}. Bund`);

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

  /** Which sheet a pick shrank to a strip, so the neck above shows the pick. */
  const [shrunk, setShrunk] = useState<SheetId | null>(null);

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
    shrinkSheet();
    const chord = chords[index];
    if (chord) strumOnce(positionsToMidi(neck.chordPositions, chord.pitchClasses));
  };

  const pickDegree = (index: number) => {
    setHighlight({ kind: 'degree', index });
    shrinkSheet();
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

  /**
   * What the neck shows. While a progression plays, the chord being played —
   * the bar below names it, so the dots above must agree. Otherwise what is
   * picked; stopping brings that back.
   */
  const playingChord =
    transport.isPlaying && transport.playingStep !== null
      ? (steps[transport.playingStep]?.chord ?? null)
      : null;
  const shown = playingChord ? chordPicked(playingChord) : picked;

  // ---- Sheets ----

  /** Which sheet is up. Page state, not the link: a link carries the music. */
  const [sheet, setSheet] = useState<SheetId | null>(null);

  /**
   * A tab opens its own sheet, or shuts it when it is already up. Without a key,
   * chords and the progression still open theirs — and say what they need.
   */
  const toggleSheet = (id: SheetId) => {
    setShrunk(null);
    setSheet((open) => (open === id ? null : id));
  };

  /**
   * A pick in a sheet shrinks it to a strip: the neck above is what to look at
   * now. Only with the neck upright — lying down, it sits wholly above the
   * sheet already, and shrinking would only hide the grip.
   */
  const shrinkSheet = () => {
    if (vertical) setShrunk(sheet);
  };

  /** A quick key from a sheet waiting for one: set it, and stay in that sheet. */
  const quickKey = (quickRoot: string, scaleTypeId: string) =>
    patch((previous) => ({ ...previous, root: quickRoot, scaleTypeId }));

  const needsKey = (what: string) => (
    <NeedsKey what={what} onQuickKey={quickKey} onChooseKey={() => setSheet('key')} />
  );

  const closeSheet = () => {
    setShrunk(null);
    setSheet(null);
  };

  /**
   * The sheet whose contents are in the frame: the open one, and after closing
   * the last one, so it can drop away with its contents rather than empty.
   */
  const [shownSheet, setShownSheet] = useState<SheetId | null>(sheet);
  if (sheet !== null && sheet !== shownSheet) setShownSheet(sheet);

  // The phone's back button closes a sheet rather than leaving the app.
  useSheetHistory(sheet !== null, closeSheet, () => `${window.location.pathname}${writeState(state)}`);

  /**
   * How a key on this pitch is written: the name with fewer accidentals in its
   * scale, the reader's ♯ or ♭ where both cost the same. A root without a scale
   * is about to become major — see the root grid.
   */
  const spelledRoot = (pitchClass: number, scaleTypeId: string | null) =>
    spellRoot(((pitchClass % 12) + 12) % 12, scaleTypeId ?? 'major', viewPrefs.spelling === 'sharp');

  /**
   * Move the key by a semitone, and a self-built progression with it. A preset
   * needs nothing: it is built from degrees, so it follows the root on its own.
   */
  const transpose = (semitones: 1 | -1) => {
    const nextRoot = spelledRoot(Note.parse(root).pitchClass + semitones, state.scaleTypeId);
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

  /**
   * What the info bar says, if anything. Hidden under a sheet: the sheet already
   * shows what is picked or playing, and the bar would float over it.
   */
  const info = ((): Info | null => {
    if (sheet !== null) return null;
    if (transport.isPlaying && transport.playingStep !== null) {
      const step = steps[transport.playingStep];
      if (step) {
        return {
          kind: 'playing',
          chord: step.chord.name(),
          step: transport.playingStep,
          steps: steps.length,
        };
      }
    }
    if (highlight?.kind === 'chord') {
      const chord = chords[highlight.index];
      if (chord) {
        return {
          kind: 'chord',
          roman: chord.romanNumeral(highlight.index),
          name: chord.name(),
          notes: chord.notes.map((note) => withAccidentals(note.name())).join(' '),
        };
      }
    }
    if (highlight && picked) {
      return {
        kind: 'note',
        label: picked.noteName ?? picked.label,
        places: fretboard.allPositions().filter((p) => p.pitchClass === picked.pitchClasses[0])
          .length,
        hasUnison: picked.unisonMidi !== null,
      };
    }
    return scale === null ? { kind: 'hint' } : null;
  })();

  const top = (
    <>
      <h1 className="sr-only">Fretboard Atlas</h1>
      <div className="scale-title">
        {/* The button names the key; the heading carries it for screen readers
            and the document outline. */}
        <h2 className="sr-only">{scale ? scale.name() : ALL_NOTES_LABEL}</h2>

        <KeyTitle scale={scale} root={root} />

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
            <button
              type="button"
              className="box-whole"
              aria-pressed={box === null}
              aria-label="Ganzer Hals"
              onClick={() => update('boxNumber', 0)}
            >
              Ganz
            </button>
            {boxes.map((option) => (
              <button
                key={option.number}
                type="button"
                aria-pressed={box?.number === option.number}
                aria-label={`Lage ${option.number}, ${fretPhrase(option.anchorFret)}`}
                title={`Lage ${option.number} (${fretPhrase(option.anchorFret)})`}
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

  /** What a shrunk sheet keeps: the row the pick was made in. */
  const peek =
    sheet === 'chords' ? (
      <ChordStrip chords={chords} isChordActive={isChordActive} onPickChord={pickChord} />
    ) : sheet === 'key' && scale ? (
      <ScaleTones
        scale={scale}
        characteristic={neck.characteristic}
        isDegreeActive={isDegreeActive}
        onPickDegree={pickDegree}
        compact
      />
    ) : null;

  const sheets = (
    <Sheet
      id={shownSheet}
      title={shownSheet ? SHEET_TITLES[shownSheet] : ''}
      open={sheet !== null}
      onClose={closeSheet}
      peek={sheet !== null && shrunk === sheet ? peek : null}
      onExpand={() => setShrunk(null)}
    >
      {shownSheet === 'key' ? (
        <>
          <KeyPicker
            tones={
              scale ? (
                <ScaleTones
                  scale={scale}
                  characteristic={neck.characteristic}
                  isDegreeActive={isDegreeActive}
                  onPickDegree={pickDegree}
                />
              ) : null
            }
            scale={scale}
            root={root}
            spelling={viewPrefs.spelling}
            onRootChange={(pitchClass) =>
              patch((previous) => {
                // A root alone shows nothing — it needs a scale to be a key, and
                // major is the scale everyone starts from.
                const scaleTypeId = previous.scaleTypeId ?? 'major';
                return { ...previous, scaleTypeId, root: spelledRoot(pitchClass, scaleTypeId) };
              })
            }
            onScaleTypeChange={(next) =>
              patch((previous) =>
                next === null
                  ? { ...previous, scaleTypeId: null }
                  : // A new scale can want the other name — D♭ major, but C♯ minor.
                    {
                      ...previous,
                      scaleTypeId: next,
                      root: spelledRoot(Note.parse(previous.root).pitchClass, next),
                    },
              )
            }
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
            // A plain match is a finished answer: close and show the neck.
            onDone={closeSheet}
          />
        </>
      ) : null}

      {shownSheet === 'chords' ? (
        <>
          {chords.length > 0 ? (
            <ChordRow
              chords={chords}
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
              voicingsOf={(chord) => voicingsFor(chord, { tuning: chordTuning })}
              onHearVoicing={hearVoicing}
              preferOpen={state.grips === 'open'}
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
          ) : (
            needsKey('die Stufenakkorde')
          )}
        </>
      ) : null}

      {shownSheet === 'progression' ? (
        <>
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
          ) : scale === null ? (
            needsKey('eine Akkordfolge')
          ) : null}
        </>
      ) : null}

      {shownSheet === 'view' ? (
        <>
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

          {/* Set once and left alone: folded, with the current value on the fold. */}
          <section className="sheet-section" aria-label="Instrument">
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
        </>
      ) : null}
    </Sheet>
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
        highlight={shown?.pitchClasses ?? null}
        highlightLabel={shown?.label ?? null}
        chordTones={shown?.chordTones ?? null}
        unisonMidi={shown?.unisonMidi ?? null}
        characteristic={neck.characteristic?.note.pitchClass ?? null}
        spelling={viewPrefs.spelling}
        vertical={vertical}
        lefty={viewPrefs.lefty}
        onHoldNote={(midi) => player().holdNote(midi)}
        onPickNote={pickNote}
      />

      <InfoBar info={info} onClear={clear} onStop={transport.toggle} />
    </AppShell>
  );
}
