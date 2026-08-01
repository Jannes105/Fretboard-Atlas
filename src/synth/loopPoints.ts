/**
 * Where to loop a recorded note so that holding a fret keeps sounding.
 *
 * The recordings are two seconds long, and after being stretched down to reach a
 * lower fret as little as 1.68 s of that is left. A finger holding a note lies
 * there for three to five. Without a loop the note dies under the finger, on a
 * control whose whole promise is that it sounds for as long as you hold it.
 *
 * Two things make a loop audible, and this avoids both:
 *
 * - The last 80 ms of every recording is already faded to silence, by shape() in
 *   scripts/build-samples.mjs, so the trimmed note does not click. Looping
 *   through that fade would gate the sound once a lap. So the loop ends before it.
 * - A seam where the waveform does not continue clicks. So the loop runs a whole
 *   number of the string's own periods and both ends are chosen to match, which
 *   is also what stops the pitch wobbling once a lap.
 *
 * And one that alignment cannot touch: the string is still dying away inside the
 * loop, so every lap restarts louder than it ended. Measured on the app's own
 * string that step is 2.3 dB every 0.35 s — a tremolo, not a sustain. So the
 * region is flattened and its seam crossfaded before it is looped; see
 * renderSustain.
 *
 * What a loop must NOT do is take the decay away for good, because a guitar that
 * does not decay is an organ. audio.ts puts it back on the gain instead, slowly,
 * which is the other half of this.
 */

/** A loop, in seconds from the start of the buffer. */
export interface LoopRegion {
  readonly start: number;
  readonly end: number;
}

export interface LoopOptions {
  /** Silence already fused onto the end of the buffer, in seconds. */
  readonly tailFade?: number;
  /** Not before here: the loop belongs in the sustain, not in the attack. */
  readonly earliest?: number;
  /** Give up below this — a loop this short pulses rather than sustains. */
  readonly minSeconds?: number;
  /** Aim for about this long. Longer is more natural, shorter steps less. */
  readonly targetSeconds?: number;
}

/** Matches shape() in scripts/build-samples.mjs. */
const TAIL_FADE = 0.08;
const EARLIEST = 0.8;
const MIN_SECONDS = 0.2;
/**
 * Long enough that the repetition does not become a character of its own. It can
 * afford to be this long because renderSustain takes the decay out of the region
 * afterwards, which is what would otherwise force it short.
 */
const TARGET_SECONDS = 0.5;

/** How much of the loop is spent easing across the seam. */
const CROSSFADE = 0.03;

/** The first upward zero crossing at or after `from`, or -1. */
function risingCrossing(samples: Float32Array, from: number, until: number): number {
  for (let i = Math.max(1, from); i < until; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0) return i;
  }
  return -1;
}

/**
 * A loop for a note recorded at `frequency`, or null if the buffer has no room
 * for one worth having.
 *
 * `frequency` is the pitch of the RECORDING, not of the note being played:
 * playbackRate stretches the buffer afterwards, and it stretches the loop points
 * with it.
 */
export function findLoop(
  samples: Float32Array,
  sampleRate: number,
  frequency: number,
  options: LoopOptions = {},
): LoopRegion | null {
  const {
    tailFade = TAIL_FADE,
    earliest = EARLIEST,
    minSeconds = MIN_SECONDS,
    targetSeconds = TARGET_SECONDS,
  } = options;

  if (frequency <= 0) return null;

  const period = sampleRate / frequency;
  const limit = samples.length - Math.round(tailFade * sampleRate);
  const start = risingCrossing(samples, Math.round(earliest * sampleRate), limit);
  if (start < 0) return null;

  // Whole periods only: a loop that is not an exact number of them restarts the
  // wave mid-swing, which is heard as a click and, once a lap, as a pitch bend.
  const room = limit - start;
  const laps = Math.min(
    Math.floor(room / period),
    Math.max(1, Math.round((targetSeconds * sampleRate) / period)),
  );
  if (laps < 1 || laps * period < minSeconds * sampleRate) return null;

  /*
   * Land the end where the waveform is doing what it was doing at the start.
   *
   * An integer number of periods gets it close, but a plucked string is not
   * exactly periodic — its harmonics decay at different rates — so the last half
   * period is spent looking for the sample that really continues. Matched over
   * the whole crossfade window rather than at a single point, because a single
   * matching sample says nothing about the phase around it, and renderSustain
   * then blends those two stretches together: aligned they reinforce, half a
   * period out they cancel and the seam sags.
   */
  const aim = start + laps * period;
  const search = Math.floor(period / 2);
  const match = Math.min(Math.round(CROSSFADE * sampleRate), start);
  let end = Math.round(aim);
  let best = Infinity;

  for (let candidate = Math.round(aim) - search; candidate <= Math.round(aim) + search; candidate++) {
    if (candidate - match <= start || candidate >= limit) continue;

    let cost = 0;
    for (let k = 0; k < match; k++) {
      const difference = samples[candidate - match + k] - samples[start - match + k];
      cost += difference * difference;
    }

    if (cost < best) {
      best = cost;
      end = candidate;
    }
  }

  return { start: start / sampleRate, end: end / sampleRate };
}

