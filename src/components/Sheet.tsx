import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import './Sheet.css';

/** How far the head must be pulled down for letting go to close the sheet. */
const CLOSE_DISTANCE = 72;

interface SheetProps {
  /** The tab that opens it points here with aria-controls. */
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A panel that rises from the bottom bar and leaves the top of the screen to the
 * neck.
 *
 * Not modal, on purpose: the neck above stays live. Pick a chord in here and you
 * want to see it there, tap a note there and hear it — a modal sheet would make
 * the one thing worth looking at inert. For the same reason a tap on the neck
 * does not close it; Escape, „Fertig" and the tab that opened it do.
 *
 * Escape closes it — and only it: a highlight on the neck survives, and the next
 * Escape clears that.
 *
 * The head can be pulled down: past a short distance, letting go closes the
 * sheet; short of it, the sheet springs back. Only the head, so scrolling the
 * body never turns into closing.
 */
export function Sheet({ id, title, open, onClose, children }: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  // Read at keypress time, so a new closure from the parent does not re-run the
  // effect — which would pull the focus back to the sheet on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    ref.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // How far the head has been pulled down, while a finger is on it.
  const [pull, setPull] = useState<number | null>(null);
  const startY = useRef(0);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // The „Fertig" button is a button, not a handle.
    if ((event.target as HTMLElement).closest('button')) return;
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPull(0);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pull === null) return;
    setPull(Math.max(0, event.clientY - startY.current));
  };

  const onPointerEnd = () => {
    if (pull === null) return;
    const far = pull > CLOSE_DISTANCE;
    setPull(null);
    if (far) onClose();
  };

  if (!open) return null;

  return (
    <section
      ref={ref}
      id={id}
      className={pull === null ? 'sheet' : 'sheet is-pulled'}
      style={pull ? { transform: `translateY(${pull}px)` } : undefined}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
    >
      <div
        className="sheet-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{title}</h2>
        <button type="button" className="sheet-done" onClick={onClose}>
          Fertig
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
