import type { Timbre } from '../audio';
import { usePopover } from '../hooks/usePopover';
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

/** Everything this drawer sets — and so everything a preset writes. */
export interface SoundSettings {
  sound: Timbre;
  amp: AmpId;
  pickup: PickupId;
  tone: ToneGains;
  reverb: ReverbId;
  delay: DelayId;
}

const FLAT: ToneGains = { bass: 0, mid: 0, treble: 0 };

/**
 * Four starting points a player would name, instead of nine controls to combine.
 *
 * Each is a complete setting, so picking one twice gives the same sound twice. The
 * app is a map of the neck and not an amp simulator — so this is the level most
 * people should ever need, and the knobs sit one fold further down.
 *
 * „Clean" is exactly the app's default, so a fresh page shows it as selected.
 */
const SOUND_PRESETS: readonly { id: string; label: string; settings: SoundSettings }[] = [
  {
    id: 'clean',
    label: 'Clean',
    settings: { sound: 'clean', amp: 'american-clean', pickup: 'recorded', tone: FLAT, reverb: 'off', delay: 'off' },
  },
  {
    id: 'clean-hall',
    label: 'Clean mit Hall',
    settings: { sound: 'clean', amp: 'american-clean', pickup: 'neck', tone: FLAT, reverb: 'hall', delay: 'off' },
  },
  {
    id: 'crunch',
    label: 'Crunch',
    settings: { sound: 'electric', amp: 'british-crunch', pickup: 'bridge', tone: FLAT, reverb: 'room', delay: 'off' },
  },
  {
    id: 'rock',
    label: 'Rock',
    settings: {
      sound: 'electric',
      amp: 'modern-high-gain',
      pickup: 'neck',
      tone: { bass: 0, mid: 2, treble: 0 },
      reverb: 'room',
      delay: 'dotted8',
    },
  },
];

function sameTone(a: ToneGains, b: ToneGains): boolean {
  return a.bass === b.bass && a.mid === b.mid && a.treble === b.treble;
}

/**
 * The preset the current settings amount to, or null. The amplifier only counts
 * when it is heard: under the clean voice it is idle, and an idle choice must not
 * make „Clean" look unselected.
 */
function matchingPreset(current: SoundSettings): string | null {
  const match = SOUND_PRESETS.find(
    ({ settings }) =>
      settings.sound === current.sound &&
      (current.sound === 'clean' || settings.amp === current.amp) &&
      settings.pickup === current.pickup &&
      sameTone(settings.tone, current.tone) &&
      settings.reverb === current.reverb &&
      settings.delay === current.delay,
  );
  return match?.id ?? null;
}

interface SoundPanelProps extends SoundSettings {
  onSoundChange: (sound: Timbre) => void;
  /** Apply a preset — every setting at once, as one change. */
  onApplyPreset: (settings: SoundSettings) => void;
  onAmpChange: (amp: AmpId) => void;
  onPickupChange: (pickup: PickupId) => void;
  onToneChange: (tone: ToneGains) => void;
  onReverbChange: (reverb: ReverbId) => void;
  onDelayChange: (delay: DelayId) => void;
}

/**
 * Everything about how the guitar SOUNDS, in one drawer.
 *
 * Clean-or-overdrive used to sit in „Instrument" next door, on the grounds that it
 * decides whether there is an amplifier at all. A player does not think in signal
 * chains, though: they look for the sound under „Klang", and finding half of it
 * under „Instrument" was the one place the two drawers contradicted their own
 * names. Now „Instrument" is the instrument and „Klang" is the sound.
 */
export function SoundPanel({
  sound,
  amp,
  pickup,
  tone,
  reverb,
  delay,
  onSoundChange,
  onApplyPreset,
  onAmpChange,
  onPickupChange,
  onToneChange,
  onReverbChange,
  onDelayChange,
}: SoundPanelProps) {
  const { open, toggle, containerRef } = usePopover();
  const preset = matchingPreset({ sound, amp, pickup, tone, reverb, delay });

  // A preset is named as itself. Anything hand-made is summed up from what is
  // actually doing something — a room or an echo that is off is not worth a word.
  const summary =
    SOUND_PRESETS.find((entry) => entry.id === preset)?.label ??
    [
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
        aria-label="Klang"
        onClick={toggle}
      >
        <svg className="trigger-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 9.5v-3h2.2L7.4 4v8L4.2 9.5H2z" />
          <path d="M10.2 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.4a6.5 6.5 0 0 1 0 9.2" />
        </svg>
        <span className="trigger-label">Klang</span>
        <span className="trigger-value">{summary}</span>
        <span className="trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="popover setup-panel sound-panel">
          <div className="preset-grid" role="group" aria-label="Klang-Voreinstellung">
            {SOUND_PRESETS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="preset-button"
                aria-pressed={preset === entry.id}
                onClick={() => onApplyPreset(entry.settings)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {/* Everything the presets combine, for whoever wants to turn the knobs
              themselves. Shut by default: the four buttons are the answer for
              almost everyone, and nine controls at once were the problem. */}
          <details className="fine-tuning">
            <summary>Feinabstimmung</summary>

            <label className="field">
              <span>Verzerrung</span>
              <select value={sound} onChange={(e) => onSoundChange(e.target.value as Timbre)}>
                <option value="clean">Clean</option>
                <option value="electric">Overdrive</option>
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

            <label className="field">
              <span>Tonabnehmer</span>
              <select value={pickup} onChange={(e) => onPickupChange(e.target.value as PickupId)}>
                {PICKUP_LABELS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Sliders and not dropdowns: a tone control is turned, and a decibel is
                small enough that thirteen positions is a gesture rather than a list.
                Shown for both voices, because the stack sits on the finished sum —
                see src/synth/toneStack.ts. */}
            <div className="tone-stack" role="group" aria-label="Klangregelung">
              {TONE_LABELS.map((entry) => (
                <label className="tone-knob" key={entry.key}>
                  <span>
                    {entry.label}{' '}
                    <output>{tone[entry.key] > 0 ? `+${tone[entry.key]}` : tone[entry.key]}</output> dB
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
          </details>
        </div>
      ) : null}
    </div>
  );
}
