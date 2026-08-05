# Gitarrenverstärker

Der Amp in `src/synth/amp.ts` bildet die Kette schon in ihrer richtigen
Reihenfolge ab: Bass straffen → Röhre → DC blocken → Speaker. Diese Datei sagt,
was in einem echten Gerät an jeder dieser Stellen sitzt und mit welchen Zahlen.

## 1. Die Kette

```
Eingang → Vorstufe (1–4 Trioden) → Tone Stack → Master → Phasenumkehr
        → Endstufe (Gegentakt) → Ausgangsübertrager → Lautsprecher → Raum
```

Fünf Stellen verzerren, und sie klingen unterschiedlich:

1. **Vorstufe** — weiches, harmonienreiches Clipping. Was "Gain" regelt.
2. **Tone Stack** — verzerrt nicht, aber entscheidet, *was* danach verzerrt.
3. **Phasenumkehrstufe** — wird bei hoher Lautstärke selbst zur Verzerrungsquelle.
4. **Endstufe** — Kompression und Sättigung, hängt an der Lautstärke.
5. **Ausgangsübertrager und Speaker** — Sättigung des Kerns, Auslenkungsgrenze
   der Membran.

**Warum ein Amp bei Zimmerlautstärke nie klingt wie im Proberaum:** Punkte 3 bis
5 setzen erst bei Pegel ein. Genau das versucht ein Attenuator oder Power Scaling
zu retten.

## 2. Der Tone Stack

Das **FMV/TMB-Netzwerk** (Fender-Marshall-Vox) ist bei praktisch allen dreien
dieselbe Schaltung mit anderen Bauteilwerten. Es ist **passiv**: es kann nur
dämpfen, nie anheben, und es sitzt mitten in der Vorstufe, wo es 20–30 dB Pegel
kostet. Die Regler sind **nicht orthogonal** — jeder verändert die Wirkung der
anderen.

### Bauteilwerte

| | Fender 5F6-A Bassman / AB763 Blackface | Marshall JTM-45 |
| --- | --- | --- |
| Treble-Kondensator | 250 pF | 500 pF |
| Bass-Kondensator | 0,1 µF | 0,02 µF |
| Mid-Kondensator | 0,047 µF | 0,022 µF |
| Treble-Poti | 250 kΩ | 250 kΩ |
| Bass-Poti | 1 MΩ | 1 MΩ |
| Mid-Poti | 25 kΩ | 25 kΩ |
| **Slope-Widerstand** | **100 kΩ** | **33 kΩ** |

Der Slope-Widerstand ist der auffälligste Unterschied und der Hauptgrund für
"Fender scooped, Marshall mittig": ein kleinerer Slope-Widerstand macht die
Mittenkerbe flacher.

### Charakteristische Kurven

- **Fender** — ausgeprägter **Mitten-Scoop bei ca. 500 Hz** in Mittelstellung.
  Fender hat den bewusst eingebaut, um die Mittenbetonung typischer Pickups
  auszugleichen. Ergebnis: glasige Höhen, satter Bass, wenig Mitten.
- **Marshall** — dieselbe Topologie, flacherer Scoop → mehr Mitten, deshalb
  setzt sich ein Marshall in einer Band durch.
- **Vox Top Boost** — andere Schaltung: nur Treble und Bass, keine Mitte. Das
  "Cut"-Regler sitzt in der Endstufe und ist ein *Höhen-Absenker*, kein Anheber.

Genauer aus derselben Quelle (5F6-A, Regler in Mittelstellung):
Treble-Grenzfrequenz wandert zwischen 2313 und 2548 Hz; Bass-Grenzfrequenz von
1,6 Hz (voll auf) bis 64 Hz (voll zu); Mid-Bandpass ab 318 Hz.

### Bright Cap

Kleiner Kondensator (typisch 100–500 pF, oft 120 pF) parallel zum Volume-Poti.
Bei kleiner Lautstärke lässt er die Höhen vorbei, bei voll aufgedrehtem Poti hat
er keine Wirkung mehr. Deshalb klingt ein Fender bei Volume 2 spitz und bei
Volume 8 rund — nicht weil die Röhren "warm werden".

*In der App:* Der Tone Stack ist der nächstliegende große Baustein. Drei
Biquads (Low-Shelf, Peaking, High-Shelf) approximieren die Kurve gut genug für
eine Trainer-App; wer es exakt will, braucht die Übertragungsfunktion 3. Ordnung
aus dem CCRMA/DAFx-Paper und eine bilineare Transformation.

## 3. Vorstufe

**12AX7 / ECC83** ist die Standard-Doppeltriode, µ ≈ 100. Eine Stufe verstärkt
etwa 30–60-fach. Was die Amps unterscheidet:

