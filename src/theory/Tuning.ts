import { mod, pitchClassName } from './Note';

/**
 * A tuning is the list of open-string pitches as MIDI note numbers,
 * ordered from the lowest string (6th, thickest) to the highest (1st).
 *
 * MIDI reference: 60 = C4 (middle C), so standard tuning is
 * E2=40, A2=45, D3=50, G3=55, B3=59, E4=64.
 */
export class Tuning {
  /** Stable, URL-safe handle. A capo does not change it — it is still the same tuning. */
  readonly id: string;
  readonly name: string;
  /** Open-string MIDI numbers, low string first. */
  readonly openStrings: readonly number[];

  constructor(id: string, name: string, openStrings: readonly number[]) {
    if (openStrings.length === 0) {
      throw new Error(`Tuning "${name}": mindestens eine Saite erforderlich.`);
    }
    this.id = id;
    this.name = name;
    this.openStrings = openStrings;
  }

  get stringCount(): number {
    return this.openStrings.length;
  }

  /** Names of the open strings, low first — derived from the pitches. */
  get stringLabels(): string[] {
    return this.openStrings.map((midi) => pitchClassName(mod(midi, 12)));
  }

  /**
   * The semitone gaps between adjacent strings. This — not the absolute pitches —
   * is what chord shapes depend on, so it is the key a shape set is looked up by
   * (see ChordShape.shapeSetFor). A capo shifts every string equally and therefore
   * leaves this pattern untouched, which is why capoed shapes still work.
   */
  get intervals(): number[] {
    return this.openStrings.slice(1).map((midi, i) => midi - this.openStrings[i]);
  }

  /** MIDI number of a fretted note. String 0 is the lowest; fret 0 is open. */
  midiAt(stringIndex: number, fret: number): number {
    if (stringIndex < 0 || stringIndex >= this.stringCount) {
      throw new Error(`Saite ${stringIndex} existiert nicht (0..${this.stringCount - 1}).`);
    }
    if (fret < 0) {
      throw new Error(`Bund ${fret} ist ungültig.`);
    }
    return this.openStrings[stringIndex] + fret;
  }

  /** Pitch class (0..11) of a fretted note. */
  pitchClassAt(stringIndex: number, fret: number): number {
    return mod(this.midiAt(stringIndex, fret), 12);
  }

  /** A copy shifted up by `fret` semitones — a capo across all strings. */
  withCapo(fret: number): Tuning {
    if (fret < 0) throw new Error(`Kapodaster kann nicht auf Bund ${fret} liegen.`);
    if (fret === 0) return this;
    return new Tuning(
      this.id,
      `${this.name} + Kapo ${fret}`,
      this.openStrings.map((midi) => midi + fret),
    );
  }

  /** E A D G B E — the default. */
  static readonly STANDARD = new Tuning('standard', 'Standard (E-A-D-G-B-E)', [
    40, 45, 50, 55, 59, 64,
  ]);

  /**
   * Low E down to D. Only that one string moves, which is why chord shapes can be
   * carried over: everything from the A string up is still tuned like standard.
   */
  static readonly DROP_D = new Tuning('drop-d', 'Drop D (D-A-D-G-B-E)', [38, 45, 50, 55, 59, 64]);

  static readonly ALL: readonly Tuning[] = [Tuning.STANDARD, Tuning.DROP_D];

  static byId(id: string): Tuning {
    return Tuning.ALL.find((tuning) => tuning.id === id) ?? Tuning.STANDARD;
  }
}
