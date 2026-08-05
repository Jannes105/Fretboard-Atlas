// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chord, Note, type Voicing } from '../theory';
import { ChordDiagram } from './ChordDiagram';

/**
 * What two digits of `.base-fret` occupy, in drawing units.
 *
 * Measured in the browser with getBBox at the 13px the stylesheet sets: 14.44.
 * Rounded up, because jsdom has no layout and cannot measure this itself — the
 * number is the reason the test can be written at all, so it is written down.
 */
const TWO_DIGITS = 15;

const aMajor = Chord.fromQuality(Note.parse('A'), 'major');

function voicingAt(baseFret: number): Voicing {
  return {
    shapeName: 'E-Form',
    baseFret,
    frets: [baseFret, baseFret + 2, baseFret + 2, baseFret + 1, baseFret, baseFret],
    isBarre: true,
  };
}

function diagram(baseFret: number) {
  const { container } = render(<ChordDiagram chord={aMajor} voicing={voicingAt(baseFret)} />);
  const svg = container.querySelector('svg')!;
  const label = container.querySelector('.base-fret')!;

  const [minX] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  return { text: label.textContent, x: Number(label.getAttribute('x')), minX };
}

describe('ChordDiagram — die Bundzahl', () => {
  it('lässt links Platz für zwei Ziffern', () => {
    /*
     * Der Bug: die Zahl ist rechtsbündig gesetzt, und der Rand war schmaler als
     * sie. Bei "10" begann die Bounding-Box bei x = -5,4, also außerhalb der
     * viewBox — sichtbar blieb die "0", und der Griff las sich als Barré im
     * nullten Bund. Unter dem 10. Bund passte alles, deshalb fiel es nie auf.
     */
    for (const baseFret of [10, 12, 15, 24]) {
      const { text, x, minX } = diagram(baseFret);

      expect(text).toBe(String(baseFret));
      expect(x - TWO_DIGITS, `Bund ${baseFret}`).toBeGreaterThanOrEqual(minX);
    }
  });

  it('zeigt einstellige Bünde weiterhin an derselben Stelle', () => {
    // Der Rand ist für beide gleich — eine 5 rutscht nicht, nur weil eine 10 passt.
    expect(diagram(5).x).toBe(diagram(10).x);
  });

  it('zeigt am Sattel keinen Bund, sondern den Sattel', () => {
    const { container } = render(
      <ChordDiagram
        chord={aMajor}
        voicing={{ shapeName: 'A-Form', baseFret: 0, frets: [-1, 0, 2, 2, 2, 0], isBarre: false }}
      />,
    );

    expect(container.querySelector('.base-fret')).toBeNull();
    expect(container.querySelector('.nut')).not.toBeNull();
  });
});
