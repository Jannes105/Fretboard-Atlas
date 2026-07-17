import { describe, expect, it } from 'vitest';
import {
  defaultPattern,
  isDefaultPattern,
  parsePattern,
  PATTERN_PRESETS,
  serializePattern,
} from './rhythm';

describe('rhythm — Muster ⇄ String', () => {
  it('serialisiert und liest ein Muster verlustfrei', () => {
    const pattern = parsePattern('d-du-udu', 4);
    expect(serializePattern(pattern)).toBe('d-du-udu');
    expect(pattern).toEqual(['down', null, 'down', 'up', null, 'up', 'down', 'up']);
  });

  it('hat pro Schlag zwei Slots — die Länge folgt der Taktart', () => {
    expect(defaultPattern(4)).toHaveLength(8);
    expect(defaultPattern(3)).toHaveLength(6);
    expect(defaultPattern(6)).toHaveLength(12);
  });

  it('gibt als Vorgabe einen Abschlag auf jeden Schlag', () => {
    expect(serializePattern(defaultPattern(4))).toBe('d-d-d-d-');
    expect(serializePattern(defaultPattern(3))).toBe('d-d-d-');
  });

  it('fällt bei falscher Länge auf die Vorgabe zurück (Taktart hat sich geändert)', () => {
    // Ein 4/4-Muster in einem 3/4-Takt: Länge passt nicht → Vorgabe für 3/4.
    expect(parsePattern('d-d-d-d-', 3)).toEqual(defaultPattern(3));
  });

  it('erkennt die Vorgabe, damit sie nicht in die URL wandert', () => {
    expect(isDefaultPattern('d-d-d-d-', 4)).toBe(true);
    expect(isDefaultPattern('dudududu', 4)).toBe(false);
  });

  it('baut jedes Preset auf die richtige Länge für die Taktart', () => {
    for (const preset of PATTERN_PRESETS) {
      expect(preset.build(4), preset.id).toHaveLength(8);
      expect(preset.build(3), preset.id).toHaveLength(6);
    }
    // Gehalten = ein Abschlag, dann Pausen.
    const held = PATTERN_PRESETS.find((p) => p.id === 'held')!;
    expect(serializePattern(held.build(4))).toBe('d-------');
  });
});
