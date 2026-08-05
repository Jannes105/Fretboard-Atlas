# Effektpedale

Geordnet nach der Reihenfolge, in der sie in der Kette stehen — das ist auch die
Reihenfolge, in der man sie in einem Audiograph verdrahten würde.

## 1. Die Signalkette

```
Gitarre → Tuner → Filter (Wah) → Dynamik (Comp) → Gain (OD/Dist/Fuzz)
        → EQ/Boost → Modulation (Chorus/Phaser/Flanger) → Zeit (Delay)
        → Raum (Reverb) → Amp
```

**Die Regel dahinter:** Effekte, die auf die *Hüllkurve* reagieren (Wah,
Kompressor, Autofilter), brauchen das unbearbeitete Signal. Effekte, die den
Klang *verzerren*, wollen ein sauberes Eingangssignal, weil Verzerrung alles
danach mit-verzerrt. Effekte, die *Kopien* erzeugen (Delay, Reverb), wollen die
fertige Stimme kopieren, nicht eine halbfertige.

**Zwei häufige Ausnahmen, beide mit gutem Grund:**
- **Fuzz zuerst, direkt an die Gitarre.** Ein Germanium-Fuzz hat eine sehr
  niedrige Eingangsimpedanz und lebt vom direkten Zusammenspiel mit dem Pickup
  und dem Volume-Poti. Hinter einem Buffer klingt es kaputt.
- **Delay und Reverb in den Effektweg (FX Loop)** des Amps, also *nach* der
  Vorstufenverzerrung. Vor dem Amp würde die Vorstufe die Hallfahne mitverzerren
  — matschig.

**Boost vor oder nach dem Drive?** Davor: mehr Verzerrung. Danach: mehr
Lautstärke, gleiche Verzerrung. Beides üblich, unterschiedliche Absicht.

## 2. Gain: die drei Familien

Der Unterschied ist die **Kennlinie und wo geclippt wird**, nicht die Menge.

| | Overdrive | Distortion | Fuzz |
| --- | --- | --- | --- |
| Clipping | weich, **soft** | härter | **hart**, fast Rechteck |
| Ort | Dioden in der **Gegenkopplung** des OpAmps | Dioden gegen **Masse** | Transistoren in Sättigung |
| Verhalten | räumt bei zurückgedrehtem Volume-Poti auf | bleibt dreckig | fällt auseinander (gewollt) |
| Klang | "der Amp lauter" | eigener Charakter | eigenes Instrument |

**Soft vs. hard clipping als Formel:**
- soft: `tanh(g·x)` oder `x - x³/3` mit Begrenzung — stetige Ableitung, wenig
  hohe Harmonische
- hard: `clamp(g·x, -1, 1)` — Knick, sehr viele hohe Harmonische, braucht
  Oversampling gegen Aliasing
- asymmetrisch: Offset vor der Kennlinie erzeugt **geradzahlige** Harmonische =
  "Wärme". Genau das macht `AMP.bias` in `src/synth/amp.ts`.

### Ibanez Tube Screamer TS808 — gemessene Werte

Das meistkopierte Overdrive-Pedal, und weil es so gut dokumentiert ist, die beste
Vorlage für eine Nachbildung.

| Parameter | Wert |
| --- | --- |
| Eingangs-/Ausgangsbuffer | Emitterfolger, Verstärkung ≈ 1 |
| Eingangsimpedanz | 446 kΩ |
| Ausgangsimpedanz | 1,2 kΩ |
| Verstärkung Clipping-Stufe | 12 … 118 (Drive-Poti 500 kΩ … 0 Ω) |
| **Hochpass in der Gegenkopplung** | **720 Hz** (R4 = 4,7 kΩ, C3 = 0,047 µF) |
| **Passiver Tiefpass danach** | **723 Hz** (R7 = 1 kΩ, C5 = 0,22 µF), 20 dB/Dekade |
| Kondensator über den Dioden | 51 pF → 12,5 kHz bei vollem Drive |
| Dioden | 1N4148/1N914, symmetrisch, ~1 V Schwelle |
| Tone-Poti | 20 kΩ linear, Höhen-Seite ≈ Hochpass bei 3,2 kHz |

