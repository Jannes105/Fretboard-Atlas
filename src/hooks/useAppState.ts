import { useEffect, useState } from 'react';
import { type AppState, initialState, writeState } from '../urlState';

export interface AppStateHandle {
  state: AppState;
  /** Set one field. */
  update: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  /** Set several at once, where one change implies another. */
  patch: (next: (previous: AppState) => AppState) => void;
}

/**
 * The whole app's state, kept in the URL.
 *
 * One object rather than a dozen useStates: it is exactly what goes in the query
 * string, so persisting it is a single effect instead of a dozen — and a reload or
 * a shared link restores the view exactly.
 */
export function useAppState(): AppStateHandle {
  // Seeded once, at mount: a phone starts on twelve frets unless the link says
  // otherwise. Deliberately not repeated on resize — that would overrule a choice
  // the user made, every time they rotate the device.
  const [state, setState] = useState<AppState>(() =>
    initialState(window.location.search, window.innerWidth),
  );

  // Replace rather than push, so the back button does not walk through every
  // twiddle of a dropdown.
  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${writeState(state)}`);
  }, [state]);

  const update = <K extends keyof AppState>(key: K, value: AppState[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  return { state, update, patch: setState };
}
