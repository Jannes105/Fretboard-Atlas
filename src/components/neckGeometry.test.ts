import { describe, expect, it } from 'vitest';
import { neckLayout } from './neckGeometry';

/**
 * Die erste Geometrie-Prüfung im Projekt, und das mit Absicht: bei der Lagen-
 * Ansicht IST der Ausschnitt das Feature, nicht bloß Styling.
 *
 * Geprüft wird deshalb durchweg relational — „schmaler als", „weiter rechts als" —
 * und nie gegen die konkreten Pixelkonstanten. Die dürfen sich weiter ändern,
 * ohne dass hier etwas rot wird.
 */
function viewBoxOf(layout: { viewBox: string }): { x: number; width: number } {
  const [x, , width] = layout.viewBox.split(' ').map(Number);
  return { x, width };
}

const box1 = { startFret: 4, endFret: 8 };
const boxUpTheNeck = { startFret: 12, endFret: 16 };

describe('neckLayout — ganzer Hals', () => {
  it('beginnt am Nullpunkt und zeigt alle Bünde', () => {
    const full = neckLayout(24, 6);
    expect(viewBoxOf(full).x).toBe(0);
    expect(full.visibleFrets).toBe(24);
  });
});

describe('neckLayout — auf eine Lage beschnitten', () => {
  it('zeigt einen Ausschnitt statt des ganzen Halses', () => {
    const full = neckLayout(24, 6);
    const cropped = neckLayout(24, 6, box1);

    expect(viewBoxOf(cropped).width).toBeLessThan(viewBoxOf(full).width);
    expect(cropped.visibleFrets).toBeLessThan(full.visibleFrets);
  });

  it('lässt einen Bund Luft zu beiden Seiten der Lage', () => {
    // Die gedimmten Nachbarn sind ein Hinweis darauf, was knapp außerhalb liegt.
    const cropped = neckLayout(24, 6, box1);
    expect(cropped.visibleFrets).toBe(box1.endFret - box1.startFret + 3);
  });

  it('wandert mit der Lage den Hals hinauf', () => {
    const low = viewBoxOf(neckLayout(24, 6, box1));
    const high = viewBoxOf(neckLayout(24, 6, boxUpTheNeck));

    expect(high.x).toBeGreaterThan(low.x);
    // Gleich große Lage, gleich großer Ausschnitt — nur verschoben.
    expect(high.width).toBe(low.width);
  });

  it('hält links Platz für die Saitennamen frei', () => {
    // Sonst schnitte eine Lage am 12. Bund die Namen einfach ab: sie stehen
    // links neben dem Brett, nicht darauf.
    const cropped = neckLayout(24, 6, boxUpTheNeck);
    const view = viewBoxOf(cropped);

    expect(cropped.labelX).toBeGreaterThanOrEqual(view.x);
    expect(cropped.labelX).toBeLessThan(cropped.boardLeft);
  });

  it('schiebt das Brett nicht in den Rand hinein', () => {
    const cropped = neckLayout(24, 6, boxUpTheNeck);
    expect(cropped.boardLeft).toBeGreaterThan(viewBoxOf(cropped).x);
  });

  it('läuft an den Enden des Halses nicht über', () => {
    const full = neckLayout(12, 6);
    // Eine Lage, die bis an den letzten Bund reicht.
    const atTheEnd = neckLayout(12, 6, { startFret: 9, endFret: 12 });
    const view = viewBoxOf(atTheEnd);

    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.x + view.width).toBeLessThanOrEqual(full.width);
  });

  it('kommt mit einer Lage am Nullbund zurecht', () => {
    const openPosition = neckLayout(24, 6, { startFret: 0, endFret: 4 });
    expect(viewBoxOf(openPosition).x).toBeGreaterThanOrEqual(0);
  });
});
