import './NeedsKey.css';

/** Keys worth one tap when there is none yet: where most people start. */
const QUICK_KEYS: readonly { root: string; scaleTypeId: string; label: string }[] = [
  { root: 'A', scaleTypeId: 'minor-pentatonic', label: 'A-Moll-Pentatonik' },
  { root: 'E', scaleTypeId: 'minor-pentatonic', label: 'E-Moll-Pentatonik' },
  { root: 'G', scaleTypeId: 'major', label: 'G-Dur' },
  { root: 'C', scaleTypeId: 'major', label: 'C-Dur' },
  { root: 'A', scaleTypeId: 'natural-minor', label: 'A-Moll' },
  { root: 'A', scaleTypeId: 'blues', label: 'A-Blues' },
];

interface NeedsKeyProps {
  /** What the sheet would show with a key — „Stufenakkorde", „eine Akkordfolge". */
  what: string;
  /** Set a key and stay right here, where the user wanted to go. */
  onQuickKey: (root: string, scaleTypeId: string) => void;
  /** The full choice: over to the key sheet. */
  onChooseKey: () => void;
}

/**
 * What the chord and progression sheets show before there is a key.
 *
 * They used to jump straight to the key sheet instead — the tab you tapped stayed
 * dark, another one lit up, and once a key was picked you were still not where
 * you set out to go. Now the sheet you asked for opens and says what it needs;
 * a quick key fills it in place.
 */
export function NeedsKey({ what, onQuickKey, onChooseKey }: NeedsKeyProps) {
  return (
    <div className="needs-key">
      <p className="needs-key-text">Für {what} braucht es eine Tonart.</p>
      <div className="needs-key-options" role="group" aria-label="Schnell eine Tonart">
        {QUICK_KEYS.map((entry) => (
          <button
            key={entry.label}
            type="button"
            className="needs-key-chip"
            onClick={() => onQuickKey(entry.root, entry.scaleTypeId)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <button type="button" className="link-button needs-key-more" onClick={onChooseKey}>
        Andere Tonart wählen …
      </button>
    </div>
  );
}
