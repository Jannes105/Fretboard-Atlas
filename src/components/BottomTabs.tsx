import './BottomTabs.css';

export type SheetId = 'key' | 'chords' | 'progression' | 'view';

interface BottomTabsProps {
  open: SheetId | null;
  onSelect: (sheet: SheetId) => void;
  /** A progression is playing — the tab says so while its sheet is shut. */
  playing: boolean;
}

const TABS: readonly { id: SheetId; label: string; icon: string }[] = [
  // A tuning fork's two tines: the key.
  { id: 'key', label: 'Tonart', icon: 'M6 2v6a2 2 0 0 0 4 0V2M8 10v4' },
  // Three stacked notes: a chord.
  { id: 'chords', label: 'Akkorde', icon: 'M4 4h8M4 8h8M4 12h8' },
  // Steps in a row: a progression.
  { id: 'progression', label: 'Folge', icon: 'M2 12h3V9h3V6h3V3h3' },
  // An eye: how the neck is drawn.
  {
    id: 'view',
    label: 'Ansicht',
    icon: 'M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  },
];

/**
 * The four ways into everything that is not the neck, at the bottom of the
 * screen where the thumb already is. Finding a note needs none of them — that is
 * a tap on the neck.
 */
export function BottomTabs({ open, onSelect, playing }: BottomTabsProps) {
  return (
    <nav className="bottom-tabs" aria-label="Bereiche">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={[
            'bottom-tab',
            tab.id === 'progression' && playing ? 'is-playing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={open === tab.id}
          aria-controls={`sheet-${tab.id}`}
          onClick={() => onSelect(tab.id)}
        >
          <svg className="bottom-tab-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d={tab.icon} />
          </svg>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
