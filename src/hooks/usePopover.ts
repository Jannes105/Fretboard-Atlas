import { type RefObject, useEffect, useRef, useState } from 'react';

export interface PopoverHandle<T extends HTMLElement> {
  open: boolean;
  setOpen: (next: boolean | ((previous: boolean) => boolean)) => void;
  toggle: () => void;
  /** Hang this on the element that holds BOTH the trigger and the panel. */
  containerRef: RefObject<T | null>;
}

/**
 * One popover: open, closed, and the two ways out — Escape, and a press anywhere
 * outside it.
 *
 * Four components carried their own copy of this, line for line. One copy means
 * one place to get it right, and it was not quite right: the outside press
 * listened for `mousedown`, which a pen and some touch browsers deliver late or not
 * at all. `pointerdown` covers mouse, touch and pen alike.
 *
 * The outside press only CLOSES this popover — it is not swallowed, so the button
 * under it still gets its click. Opening a second popover is therefore one click,
 * not two.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>(): PopoverHandle<T> {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (event: Event) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onDown);
    // jsdom and older browsers fire mouse events without pointer events.
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, toggle: () => setOpen((value) => !value), containerRef };
}
