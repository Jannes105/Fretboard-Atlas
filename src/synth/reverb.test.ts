import { describe, expect, it } from 'vitest';
import { impulseResponse, ROOMS, type RoomId } from './reverb';

const SAMPLE_RATE = 48000;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** Energy of one slice of the tail, given as a fraction of the whole. */
function energyBetween(channel: Float32Array, from: number, to: number): number {
  let sum = 0;
  const start = Math.floor(from * channel.length);
  const end = Math.floor(to * channel.length);
  for (let i = start; i < end; i++) sum += channel[i] * channel[i];
  return sum;
}

describe('impulseResponse', () => {
  it('runs for as long as it was asked to', () => {
    const [left] = impulseResponse(SAMPLE_RATE, {
      seconds: 1.5,
      decay: 3,
      random: seeded(7),
    });

    expect(left).toHaveLength(1.5 * SAMPLE_RATE);
  });

  it('fades away, loudest at the front', () => {
    const [left] = impulseResponse(SAMPLE_RATE, { seconds: 2, decay: 3, random: seeded(7) });

    const first = energyBetween(left, 0, 0.25);
    const middle = energyBetween(left, 0.25, 0.5);
    const last = energyBetween(left, 0.75, 1);

    expect(middle).toBeLessThan(first);
    expect(last).toBeLessThan(middle);
    // It has to reach real silence, or the tail ends on an audible edge.
    expect(last).toBeLessThan(first * 0.01);
  });

  it('collapses sooner the more it is damped', () => {
    const damped = impulseResponse(SAMPLE_RATE, { seconds: 2, decay: 8, random: seeded(7) })[0];
    const open = impulseResponse(SAMPLE_RATE, { seconds: 2, decay: 1.5, random: seeded(7) })[0];

    expect(energyBetween(damped, 0.5, 1)).toBeLessThan(energyBetween(open, 0.5, 1));
  });

  it('gives the two ears different noise', () => {
    const [left, right] = impulseResponse(SAMPLE_RATE, {
      seconds: 0.5,
      decay: 3,
      random: seeded(7),
    });

    // Identical channels would collapse the room to a point between your ears.
    let identical = 0;
    for (let i = 0; i < left.length; i++) if (left[i] === right[i]) identical++;
    expect(identical).toBeLessThan(left.length * 0.01);
  });

  it('stays inside the rails', () => {
    for (const id of Object.keys(ROOMS) as RoomId[]) {
      const { seconds, decay } = ROOMS[id];
      for (const channel of impulseResponse(SAMPLE_RATE, { seconds, decay, random: seeded(3) })) {
        let loudest = 0;
        let finite = true;
        for (const sample of channel) {
          if (!Number.isFinite(sample)) finite = false;
          else loudest = Math.max(loudest, Math.abs(sample));
        }
        expect(finite, id).toBe(true);
        expect(loudest, id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('offers rooms that get bigger, with "off" genuinely silent', () => {
    expect(ROOMS.off.wet).toBe(0);
    expect(ROOMS.hall.seconds).toBeGreaterThan(ROOMS.room.seconds);
    expect(ROOMS.hall.wet).toBeGreaterThan(ROOMS.room.wet);
  });

  it('survives nonsense rather than throwing', () => {
    expect(impulseResponse(SAMPLE_RATE, { seconds: 0, decay: 3, random: seeded(1) })[0]).toHaveLength(
      1,
    );
  });
});