**Warum es so klingt.** Unter 720 Hz bekommt das Signal *weniger* Verstärkung und
wird deshalb *weniger* verzerrt — der Bass bleibt sauber. Darüber greift der
passive Tiefpass bei praktisch derselben Frequenz. Zwei Filter an nahezu
identischer Stelle, einer vor und einer nach dem Clipping: das ist der berühmte
**Mittenbuckel um 700–800 Hz**, und der Grund, warum ein Tube Screamer einen
High-Gain-Amp "strafft" statt ihn lauter zu machen.

Für die App interessant, weil `AMP.tight` (Low-Shelf −8 dB bei 180 Hz) genau
dasselbe Problem auf andere Weise löst.

### Electro-Harmonix Big Muff Pi

Vier Verstärkerstufen hintereinander, zwei davon mit Dioden-Clipping, dazwischen
**Miller-Kapazitäten, die dreimal um 1,2 kHz filtern**. Der passive Tone-Regler
mischt einen Hoch- und einen Tiefpass so, dass in Mittelstellung eine **Kerbe bei
1 kHz** entsteht. Die Ausgangsstufe gibt ca. **13 dB** zurück, die der passive
Tone-Regler geschluckt hat.

Der Mitten-Scoop ist das genaue Gegenteil des Tube Screamers — deshalb geht ein
Big Muff im Bandkontext unter, wo ein TS durchsetzt.

### Weitere Klassiker in Stichworten

- **Fuzz Face** — zwei Transistoren, Germanium (weich, temperaturabhängig) oder
  Silizium (härter). Niedrige Eingangsimpedanz ist ein Feature.
- **ProCo RAT** — LM308-OpAmp, Dioden gegen Masse, Filter-Regler ist ein
  *Tiefpass* (rechtsherum = dunkler).
- **Klon Centaur** — Transparent Overdrive: das Cleansignal läuft parallel mit,
  nur ein Teil wird verzerrt. Deshalb "man hört noch die Gitarre".
- **Boss DS-1 / SD-1** — SD-1 ist ein asymmetrisch clippender Tube Screamer.
- **Rangemaster Treble Booster** — Hochpass davor, dann Transistorstufe. Der
  frühe Britrock-Sound; ein Amp verzerrt anders, wenn man ihm nur Höhen füttert.

## 3. Filter

**Wah (Dunlop Cry Baby GCB-95)** — aktives Bandpassfilter mit Induktivität,
dessen Mittenfrequenz per Pedal verschoben wird.

| Parameter | Wert |
| --- | --- |
| Sweep-Bereich | **450 Hz … 1,6 kHz** |
| Peak in Mittelstellung | ~750 Hz |
| Q | fest beim GCB-95, regelbar beim 535Q |

Direkt als `BiquadFilterNode` mit `type: 'bandpass'` nachbaubar: `frequency` auf
den Pedalweg, `Q` zwischen ca. 2 und 6.

**Auto-Wah / Envelope Filter** — dasselbe Filter, aber die Frequenz folgt der
Hüllkurve des Eingangs statt einem Pedal.

## 4. Dynamik

**Kompressor** — Parameter und übliche Bereiche für Gitarre:

| Parameter | Bereich Gitarre |
| --- | --- |
| Threshold | −30 … −10 dBFS |
| Ratio | 2:1 … 8:1 (Squash: 20:1) |
| Attack | 1–30 ms — kurz = Attack weg, lang = Attack bleibt |
| Release | 50–300 ms |
| Knee | soft für Gitarre |

Klassiker: **Ross/Dyna Comp** (OTA, sehr hörbar, "Country-Squash"),
**Keeley/Boss CS-3**, **Optokoppler** (langsam, musikalisch).

