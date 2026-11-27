import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import './Sheet.css';

/** How far the head must be pulled down for letting go to close the sheet. */
const CLOSE_DISTANCE = 72;

/** Moved less than this, a touch on the head was a tap, not a pull. */
const TAP_SLOP = 6;

/** How long the sheet takes to drop away. Rising takes a little longer, in CSS. */
const CLOSE_MS = 200;

/** Whether this page can and may animate the sheet away. */
function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof Element === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return typeof Element.prototype.animate === 'function';
}

interface SheetProps {
  /**
   * Which sheet is showing — the tab that opens it points at `sheet-<id>` with
   * aria-controls. Null only before any sheet has been opened.
   */
  id: string | null;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * Shrunk to a strip: what the sheet shows instead of its contents while the
   * neck above is what matters — after a chord or a tone was picked in it.
   * Null when the sheet is shown in full.
   */
  peek?: ReactNode;
  /** Back from the strip to the whole sheet. */
  onExpand?: () => void;
}

/**
 * The panel that rises from the bottom bar and leaves the top of the screen to
 * the neck. One frame for all four sheets: switching tabs keeps it in place and
 * only its contents change, fading in, while its height follows them smoothly.
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
 *
 * Closing lets it drop away before it leaves the page; the caller keeps handing
 * in the contents it had until then.
 *
 * With a `peek`, it shrinks to a strip — its head and that one row — so the
 * neck above shows what was just picked; „Mehr" brings the rest back.
 */
export function Sheet({ id, title, open, onClose, children, peek = null, onExpand }: SheetProps) {
  const compact = peek !== null;
  const ref = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Read at keypress time, so a new closure from the parent does not re-run the
  // effect — which would pull the focus back to the sheet on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // On the page: while open, and while dropping away after.
  const [present, setPresent] = useState(open);
  // How far the head has been pulled down, while a finger is on it — and, after
  // a pull that closed it, where the drop starts from.
  const [pull, setPull] = useState<number | null>(null);

  if (open && !present) setPresent(true);
  // Nothing to animate with (or the reader asked for no motion): just go.
  if (!open && present && !canAnimate()) {
    setPresent(false);
    setPull(null);
  }

  useEffect(() => {
    if (open || !present) return;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const from = `translateY(${pull ?? 0}px)`;
    const animation = el.animate([{ transform: from }, { transform: 'translateY(105%)' }], {
      duration: CLOSE_MS,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'forwards',
    });
    const done = () => {
      setPresent(false);
      setPull(null);
    };
    animation.onfinish = done;
    // A page that draws no frames (a hidden tab) never finishes an animation;
    // the sheet must still go.
    const fallback = window.setTimeout(done, CLOSE_MS + 150);
    return () => {
      window.clearTimeout(fallback);
      animation.cancel();
    };
    // `pull` is only where the drop starts; changing it must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present]);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, id]);

  /*
   * The frame's height, measured from what is in it, so a change — another
   * sheet, a grip appearing, a fold opening — can glide instead of jump. CSS
   * still caps it, and the body scrolls past the cap.
   */
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const head = headRef.current;
    const content = contentRef.current;
    if (!present || !head || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      // +1 for the frame's top border.
      setHeight(head.offsetHeight + content.offsetHeight + 1),
    );
    observer.observe(head);
    observer.observe(content);
    return () => observer.disconnect();
  }, [present, id, compact]);

  const startY = useRef(0);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!open) return;
    // The „Fertig" button is a button, not a handle.
    if ((event.target as HTMLElement).closest('button')) return;
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPull(0);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pull === null || !open) return;
    setPull(Math.max(0, event.clientY - startY.current));
  };

  const onPointerEnd = () => {
    if (pull === null || !open) return;
    if (pull > CLOSE_DISTANCE) {
      // Keep the pull: the drop continues from where the finger let go.
      onClose();
      return;
    }
    // A tap on the head of a strip, not a pull: open it up again.
    if (pull < TAP_SLOP && compact) onExpand?.();
    setPull(null);
  };

  if (!present) return null;

  return (
    <section
      ref={ref}
      id={id ? `sheet-${id}` : undefined}
      className={[
        'sheet',
        compact ? 'is-compact' : '',
        pull === null ? '' : 'is-pulled',
        open ? '' : 'is-closing',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        height: height ?? undefined,
        transform: pull ? `translateY(${pull}px)` : undefined,
      }}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
    >
      <div
        ref={headRef}
        className="sheet-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{title}</h2>
        {compact && onExpand ? (
          <button
            type="button"
            className="sheet-expand"
            aria-expanded={false}
            aria-label={`${title} ganz zeigen`}
            onClick={onExpand}
          >
            Mehr ▴
          </button>
        ) : null}
        <button type="button" className="sheet-done" onClick={onClose}>
          Fertig
        </button>
      </div>
      <div className="sheet-body">
        {/* Keyed by sheet, so a new one fades in rather than swapping in place. */}
        <div
          key={`${id ?? 'none'}${compact ? '-peek' : ''}`}
          ref={contentRef}
          className="sheet-content"
        >
          {compact ? peek : children}
        </div>
      </div>
    </section>
  );
}
