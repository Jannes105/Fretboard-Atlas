import type { ThemeChoice } from '../hooks/useTheme';
import type { NeckOrientation, ViewPrefs } from '../hooks/useViewPrefs';
import './AppFooter.css';

interface AppFooterProps {
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  prefs: ViewPrefs;
  onOrientationChange: (orientation: NeckOrientation) => void;
  onLeftyChange: (lefty: boolean) => void;
}

const ORIENTATIONS: readonly { value: NeckOrientation; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'horizontal', label: 'Liegend' },
  { value: 'vertical', label: 'Hochkant' },
];

const THEMES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

/**
 * The settings that are about the READER, not the music: colours, which hand
 * plays, how the neck lies on this screen. Kept on the device, never in the link —
 * see useTheme and useViewPrefs.
 *
 * Three choices each, so each is a segmented control rather than a dropdown,
 * and the hand is a switch.
 */
export function AppFooter({
  theme,
  onThemeChange,
  prefs,
  onOrientationChange,
  onLeftyChange,
}: AppFooterProps) {
  return (
    <div className="option-rows app-footer">
      <div className="option-row">
        <span className="option-label">Ausrichtung</span>
        <div className="segmented" role="group" aria-label="Ausrichtung">
          {ORIENTATIONS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={prefs.orientation === entry.value}
              onClick={() => onOrientationChange(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="option-row">
        <span className="option-label">Farbschema</span>
        <div className="segmented" role="group" aria-label="Farbschema">
          {THEMES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={theme === entry.value}
              onClick={() => onThemeChange(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <label className="option-row switch-row footer-toggle">
        <span className="option-label">Linkshänder</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={prefs.lefty}
          onChange={(e) => onLeftyChange(e.target.checked)}
        />
      </label>
    </div>
  );
}
