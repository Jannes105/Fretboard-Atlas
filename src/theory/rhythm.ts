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
