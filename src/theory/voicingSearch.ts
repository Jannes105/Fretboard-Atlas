import type { Chord } from './Chord';
import type { Voicing } from './ChordShape';
import { mod } from './Note';
import type { Tuning } from './Tuning';

/**
 * Finds playable grips for a chord by searching the fretboard, rather than by
 * looking one up in a table. This is what covers the chords no hand-authored
 * shape reaches — sixths, m6, augMaj7, and above all slash chords, whose bass can
 * be anything. Because a grip is built from real fret positions, whatever
 * voicingMidi later reads off it sounds exactly what is drawn: the tone follows
 * the fret, bass included.
 *
 * The named shapes in ChordShape.ts stay the first choice where they exist — they
 * are more idiomatic. This engine is the fallback for everything else.
 */

/** The chord-diagram window is five frets tall, so a grip must fit inside it. */
const WINDOW = 5;

/** How many grips to return — a few positions, best (most comfortable) first. */
const MAX_RESULTS = 4;

interface Grip {
  readonly frets: number[];
  readonly cost: number;
}

/**
 * Every valid grip for one hand position, where the lowest fretted note sits on
 * `handPos` (that anchor keeps each grip from being found once per window it
 * happens to fit in). `allowed` is every pitch class that may sound; `required`
 * is every one that must — they differ only when the fifth is dropped to widen
 * coverage.
 */
function gripsAtPosition(
  tuning: Tuning,
  handPos: number,
  span: number,
  maxFret: number,
  bassPitchClass: number,
  allowed: ReadonlySet<number>,
  required: ReadonlySet<number>,
): number[][] {
  const strings = tuning.stringCount;

  // Candidate frets per string: muted, open (if a chord tone), or a fretted note
  // inside the window whose pitch class is a chord tone.
  const candidates: number[][] = [];
  for (let string = 0; string < strings; string++) {
    const options = [-1];
    if (allowed.has(tuning.pitchClassAt(string, 0))) options.push(0);
    for (let fret = handPos; fret <= Math.min(handPos + span - 1, maxFret); fret++) {
      if (fret >= 1 && allowed.has(tuning.pitchClassAt(string, fret))) options.push(fret);
    }
    candidates.push(options);
  }

  const grips: number[][] = [];
  const frets = new Array<number>(strings).fill(-1);

  const walk = (string: number, bassPlaced: boolean): void => {
    if (string === strings) {
      if (isValid(tuning, frets, handPos, bassPitchClass, required)) grips.push([...frets]);
      return;
    }

    for (const fret of candidates[string]) {
      if (fret >= 0 && !bassPlaced) {
        // The first string that sounds is the bass — it must carry the bass note.
        if (tuning.pitchClassAt(string, fret) !== bassPitchClass) continue;
      }
      frets[string] = fret;
      walk(string + 1, bassPlaced || fret >= 0);
    }
    frets[string] = -1;
  };

  walk(0, false);
  return grips;
}

function isValid(
  tuning: Tuning,
  frets: readonly number[],
  handPos: number,
  bassPitchClass: number,
  required: ReadonlySet<number>,
): boolean {
  const sounding = frets.filter((fret) => fret >= 0);
  if (sounding.length < 3) return false;

  const fretted = frets.filter((fret) => fret > 0);
  if (fretted.length === 0) return false;
  // Anchor: the lowest fretted note is the position, so a grip is found once only.
  if (Math.min(...fretted) !== handPos) return false;

  // Every required tone has to actually sound (foreign tones are already excluded
  // by how the candidates were built).
  const heard = new Set<number>();
  frets.forEach((fret, string) => {
    if (fret >= 0) heard.add(tuning.pitchClassAt(string, fret));
  });
  for (const pitchClass of required) {
    if (!heard.has(pitchClass)) return false;
  }

  // The lowest sounding string must be the bass (belt and braces — the search
  // already enforces it).
  const lowestString = frets.findIndex((fret) => fret >= 0);
  return tuning.pitchClassAt(lowestString, frets[lowestString]) === bassPitchClass;
}

/** Lower is more comfortable: penalise gaps, stretch and fingers, reward open strings. */
function gripCost(frets: readonly number[]): number {
  const soundingStrings = frets
    .map((fret, string) => (fret >= 0 ? string : -1))
    .filter((string) => string >= 0);
  const low = soundingStrings[0];
  const high = soundingStrings[soundingStrings.length - 1];

  let interiorMutes = 0;
  for (let string = low; string <= high; string++) {
    if (frets[string] < 0) interiorMutes++;
  }

  const fretted = frets.filter((fret) => fret > 0);
  const span = fretted.length > 0 ? Math.max(...fretted) - Math.min(...fretted) : 0;
  const openStrings = frets.filter((fret) => fret === 0).length;
  const position = fretted.length > 0 ? Math.min(...fretted) : 0;

  return (
    interiorMutes * 10 +
    span * 2 +
    fretted.length +
    position * 0.2 -
    openStrings * 1.5 -
    soundingStrings.length * 0.5
  );
}

function toVoicing(frets: readonly number[]): Voicing {
  const fretted = frets.filter((fret) => fret > 0);
  const lowestFretted = Math.min(...fretted);
  const highestFretted = Math.max(...fretted);
  const hasOpen = frets.includes(0);

  // Show the nut when the grip sits low and rings an open string; otherwise label
  // it by the fret it starts on, exactly as the hand-authored voicings do.
  const baseFret = hasOpen && highestFretted <= WINDOW ? 0 : lowestFretted;
  const isBarre = baseFret > 0 && frets.filter((fret) => fret === baseFret).length >= 2;

  return { shapeName: '', baseFret, frets: [...frets], isBarre };
}

function runSearch(
  tuning: Tuning,
  maxFret: number,
  bassPitchClass: number,
  allowed: ReadonlySet<number>,
  required: ReadonlySet<number>,
  span: number,
): Grip[] {
  const grips: Grip[] = [];
  const seen = new Set<string>();

  for (let handPos = 1; handPos <= maxFret; handPos++) {
    for (const frets of gripsAtPosition(
      tuning,
      handPos,
      span,
      maxFret,
      bassPitchClass,
      allowed,
      required,
    )) {
      const key = frets.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      grips.push({ frets, cost: gripCost(frets) });
    }
  }

  return grips;
}

/**
 * Playable grips for the chord, most comfortable first. Coverage wins over
 * comfort: if a tight, clean grip cannot be found, the search widens (a longer
 * stretch, and the fifth may be dropped) so a hard grip is offered rather than
 * none. Empty only when even that finds nothing.
 */
export function generateVoicings(chord: Chord, tuning: Tuning, maxFret: number): Voicing[] {
  if (!chord.quality) return [];

  const bassPitchClass = (chord.bass ?? chord.root).pitchClass;
  const allowed = new Set(chord.pitchClasses);

  // Strict pass: every tone present, a hand-sized stretch.
  let grips = runSearch(tuning, maxFret, bassPitchClass, allowed, allowed, 4);

  if (grips.length === 0) {
    // Widen, and let the perfect fifth go — the tone a guitarist drops first.
    const fifth = mod(chord.root.pitchClass + 7, 12);
    const required =
      allowed.size > 2 && allowed.has(fifth)
        ? new Set([...allowed].filter((pitchClass) => pitchClass !== fifth))
        : allowed;
    grips = runSearch(tuning, maxFret, bassPitchClass, allowed, required, 5);
  }

  return grips
    .sort((a, b) => a.cost - b.cost)
    .slice(0, MAX_RESULTS)
    .map((grip) => toVoicing(grip.frets));
}
