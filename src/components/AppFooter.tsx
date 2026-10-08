import type { ThemeChoice } from '../hooks/useTheme';
import type { NeckOrientation, ViewPrefs } from '../hooks/useViewPrefs';

interface AppFooterProps {
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  prefs: ViewPrefs;
  onOrientationChange: (orientation: NeckOrientation) => void;
  onLeftyChange: (lefty: boolean) => void;
}

/**
 * The settings that are about the READER, not the music: colours, which hand
 * plays, how the neck lies on this screen. Kept on the device, never in the link —
 * see useTheme and useViewPrefs. Set once per device, so they cost the top of the
 * page nothing down here.
 */
export function AppFooter({
  theme,
  onThemeChange,
  prefs,
  onOrientationChange,
  onLeftyChange,
}: AppFooterProps) {
  return (
    <footer className="app-footer">
      <label className="field field--inline">
        <span>Hals</span>
        <select
          value={prefs.orientation}
          onChange={(e) => onOrientationChange(e.target.value as NeckOrientation)}
        >
          <option value="auto">Automatisch</option>
          <option value="horizontal">Waagerecht</option>
          <option value="vertical">Senkrecht</option>
        </select>
      </label>
      <label className="toggle footer-toggle">
        <input
          type="checkbox"
          checked={prefs.lefty}
          onChange={(e) => onLeftyChange(e.target.checked)}
        />
        <span>Linkshänder</span>
      </label>
      <label className="field field--inline">
        <span>Darstellung</span>
        <select value={theme} onChange={(e) => onThemeChange(e.target.value as ThemeChoice)}>
          <option value="system">Automatisch</option>
          <option value="light">Hell</option>
          <option value="dark">Dunkel</option>
        </select>
      </label>
    </footer>
  );
}
