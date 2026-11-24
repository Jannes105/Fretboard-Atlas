import type { ReactNode } from 'react';
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
  return (
    <div className="app-shell">
      <header className="shell-top">{top}</header>
      <main className="shell-stage">{children}</main>
      {sheets}
      {tabs}
    </div>
  );
}
