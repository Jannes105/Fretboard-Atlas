# Die E-Gitarre als Instrument

Was am Instrument den Klang macht — und welche dieser Größen sich sinnvoll in
eine Browser-App übersetzen lassen.

## 1. Tonabnehmer

Ein Pickup ist ein **LCR-Kreis**, kein Mikrofon: Spule mit Induktivität L,
Eigenkapazität C, Drahtwiderstand R. Die Saite bewegt das Magnetfeld, die Spule
gibt Spannung ab — und der Kreis hat eine **Resonanzspitze**.

$$f_{res} = \frac{1}{2\pi\sqrt{LC}}$$

### Gemessene Größenordnungen

| Größe | Bereich |
| --- | --- |
| Induktivität L | 1–10 H |
| Eigenkapazität C | 80–200 pF |
| Kabelkapazität | ~100 pF pro Meter — **kommt oben drauf** |
| Resonanz Single Coil | 5–8 kHz |
| Resonanz P-90 | 6,4 kHz (gemessen) |
| Resonanz Humbucker | 2–4 kHz |
| Gleichstromwiderstand | SC ~6 kΩ, HB ~8–16 kΩ |

**Warum das der wichtigste Klangparameter ist.** Der Unterschied zwischen Single
Coil und Humbucker ist nicht in erster Linie "zwei Spulen", sondern die doppelte
Induktivität und damit die um rund eine Oktave tiefere Resonanz. Mehr Windungen =
mehr Ausgangspegel *und* dunklerer Klang; das ist dieselbe Ursache, nicht zwei.

**Coil Split / Parallel:**
- Nur eine Spule → L halbiert → Resonanz ×√2 ≈ ×1,41
- Beide Spulen parallel → L auf ein Viertel → Resonanz ×2

**Ein Kabel ist ein Klangregler.** 6 m Klinkenkabel bringen ~600 pF und ziehen
die Resonanz eines Single Coils spürbar nach unten. Genau deshalb klingt ein
Buffer am Anfang der Kette "heller" — er nimmt das Kabel aus der Rechnung.

### Positionen

| Position | Charakter | Grund |
| --- | --- | --- |
| Hals (Neck) | rund, warm, viel Grundton | sitzt nahe am Schwingungsbauch |
| Mitte | ausgewogen | |
| Steg (Bridge) | hell, aggressiv, weniger Pegel | Saite bewegt sich dort am wenigsten |
| Zwischenstellungen 2 & 4 | "quacky", ausgehöhlt | zwei Pickups parallel → Kammfilter durch den Phasenversatz |

Der Strat-Zwischenposition-Sound entsteht durch **Kammfilterung**: derselbe Ton,
an zwei Orten abgenommen, hat für jede Frequenz einen anderen Phasenversatz.
Das ist als kurzes Delay + Summe modellierbar (Größenordnung: die
Pickup-Abstände liegen bei 8–10 cm, die Auslöschungen ergeben sich aus der
Saitenwellenlänge, nicht aus einer Laufzeit im Kabel).

*In der App:* **implementiert** in `src/synth/pickup.ts` — Hals bei 2800 Hz
(Q 1,2) und Steg bei 6300 Hz (Q 1,0), das sind die geometrischen Mitten der
Bänder in der Tabelle oben; dazu ein Low-Shelf bei 320 Hz für den
Pegelunterschied aus der Positionstabelle. Die Q-Werte kommen aus §2, nicht aus
dem Pickup-Typ.

Die Vorgabe ist eine **dritte** Stellung, „wie aufgenommen", flach auf beiden
Filtern: die Aufnahmen sind durch einen Pickup entstanden, und den kann man nicht
herausrechnen. Der Pickup sitzt vor dem Verstärker, weil er die Gitarre ist —
gemessen fährt der Halspickup die Kennlinie 3,5 dB kräftiger an als der Steg,
wovon nach dem Verstärker noch 0,3 dB übrig sind. Die Zwischenstellungen sind
nicht implementiert.

### Typen

- **Single Coil** — hell, dynamisch, brummempfindlich (50/60 Hz Netzbrumm).
- **Humbucker** — zwei gegenläufig gewickelte Spulen mit umgekehrter Polarität.
  Der Brumm hebt sich auf, ein Teil des Signals ebenso → mittiger, dicker.
- **P-90** — Single Coil mit breiter, flacher Spule. Zwischen beidem: mehr Biss
  als ein Humbucker, mehr Fleisch als ein Strat-Pickup.
