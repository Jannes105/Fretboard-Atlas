/**
 * A discrete Fourier transform, for tests that have to measure a signal rather
 * than assert something about the code that made it.
 *
 * Lives here rather than in src/synth because two suites now need it — pluck.test.ts
 * to measure brightness, amp.test.ts to show that distorting a sum produces
 * intermodulation where distorting each note separately does not.
 */

/** Magnitude spectrum of a power-of-two frame — iterative radix-2, just for measuring. */
export function spectrum(frame: Float64Array): Float64Array {
  const n = frame.length;
  const re = Float64Array.from(frame);
  const im = new Float64Array(n);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const step = (-2 * Math.PI) / length;
    for (let i = 0; i < n; i += length) {
      for (let k = 0; k < length / 2; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + length / 2] * wr - im[i + k + length / 2] * wi;
        const vi = re[i + k + length / 2] * wi + im[i + k + length / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + length / 2] = ur - vr;
        im[i + k + length / 2] = ui - vi;
      }
    }
  }

  const magnitude = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) magnitude[k] = Math.hypot(re[k], im[k]);
  return magnitude;
}
