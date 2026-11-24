import { NoteText } from './NoteText';

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

/**
 * A pill floating above the bottom bar, saying what the neck is showing.
 *
 * It floats rather than taking a line on the page: the legend under the neck
 * used to push everything below it down whenever it appeared, and on a phone
 * it sat two screens below the dots it described. Its ✕ is the one way back
 * from a highlight — it replaces the „Hervorhebung aufheben" links that sat in
 * two places at once.
 */
export function InfoBar({ info, onClear, onStop }: InfoBarProps) {
  return (
    <div className="info-bar-slot" aria-live="polite">
      {info ? (
        <div className={`info-bar info-bar--${info.kind}`}>
          {info.kind === 'playing' ? (
            <>
              <button
                type="button"
                className="info-bar-stop"
                onClick={onStop}
                aria-label="Akkordfolge stoppen"
              >
                ■
              </button>
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
