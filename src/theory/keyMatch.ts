import type { Chord } from './Chord';
import { Note } from './Note';
import { ROOT_CHOICES, Scale } from './Scale';
import { MAJOR, NATURAL_MINOR } from './ScaleType';

/**
 * A key that the entered chords could be in, with everything the UI needs to
 * explain the guess rather than just assert it.
 */
export interface KeyMatch {
  readonly scale: Scale;
  /** Scale degree (0..6) of each input chord, in input order; null if it does not fit. */
  readonly degrees: (number | null)[];
  /** The chords that do not belong to this key — the ones worth pointing at. */
  readonly outsiders: Chord[];
  /** Does the sequence begin or end on the I chord? The only hint at the tonic. */
  readonly tonicEvidence: boolean;
}

interface Mode {
  readonly type: typeof MAJOR;
  readonly isMinor: boolean;
}

// Only major and natural minor. A mode (dorian, ...) is the same set of notes
// from a different starting point, so it would return note-for-note duplicate
// keys for every hit — noise, not information.
const MODES: readonly Mode[] = [
  { type: MAJOR, isMinor: false },
  { type: NATURAL_MINOR, isMinor: true },
];

/** How many candidates to hand back at most, so a vague input does not flood. */
const MAX_RESULTS = 4;

/**
 * The degree an input chord occupies in a key, or null if it is foreign.
 *
 * The rule is "every tone belongs to the scale": that covers a diatonic triad, a
 * diatonic seventh AND a power chord or suspension in one stroke — for a tertian
 * chord it is equivalent to matching the diatonic quality, since a chord whose
 * root is a scale degree and whose stacked thirds are all in the scale IS that
 * degree's chord. The degree is simply where the root sits in the scale.
 */
function degreeOf(chord: Chord, scale: Scale, isMinor: boolean): number | null {
  const rootPitchClass = chord.root.pitchClass;
  const degree = scale.degreeIndexOf(rootPitchClass);

  if (degree !== null && chord.pitchClasses.every((pitchClass) => scale.contains(pitchClass))) {
    return degree;
  }

  // In a minor key the V is played major or dominant far more often than the
  // minor v that natural minor spells (Am Dm E7). Its raised leading tone is not
  // in the scale, so the test above rejects it — but it belongs. The same kind of
  // justified exception Progression.forceQuality makes for the blues.
  const qualityId = chord.quality?.id;
  if (
    isMinor &&
    rootPitchClass === scale.pitchClasses[4] &&
    (qualityId === 'major' || qualityId === 'dominant7')
  ) {
    return 4;
  }

  return null;
}

function matchOneKey(chords: readonly Chord[], scale: Scale, isMinor: boolean): KeyMatch {
  const degrees = chords.map((chord) => degreeOf(chord, scale, isMinor));

  const outsiders: Chord[] = [];
  const seenOutsiders = new Set<string>();
  chords.forEach((chord, i) => {
    if (degrees[i] === null && !seenOutsiders.has(chord.name())) {
      seenOutsiders.add(chord.name());
      outsiders.push(chord);
    }
  });

  const first = degrees[0];
  const last = degrees[degrees.length - 1];
  const tonicEvidence = first === 0 || last === 0;

  return { scale, degrees, outsiders, tonicEvidence };
}

/** Distinct diatonic chords, so a repeated chord (12-bar blues) is not counted twice. */
function score(match: KeyMatch, chords: readonly Chord[]): number {
  const hits = new Set<string>();
  match.degrees.forEach((degree, i) => {
    if (degree !== null) hits.add(chords[i].name());
  });
  return hits.size;
}

/**
 * The keys the given chords could be in, best first. Empty when nothing fits.
 *
 * Ranking: most diatonic chords first, then whichever starts or ends on its I,
 * then major before minor — the last two only to make ties deterministic. A tie
 * is real and kept: C major and A minor share all seven chords and cannot be
 * told apart from the chords alone.
 */
export function matchKeys(chords: readonly Chord[]): KeyMatch[] {
  if (chords.length === 0) return [];

  const candidates: { match: KeyMatch; score: number; isMinor: boolean }[] = [];

  for (const rootName of ROOT_CHOICES) {
    for (const mode of MODES) {
      const scale = new Scale(Note.parse(rootName), mode.type);
      const match = matchOneKey(chords, scale, mode.isMinor);
      candidates.push({ match, score: score(match, chords), isMinor: mode.isMinor });
    }
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.match.tonicEvidence !== b.match.tonicEvidence) return a.match.tonicEvidence ? -1 : 1;
    if (a.isMinor !== b.isMinor) return a.isMinor ? 1 : -1;
    return 0; // stable sort keeps ROOT_CHOICES order for the rest
  });

  const best = candidates[0].score;
  if (best === 0) return [];

  // Keep the top score's ties (C major / A minor), but never flood the UI.
  return candidates
    .filter((candidate) => candidate.score === best)
    .slice(0, MAX_RESULTS)
    .map((candidate) => candidate.match);
}
