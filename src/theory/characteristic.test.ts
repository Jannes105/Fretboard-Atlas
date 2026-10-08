import { describe, expect, it } from 'vitest';
import { characteristicTone, scaleTypeById, SCALE_TYPES } from './ScaleType';

/** The neighbour each mode is told apart from — the claim each `why` makes. */
const NEIGHBOUR: Record<string, string> = {
  'natural-minor': 'dorian',
  dorian: 'natural-minor',
  phrygian: 'natural-minor',
  lydian: 'major',
  mixolydian: 'major',
  locrian: 'phrygian',
  'harmonic-minor': 'natural-minor',
  'melodic-minor': 'natural-minor',
  blues: 'minor-pentatonic',
};

describe('Charakterton', () => {
  it('ist genau der Ton, den der Nachbar nicht hat', () => {
    for (const [id, neighbourId] of Object.entries(NEIGHBOUR)) {
      const type = scaleTypeById(id);
      const tone = characteristicTone(type);
      expect(tone, id).not.toBeNull();

      const semitone = type.semitones[tone!.index];
      expect(scaleTypeById(neighbourId).semitones, `${id} gegen ${neighbourId}`).not.toContain(
        semitone,
      );
    }
  });

  it('zeigt auf einen Ton, den die Skala wirklich hat', () => {
    for (const type of SCALE_TYPES) {
      const tone = characteristicTone(type);
      if (tone) expect(tone.index, type.id).toBeLessThan(type.semitones.length);
    }
  });

  it('gibt Dur und den Pentatoniken keinen — sie sind der Maßstab', () => {
    expect(characteristicTone(scaleTypeById('major'))).toBeNull();
    expect(characteristicTone(scaleTypeById('minor-pentatonic'))).toBeNull();
  });
});
