import { useEffect, useMemo, useState } from 'react';
import type { AudioPlayer } from '../audio';
import { positionKey } from '../components/neckGeometry';
import { positionsAtPitch, type Scale, type ScaleFretPosition, scaleMidiSequence } from '../theory';

/**
 * The scale's ▶: play it up and down, and light each note on the neck as it sounds.
 */
export function useScaleRun(
  scale: Scale | null,
  visiblePositions: readonly ScaleFretPosition[],
  player: () => AudioPlayer,
) {
  /**
   * Which note of the run is sounding, as an index into the sequence. Only the
   * index is kept: the positions derive from it, and a second copy could go stale.
   */
  const [soundingIndex, setSoundingIndex] = useState<number | null>(null);

  const lowestMidi = useMemo(
    () => visiblePositions.reduce((min, p) => Math.min(min, p.midi), Number.POSITIVE_INFINITY),
    [visiblePositions],
  );

  /**
   * Anchored to the register the scale occupies on screen, so a capo or a box up
   * the neck is heard rather than flattened to a fixed octave. Over the whole neck
   * that lands low, and was left low on purpose: mapping the fret wins over being
   * easy to hear. App.test.tsx guards it.
   */
  const scaleSequence = useMemo(
    () => (scale ? scaleMidiSequence(scale, { baseMidi: lowestMidi, descend: true }) : []),
    [scale, lowestMidi],
  );

  // A pitch often sits on several positions at once, and all of them light up.
  const soundingKeys = useMemo(() => {
    if (soundingIndex === null) return null;
    const midi = scaleSequence[soundingIndex];
    if (midi === undefined) return null;
    return new Set(positionsAtPitch(visiblePositions, midi).map(positionKey));
  }, [soundingIndex, scaleSequence, visiblePositions]);

  // A run that is no longer playable — the key changed mid-run — leaves no marker.
  useEffect(() => setSoundingIndex(null), [scaleSequence]);

  const playScale = () =>
    player().play(scaleSequence, { mode: 'sequence', onNote: setSoundingIndex });

  return { soundingKeys, playScale };
}