**Noise Gate** — vor allem bei High Gain nötig. Threshold, Attack (schnell),
Hold, Release. Sinnvoll als *zwei* Instanzen: eine vor dem Drive (schneidet das
Rauschen an der Quelle), eine danach.

## 5. Modulation

Alle drei sind **Kammfilter**, sie unterscheiden sich in der Bauart.

| Effekt | Prinzip | Delay-Zeit | LFO-Rate | Feedback |
| --- | --- | --- | --- | --- |
| **Chorus** | modulierte Verzögerung + Original | **15–35 ms** | 0,1–4 Hz | keins |
| **Flanger** | dito, aber kurz + Rückkopplung | **1–10 ms** | 0,05–5 Hz | ja, oft hoch |
| **Phaser** | 4/6/8/12 **Allpassfilter** in Reihe, Kerben verschoben | keine | 0,1–10 Hz | ja |
| **Vibrato** | nur das verzögerte Signal, kein Original | 5–15 ms | 4–8 Hz | keins |
| **Tremolo** | Amplitudenmodulation, gar kein Delay | — | 2–12 Hz | — |
| **Rotary/Leslie** | Doppler + Amplitude, zwei Rotoren | — | langsam ~0,8 Hz / schnell ~7 Hz | — |

**Der Unterschied Chorus/Flanger in einem Satz:** Chorus hat so viel Verzögerung,
dass man zwei Instrumente hört; Flanger so wenig, dass man nur den Kammfilter
hört. Die Kerben eines Flangers liegen harmonisch (bei 1/τ, 3/2τ, …), die eines
Phasers nicht — deshalb klingt ein Phaser weicher und ein Flanger "metallisch".

**Ringmodulator, Octaver, Pitch Shifter, Harmonizer** — Tonhöhe statt Zeit.
Octave-Up klassisch durch Gleichrichtung (Octavia), Octave-Down durch
Frequenzteilung. Ein digitaler Harmonizer, der *tonartbezogen* transponiert, wäre
für diese App fachlich sehr naheliegend: die Tonart steht ja schon in der URL.

## 6. Zeit und Raum

**Delay**

| Typ | Charakter | Modellierung |
| --- | --- | --- |
| Digital | sauber, exakte Wiederholungen | reines Delay + Feedback |
| **Analog (BBD)** | jede Wiederholung dunkler und schmutziger | Tiefpass im Feedbackpfad, leichte Sättigung |
| **Tape** | dazu Gleichlaufschwankung | + langsamer LFO auf die Delayzeit (Wow/Flutter) |
| Reverse, Multi-Tap, Dotted-Eighth | | |

Übliche Zeiten: Slapback 60–120 ms, rhythmisch an die BPM gebunden
(Viertel = 60000/BPM ms, punktierte Achtel = 45000/BPM ms — der U2-Sound).
Feedback über ~0,95 schwingt auf.

**Reverb**

| Typ | Charakter |
| --- | --- |
| **Spring** | im Amp eingebaut, "boing", der Surf-Sound |
| **Plate** | dicht, hell |
| **Room / Hall** | natürlich, Hall mit langem Vorlauf |
| **Shimmer** | Reverb + Oktave im Feedback |

Parameter: Pre-Delay (0–100 ms), Decay/RT60 (0,3–10 s), Damping (Höhenverlust
über die Zeit), Mix. In Web Audio am einfachsten als `ConvolverNode` mit einer
generierten Impulsantwort (Rauschen mit exponentiell fallender Hüllkurve) — das
braucht keine externe Datei.

