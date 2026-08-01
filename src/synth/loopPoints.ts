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
  /** Never longer than this, whatever the search would prefer. */
  readonly maxSeconds?: number;
}

/** Matches shape() in scripts/build-samples.mjs. */
const TAIL_FADE = 0.08;
/**
 * Not before here: the loop belongs in the sustain and not in the attack.
 *
 * It was 0.8 s first, and that was late enough to hurt. Whatever the loop is cut
 * from is what a held note sounds like for as long as it is held, and by 0.8 s a
 * low string has lost nearly all of its harmonics: measured on the low E, only
 * 4 % of the looped note's energy was left above the third harmonic — a sine in
 * all but name, and holding a sine for ten seconds is exactly what "you can hear
 * the oscillation" sounds like. Cut at 0.5 s the same note keeps 18.5 %.
 *
 * Not earlier than this, though. Before half a second the note is still visibly
 * settling, and a loop cut out of a moving target neither flattens cleanly nor
 * holds still afterwards.
 */
const EARLIEST = 0.5;
/** Give up below this — under a couple of periods there is no waveform to hold. */
const MIN_SECONDS = 0.04;
/**
 * How long the loop runs, and the one number that decides whether a held note
 * throbs.
 *
 * The instinct is that a longer loop repeats less obviously. It is exactly wrong,
 * and the amplifier is what makes it wrong. Flattening takes the region's overall
 * decay out but not the differences WITHIN it — harmonics fade at their own rates,
 * and the two polarisations of a string beat against each other — so a long loop
 * repeats a long, structured pattern. Clean, that pattern sits far enough down to
 * pass. Driven it does not, because saturation compresses the loud parts and lifts
 * everything underneath, and what it lifts is the pattern.
 *
 * Measured on the low E through the amplifier, as modulation at the loop's own
 * repetition rate: 82 at half a second, 41 at a third, 6 at a fifth, 2 at a
 * twentieth. Not a slope but a cliff, between 0.2 s and 0.35 s — and it lines up
 * with the ear, which is most alive to flutter at a few hertz and stops hearing it
 * as flutter above about fifteen.
 *
 * A tenth of a second puts the repetition near 10 Hz and the modulation at a
 * fourteenth of what it was, while still leaving eight periods of the lowest
 * string to hold a waveform, and room for the seam to be crossfaded inside it.
 */
const TARGET_SECONDS = 0.1;
/**
 * The longest the search may go. Past here the repetition drops back into the few
 * hertz the ear reads as flutter, and the measurements above say what that costs.
 */
const MAX_SECONDS = 0.22;

/**
 * How much of the loop is spent easing across the seam.
 *
 * Capped as a share as well, because the loop is now short enough that a fixed
 * 30 ms could otherwise be most of it — and a crossfade that long stops being a
 * join and starts being the sound.
 */
const CROSSFADE = 0.03;
const CROSSFADE_SHARE = 0.25;

/**
 * How many samples the seam gets, for a loop of this length.
 *
 * Shared by the search and the render on purpose: findLoop picks the end by how
 * well these two stretches match, and renderSustain then blends exactly those.
 * If the two disagreed about the length, the search would be optimising a window
 * that is not the one actually crossfaded.
 *
 * `available` is what lies before the loop starts — the crossfade reaches back
 * into it, so it can never be longer than that.
 */
function crossfadeSamples(loopSamples: number, available: number, sampleRate: number): number {
  return Math.max(
    0,
    Math.min(Math.round(CROSSFADE * sampleRate), Math.floor(loopSamples * CROSSFADE_SHARE), available),
  );
}

/**
 * How steadily a stretch holds its level, ignoring the decay running through it.
 * Lower is steadier; the return is the spread of what is left once the decay has
 * been taken out, in nepers, so it can be compared between stretches.
 *
 * This is the thing renderSustain cannot fix and the loop therefore repeats: a
 * region's overall slope is straightened, but a string beating against itself
 * inside that region is not, and every lap plays that beat again. Which is why
 * the loop length is chosen by this rather than set to a number — how steady a
 * stretch is depends on the recording, and a length that suits one note leaves
 * another throbbing.
 */
