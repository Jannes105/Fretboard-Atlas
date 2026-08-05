import type { Voicing } from './ChordShape';
import { gripCost } from './voicingSearch';

/**
 * One grip per chord of a progression, chosen as a SEQUENCE rather than one at a
 * time.
 *
 * Picking each chord's most comfortable grip independently is what the app did
 * before, and it sends the hand up and down the neck between chords that have a
 * perfectly good voicing right where the hand already is. A guitarist does the
 * opposite: leave the common tones where they are and move the rest as little as
 * possible. That is voice leading, and it is not a new kind of grip — it is a
 * term that was missing from the cost.
 *
 * So the choice is a shortest path: every chord contributes its candidates as
 * nodes, every pair of neighbours contributes edges priced by how far the hand
 * travels, and one Viterbi pass finds the cheapest way through. With a dozen
 * chords and a handful of grips each the whole thing is a few hundred additions.
 */

/** What one fret of hand travel costs. The unit everything else is priced in. */
const MOVE_PER_FRET = 1;

/**
 * How much a grip's own comfort counts against the distance to it.
 *
 * Small on purpose, and the number was measured rather than guessed. On
 * gripCost's scale an open shape sits about ten below a barre, so at any
 * appreciable weight the search will cross the neck to reach an open string.
 * Summed over the eight presets in six keys each, total hand travel came out as:
 *
 * | weight | total travel | worst case |
 * | ------ | ------------ | ---------- |
 * | 1.00   | 148          | 12-bar blues in A: 6 → 18 |
 * | 0.25   | 148          | 12-bar blues in A: 6 → 15 |
 * | 0.12   | 136          | 12-bar blues in A: 6 → 11 |
 * | 0.06   | 128          | none — every progression improves or ties |
 *
 * The blues in A is the case that exposes it: A7 and E7 both have an open shape
 * and D7 does not, so any weight that lets comfort win makes the hand shuttle
 * between the nut and the fifth fret twice a chorus. At 0.06 comfort still ranks
 * the candidates within one position and no longer decides which position to be
 * in — which is the division of labour this cost function is meant to express.
 */
const COMFORT_WEIGHT = 0.06;

/**
 * What one string held still is worth — the same fret on the same string in both
 * chords, so the finger simply stays down.
 *
 * This is the common-tone term. It is deliberately smaller than MOVE_PER_FRET:
 * common tones are the reward for staying put, not a reason to reach for an
 * awkward grip that happens to share one note.
 */
const COMMON_STRING_BONUS = 0.6;

/**
 * The opening chord is chosen by the search like every other one, and two earlier
 * attempts to anchor it to `defaultVoicingIndex` are the reason it is not.
 *
 * A soft bias does not hold: in A major the open A is cheap enough to beat any
 * weight still small enough to call itself soft. Pinning it outright does hold,
 * and it is worse — `defaultVoicingIndex` picks the lowest BARRE, so a 12-bar
 * blues in A opened on an A7 at the fifth fret and then spent the next eleven
 * bars walking back towards the nut. Measured, that anchor alone cost twelve
 * frets of travel.
 *
 * The premise was wrong rather than the weight. `defaultVoicingIndex` prefers a
 * barre because it is the grip that works anywhere on the neck — the right answer
 * for one chord standing on its own, and the wrong one here, where the neighbours
 * are known. So the opening chord may now differ from the one the picker offers
 * for that chord alone. It is still one click away, and the bars after it are
 * where the change is felt.
 */

/**
 * Where the hand actually is, in frets.
 *
 * The lowest fretted note rather than `baseFret`, because `baseFret` carries a
 * display decision as well: a grip that rings an open string near the nut reports
 * 0 so the diagram draws the nut, whichever fret the fingers are on.
 */
function handPosition(voicing: Voicing): number {
  const fretted = voicing.frets.filter((fret) => fret > 0);
  return fretted.length === 0 ? 0 : Math.min(...fretted);
}

/** Strings that keep the very same fret — the fingers that never lift. */
function commonStrings(from: Voicing, to: Voicing): number {
  let held = 0;
  for (let string = 0; string < from.frets.length && string < to.frets.length; string++) {
    if (from.frets[string] >= 0 && from.frets[string] === to.frets[string]) held++;
  }
  return held;
}

/** What it costs to go from one grip to the next. */
function transitionCost(from: Voicing, to: Voicing): number {
  const travel = Math.abs(handPosition(to) - handPosition(from));
  return travel * MOVE_PER_FRET - commonStrings(from, to) * COMMON_STRING_BONUS;
}

/** How awkward this grip is on its own, on the same scale as the travel above. */
function comfort(voicing: Voicing): number {
  return gripCost(voicing.frets) * COMFORT_WEIGHT;
}

/**
 * The index to select in each chord's list of grips.
 *
 * A chord with no grips at all — a quality no shape reaches in an exotic tuning —
 * yields 0 and is stepped over rather than breaking the chain: the hand carries on
 * from the last chord that had one, which is what actually happens when a player
 * skips a chord.
 */
export function voicingPath(lists: readonly (readonly Voicing[])[]): number[] {
  const chosen = lists.map(() => 0);

  // Only chords that offer a choice take part; the empty ones keep their 0.
  const steps = lists
    .map((voicings, index) => ({ voicings, index }))
    .filter((step) => step.voicings.length > 0);
  if (steps.length === 0) return chosen;

  // best[j] — cheapest total cost of arriving at candidate j of the current step.
  let best = steps[0].voicings.map((voicing) => comfort(voicing));
  // One row per step after the first, each entry naming the predecessor that
  // produced it. This is what makes the walk back possible.
  const cameFrom: number[][] = [];

  for (let s = 1; s < steps.length; s++) {
    const previous = steps[s - 1].voicings;
    const current = steps[s].voicings;

    const next = new Array<number>(current.length).fill(Infinity);
    const back = new Array<number>(current.length).fill(0);

    current.forEach((voicing, j) => {
      const here = comfort(voicing);
      previous.forEach((from, k) => {
        const total = best[k] + transitionCost(from, voicing) + here;
        if (total < next[j]) {
          next[j] = total;
          back[j] = k;
        }
      });
    });

    best = next;
    cameFrom.push(back);
  }

  // Walk back from the cheapest ending, writing each step's pick into its own slot.
  let pick = best.indexOf(Math.min(...best));
  for (let s = steps.length - 1; s >= 0; s--) {
    chosen[steps[s].index] = pick;
    if (s > 0) pick = cameFrom[s - 1][pick];
  }

  return chosen;
}
