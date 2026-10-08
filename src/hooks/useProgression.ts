import { useEffect, useMemo, useState } from 'react';
import {
  buildProgression,
  Chord,
  type ChordSize,
  customSteps,
  defaultVoicingIndex,
  progressionsFor,
  type Scale,
  type Tuning,
  voicingPath,
  voicingsFor,
  withAccidentals,
} from '../theory';
import { customProgSteps, type GripPreference } from '../urlState';

interface ProgressionInputs {
  progressionId: string;
  scale: Scale | null;
  /** The key the harmony comes from — see useNeckModel. */
  chordScale: Scale | null;
  chordSize: ChordSize;
  chordTuning: Tuning;
  grips: GripPreference;
}

/**
 * The progression: which one, its chords, and the grip each is played with.
 *
 * The grips live here rather than inside the chord diagrams because the transport
 * has to play the very shapes on screen.
 */
export function useProgression({
  progressionId,
  scale,
  chordScale,
  chordSize,
  chordTuning,
  grips,
}: ProgressionInputs) {
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

  // Steps and their bar counts are built together, so skipping an unparseable
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
      // Roman numerals are measured against the key the harmony lives in.
      const key = chordScale ?? scale;
      return { steps: key ? customSteps(key, chords) : [], chordBars: key ? bars : [] };
    }
    const chosen = progressions.find((p) => p.id === progressionId) ?? progressions[0] ?? null;
    const built = chosen && chordScale ? buildProgression(chordScale, chosen, chordSize) : [];
    return { steps: built, chordBars: built.map(() => 1) };
  }, [progressionId, progressions, scale, chordScale, chordSize]);

  const stepVoicings = useMemo(
    () => steps.map((step) => voicingsFor(step.chord, { tuning: chordTuning })),
    [steps, chordTuning],
  );

  const [chosenVoicings, setChosenVoicings] = useState<number[]>([]);

  // New chords or tuning mean new grips, so any earlier choice is meaningless. The
  // replacements are chosen as a sequence — and by default with a pull towards
  // the nut, so G–D–Em–C comes out as the four open chords everyone learns first.
  useEffect(() => {
    setChosenVoicings(voicingPath(stepVoicings, { preferOpen: grips === 'open' }));
  }, [stepVoicings, grips]);

  const voicingIndex = (step: number) =>
    chosenVoicings[step] ?? defaultVoicingIndex(stepVoicings[step] ?? []);

  const selectVoicing = (step: number, voicing: number) =>
    setChosenVoicings((current) => {
      const next = [...current];
      next[step] = voicing;
      return next;
    });

  /** What each preset spells out in this key, for the dropdown. */
  const presetChords = useMemo(() => {
    const names = new Map<string, string>();
    if (chordScale === null) return names;
    for (const progression of progressions) {
      const built = buildProgression(chordScale, progression, chordSize);
      // Long forms (the twelve-bar blues) are named by their distinct chords.
      const long = built.length > 6;
      const symbols = long
        ? [...new Set(built.map((step) => step.chord.name()))]
        : built.map((step) => step.chord.name());
      const list = symbols.map(withAccidentals).join(' – ');
      names.set(progression.id, long ? `${progression.name}: ${list}` : list);
    }
    return names;
  }, [chordScale, progressions, chordSize]);

  return {
    progressions,
    presetChords,
    customChordSteps,
    isCustom,
    preset,
    steps,
    chordBars,
    stepVoicings,
    chosenVoicings,
    voicingIndex,
    selectVoicing,
  };
}