/** Root mean square over `count` samples from `first`. */
function level(samples: Float32Array, first: number, count: number): number {
  let sum = 0;
  for (let i = first; i < first + count; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / count);
}

/**
 * The buffer to loop: the note up to the end of its loop, with the loop region
 * held at a steady level and its seam eased across.
 *
 * Two jobs, and the first is the one that matters.
 *
 * **Flattening.** A string decays inside the loop as much as anywhere else, so a
 * lap that starts 2.3 dB above where the last one ended is a sawtooth on the
 * level — heard as a tremolo at the loop's own rate, which for a third of a
 * second lands squarely in the range the ear is most sensitive to. Undoing that
 * decay makes the region genuinely steady, and the note's decay then comes from
 * the one place that can shape it musically: the gain in audio.ts.
 *
 * **Crossfading.** Period alignment gets the two ends of the loop close, but a
 * plucked string is not exactly periodic and never joins perfectly. Blending the
 * few hundredths of a second before the loop starts into its end means the seam
 * is not a join at all — by the time the playhead jumps it is already playing
 * what it is about to jump to.
 *
 * The attack is left exactly as recorded. Only the sustain is rebuilt, which is
 * the part that has no information left in it worth preserving.
 */
export function renderSustain(
  samples: Float32Array,
  sampleRate: number,
  loop: LoopRegion,
  crossfadeSeconds = CROSSFADE,
  // Backed by an explicit ArrayBuffer so the type matches copyToChannel, which
  // rejects the ArrayBufferLike that slicing a decoded buffer infers.
): Float32Array<ArrayBuffer> {
  const start = Math.round(loop.start * sampleRate);
  const end = Math.round(loop.end * sampleRate);
  const out = new Float32Array(new ArrayBuffer(end * Float32Array.BYTES_PER_ELEMENT));
  out.set(samples.subarray(0, end));

  const measure = Math.min(Math.round(0.05 * sampleRate), Math.floor((end - start) / 3));
  const crossfade = Math.min(Math.round(crossfadeSeconds * sampleRate), start, end - start - measure);
  if (measure <= 0) return out;

  /*
   * A string decays exponentially, so the correction is a straight line in
   * decibels — a plain exponential in the gain.
   *
   * Anchored at the CENTRES of the two windows it was measured over, not at the
   * ends of the loop. An RMS is an average across its window, so a gain that
   * reaches its full value only at the very last sample leaves the window it was
   * measured over under-corrected, and the flattening quietly falls short.
   */
  const opening = level(samples, start, measure);
  const closing = level(samples, end - measure, measure);
  const climb = opening > 0 && closing > 0 ? Math.log(opening / closing) : 0;
  const from = start + measure / 2;
  const span = end - start - measure;

  for (let i = start; i < end; i++) {
    out[i] = samples[i] * Math.exp((climb * (i - from)) / span);
  }

  /*
   * Ease across the seam with the audio that runs INTO the loop.
   *
   * A linear fade, and deliberately so: findLoop matched these two stretches to
   * each other, so they are near copies rather than independent signals. Two
   * copies want a crossfade whose halves SUM to one — the equal-power curve used
   * for uncorrelated material would put a 3 dB bulge in the middle of the seam.
   */
  for (let i = 0; i < crossfade; i++) {
    const mix = (i + 1) / (crossfade + 1);
    out[end - crossfade + i] =
      out[end - crossfade + i] * (1 - mix) + out[start - crossfade + i] * mix;
  }

  return out;
}
