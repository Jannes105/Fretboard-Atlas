import { useEffect, useState } from 'react';

/** Follow the OS, or override it in one direction. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'fretboard:theme';

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

function isChoice(value: string | null): value is ThemeChoice {
  return value !== null && (CHOICES as readonly string[]).includes(value);
}

/**
 * A theme is the only setting that does NOT go in the URL.
 *
 * Everything else in AppState describes the instrument or the music, and lives in
 * the query string precisely so a link carries it. A theme describes the reader's
 * eyes: `?theme=dark` would impose the sender's preference on someone else's phone
 * in bright sun. So it stays on the device — and, unlike the URL state, it has a
 * third value, "whatever the OS says", which is the default.
 */
export function useTheme(): { theme: ThemeChoice; setTheme: (next: ThemeChoice) => void } {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return isChoice(stored) ? stored : 'system';
    } catch {
      // Safari in private mode throws on access. A colour is not worth dying over.
      return 'system';
    }
  });

  useEffect(() => {
    const root = document.documentElement;

    // No attribute at all means the media query decides — the original behaviour.
    if (theme === 'system') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }

    try {
      if (theme === 'system') {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, theme);
      }
    } catch {
      // Then the choice simply does not survive a reload.
    }
  }, [theme]);

  return { theme, setTheme };
}
