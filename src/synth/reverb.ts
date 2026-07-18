/**
 * The room the guitar is played in.
 *
 * A convolution reverb needs an impulse response: a recording of how one sharp
 * handclap decays in a space. Rather than ship one, this computes it — noise that
 * fades away, which is what an impulse response mostly is once you look at it.
 *
 * A completely dry signal is one of the reasons a sampled instrument still sounds
 * artificial: real notes arrive with the room attached, and the ear misses it.
 *
 * Numbers in, samples out, so the decay can be measured in a plain test.
 */

export interface RoomOptions {
  /** How long the tail runs before it is inaudible. */
  seconds: number;
  /**
   * How sharply it fades. Higher means the tail collapses early — a small, damped
   * room; lower lets it hang on, which reads as a big hall.
   */
  decay: number;
  /** Injectable randomness, so a test can build the same room twice. */
  random?: () => number;
}

/**
 * Builds a stereo impulse response.
 *
 * Two independent channels rather than one duplicated: identical noise in both ears
 * collapses to a point in the middle of your head, which is the one thing a room
 * never does.
 */
export function impulseResponse(
  sampleRate: number,
  { seconds, decay, random = Math.random }: RoomOptions,
): Float32Array<ArrayBuffer>[] {
  const length = Math.max(1, Math.round(seconds * sampleRate));

  return [0, 1].map(() => {
    const channel = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));

    for (let i = 0; i < length; i++) {
      const progress = i / length;
      // The early part of a real tail is denser than the end. Raising the fade to a
      // power rather than a straight exponential keeps the first reflections strong
      // while still arriving at exact silence, so the tail has no audible cut.
      channel[i] = (random() * 2 - 1) * Math.pow(1 - progress, decay);
    }

    return channel;
  });
}

/** The rooms on offer, and how much of each is mixed in. */
export interface Room extends RoomOptions {
  /**
   * Share of the signal that goes through the room, 0…1.
   *
   * Only meaningful with `ConvolverNode.normalize` turned off. Left on — which is
   * the default — the node scales the impulse response to unit gain, and for a long
   * noisy tail like this that is a division by well over a hundred: measured, the
   * reverb came back at 4 % of the dry signal and was simply inaudible.
   */
  wet: number;
}

export const ROOMS = {
  off: { seconds: 0.1, decay: 8, wet: 0 },
  // One room rather than a choice of three. Two of them were a distinction nobody
  // could hear, and the reason was the normalisation above, not the settings.
  on: { seconds: 1.8, decay: 2.6, wet: 0.28 },
} as const satisfies Record<string, Room>;

export type RoomId = keyof typeof ROOMS;
