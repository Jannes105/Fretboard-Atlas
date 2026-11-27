import { useEffect, useRef, useState } from 'react';
import { NoteText } from './NoteText';
import './InfoBar.css';

/** What the bar has to say — at most one thing at a time. */
export type Info =
  /** A progression is playing: which chord, and the way to stop it. */
  | { kind: 'playing'; chord: string; step: number; steps: number }
  /** A chord is picked out on the neck. */
  | { kind: 'chord'; roman: string; name: string; notes: string }
  /** A note (or a degree) is picked out: where else it lives. */
  | { kind: 'note'; label: string; places: number; hasUnison: boolean }
  /** The empty neck: the one thing worth knowing before the first tap. */
  | { kind: 'hint' };

interface InfoBarProps {
  info: Info | null;
  onClear: () => void;
  onStop: () => void;
}

/** Whether this page can and may animate the bar away. */
function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof Element === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return typeof Element.prototype.animate === 'function';
}

/** What makes one message a different one — a new chord, a new note, a new step. */
function messageKey(info: Info): string {
  switch (info.kind) {
    case 'playing':
      return `playing-${info.step}-${info.chord}`;
    case 'chord':
      return `chord-${info.name}`;
    case 'note':
      return `note-${info.label}`;
    default:
      return 'hint';
  }
}

/**
 * A pill floating above the bottom bar, saying what the neck is showing.
 *
 * It floats rather than taking a line on the page: the legend under the neck
 * used to push everything below it down whenever it appeared, and on a phone
 * it sat two screens below the dots it described. Its ✕ is the one way back
 * from a highlight — it replaces the „Hervorhebung aufheben" links that sat in
 * two places at once.
 *
 * It rises in, fades out with its last words still on it, and when what it says
 * changes, the words fade over rather than swap.
 */
export function InfoBar({ info: current, onClear, onStop }: InfoBarProps) {
  // The last thing said, kept while the bar fades out.
  const [last, setLast] = useState<Info | null>(current);
  if (current !== null && current !== last) setLast(current);
  if (current === null && last !== null && !canAnimate()) setLast(null);

  const ref = useRef<HTMLDivElement>(null);
  const leaving = current === null && last !== null;

  useEffect(() => {
    const el = ref.current;
    if (!leaving || !el || typeof el.animate !== 'function') return;
    const animation = el.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(8px)' },
      ],
      { duration: 150, easing: 'ease-in', fill: 'forwards' },
    );
    const done = () => setLast(null);
    animation.onfinish = done;
    // A page that draws no frames never finishes an animation; go anyway.
    const fallback = window.setTimeout(done, 300);
    return () => {
      window.clearTimeout(fallback);
      animation.cancel();
    };
  }, [leaving]);

  const info = current ?? last;

  return (
    <div className="info-bar-slot" aria-live="polite">
      {info ? (
        <div
          ref={ref}
          className={`info-bar info-bar--${info.kind}${leaving ? ' is-leaving' : ''}`}
        >
          {info.kind === 'playing' ? (
            <button
              type="button"
              className="info-bar-stop"
              onClick={onStop}
              aria-label="Akkordfolge stoppen"
            >
              ■
            </button>
          ) : null}

          <span key={messageKey(info)} className="info-bar-message">
            {info.kind === 'playing' ? (
              <>
                <strong className="info-bar-title">
                  <NoteText name={info.chord} />
                </strong>
                <span className="info-bar-text">
                  {info.step + 1} / {info.steps}
                </span>
              </>
            ) : info.kind === 'chord' ? (
              <>
                <strong className="info-bar-title">
                  <span className="info-bar-roman">{info.roman}</span>
                  <NoteText name={info.name} />
                </strong>
                <span className="info-bar-text">{info.notes}</span>
              </>
            ) : info.kind === 'note' ? (
              <>
                <strong className="info-bar-title">
                  <NoteText name={info.label} />
                </strong>
                <span className="info-bar-text">
                  {info.places} Stellen
                  {info.hasUnison ? (
                    <>
                      {' · '}
                      <span className="unison-mark" aria-hidden="true" /> genau diese Tonhöhe
                    </>
                  ) : null}
                </span>
              </>
            ) : (
              <span className="info-bar-text">
                Tippe einen Ton an – du hörst ihn und siehst jede Stelle.
              </span>
            )}
          </span>

          {info.kind === 'chord' || info.kind === 'note' ? (
            <button
              type="button"
              className="info-bar-clear"
              onClick={onClear}
              aria-label="Hervorhebung aufheben"
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
