/**
 * A strumming pattern for one bar, on an eighth-note grid: two slots per beat, so
 * `beatsPerBar * 2` slots. Each slot is a downstroke, an upstroke, or a rest. The
 * pattern repeats bar by bar under whatever chord is playing. Pure — no audio, no
 * DOM; audio.ts turns a pattern into scheduled strums.
 */

/** One slot of a pattern: a strum direction, or null for a rest (no strum). */
export type StrumSlot = 'down' | 'up' | null;

/** Slots per beat — an eighth-note grid. */
export const SLOTS_PER_BEAT = 2;

const CHAR: Record<'down' | 'up', string> = { down: 'd', up: 'u' };

/** A pattern as a compact string, e.g. "d-d-d-d-" — d = down, u = up, - = rest. */
export function serializePattern(pattern: readonly StrumSlot[]): string {
  return pattern.map((slot) => (slot === null ? '-' : CHAR[slot])).join('');
}

/** The default groove for a meter: a downstroke on every beat. */
export function defaultPattern(beatsPerBar: number): StrumSlot[] {
  return Array.from({ length: beatsPerBar * SLOTS_PER_BEAT }, (_, i) =>
    i % SLOTS_PER_BEAT === 0 ? 'down' : null,
  );
}

/**
 * Reads a pattern string against a meter. A string of the wrong length — which
 * happens whenever the time signature changed under it — falls back to the
 * default groove, so a pattern is always valid for the bar it plays in.
 */
export function parsePattern(text: string, beatsPerBar: number): StrumSlot[] {
  const expected = beatsPerBar * SLOTS_PER_BEAT;
  if (text.length !== expected) return defaultPattern(beatsPerBar);
  return [...text].map((char) => (char === 'd' ? 'down' : char === 'u' ? 'up' : null));
}

/** Whether a pattern string is just the default groove — kept out of the URL. */
export function isDefaultPattern(text: string, beatsPerBar: number): boolean {
  return text === serializePattern(defaultPattern(beatsPerBar));
}

/**
 * How the hand crosses the strings.
 *
 * `standard` brushes them, near enough to together that the chord arrives as one
 * sound. `arpeggio` walks them, one note at a time across the whole bar, so the
 * chord is heard as its parts.
 *
 * This replaced three speeds — fast, medium, plucked. Measured, they were 36, 72 and
 * 156 ms across six strings, which is three shades of the same gesture; the first
 * two were indistinguishable by ear. Strum against arpeggio is a musical
 * distinction rather than a slider.
 */
export type StrumStyle = 'standard' | 'arpeggio';

/** Seconds between one string and the next in an ordinary strum. */
export const STANDARD_STRUM_GAP = 0.01;

/**
 * When each string of a chord is struck, in seconds from the start of the bar.
 *
 * An arpeggio is spread to fill the bar exactly, so it always resolves on the next
 * chord no matter the tempo or the meter. That is also why it ignores the strum
 * pattern: spreading the notes across the bar IS the pattern.
 */
export function strumOffsets(
  noteCount: number,
  style: StrumStyle,
  secondsPerBar: number,
): number[] {
  if (noteCount <= 0) return [];

  const gap =
    style === 'arpeggio'
      ? // Divided by the note count, not by count-1, so the last note still gets its
        // own share of the bar instead of landing on the downbeat of the next one.
        secondsPerBar / noteCount
      : STANDARD_STRUM_GAP;

  return Array.from({ length: noteCount }, (_, i) => i * gap);
}

/**
 * How many strings an arpeggio plays: as many as the smallest chord can supply.
 *
 * Every chord of the progression uses this same count, and that is the whole point.
 * The notes are spread by dividing the bar among them, so a six-string chord
 * followed by a five-string one used to pulse at 444 ms and then 533 ms — the beat
 * changed with the chord, which is audible and wrong. Holding the count still holds
 * the pulse still.
 */
export function arpeggioStringCount(chords: readonly (readonly unknown[])[]): number {
  const counts = chords.map((chord) => chord.length).filter((count) => count > 0);
  return counts.length === 0 ? 0 : Math.min(...counts);
}

/**
 * The lowest `count` notes of a chord.
 *
 * An arpeggio gives up the top strings first, which is how it is actually played —
 * the picking hand runs out up there, and the bass is what carries the chord. Chords
 * are held lowest string first throughout this code, so this is a slice from the
 * front; the name is here to say why.
 */