| Amp-Typ | Vorstufen | Charakter |
| --- | --- | --- |
| Fender Blackface | 1–2 Stufen vor dem Tone Stack | bleibt lange clean |
| Marshall Plexi | 2 Stufen, Tone Stack danach | bricht früher auf |
| Marshall JCM800 | Master Volume + Zusatzstufe | Vorstufenverzerrung bei jeder Lautstärke |
| Mesa/Boogie | 3–5 Stufen kaskadiert | High Gain, sehr komprimiert |

**Kathoden-Bypass-Kondensator.** Ein Kondensator über dem Kathodenwiderstand
hebt die Verstärkung an — aber nur oberhalb einer Grenzfrequenz. Groß (25 µF) =
alles wird lauter; klein (0,68 µF) = nur die Höhen. Das ist die zweite große
Klangstellschraube nach dem Tone Stack.

**Röhrenkennlinie.** Asymmetrisch: Gitterstrom begrenzt die eine Halbwelle,
Cutoff die andere, und zwar unterschiedlich hart. Daher die geradzahligen
Harmonischen. `ampShape()` in `amp.ts` modelliert das als `tanh` mit Offset —
richtige Idee, und der Offset muss gegen den Drive skaliert werden, sonst kippt
die Asymmetrie (steht so im Kommentar zu `AMP.bias`).

## 4. Endstufe

| Röhre | Amps | Klang |
| --- | --- | --- |
| **6V6** | Fender Deluxe/Princeton | weich, früher Breakup, US-Sound |
| **6L6 / 5881** | Fender Twin/Bassman | viel Headroom, straffer Bass |
| **EL84** | Vox AC15/AC30 | chimey, komprimiert früh |
| **EL34** | Marshall | mittig, "britisch", singendes Clipping |
| **KT88 / 6550** | Hiwatt, Ampeg | sehr viel Headroom |

**Klasse A vs. AB.** Klasse A (AC30, kathodenbiased): beide Röhren leiten immer,
mehr Wärme, weniger Wirkungsgrad, früherer und weicherer Breakup. Klasse AB:
mehr Leistung aus denselben Röhren, klarer bis zur Grenze.

Konkrete Beispiele: **Fender Deluxe Reverb** = 22 W aus zwei 6V6, vier 12AX7 und
zwei 12AT7. **Vox AC30 Top Boost** = 30 W aus vier kathodenbiased EL84, drei
12AX7, **ohne Gegenkopplung**.

**Doppelte Leistung ist ~3 dB.** Ein 100-W-Marshall ist nicht "doppelt so laut"
wie ein 50-W-Modell, sondern hat ~3 dB mehr und bricht später auf. Deshalb sind
kleine Amps im Studio beliebt.

### Gegenkopplung und Presence

Ein Teil des Ausgangssignals wird phasenverkehrt an die Phasenumkehrstufe
zurückgeführt. Mehr Gegenkopplung = weniger Verzerrung, mehr Dämpfung, strafferer
Bass, aber auch weniger Charakter.

**Der Presence-Regler senkt die Gegenkopplung für hohe Frequenzen ab.** Er ist
kein Höhenregler im Signalweg — er *reduziert die Höhen-Gegenkopplung* und lässt
die Endstufe oben freier laufen. Ein **Depth/Resonance-Regler** macht dasselbe
für den Bass.

Der AC30 hat gar keine Gegenkopplung — daher sein rauer, offener Ton und die
frühe Kompression.

*In der App:* `AMP.presence` ist derzeit ein Peaking-Filter bei 2800 Hz, +4,5 dB,
Q 1,1 *nach* dem Shaper. Das ist die richtige Vereinfachung; eine echte
Gegenkopplungsschleife wäre eine Rückführung im Graph und in Web Audio mit einem
`DelayNode` von einem Sample machbar, aber deutlich aufwändiger.

### Sag

Bei lautem Spiel bricht die Anodenspannung kurz ein — die Röhren ziehen mehr
Strom, als das Netzteil nachliefert. Ergebnis: der Anschlag wird gestaucht, dann
schwillt der Ton wieder an. Röhrengleichrichter (GZ34, 5Y3) sagen stark,
Siliziumdioden kaum.

Modellierbar als **pegelabhängiger Verstärkungseinbruch mit langsamer
Erholung** — im Prinzip ein Kompressor mit sehr langsamem Release (100–500 ms),
der auf die Vorstufe zurückwirkt, nicht auf den Ausgang.

## 5. Lautsprecher und Box

Der Speaker ist der stärkste Filter der ganzen Kette — mehr als jeder
Klangregler.

| Speaker | Fs (Resonanz) | Bereich | Charakter |
| --- | --- | --- | --- |
| **Celestion Vintage 30** | 70–75 Hz | 70 Hz – 5 kHz | aggressiver Präsenzpeak **1,5–3 kHz** |
| **Celestion Greenback G12M** | ~75 Hz | | warm, Abfall ab ~5 kHz, weniger Präsenz |
| **Celestion G12T-75** | | | scooped, straffer Bass |
| **Celestion Alnico Blue** | | | frühe Kompression, Vox-Sound |
| **Jensen P/C-Serie** | | | Fender-Sound, weniger Mitten |

