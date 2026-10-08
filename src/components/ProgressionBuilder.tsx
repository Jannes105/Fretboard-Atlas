import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { Chord } from '../theory';
import type { CustomStep } from '../urlState';
import { NoteText } from './NoteText';
import './ProgressionBuilder.css';

/** One chord may be held up to this many bars. */
const MAX_BARS = 4;

interface ProgressionBuilderProps {
  /** The current sequence: each chord and how many bars it is held. */
  steps: readonly CustomStep[];
  onChange: (steps: CustomStep[]) => void;
}

/** The sequence with one chord moved from one place to another. */
function moved(steps: readonly CustomStep[], from: number, to: number): CustomStep[] {
  const next = [...steps];
  const [step] = next.splice(from, 1);
  next.splice(to, 0, step);
  return next;
}

const sameSteps = (a: readonly CustomStep[], b: readonly CustomStep[]) =>
  a.length === b.length && a.every((step, i) => step.symbol === b[i].symbol && step.bars === b[i].bars);

/**
 * The sequence itself: chips that can be dragged into a new order, with their bar
 * counts, plus a field for anything the vocabulary knows (power chords,
 * suspensions, slash chords). The diatonic chords are added from their cards
 * above — they are not drawn twice.
 */
export function ProgressionBuilder({ steps, onChange }: ProgressionBuilderProps) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * The way back from a removal or „Leeren". Kept with the sequence it produced,
   * and offered only while that is still what is on screen — once anything else
   * has changed it (a „+" on a chord card, say), undoing would throw that away too.
   */
  const [undo, setUndo] = useState<{ before: CustomStep[]; after: CustomStep[]; what: string } | null>(
    null,
  );
  const canUndo = undo !== null && sameSteps(undo.after, steps);

  /**
   * Which chip is being dragged, if any. Twice: the ref is what the pointer
   * handlers read, because a quick flick sends its first move before React has
   * re-rendered with the new state; the state is what the chip is drawn from.
   */
  const [dragging, setDraggingState] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const setDragging = (index: number | null) => {
    dragRef.current = index;
    setDraggingState(index);
  };

  const add = (symbol: string) => onChange([...steps, { symbol, bars: 1 }]);

  const addTyped = () => {
    const text = typed.trim();
    if (text === '') return;
    try {
      // Normalise through the parser, so "e5" becomes "E5" and junk is caught here.
      add(Chord.parse(text).name());
      setTyped('');
      setError(null);
    } catch {
      setError(`„${text}" ist kein Akkord, den ich kenne.`);
    }
  };

  const destructive = (next: CustomStep[], what: string) => {
    setUndo({ before: [...steps], after: next, what });
    onChange(next);
  };

  const removeAt = (index: number) =>
    destructive(
      steps.filter((_, i) => i !== index),
      `${steps[index].symbol} entfernt`,
    );

  // Click cycles the bar count 1 → 2 → 3 → 4 → 1.
  const cycleBars = (index: number) =>
    onChange(
      steps.map((step, i) => (i === index ? { ...step, bars: (step.bars % MAX_BARS) + 1 } : step)),
    );

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || to === from) return;
    onChange(moved(steps, from, to));
  };

  // ---- Dragging: pointer events, so a finger works as well as a mouse ----

  const onHandleDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    setDragging(index);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // No active pointer — the drag simply ends at the first move.
    }
  };

  const onHandleMove = (event: PointerEvent<HTMLButtonElement>) => {
    const from = dragRef.current;
    if (from === null || typeof document.elementFromPoint !== 'function') return;
    // Whichever chip is under the finger right now is where the dragged one goes.
    const under = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.builder-chip');
    const target = under ? Number(under.dataset.index) : NaN;
    if (Number.isInteger(target) && target !== from) {
      onChange(moved(steps, from, target));
      setDragging(target);
    }
  };

  const endDrag = () => setDragging(null);

  // The same, by keyboard: arrows move the focused chord one place.
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo(index, index - 1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveTo(index, index + 1);
    }
  };

  return (
    <div className="builder">
      <div className="builder-sequence" aria-label="Deine Akkordfolge">
        {steps.length === 0 ? (
          <span className="builder-empty">Noch leer — tippe Akkorde an oder gib welche ein.</span>
        ) : (
          steps.map((step, i) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={`${step.symbol}#${i}`}
              className={dragging === i ? 'builder-chip is-dragging' : 'builder-chip'}
              data-index={i}
            >
              <button
                type="button"
                className="builder-handle"
                aria-label={`${step.symbol} verschieben — ziehen oder Pfeiltasten`}
                title="Ziehen zum Umsortieren"
                onPointerDown={(event) => onHandleDown(event, i)}
                onPointerMove={onHandleMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
                onKeyDown={(event) => onHandleKey(event, i)}
              >
                <span className="builder-grip" aria-hidden="true">
                  ⠿
                </span>
                <NoteText name={step.symbol} />
              </button>
              <button
                type="button"
                className="builder-bars"
                onClick={() => cycleBars(i)}
                aria-label={`${step.symbol}: Länge ${step.bars} ${step.bars === 1 ? 'Takt' : 'Takte'}`}
                title="Länge in Takten"
              >
                {step.bars}×
              </button>
              <button
                type="button"
                className="builder-remove"
                onClick={() => removeAt(i)}
                aria-label={`${step.symbol} entfernen`}
              >
                ×
              </button>
            </span>
          ))
        )}

        {steps.length > 0 ? (
          <button
            type="button"
            className="builder-clear"
            onClick={() => destructive([], 'Folge geleert')}
          >
            Leeren
          </button>
        ) : null}
      </div>

      {canUndo ? (
        <p className="builder-undo" role="status">
          {undo.what}.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onChange(undo.before);
              setUndo(null);
            }}
          >
            Rückgängig
          </button>
        </p>
      ) : null}

      <div className="builder-add">
        <form
          className="builder-type"
          onSubmit={(event) => {
            event.preventDefault();
            addTyped();
          }}
        >
          <input
            type="text"
            value={typed}
            placeholder="z. B. E5, Dsus4"
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Akkord eingeben"
          />
          <button type="submit" className="builder-type-add">
            Hinzufügen
          </button>
        </form>
      </div>

      {error ? <p className="builder-error">{error}</p> : null}
    </div>
  );
}
