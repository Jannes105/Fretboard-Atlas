import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import './AppShell.css';

/** A sheet's usual share of the screen — as `--sheet-max` says in the CSS. */
const SHEET_SHARE = 0.55;
/** Below this share, the space under the neck is too small to be worth keeping to. */
const MIN_SHARE = 0.3;
/** Air between the neck's last string and a sheet's top edge. */
const SHEET_GAP = 12;

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

  /*
   * How tall a sheet may rise. On a phone the upright neck is far longer than
   * the screen, so a sheet takes its usual share and the neck scrolls above it.
   * Lying down on a wide screen, the whole neck fits — and a sheet should stop
   * below it rather than cover its lowest strings.
   */
  const stageRef = useRef<HTMLElement>(null);
  const [sheetMax, setSheetMax] = useState<number | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const neck = stage.querySelector('.fretboard');
      if (!neck) return;
      const neckBottom = neck.getBoundingClientRect().bottom + window.scrollY;
      const tabs = document.querySelector('.bottom-tabs')?.getBoundingClientRect().height ?? 0;
      const free = window.innerHeight - tabs - neckBottom - SHEET_GAP;
      const usual = window.innerHeight * SHEET_SHARE;
      // Room enough below the neck: stay in it. Otherwise the neck scrolls anyway.
      setSheetMax(free >= window.innerHeight * MIN_SHARE ? Math.min(usual, free) : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const style = {
    '--shell-top-h': `${topHeight}px`,
    ...(sheetMax === null ? {} : { '--sheet-max': `${Math.round(sheetMax)}px` }),
  } as CSSProperties;

  return (
    <div className="app-shell" style={style}>
      <header ref={topRef} className="shell-top">
        {top}
      </header>
      <main ref={stageRef} className="shell-stage">
        {children}
      </main>
      {sheets}
      {tabs}
    </div>
  );
}