export function dropHighest<T>(notes: readonly T[], count: number): T[] {
  return notes.slice(0, Math.max(0, count));
}

/**
 * Whether notes are left to ring into each other, or cut off after each strum.
 *
 * `stopped` is a damped, chopped chord: every strum stands on its own with silence
 * before the next. That silence is the point, not a side effect — a note that merely
 * ends a little sooner still runs into the following one and reads as ringing.
 */
export type NoteLength = 'ring' | 'stopped';

/** Share of the gap to the next strum that a stopped note actually sounds for. */
const STOPPED_SHARE = 0.45;
/** A stopped note is cut, not faded — this is short enough to hear as damping. */
const HARD_RELEASE = 0.012;
/** A ringing note fades out gently, so the tail does not end on an edge. */
export const SOFT_RELEASE = 0.08;

/**
 * How long one note sounds, and how sharply it ends.
 *
 * The release belongs here rather than in the audio code, because half of what makes
 * a strum sound damped is that it is cut off rather than faded away — splitting the
 * two decisions across two files would hide that.
 *
 * @param nextNote Seconds until the next note of the same gesture: the strum grid's
 *   slot, or the step of an arpeggio.
 */
export function noteSeconds(
  style: StrumStyle,
  length: NoteLength,
  secondsPerBar: number,
  nextNote: number,
): { seconds: number; release: number } {
  if (length === 'stopped') {
    return { seconds: Math.max(0.05, nextNote * STOPPED_SHARE), release: HARD_RELEASE };
  }

  // Ringing: a strum hangs over into the next one the way real strumming sustains,
  // and an arpeggio has to hold until the bar is out or the chord is never heard as
  // a chord — only as a queue of notes.
  const ringing = Math.min(nextNote * 2.6, 2);
  return {
    seconds: style === 'arpeggio' ? Math.max(ringing, secondsPerBar) : ringing,
    release: SOFT_RELEASE,
  };
}

/**
 * The click track.
 *
 * `countIn` is one bar of clicks and then silence — you are counted in and then
 * play along to the guitar alone. `metronome` keeps clicking throughout, and counts
 * in as well, because a metronome that starts on the same beat as the music gives
 * you nothing to come in on.
 */
export type ClickMode = 'off' | 'countIn' | 'metronome';

/** One click: when, and whether it is the downbeat. */
export interface Click {
  readonly at: number;
  readonly accent: boolean;
}

/**
 * The beats of `bars` bars, starting at `from` seconds.
 *
 * The first beat of each bar is accented — without it a click track in 3/4 is
 * indistinguishable from one in 4/4, which defeats the point of counting.
 */
export function clickTimes(
  beatsPerBar: number,
  secondsPerBar: number,
  bars: number,
  from = 0,
): Click[] {
  if (beatsPerBar <= 0 || bars <= 0) return [];

  const secondsPerBeat = secondsPerBar / beatsPerBar;
  const clicks: Click[] = [];

  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < beatsPerBar; beat++) {
      clicks.push({
        at: from + bar * secondsPerBar + beat * secondsPerBeat,
        accent: beat === 0,
      });
    }
  }

  return clicks;
}

/** How much silence to put before the music: one bar, or none. */
export function countInBars(mode: ClickMode): number {
  return mode === 'off' ? 0 : 1;
}

export interface PatternPreset {
  readonly id: string;
  readonly name: string;
  readonly build: (beatsPerBar: number) => StrumSlot[];
}

/** Quick starting points; the editor lets the pattern be shaped freely from there. */
export const PATTERN_PRESETS: readonly PatternPreset[] = [
  { id: 'quarter', name: 'Viertel', build: defaultPattern },
  {
    id: 'eighth',
    name: 'Achtel',
    build: (beatsPerBar) =>
      Array.from({ length: beatsPerBar * SLOTS_PER_BEAT }, (_, i) =>
        i % SLOTS_PER_BEAT === 0 ? 'down' : 'up',
      ),
  },
  {
    id: 'held',
    name: 'Gehalten',
    build: (beatsPerBar) =>
      Array.from({ length: beatsPerBar * SLOTS_PER_BEAT }, (_, i) => (i === 0 ? 'down' : null)),
  },
];
