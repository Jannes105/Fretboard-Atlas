import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import './AppShell.css';

interface AppShellProps {
  /** The bar at the top: the key, and with a key the positions. */
  top: ReactNode;
  /** The stage: the neck and what explains it. */
  children: ReactNode;
  /** The sheets; at most one of them renders. */
  sheets: ReactNode;
  /** The bar at the bottom. */
  tabs: ReactNode;
}

/**
 * The frame of the app on every screen: a bar on top, the neck in the middle,
 * the tabs at the bottom, and a sheet that rises from them over the lower part
 * of the neck.
 *
 * The page itself scrolls, not a box inside it: the top bar sticks and the
 * bottom bar is fixed, so the phone's own scrolling — and its address bar
 * folding away — keeps working.
 */
export function AppShell({ top, children, sheets, tabs }: AppShellProps) {
  // The top bar's height, for whatever sticks below it (the neck's string names).
  // It changes: the positions row comes and goes with the key.
  const topRef = useRef<HTMLElement>(null);
  const [topHeight, setTopHeight] = useState(0);

  useEffect(() => {
    const el = topRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setTopHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell" style={{ '--shell-top-h': `${topHeight}px` } as CSSProperties}>
      <header ref={topRef} className="shell-top">
        {top}
      </header>
      <main className="shell-stage">{children}</main>
      {sheets}
      {tabs}
    </div>
  );
}