- **Aktive Pickups** (EMG etc.) — Vorverstärker im Instrument, niedrige
  Impedanz. Kabel und Potis beeinflussen den Klang dann praktisch nicht mehr;
  Resonanz wird flach, Rauschabstand hoch, Dynamik geringer.

## 2. Elektronik im Instrument

| Bauteil | Übliche Werte |
| --- | --- |
| Volume-Poti | 250 kΩ (Single Coil), 500 kΩ (Humbucker/P-90), 1 MΩ (Jazzmaster) |
| Tone-Poti | wie Volume |
| Tone-Kondensator | 0,022 µF (Humbucker), 0,047 µF (Single Coil) |

**Das Tone-Poti ist ein Tiefpass gegen Masse.** Der Kondensator leitet die Höhen
ab; das Poti bestimmt, wie viel davon. Größerer Kondensator = tiefere
Grenzfrequenz = dunkler.

**Warum 250 k heller/dunkler macht:** Das Poti liegt parallel zum Pickup und
bedämpft dessen Resonanzspitze. 500 kΩ bedämpft weniger → höhere Güte, hellerer
Klang. Der Unterschied ist ein **Q-Unterschied an der Resonanz**, keine
Grenzfrequenzverschiebung. Ein Q-Wert am Peaking-Filter ist genau die richtige
Modellierung.

**Treble Bleed:** kleiner Kondensator (meist 470 pF–1 nF, oft mit
Parallelwiderstand ~100 kΩ) über das Volume-Poti. Sorgt dafür, dass beim
Zurückdrehen der Lautstärke die Höhen nicht mitverschwinden.

## 3. Mensur, Saiten, Stimmung

### Mensur

| Mensur | Vorkommen | Wirkung |
| --- | --- | --- |
| 24,75" (628 mm) | Gibson | weichere Saiten, wärmer, leichteres Bending |
| 25,5" (648 mm) | Fender | straffer, klarer, mehr Attack |
| 25" (635 mm) | PRS | dazwischen |
| 26,5–27" | Baritone, 7/8-Saiter | nötig, damit tiefe Saiten straff bleiben |
| Fan Fret / Multiscale | moderne Extended Range | pro Saite eigene Mensur |

**Bundabstände** folgen der 12. Wurzel aus 2. Abstand von Sattel zum Bund *n*:

$$d_n = L \left(1 - 2^{-n/12}\right)$$

Bund 12 liegt exakt bei $L/2$. Die "Rule of 18" (eigentlich 17,817) ist die
Näherung derselben Formel.

*Status:* `src/components/neckGeometry.ts` macht genau diese Rechnung fürs
Layout.

### Saitenspannung

$$T = \frac{UW \cdot (2 L f)^2}{386{,}088}$$

mit T in lbs, UW = Gewicht pro Zoll in lbs/in, L in Zoll, f in Hz.

Faustregeln: Gesamtspannung eines Satzes 100–130 lbs = leicht, 130–160 = medium,
160+ = schwer. Einen Ganzton runterstimmen? Eine Stärke dicker nehmen
(.010 → .011), dann bleibt das Spielgefühl gleich.

### Stimmungen

Als MIDI-Nummern, tiefste Saite zuerst (E2 = 40).

| Stimmung | Töne | MIDI | Intervalle |
| --- | --- | --- | --- |
| Standard | E A D G B E | 40 45 50 55 59 64 | 5 5 5 4 5 |
| Drop D | D A D G B E | 38 45 50 55 59 64 | 7 5 5 4 5 |
| Eb Standard | Eb Ab Db Gb Bb Eb | 39 44 49 54 58 63 | 5 5 5 4 5 |
| D Standard | D G C F A D | 38 43 48 53 57 62 | 5 5 5 4 5 |
| Drop C | C G C F A D | 36 43 48 53 57 62 | 7 5 5 4 5 |
| Drop C# | C# G# C# F# A# D# | 37 44 49 54 58 63 | 7 5 5 4 5 |
| Open G | D G D G B D | 38 43 50 55 59 62 | 5 7 5 4 3 |
| Open D | D A D F# A D | 38 45 50 54 57 62 | 7 5 4 3 5 |
| Open E | E B E G# B E | 40 47 52 56 59 64 | 7 5 4 3 5 |
| Open A | E A E A C# E | 40 45 52 57 61 64 | 5 7 5 4 3 |
| DADGAD | D A D G A D | 38 45 50 55 57 62 | 7 5 5 2 5 |
| Double Drop D | D A D G B D | 38 45 50 55 59 62 | 7 5 5 4 3 |
| Orkney | C G D G C D | 36 43 50 55 60 62 | 7 7 5 5 2 |
| Alle Quarten | E A D G C F | 40 45 50 55 60 65 | 5 5 5 5 5 |
| Nick Drake / C-G-C-F-C-E | | 36 43 48 53 60 64 | 7 5 5 7 4 |
| 7-Saiter Standard | B E A D G B E | 35 40 45 50 55 59 64 | 5 5 5 5 4 5 |
| 7-Saiter Drop A | A E A D G B E | 33 40 45 50 55 59 64 | 7 5 5 5 4 5 |
| 8-Saiter Standard | F# B E A D G B E | 30 35 40 45 50 55 59 64 | 5 5 5 5 5 4 5 |