*In der App:* **beide implementiert**, `src/synth/delay.ts` und
`src/synth/reverb.ts`, hinter dem Verstärker als Sends. Delay mit Feedback 0,35
und Tiefpass 3000 Hz in der Schleife — die Sättigung aus der Tabelle oben fehlt
absichtlich, weil eine Nichtlinearität in einer Rückkopplung gegen die Regel am
Ende dieses Dokuments verstößt. Hall als Raum (RT60 0,9 s) und Halle (1,8 s), mit
wandernder Dämpfung und einer auf Energie 1 normierten Impulsantwort; der
`ConvolverNode` steht deshalb auf `normalize = false`, sonst wäre der Sendepegel
nicht der Hallanteil.

Zwei Zahlen aus der Messung in `scripts/measure-space.html`: die Echos liegen
0,06 ms neben dem Sollwert, und Raum und Halle kosten trotz doppelter Länge
denselben Pegel auf 0,29 dB. Wichtiger noch — mit beiden auf „aus" ist die
Ausgabe **sample-identisch** mit der ohne diese Knoten, weil ein Send auf 0
echte Nullen liefert.

## 7. Was davon in Web Audio direkt geht

| Effekt | Web-Audio-Bausteine | Aufwand |
| --- | --- | --- |
| Tremolo | `GainNode` + `OscillatorNode` auf `gain` | trivial |
| Wah / Auto-Wah | `BiquadFilterNode('bandpass')` | trivial |
| Chorus/Flanger/Vibrato | `DelayNode` + `OscillatorNode` auf `delayTime` | klein |
| Phaser | 4–8 × `BiquadFilterNode('allpass')` + LFO | klein |
| Delay | `DelayNode` + `GainNode` im Feedback + Tiefpass | klein |
| Reverb | `ConvolverNode` mit generiertem IR | klein |
| Kompressor | `DynamicsCompressorNode` — **oder von Hand** | mittel |
| Overdrive/Fuzz | `WaveShaperNode`, `oversample: '4x'` | vorhanden |
| Tube Screamer | Shelf 720 Hz → Shaper → Tiefpass 723 Hz | mittel |
| Noise Gate | kein fertiger Node, `ScriptProcessor`/`AudioWorklet` | mittel |
| Pitch Shift | kein fertiger Node, Phase Vocoder nötig | groß |

**Warnung aus der eigenen Historie.** `src/audio.ts` dokumentiert, warum der
`DynamicsCompressorNode` als Ausgangsbegrenzer versagt hat: 3 ms Attack lässt
jede Transiente durch, 150 ms Release pumpt im Takt des Anschlags — gemessen
*erhöhte* er den Spitzenpegel von 0,637 auf 0,80. Als Effekt (wo Pumpen gewollt
ist) ist er brauchbar, als Schutz nicht.

**Und die wichtigste Lehre aus `amp.ts`:** Jede Nichtlinearität gehört auf den
**Bus**, nicht auf die einzelne Note. Sechs einzeln verzerrte Saiten sind kein
verzerrter Akkord — die Intermodulation zwischen den Saiten ist der ganze Punkt.
Dasselbe gilt für Kompressor und Gate. Reine Filter und Delays dürfen dagegen
überall stehen.

---

## Quellen

- [ElectroSmash — Ibanez Tube Screamer Circuit Analysis](https://electrosmash.mas-effects.com/tube-screamer-analysis.html)
- [ElectroSmash — Big Muff Pi Analysis](https://electrosmash.mas-effects.com/big-muff-pi-analysis.html)
- [ElectroSmash — Dunlop Cry Baby GCB-95 Circuit Analysis](https://www.electrosmash.com/crybaby-gcb-95)
- [GeoFex — The Technology of Wah Pedals](http://www.geofex.com/article_folders/wahpedl/wahped.htm)
- [Strymon — Setting Up Your Effect Signal Chain](https://www.strymon.net/setting-up-your-effect-signal-chain/)
- [Guitar Player — Signal Chains: A guide to guitar pedal order](https://www.guitarplayer.com/gear/guide-to-guitar-pedal-order)
- [iZotope — Understanding Chorus, Flangers, and Phasers](https://www.izotope.com/community/blog/understanding-chorus-flangers-and-phasers-in-audio-production)
