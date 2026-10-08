import { useEffect, useState } from 'react';
import type { Spelling } from '../components/FretboardView';
import { NARROW_VIEWPORT } from '../urlState';

/** How the neck lies: across the page, down it, or whichever suits the screen. */
export type NeckOrientation = 'auto' | 'horizontal' | 'vertical';

export interface ViewPrefs {
  /** Mirror the neck, nut on the right — a left-handed guitar seen from the front. */
  lefty: boolean;
  orientation: NeckOrientation;
  /** ♯ or ♭ for black keys, where no key spells them. */
  spelling: Spelling;
}

const STORAGE_KEY = 'fretboard:view';
const DEFAULTS: ViewPrefs = { lefty: false, orientation: 'auto', spelling: 'sharp' };

function read(): ViewPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    return {
      lefty: parsed.lefty === true,
      orientation:
        parsed.orientation === 'horizontal' || parsed.orientation === 'vertical'
          ? parsed.orientation
          : 'auto',
      spelling: parsed.spelling === 'flat' ? 'flat' : 'sharp',
    };
  } catch {
    return DEFAULTS;
  }
}

/** Whether the viewport is phone-narrow, tracked live — a phone gets turned. */
function useNarrow(): boolean {
  const query = `(max-width: ${NARROW_VIEWPORT - 1}px)`;
  const [narrow, setNarrow] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setNarrow(list.matches);
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, [query]);

  return narrow;
}

/**
 * Preferences about the READER, kept on the device — like the theme, and for the
 * same reason: a link carries the music, not the hands or the screen of whoever
 * sent it. A left-handed player sharing a scale must not mirror it for the
 * right-handed friend who opens it.
 *
 * `vertical` is what the neck resolves to right now: an explicit choice, or under
 * „auto" the phone's narrow screen. Upright, a phone holds all twelve frets at a
 * readable size instead of five and a swipe.
 */
export function useViewPrefs() {
  const [prefs, setPrefs] = useState<ViewPrefs>(read);
  const narrow = useNarrow();

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Then the choice simply does not survive a reload.
    }
  }, [prefs]);

  const vertical = prefs.orientation === 'vertical' || (prefs.orientation === 'auto' && narrow);

  return {
    prefs,
    vertical,
    setLefty: (lefty: boolean) => setPrefs((previous) => ({ ...previous, lefty })),
    setOrientation: (orientation: NeckOrientation) =>
      setPrefs((previous) => ({ ...previous, orientation })),
    setSpelling: (spelling: Spelling) => setPrefs((previous) => ({ ...previous, spelling })),
  };
}
