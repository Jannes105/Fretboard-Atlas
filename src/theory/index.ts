export { Note, LETTERS, mod, pitchClassName, type LetterIndex } from './Note';
export {
  SCALE_TYPES,
  scaleTypeById,
  scaleTypesInGroup,
  degreeLabel,
  MAJOR,
  NATURAL_MINOR,
  HARMONIC_MINOR,
  MELODIC_MINOR,
  DORIAN,
  PHRYGIAN,
  LYDIAN,
  MIXOLYDIAN,
  LOCRIAN,
  MAJOR_PENTATONIC,
  MINOR_PENTATONIC,
  BLUES,
  type ScaleType,
  type ScaleGroup,
} from './ScaleType';
export { Scale, ROOT_CHOICES } from './Scale';
export { Tuning } from './Tuning';
export {
  Fretboard,
  type FretPosition,
  type ScaleFretPosition,
  type ScalePosition,
} from './Fretboard';
export { Chord, diatonicChords, type ChordQuality, type ChordSize } from './Chord';
export { matchKeys, type KeyMatch } from './keyMatch';
export {
  SHAPE_SETS,
  shapeSetFor,
  hasChordShapes,
  voicingsFor,
  defaultVoicingIndex,
  type ChordShape,
  type ShapeSet,
  type Voicing,
  type VoicingOptions,
} from './ChordShape';
export { generateVoicings } from './voicingSearch';
export {
  type StrumSlot,
  SLOTS_PER_BEAT,
  serializePattern,
  defaultPattern,
  parsePattern,
  isDefaultPattern,
  PATTERN_PRESETS,
  type PatternPreset,
} from './rhythm';
export {
  PROGRESSIONS,
  buildProgression,
  customSteps,
  progressionsFor,
  type Progression,
  type ProgressionStep,
} from './Progression';
export {
  DEFAULT_BASE_MIDI,
  midiToFrequency,
  midiForPitchClass,
  scaleMidiSequence,
  chordMidiTones,
  positionsToMidi,
  voicingMidi,
  type ScaleSequenceOptions,
  type PlayablePosition,
} from './pitch';
