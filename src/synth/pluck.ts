/**
 * A plucked string, synthesised — Karplus-Strong.
 *
 * The idea in one sentence: a burst of noise (the pick) runs around a delay loop
 * whose length sets the pitch, and every lap it is nudged through a gentle lowpass.
 *
 * That lowpass is the whole point. The signal passes it hundreds of times per
 * second, so its damping compounds: high harmonics are gone in a fraction of a
 * second while the fundamental rings on. A real string behaves exactly this way,
 * and it is what an oscillator with a volume envelope can never do — that only
 * gets quieter, never darker.
 *
 * Nothing here touches Web Audio. Numbers in, samples out, so it can be measured
 * in a plain test.
 */

export interface PluckOptions {
  /**
   * 0…1 — how much of the highs each lap eats. Low is bright and steely, high is
   * muted and nylon-like. Mapped onto the loop filter's coefficient, which tops out
   * at 0.5: that is a true two-point average, the darkest this filter gets.
   */
  damping: number;
  /**
   * 0…1 — softness of the pick. 0 is white noise, a hard plectrum with all the
   * harmonics excited at once; 1 is smoothed, closer to a thumb.
   */
  pick: number;
  /** Seconds for the string to fall by 60 dB from the loop's losses alone. */
  sustainSeconds: number;
  /** Injectable randomness, so a test can render the same string twice. */
  random?: () => number;
}

/** The loop filter is a two-point average at most — beyond that it stops darkening. */
const MAX_DAMPING = 0.5;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Renders one plucked note.
 *
 * @param frequency Pitch in Hz — sets the loop length, and so the pitch.
 * @param sampleRate Samples per second, normally the AudioContext's.
 * @param seconds How much to render.
 */
export function pluck(frequency: number, sampleRate: number, seconds: number, options: PluckOptions) {
  const total = Math.max(0, Math.round(seconds * sampleRate));
  // Backed by an explicit ArrayBuffer, and with no return annotation to widen it
  // again: copyToChannel rejects the ArrayBufferLike a bare `new Float32Array(n)`
  // infers.
  const out = new Float32Array(new ArrayBuffer(total * Float32Array.BYTES_PER_ELEMENT));
  if (total === 0 || frequency <= 0 || sampleRate <= 0) return out;

  const random = options.random ?? Math.random;
  const damping = clamp01(options.damping) * MAX_DAMPING;

  // The loop filter y[n] = (1-d)·x[n] + d·x[n-1] delays by d samples on its own, so
  // the delay line has to be that much SHORTER or every note would sound flat.
  const delay = sampleRate / frequency - damping;
  if (delay < 2) return out; // above roughly half the sample rate there is no string left

  const size = Math.floor(delay) + 2;
  const line = new Float32Array(size);

  // The pick: noise, optionally smoothed. A one-pole lowpass rolls the top off, and
  // the coefficient is what turns a plectrum into a thumb.
  const smoothing = clamp01(options.pick) * 0.9;
  let previous = 0;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const white = random() * 2 - 1;
    previous = white * (1 - smoothing) + previous * smoothing;
    line[i] = previous;
    sum += previous;
  }

  // Any DC left in the loop never decays — it just circles forever as a thump under
  // the note. Centring the excitation removes it at the source.
  const mean = sum / size;
  let peak = 0;
  for (let i = 0; i < size; i++) {
    line[i] -= mean;
    peak = Math.max(peak, Math.abs(line[i]));
  }
  if (peak > 0) {
    for (let i = 0; i < size; i++) line[i] /= peak;
  }

  // Each stored value is rewritten once per LAP, not once per sample — so this is
  // the loss per lap. Dividing by the frequency cancels the lap count out, which
  // makes the -60 dB time come out the same at every pitch. The filter's own damping
  // then shortens high notes on top of that, which is right: a thin string does die
  // away sooner.
  const loopGain =
    options.sustainSeconds > 0 ? Math.pow(10, -3 / (options.sustainSeconds * frequency)) : 0;

  let write = 0;
  let last = 0;

  for (let n = 0; n < total; n++) {
    // Read the delay line a fractional number of samples back. Rounding to whole
    // samples instead would detune the high notes by up to half a percent — audible.
    let read = write - delay;
    if (read < 0) read += size;
    const index = Math.floor(read);
    const fraction = read - index;
    const a = line[index];
    const b = line[index + 1 === size ? 0 : index + 1];
    const sample = a + (b - a) * fraction;

    out[n] = sample;

    line[write] = ((1 - damping) * sample + damping * last) * loopGain;
    last = sample;

    write = write + 1 === size ? 0 : write + 1;
  }

  return out;
}
