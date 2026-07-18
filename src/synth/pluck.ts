/**
 * A plucked string, synthesised — Karplus-Strong.
 *
 * Two parts, and both matter.
 *
 * **The loop** sets how the note evolves: the string's displacement runs around a
 * delay line whose length fixes the pitch, and every lap it passes a gentle lowpass.
 * That filter compounds over hundreds of laps a second, so the high harmonics are
 * gone in a fraction of a second while the fundamental rings on. A real string
 * behaves exactly this way, and it is what an oscillator with a volume envelope can
 * never do — that only gets quieter, never darker.
 *
 * **The excitation** sets what the note is made of, and it is easy to get wrong.
 * Filling the loop with noise excites every harmonic equally, which measures as no
 * rolloff at all and sounds buzzy and koto-like — the fundamental ends up the
 * quietest part of its own note. So the loop starts from the shape a real string
 * actually has when plucked: pulled aside into a **triangle** and let go. Those
 * partials fall away as 1/n² on their own.
 *
 * Nothing here touches Web Audio. Numbers in, samples out, so it can be measured
 * in a plain test — including the harmonic rolloff, which is the property that
 * decides whether this sounds like a string at all.
 */

export interface PluckOptions {
  /**
   * 0…1 — how much of the highs each lap eats. Low is bright and steely, high is
   * muted and nylon-like. Mapped onto the loop filter's coefficient, which tops out
   * at 0.5: that is a true two-point average, the darkest this filter gets.
   */
  damping: number;
  /**
   * 0.05…0.5 — where along the string it is plucked, as a fraction of its length.
   *
   * This is also the pick-position filter, for free: a triangle peaking at `p` puts
   * a null on every harmonic that has a node there. Near the bridge (small values)
   * that thins the low partials and sounds nasal and twangy; toward the middle it is
   * round and mellow, like picking over the sound hole.
   */
  pickPosition: number;
  /** 0…1 — a trace of plectrum scrape over the pluck. A little goes a long way. */
  pickNoise: number;
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

  // The pluck itself: the string pulled aside into a triangle peaking where it is
  // picked. This shape is the whole reason the note has a sane spectrum — its
  // partials fall off as 1/n², where noise would leave every harmonic screaming at
  // full strength and bury the fundamental in its own note.
  const pickPosition = Math.min(0.5, Math.max(0.02, options.pickPosition));
  const scrape = clamp01(options.pickNoise);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const along = i / size;
    const triangle =
      along < pickPosition ? along / pickPosition : (1 - along) / (1 - pickPosition);
    line[i] = triangle * (1 - scrape) + (random() * 2 - 1) * scrape;
    sum += line[i];
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
