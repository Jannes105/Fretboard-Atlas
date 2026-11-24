import { type ReactNode, useEffect, useRef } from 'react';

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
 * Escape belongs to whatever is innermost: a popover inside the sheet (the
 * rhythm drawer, a grip picker) closes first, and only the next Escape closes
 * the sheet.
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
      if (ref.current?.querySelector('.popover')) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <section ref={ref} id={id} className="sheet" role="dialog" aria-label={title} tabIndex={-1}>
      <div className="sheet-head">
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