**Für die App entscheidend:** Die Intervallspalte, nicht die Töne. Die
Akkordform-Sets in `ChordShape.ts` hängen am Intervallmuster. Standard, Eb
Standard und D Standard teilen sich `[5,5,5,4,5]` und damit alle Griffe; Drop D
und Drop C teilen sich `[7,5,5,4,5]`. **Alle Quarten** (`[5,5,5,5,5]`) wäre ein
eigenes, sehr einfaches Set: keine G→B-Ausnahme, jede Form überall gleich.

Open-Tunings brauchen jeweils ein eigenes Set — oder man lässt `voicingsFor` wie
bisher `[]` zurückgeben und zeigt stattdessen die gesuchten Voicings aus
`voicingSearch.ts`.

### Kapo

Verschiebt alle Saiten gleich → Intervallmuster bleibt → dieselben Griffe, andere
Tonhöhe. **Teilkapos** (Kapo nur über 3 oder 5 Saiten, z. B. "Esus4-Kapo" auf
Bund 2 der Saiten 5-4-3) verändern das Muster dagegen sehr wohl.

*Status:* Kapo implementiert. Fünf Presets — `standard`, `eb`, `d-standard`,
`drop-d`, `drop-c` — plus freie Stimmung. Kein Teilkapo, keine 7/8-Saiter (die
Klasse trägt beliebige Saitenzahl, aber `ChordShape` und die Samples nicht).

## 4. Mechanik

- **Feste Bridge / Tune-o-matic** — stimmstabil, maximale Sustain-Übertragung.
- **Fender-Vibrato (Synchronized Tremolo)** — schwebend oder aufliegend;
  schwebend geht in beide Richtungen, verstimmt sich aber beim Saitenriss.
- **Floyd Rose** — doppelt verriegelt (Sattel + Bridge). Sehr stimmstabil, jede
  Saitenwechsel- und Stimmungsänderung ist Arbeit.
- **Bigsby** — geringer Hub, sanftes Vibrato.

**Intonation** wird an der Bridge kompensiert: dickere Saiten brauchen eine
längere effektive Mensur, weil das Herunterdrücken sie mehr dehnt. Deshalb steht
das Reiterchen der tiefen E-Saite weiter hinten als das der hohen. Der Effekt ist
für ein Griffbrett-Trainerprogramm ohne Belang — außer man wollte je Bund die
reale Tonhöhenabweichung zeigen.

**Bending, Vibrato, Slide, Hammer-On/Pull-Off** sind das, was eine
Griffbrett-App klanglich am ehesten fehlen lässt: alles davon sind
Tonhöhenverläufe, kein neuer Ton. Halbton- und Ganztonbending sind Standard,
1½ Töne auf der H-Saite kommen vor.

---

## Quellen

- [Physics 406, University of Illinois — Measurement of EM Properties of Electric Guitar Pickups (PDF)](https://courses.physics.illinois.edu/phys406/sp2017/Lab_Handouts/Electric_Guitar_Pickup_Measurements.pdf)
- [Bedlam Guitars — Pickup Inductance](https://bedlamguitars.wordpress.com/technical-info/pickup-inductance/)
- [Wikipedia — P-90](https://en.wikipedia.org/wiki/P-90)
- [arXiv 2409.19782 — Guitar Pickups I: Winding and Wire Gauge in Single Coil Pickups](https://arxiv.org/pdf/2409.19782)
- [Lollar Pickups — Caps and Pots, Part 1](https://www.lollarguitars.com/blog/2017/05/tone-chasin-the-skinny-on-capacitors-and-potentiometers-or-caps-and-pots-part-1/)
- [Elixir Strings — String Tension Charts](https://elixirstrings.com/support/string-tension-for-tuning-guitar)
- [Stringjoy — Alternate Guitar Tunings: The Ultimate Guide](https://stringjoy.com/alternate-tunings/)
- [Guitar World — 11 alternate and open tunings](https://www.guitarworld.com/lessons/11-alternate-tunings-every-guitarist-should-know)