function unsteadiness(samples: Float32Array, from: number, length: number, period: number): number {
  const window = Math.max(1, Math.round(4 * period));
  const levels: number[] = [];
  for (let i = from; i + window <= from + length; i += window) {
    const value = level(samples, i, window);
    // Silence carries no information about steadiness, and its log is -Infinity.
    if (value <= 0) return Infinity;
    levels.push(Math.log(value));
  }
  if (levels.length < 3) return Infinity;

  // Least squares against index, which is the decay; the residual is the wobble.
  const n = levels.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += levels[i];
    sxx += i * i;
    sxy += i * levels[i];
  }
  const slope = (n * sxy - sx * sy) / Math.max(1e-12, n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;

  let residual = 0;
  for (let i = 0; i < n; i++) {
    const difference = levels[i] - (slope * i + intercept);
    residual += difference * difference;
  }
  return Math.sqrt(residual / n);
}

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
    maxSeconds = MAX_SECONDS,
  } = options;

  if (frequency <= 0) return null;

  const period = sampleRate / frequency;
  const limit = samples.length - Math.round(tailFade * sampleRate);
  const start = risingCrossing(samples, Math.round(earliest * sampleRate), limit);
  if (start < 0) return null;

  /*
   * Whole periods only: a loop that is not an exact number of them restarts the
   * wave mid-swing, which is heard as a click and, once a lap, as a pitch bend.
   *
   * Which whole number is chosen by measurement rather than set. Every candidate
   * length inside the allowed range is scored by how steadily it holds its level
   * once its decay is taken out, and the steadiest wins — because that leftover
   * wobble is exactly what the loop repeats, and what the amplifier then lifts
   * into earshot. A fixed length cannot do this: measured through the amplifier,
   * a tenth of a second is thirteen times quieter than half a second on the low E
   * and twice as loud on the D sharp two octaves up. It depends on the recording.
   */
  const room = limit - start;
  const most = Math.min(Math.floor(room / period), Math.floor((maxSeconds * sampleRate) / period));
  const fewest = Math.max(1, Math.ceil((minSeconds * sampleRate) / period));
  if (most < fewest) return null;

  let laps = fewest;
  let steadiest = Infinity;
  for (let candidate = fewest; candidate <= most; candidate++) {
    const score = unsteadiness(samples, start, Math.round(candidate * period), period);
    // Ties go to the shorter loop: it repeats faster, and the faster it repeats
    // the further the repetition sits from where the ear hears flutter.
    if (score < steadiest * 0.98) {
      steadiest = score;
      laps = candidate;
    }
  }
  if (!Number.isFinite(steadiest)) {
    // Nothing measurable to choose between — fall back to the preferred length.
    laps = Math.max(fewest, Math.min(most, Math.round((TARGET_SECONDS * sampleRate) / period)));
  }

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
  const match = crossfadeSamples(laps * period, start, sampleRate);
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
  // Backed by an explicit ArrayBuffer so the type matches copyToChannel, which
  // rejects the ArrayBufferLike that slicing a decoded buffer infers.
): Float32Array<ArrayBuffer> {
  const start = Math.round(loop.start * sampleRate);
  const end = Math.round(loop.end * sampleRate);
  const out = new Float32Array(new ArrayBuffer(end * Float32Array.BYTES_PER_ELEMENT));
  out.set(samples.subarray(0, end));

  // A third of the loop at most, so the two windows the level is read from cannot
  // overlap — on a short loop a fixed 50 ms would swallow the whole region.
  const measure = Math.min(Math.round(0.05 * sampleRate), Math.floor((end - start) / 3));
  const crossfade = crossfadeSamples(end - start, start, sampleRate);
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