**Die zwei Zahlen, auf die es ankommt:**
1. **Steiler Höhenabfall ab ~4–5 kHz.** Ein Gitarrenlautsprecher gibt oberhalb
   praktisch nichts mehr ab — das ist der Grund, warum verzerrte Gitarre nicht
   fizzt. In `amp.ts` sind das die zwei Butterworth-Pole bei 4200 Hz.
2. **Resonanzhöcker bei 70–100 Hz.** Gibt der tiefen E-Saite ihr Fundament, ohne
   dass tiefere Frequenzen durchkommen.

Dazu die **Präsenzspitze** je nach Modell: V30 bei 1,5–3 kHz (deshalb "modern"
und durchsetzungsfähig), Greenback deutlich flacher (deshalb "vintage").

**Box:**
- **Open Back** (typisch Fender-Combo) — Bass fällt früher ab, Abstrahlung nach
  hinten, breiter aber weniger druckvoll.
- **Closed Back** (typisch 4×12) — mehr Tiefbass, gerichtete Abstrahlung.
- **4×12** ergibt zusätzlich Interferenzen zwischen den Speakern.

**Mikrofonierung** ist Teil des Sounds, nicht ein Nachgedanke: SM57 dicht an der
Membran; mittig = hell, am Rand = dunkler. Genau das steckt in einer
**Impulsantwort (IR)** — Speaker + Box + Mikro + Position in einer Datei. Ein
`ConvolverNode` mit einer IR wäre in Web Audio der direkteste Weg zu einem
glaubwürdigen Cabinet, wenn man das Gewicht der Datei (typ. 20–200 ms bei
48 kHz, also wenige zehn KB) tragen will.

## 6. Amp-Archetypen als Parametersätze

Wenn die App je mehrere Amp-Voicings anbieten soll, sind das die Achsen, die
ausreichen:

| Archetyp | Gain | Tone-Stack-Scoop | Presence | Speaker-Eckfrequenz | Bass-Straffung |
| --- | --- | --- | --- | --- | --- |
| **American Clean** (Deluxe/Twin) | niedrig | tief bei 500 Hz | mittel | ~5 kHz | wenig |
| **British Chime** (AC30) | mittel | kein Mid-Regler, flach | hoch (keine NFB) | ~4,5 kHz, Alnico | wenig |
| **British Crunch** (Plexi/JCM800) | hoch | flach | mittel | ~4 kHz, Greenback | mittel |
| **Modern High Gain** (Rectifier) | sehr hoch | tief | hoch | ~3,8 kHz, V30 | **stark** |

**Status: implementiert.** `AMPS` in `src/synth/amp.ts` hält alle vier;
`british-crunch` ist der Amp, den die App immer hatte (`preGain: 16`, `tight:
−8 dB @ 180 Hz`, Cab bei 4200 Hz, Presence +4,5 dB @ 2800 Hz), unverändert.

**Der Fallstrick, wenn man weitere ergänzt:** `makeup` **pro Archetyp neu
messen**, mit `scripts/measure-makeup.html`. Der Kommentar an `AMP.makeup`
erklärt, warum es nicht aus der Referenzimplementierung abgeleitet werden darf:
Modell und Aufnahme haben unterschiedliche Crest-Faktoren (7,95 dB vs. 13,02 dB)
und werden deshalb unterschiedlich stark komprimiert. Beim Anlegen der drei neuen
Archetypen lagen Schätzung und Messung um bis zu 6,2 dB auseinander.

---

## Quellen

- [Rob Robinette — How the TMB Tone Stack Works](https://robrobinette.com/How_The_TMB_Tone_Stack_Works.htm)
- [CCRMA Stanford — Tone Stack (Yeh/Smith, DAFx-06)](https://ccrma.stanford.edu/~dtyeh/tonestack/)
- [arXiv 2110.02285 — Modelling of the Fender Bassman 5F6-A Tone Stack](https://arxiv.org/pdf/2110.02285)
- [arXiv 2408.11405 — DDSP Guitar Amp: Interpretable Guitar Amplifier Modeling](https://arxiv.org/pdf/2408.11405)
- [Analog Ethos — Tube Amplifiers Explained, Part 11: Negative Feedback](https://www.analogethos.com/post/negative-feedback)
- [Celestion — Vintage 30 Speaker Responses](https://www.celestionplus.com/products/guitar-responses-by-speaker/vintage-30/)
- [Wikipedia — Fender Deluxe Reverb](https://en.wikipedia.org/wiki/Fender_Deluxe_Reverb)
- [Reverb — Vox AC15 vs. Fender Deluxe Reverb](https://reverb.com/news/vox-ac15-vs-fender-deluxe-reverb)
