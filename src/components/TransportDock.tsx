import { type RefObject, useEffect, useState } from 'react';
import type { ProgressionStep } from '../theory';
import { NoteText } from './NoteText';

interface TransportDockProps {
  /** The full transport in the progression panel. The dock shows while it is not. */
  anchor: RefObject<HTMLElement | null>;
  steps: readonly ProgressionStep[];
  isPlaying: boolean;
  playingStep: number | null;
  bpm: number;
  onToggle: () => void;
}

/**
 * Play and stop, pinned to the bottom of the window.
 *
 * The marker that walks the neck while a progression plays is the app's best
 * idea — and on a laptop you could never watch it: the play button sat a whole
 * screen below the neck, so you saw either the control or the picture. The dock
 * appears whenever the real transport has scrolled out of sight, and only then,
 * so there are never two play buttons on screen at once.
 */
export function TransportDock({
  anchor,
  steps,
  isPlaying,
  playingStep,
  bpm,
  onToggle,
}: TransportDockProps) {
  const [anchorVisible, setAnchorVisible] = useState(true);

  useEffect(() => {
    const el = anchor.current;
    // jsdom has no IntersectionObserver; there the dock simply never shows.
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setAnchorVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor, steps.length]);

  // Leave room at the foot of the page, so the dock never covers the last of it.
  const shown = !anchorVisible && steps.length > 0;
  useEffect(() => {
    document.body.classList.toggle('has-dock', shown);
    return () => document.body.classList.remove('has-dock');
  }, [shown]);

  if (!shown) return null;

  return (
    <div className="transport-dock" role="region" aria-label="Wiedergabe">
      <button
        type="button"
        className={isPlaying ? 'play-button is-playing' : 'play-button'}
        onClick={onToggle}
        aria-label={isPlaying ? 'Akkordfolge stoppen' : 'Akkordfolge abspielen'}
      >
        {isPlaying ? '■' : '▶'}
      </button>
      <ol className="dock-chords">
        {steps.map((step, i) => (
          <li
            // Steps repeat chords, so the index is part of the identity.
            // eslint-disable-next-line react/no-array-index-key
            key={`${step.chord.name()}#${i}`}
            className={playingStep === i ? 'is-playing' : undefined}
          >
            <NoteText name={step.chord.name()} />
          </li>
        ))}
      </ol>
      <span className="dock-tempo">{bpm} BPM</span>
    </div>
  );
}
