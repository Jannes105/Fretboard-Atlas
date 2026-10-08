import type { KeyPickerTab } from './KeyPicker';

/** Keys worth one tap from the opening screen: where most people start. */
const QUICK_STARTS: readonly { root: string; scaleTypeId: string; label: string }[] = [
  { root: 'A', scaleTypeId: 'minor-pentatonic', label: 'A-Moll-Pentatonik' },
  { root: 'E', scaleTypeId: 'minor-pentatonic', label: 'E-Moll-Pentatonik' },
  { root: 'G', scaleTypeId: 'major', label: 'G-Dur' },
  { root: 'C', scaleTypeId: 'major', label: 'C-Dur' },
  { root: 'A', scaleTypeId: 'blues', label: 'A-Blues' },
];

interface StartScreenProps {
  onOpenKeyPicker: (tab: KeyPickerTab) => void;
  onQuickStart: (root: string, scaleTypeId: string) => void;
}

/**
 * The opening state, under the neck: three ways in, named by what someone came to
 * do, and a handful of keys one tap away.
 */
export function StartScreen({ onOpenKeyPicker, onQuickStart }: StartScreenProps) {
  return (
    <section className="empty start" aria-labelledby="start-heading">
      <h2 id="start-heading">Womit möchtest du anfangen?</h2>
      <div className="start-cards">
        <button type="button" className="start-card" onClick={() => onOpenKeyPicker('choose')}>
          <strong>Eine Tonart erkunden</strong>
          <span>Grundton und Skala wählen — Lagen, Akkorde und Akkordfolgen kommen dazu.</span>
        </button>
        <button type="button" className="start-card" onClick={() => onOpenKeyPicker('detect')}>
          <strong>Akkorde zu einem Song</strong>
          <span>Akkorde eintippen, die Tonart erkennen lassen und die Folge mitspielen.</span>
        </button>
        <div className="start-card start-card--note">
          <strong>Einen Ton finden</strong>
          <span>Tippe oben einen Ton an: du hörst ihn, und jede Stelle mit diesem Ton leuchtet auf.</span>
        </div>
      </div>
      <p className="quick-starts">
        <span>Schnellstart:</span>
        {QUICK_STARTS.map((entry) => (
          <button
            key={entry.label}
            type="button"
            className="quick-start"
            onClick={() => onQuickStart(entry.root, entry.scaleTypeId)}
          >
            {entry.label}
          </button>
        ))}
      </p>
    </section>
  );
}
