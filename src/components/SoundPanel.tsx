import { useEffect, useRef, useState } from 'react';
import type { Timbre } from '../audio';
import type { AmpId } from '../synth/amp';
import type { DelayId } from '../synth/delay';
import type { PickupId } from '../synth/pickup';
import type { ReverbId } from '../synth/reverb';
import { TONE_MAX_DB, type ToneGains } from '../synth/toneStack';

/**
 * The four amplifiers, named for what a player would recognise rather than for the
 * makes they are modelled on. src/synth/amp.ts carries the numbers.
 */
const AMP_LABELS: readonly { value: AmpId; label: string }[] = [
  { value: 'american-clean', label: 'American Clean' },
  { value: 'british-chime', label: 'British Chime' },
  { value: 'british-crunch', label: 'British Crunch' },
  { value: 'modern-high-gain', label: 'Modern High Gain' },
];

/**
 * The pickup positions.
 *
 * „Wie aufgenommen" is first and is the default, and the wording is the point: the
 * archtop in public/samples was recorded through a pickup, so the other two lean
 * that sound toward a neck or a bridge character rather than pretending to replace
 * a pickup that is not there to replace. src/synth/pickup.ts says why at length.
 */
const PICKUP_LABELS: readonly { value: PickupId; label: string }[] = [
  { value: 'recorded', label: 'wie aufgenommen' },
  { value: 'neck', label: 'Hals (Humbucker)' },
  { value: 'bridge', label: 'Steg (Single Coil)' },
];

const REVERB_LABELS: readonly { value: ReverbId; label: string }[] = [
  { value: 'off', label: 'aus' },
  { value: 'room', label: 'Raum' },
  { value: 'hall', label: 'Halle' },
];

const DELAY_LABELS: readonly { value: DelayId; label: string }[] = [
  { value: 'off', label: 'aus' },
  { value: 'quarter', label: 'Viertel' },
  { value: 'dotted8', label: 'Punktierte Achtel' },
];

const TONE_LABELS: readonly { key: keyof ToneGains; label: string }[] = [
  { key: 'bass', label: 'Bass' },
  { key: 'mid', label: 'Mitten' },
  { key: 'treble', label: 'Höhen' },
];

interface SoundPanelProps {
  sound: Timbre;
  amp: AmpId;
  pickup: PickupId;
  tone: ToneGains;
  reverb: ReverbId;
  delay: DelayId;
  onAmpChange: (amp: AmpId) => void;
  onPickupChange: (pickup: PickupId) => void;
  onToneChange: (tone: ToneGains) => void;
  onReverbChange: (reverb: ReverbId) => void;
  onDelayChange: (delay: DelayId) => void;
}

/**
 * Everything between the string and the speaker: the pickup, the amplifier, its
 * tone controls, and the room the whole thing is played in.
 *
 * A drawer of its own rather than four more rows in „Instrument", which would have
 * run to nine dropdowns behind one trigger. The split is not arbitrary either —
 * „Instrument" is what you set up once and leave (tuning, capo, how much neck to
 * show), and this is what you reach for while you are already playing.
 */
export function SoundPanel({
  sound,
  amp,
  pickup,
  tone,
  reverb,
  delay,
  onAmpChange,
  onPickupChange,
  onToneChange,
  onReverbChange,
  onDelayChange,
}: SoundPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Only what is actually doing something: the amplifier is idle on the clean
  // voice, and a room or an echo that is off is not worth a word in the summary.
  const summary = [
    sound === 'electric' ? AMP_LABELS.find((entry) => entry.value === amp)?.label : 'Clean',
    pickup === 'recorded' ? null : PICKUP_LABELS.find((entry) => entry.value === pickup)?.label,
    reverb === 'off' ? null : REVERB_LABELS.find((entry) => entry.value === reverb)?.label,
    delay === 'off' ? null : 'Delay',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="setup" ref={containerRef}>
      <button
        type="button"
        className={open ? 'trigger sound-trigger is-open' : 'trigger sound-trigger'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg className="trigger-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 9.5v-3h2.2L7.4 4v8L4.2 9.5H2z" />
          <path d="M10.2 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.4a6.5 6.5 0 0 1 0 9.2" />
        </svg>
        Klang
        <span className="trigger-value">{summary}</span>
        <span className="trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="popover setup-panel sound-panel">
          <label className="field">
            <span>Tonabnehmer</span>
            <select
              value={pickup}
              onChange={(e) => onPickupChange(e.target.value as PickupId)}
            >
              {PICKUP_LABELS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          {/* Clean never reaches the amplifier, so choosing one there would be a
              control that does nothing. */}
          {sound === 'electric' ? (
            <label className="field">
              <span>Verstärker</span>
              <select value={amp} onChange={(e) => onAmpChange(e.target.value as AmpId)}>
                {AMP_LABELS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {/* Sliders and not dropdowns: a tone control is turned, and a decibel is
              small enough that thirteen positions is a gesture rather than a list.
              Shown for both voices, because the stack sits on the finished sum —
              see src/synth/toneStack.ts. */}
          <div className="tone-stack" role="group" aria-label="Klangregelung">
            {TONE_LABELS.map((entry) => (
              <label className="tone-knob" key={entry.key}>
                <span>
                  {entry.label} <output>{tone[entry.key] > 0 ? `+${tone[entry.key]}` : tone[entry.key]}</output> dB
                </span>
                <input
                  type="range"
                  min={-TONE_MAX_DB}
                  max={TONE_MAX_DB}
                  step={1}
                  value={tone[entry.key]}
                  onChange={(e) => onToneChange({ ...tone, [entry.key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>

          <label className="field">
            <span>Hall</span>
            <select value={reverb} onChange={(e) => onReverbChange(e.target.value as ReverbId)}>
              {REVERB_LABELS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Delay</span>
            <select value={delay} onChange={(e) => onDelayChange(e.target.value as DelayId)}>
              {DELAY_LABELS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {/* The echo follows the transport rather than a millisecond setting, so
              moving the tempo slider moves it too. */}
          {delay === 'off' ? null : <p className="hint">Folgt dem Tempo der Akkordfolge.</p>}
        </div>
      ) : null}
    </div>
  );
}
