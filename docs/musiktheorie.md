# Musiktheorie für Gitarre

## 1. Intervalle

Halbtonabstand, Name, und wie das Intervall auf dem Griffbrett aussieht
(Standardstimmung, ausgehend von einem Grundton auf Saite 6 oder 5).

| HT | Intervall | Kurz | Griffbild ab Grundton |
| --- | --- | --- | --- |
| 0 | Prime | 1 | — |
| 1 | kleine Sekunde | b2 | +1 Bund, gleiche Saite |
| 2 | große Sekunde | 2 | +2 Bünde |
| 3 | kleine Terz | b3 | +3 Bünde |
| 4 | große Terz | 3 | +4 Bünde |
| 5 | Quarte | 4 | nächsthöhere Saite, gleicher Bund (außer G→B) |
| 6 | Tritonus | b5/#4 | nächsthöhere Saite, +1 Bund |
| 7 | Quinte | 5 | nächsthöhere Saite, +2 Bünde |
| 8 | kleine Sexte | b6 | +3 |
| 9 | große Sexte | 6 | +4 |
| 10 | kleine Septime | b7 | zwei Saiten höher, −2 Bünde |
| 11 | große Septime | 7 | zwei Saiten höher, −1 Bund |
| 12 | Oktave | 8 | zwei Saiten höher, +2 Bünde (E/A/D/G-Basis) |

**Der G→B-Bruch.** Die Standardstimmung ist Quarten, außer zwischen Saite 3 (G)
und 2 (B) — dort eine große Terz. Jedes Griffbild, das diese Grenze überquert,
verschiebt sich um **einen Bund nach oben**. Das ist die einzige Unregelmäßigkeit
im ganzen System und die Ursache für praktisch jeden Griffbild-Sonderfall.

**Oktavformen** — die praktischste Merkhilfe überhaupt:
- Saite 6 → 4, +2 Bünde. Saite 5 → 3, +2 Bünde.
- Saite 4 → 2, +3 Bünde. Saite 3 → 1, +3 Bünde. (wegen G→B)

**Komplementärintervalle** ergänzen sich zu 12: Quarte ↔ Quinte, große Terz ↔
kleine Sexte, kleine Sekunde ↔ große Septime. Für Umkehrungen von Akkorden und
für "die gleiche Note zwei Saiten tiefer" relevant.

*Status in der App:* Intervalle existieren implizit in `ScaleType.semitones` und
`Chord.semitones`. Es gibt **keine** eigene Intervall-Ansicht und keine
Beschriftung "b3" direkt am Bund außerhalb von `degreeLabel`.

---

## 2. Skalen

### 2.1 Was die App kennt

Dur, Natürlich Moll, Moll-Pentatonik, Blues, Dur-Pentatonik, Dorisch,
Mixolydisch, Harmonisch Moll, Melodisch Moll, Phrygisch, Lydisch, Lokrisch.
(`src/theory/ScaleType.ts`)

### 2.2 Was fehlt und sich lohnt

Halbtonschritte relativ zum Grundton.

| Skala | Halbtöne | Wofür |
| --- | --- | --- |
| **Phrygisch Dominant** (5. Modus HM) | 0 1 4 5 7 8 10 | Flamenco, Metal, jede V-Stufe in Moll |
| **Lydisch Dominant** (4. Modus MM) | 0 2 4 6 7 9 10 | Dominante mit #11, Fusion |
| **Altered / Superlokrisch** (7. Modus MM) | 0 1 3 4 6 8 10 | V7alt vor Moll-Tonika, Jazz |
| **Lokrisch #2** (6. Modus MM) | 0 2 3 5 6 8 10 | über m7b5, statt Lokrisch |
| **Ganztonleiter** | 0 2 4 6 8 10 | über 7#5, symmetrisch, nur 2 verschiedene |
| **HTGT / Vermindert** | 0 1 3 4 6 7 9 10 | über 7b9, symmetrisch, 3 verschiedene |
| **GTHT / Vermindert** | 0 2 3 5 6 8 9 11 | über dim7 |
| **Harmonisch Dur** | 0 2 4 5 7 8 11 | Dur mit b6, seltener aber schön |
| **Ungarisch Moll** | 0 2 3 6 7 8 11 | HM mit #4 |
| **Dur-Bebop** | 0 2 4 5 7 8 9 11 | Achtel-Linien: Akkordton auf jeder Zählzeit |
| **Dominant-Bebop** | 0 2 4 5 7 9 10 11 | dito über V7 |
| **Dur-Blues** | 0 2 3 4 7 9 | Dur-Pentatonik + b3, Country/Rock |

**Achtung bei der Notation.** Die App buchstabiert Töne als Buchstabe +
Vorzeichen. Symmetrische Skalen (Ganzton, vermindert) haben **keine saubere
Sieben-Buchstaben-Schreibung** — die Ganztonleiter auf C ist C D E F# G# A#, also
kein einziges F, B oder Db, und HTGT braucht acht Töne auf sieben Buchstaben.
`diatonicSteps` muss dort bewusst Dopplungen enthalten, so wie es die Blues-Skala
schon tut (`[0, 2, 3, 4, 4, 6]`).

### 2.3 Modi: charakteristischer Ton und Avoid Note

Der **charakteristische Ton** ist der eine Ton, der den Modus von seinem
nächstverwandten Nachbarn unterscheidet. Er muss klingen, sonst hört niemand den
Modus. Die **Avoid Note** ist ein Skalenton, der einen kleinen Sekundabstand über
einem Akkordton liegt und deshalb als liegender Ton nicht funktioniert — als
Durchgangston schon.

| Modus | Vs. | Charakteristisch | Avoid | Akkord |
| --- | --- | --- | --- | --- |
| Ionisch | — | — | 4 (über der 3) | maj7 |
| Dorisch | Äolisch | **6** | — (die 6 ist gerade das Merkmal) | m7 |
| Phrygisch | Äolisch | **b2** | b6 | m7, sus b9 |
| Lydisch | Ionisch | **#4** | keine | maj7#11 |
| Mixolydisch | Ionisch | **b7** | 4 | 7 |
| Äolisch | — | b6 | b6 (über der 5) | m7 |
| Lokrisch | — | b5 | b2 | m7b5 |

**Modale Musik braucht einen Vamp, keine Kadenz.** Sobald ein V–I durchläuft,
hört das Ohr Dur/Moll und nicht mehr den Modus. Deshalb sind modale Stücke fast
immer zwei Akkorde: Dm–G (Dorisch), Em–F (Phrygisch), C–D (Lydisch), G–F
(Mixolydisch). Das ist für einen Progression-Preset "Modal Vamp" direkt
verwertbar.

*Status:* Die App kennt die Modi als Skalen, aber nicht ihren charakteristischen
Ton, nicht die Avoid Notes und keine modalen Vamps.

---

## 3. Akkorde

### 3.1 Formeln

| Typ | Halbtöne | Symbol |
| --- | --- | --- |
| Dur | 0 4 7 | — |
| Moll | 0 3 7 | m |
| Vermindert | 0 3 6 | dim, ° |
| Übermäßig | 0 4 8 | aug, + |
| sus2 / sus4 | 0 2 7 / 0 5 7 | sus2, sus4 |
| Power | 0 7 | 5 |
| maj7 | 0 4 7 11 | maj7, Δ |
| 7 | 0 4 7 10 | 7 |
| m7 | 0 3 7 10 | m7, −7 |
| m7b5 | 0 3 6 10 | ø7 |
| dim7 | 0 3 6 9 | °7 |
| mMaj7 | 0 3 7 11 | mMaj7 |
| 6 / m6 | 0 4 7 9 / 0 3 7 9 | 6, m6 |
| **add9** | 0 4 7 14 | add9 — *ohne* Septime |
| **maj9** | 0 4 7 11 14 | maj9 |
| **9** | 0 4 7 10 14 | 9 |
| **m9** | 0 3 7 10 14 | m9 |
| **11** | 0 (4) 7 10 14 17 | 11 — Terz wird meist weggelassen |
| **m11** | 0 3 7 10 14 17 | m11 |
| **13** | 0 4 (7) 10 (14) 21 | 13 |
| **7b9 / 7#9** | 0 4 7 10 13 / 0 4 7 10 15 | 7b9, 7#9 ("Hendrix") |
| **7#5 / 7b5** | 0 4 8 10 / 0 4 6 10 | 7#5, 7b5 |
| **7sus4** | 0 5 7 10 | 7sus4 |
| **6/9** | 0 4 7 9 14 | 6/9 |

Alles über der Oktave ist derselbe Ton wie 9=2, 11=4, 13=6 — die höhere Zahl sagt
nur, dass die Septime mitgedacht ist. `add9` ist genau der Fall, wo sie es nicht
ist.

**Weglassregeln auf der Gitarre** (sechs Saiten, vier Finger): Die **Quinte** darf
fast immer weg — sie sagt nichts über die Qualität. Der **Grundton** darf weg,
wenn ein Bass ihn spielt. **Terz und Septime müssen bleiben**, das sind die
"Guide Tones", die die Akkordqualität tragen. Bei 11er-Akkorden über Dur fliegt
die Terz raus, weil 11 und 3 einen Halbton auseinanderliegen (b9-Reibung).

### 3.2 Leitereigene Akkorde

Dur: I–ii–iii–IV–V–vi–vii°, mit Vierklängen maj7–m7–m7–maj7–7–m7–m7b5.
Natürlich Moll: i–ii°–III–iv–v–VI–VII, Vierklänge m7–m7b5–maj7–m7–m7–maj7–7.
Harmonisch Moll: i–ii°–III+–iv–**V**–VI–vii°, Vierklänge mMaj7–m7b5–maj7#5–m7–**7**–maj7–dim7.

Der Grund, warum Harmonisch Moll existiert: die V-Stufe wird zur echten Dominante
mit Leitton.

### 3.3 Erweiterte Harmonik

**Zwischendominanten.** Vor jede Stufe außer vii° darf ihre eigene V7 gesetzt
werden: V7/ii, V7/iii, V7/IV, V7/V, V7/vi. In C-Dur ist V7/V = D7, V7/vi = E7.
Das ist der häufigste Grund für einen "leiterfremden" Akkord in Pop und Blues.

**Tritonussubstitution.** Jede V7 lässt sich durch die V7 einen Tritonus entfernt
ersetzen: G7 → Db7. Funktioniert, weil beide dieselben Guide Tones haben
(B/F bzw. Cb/F). Ergibt chromatisch absteigende Bässe: Dm7–Db7–Cmaj7.

**Modal Interchange / Borrowed Chords.** Akkorde aus der gleichnamigen Molltonart
in Dur: bIII, bVI, bVII, iv, ii°. In C-Dur also Eb, Ab, Bb, Fm. Das bVII–I und
das iv–I sind in Rock allgegenwärtig.

**Backdoor-Dominante.** bVII7 → I statt V7 → I. In C: Bb7 → Cmaj7.

**Neapolitaner** (bII, meist als Sextakkord bII6) und **übermäßiger
Sextakkord** — klassisch, für die App eher Randnotiz.

**Negative Harmonie.** Spiegelung an der Achse zwischen Terz und Quinte der
Tonika (in C: zwischen Eb und E). Macht aus G7 ein Fm6. Modisch, aber ein
hübsches Analysewerkzeug.

### 3.4 Kadenzen und Funktionen

Drei Funktionen: **Tonika** (I, vi, iii), **Subdominante** (IV, ii),
**Dominante** (V, vii°). Bewegung geht typischerweise T → S → D → T.

| Kadenz | Bewegung | Wirkung |
| --- | --- | --- |
| Authentisch | V–I | Schluss |
| Plagal | IV–I | "Amen", weicher Schluss |
| Trugschluss | V–vi | offen, überraschend |
| Halbschluss | ?–V | Frage, Halbsatz |
| Phrygisch | bII–I / iv6–V | spanisch |

### 3.5 Häufige Progressionen

| Name | Stufen | Beispiel in C |
| --- | --- | --- |
| Axis / Pop-Punk | I–V–vi–IV | C–G–Am–F |
| 50s / Doo-Wop | I–vi–IV–V | C–Am–F–G |
| Sensitive | vi–IV–I–V | Am–F–C–G |
| Jazz-Kadenz | ii–V–I | Dm7–G7–Cmaj7 |
| Rhythm Changes A | I–vi–ii–V | C–Am–Dm–G |
| Andalusisch | i–VII–VI–V | Am–G–F–E |
| Epic / Moll-Axis | i–VI–III–VII | Am–F–C–G |
| Canon | I–V–vi–iii–IV–I–IV–V | C–G–Am–Em–F–C–F–G |
| Montgomery-Ward-Bridge | I–IV–ii–V | C–F–Dm–G |
| Royal Road (japanisch) | IV–V–iii–vi | F–G–Em–Am |
| Blues 12-Takt | I–I–I–I–IV–IV–I–I–V–IV–I–V | alle als 7 |
| Blues Quick Change | wie oben, Takt 2 = IV | |
| Jazz-Blues | I7–IV7–I7–v7 IV7–IV7–#iv°–I7–VI7–ii7–V7–I7–V7 | |
| Minor Blues | i–i–i–i–iv–iv–i–i–VI–V–i–V | |
| Doo-Wop-Turnaround | I–vi–ii–V | |
| Blues-Turnaround | I–VI7–ii–V7 | |

*Status:* Die App hat 8 Progressionen (`Progression.ts`), Drei-, Vier- und
**Fünfklänge** (`ChordSize = 3 | 4 | 5`), Slash-Akkorde (`bass`) und einen
KeyFinder mit `outsiders`. Es fehlen: Erweiterungen über die None hinaus (11, 13,
alteriert), Zwischendominanten, Modal Interchange, und die Funktion (T/S/D) als
Anzeige.

---

## 4. Voicings und Griffbrett-Systeme

### 4.1 CAGED

Fünf offene Akkordformen (C, A, G, E, D), chromatisch verschoben. Ihre Reihenfolge
den Hals hinauf ist immer C–A–G–E–D, und jede Form überlappt die nächste in genau
einem Bund. Die zugehörigen fünf Skalenformen liegen deckungsgleich darüber —
das ist der eigentliche Nutzen: Akkordton und Skalenton im selben Bild.

*Status:* implementiert in `src/theory/caged.ts`, aber nur für `major` und
`minor`.

### 4.2 Dreiklänge auf Saitensets

Drei Dreiklänge (Grundstellung, 1. Umkehrung, 2. Umkehrung) auf jedem der vier
zusammenhängenden Saitensets 6-5-4, 5-4-3, 4-3-2, 3-2-1. Zwölf Griffbilder pro
Akkordqualität decken den ganzen Hals ab. Das Set 3-2-1 und 4-3-2 haben wegen
G→B andere Formen als 6-5-4 und 5-4-3.

Sehr lohnende Ergänzung: kleine, klanglich brauchbare Voicings, und didaktisch
der beste Weg, Umkehrungen zu verstehen.

### 4.3 Drop-2 und Drop-3

Ausgangspunkt ist die **enge Lage** eines Vierklangs (alle Töne innerhalb einer
Oktave, z. B. C-E-G-B). Die ist auf der Gitarre nicht greifbar.

- **Drop 2:** zweithöchster Ton eine Oktave nach unten. Ergibt vier
  benachbarte Saiten — Sets 6-5-4-3, 5-4-3-2, 4-3-2-1.
- **Drop 3:** dritthöchster Ton eine Oktave nach unten. Ergibt eine Lücke —
  Sets 6-4-3-2 und 5-3-2-1, die übersprungene Saite wird abgedämpft.

Wichtig für eine Implementierung: **erst umkehren, dann droppen.** Die vier
Umkehrungen der engen Lage ergeben vier Drop-2-Formen; ein Drop-2 selbst
umzukehren ergibt etwas anderes.

### 4.4 Shell Voicings

Nur Grundton, Terz, Septime — drei Töne, R-3-7 oder R-7-3. Der Standard fürs
Comping, weil sie sich mit minimaler Bewegung verketten lassen und keiner anderen
Stimme im Weg sind.

### 4.5 Quartenvoicings

Gestapelte Quarten statt Terzen (z. B. D-G-C). Klanglich schwebend, harmonisch
mehrdeutig — modaler Jazz, aber auch Post-Rock.

### 4.6 Three Notes Per String

Sieben Skalenformen mit je drei Tönen pro Saite. Vorteil gegenüber CAGED-Boxen:
gleichmäßiges Fingermuster, ideal für Legato und schnelle Läufe. Nachteil: die
Formen sagen nichts über die darunterliegenden Akkorde.

### 4.7 Voice Leading

Die Regel, die 90 % ausmacht: **gemeinsame Töne liegen lassen, den Rest den
kürzesten Weg gehen.** Bei ii–V–I in C bewegen sich die Guide Tones nur um je
einen Halbton: F/C → F/B → E/B. Ein Voicing-Suchalgorithmus, der auf minimale
Bewegung zur Vorgängerform optimiert, klingt sofort musikalischer als einer, der
jede Form einzeln nach Greifbarkeit bewertet.

*Status:* implementiert. `voicingSearch.ts` bewertet den einzelnen Griff,
`voicingPath.ts` wählt die ganze Folge als kürzesten Weg — gemeinsame Töne
zählen, Handweg zählt schwerer.

---

## 5. Blues

- **Blue Notes:** b3, b5, b7 gegen einen Dur-Akkord. Der Reiz ist genau die
  Reibung, nicht ihre Auflösung.
- **Dur- und Moll-Pentatonik gemischt** über demselben Akkord ist der
  Standardsound (b3 → 3 als Bending-Ziel).
- **Alle Akkorde sind Dominantseptakkorde**, auch die Tonika. Theoretisch falsch,
  praktisch das Genre.
- **Turnarounds** in den letzten zwei Takten, chromatisch absteigende Linie über
  I.
- **Shuffle/Swing:** Achtel im Verhältnis ca. 2:1 statt 1:1, real eher 1,7:1 bis
  2,2:1 je nach Tempo — schnellere Tempi swingen weniger.

*Status:* Blues-Skala, 12-Takt-Preset und **Shuffle** (`SwingFeel` in
`rhythm.ts`) vorhanden. Es fehlen Turnarounds und der Quick Change.

---

## 6. Rhythmus

**Taktarten:** 4/4 dominiert; 3/4 (Walzer), 6/8 (Ballade, zusammengesetzt),
12/8 (Slow Blues), 5/4 und 7/8 als Odd Meter.

**Gängige Schlagmuster im 4/4** (D = down, U = up, - = Pause, Raster: Achtel):

| Muster | Slots | Wo |
| --- | --- | --- |
| Viertel | D-D-D-D- | alles |
| Achtel | DUDUDUDU | Pop, Punk |
| "Standard" | DU-UDU | Lagerfeuer |
| Folk | D-DUUDU | Folk, Country |
| Reggae Skank | -U-U-U-U | Offbeat |
| Rock-Anschlag | D--D--D- | Halftime |

**Auflösung.** Achtel reichen für die meisten Muster, **Sechzehntel** braucht man
für Funk und für Galopp-Figuren (D-DD). `SLOTS_PER_BEAT` von 2 auf 4 zu erhöhen
wäre die zugehörige Änderung — mit Rückwärtskompatibilität für die
URL-Serialisierung.

**Swing** als Verhältnis, nicht als eigenes Raster: das zweite Achtel wandert von
50 % auf ~66 % der Zählzeit. Eine einzige Zahl im Transport, kein neues
Pattern-Format.

*Status:* `rhythm.ts` hat Achtelraster, Down/Up, drei Presets, Metronom, Count-In
und **Swing** (gerade / Shuffle, über `slotTime`). Keine Sechzehntel, keine
Palm-Mute-/Akzent-Stufen.

---

## Quellen

- [Berklee Online — Music Modes: Major and Minor Modal Scales](https://online.berklee.edu/takenote/music-modes-major-and-minor/)
- [Jazz Library — What Is An Avoid Note In Jazz?](https://jazz-library.com/articles/avoid-notes/)
- [Jazz Guitar Online — Drop 2 Chords](https://www.jazzguitar.be/blog/drop-2-chords/)
- [Jazz Guitar Online — Drop 3 Chords & Inversions](https://www.jazzguitar.be/blog/drop-3-chords-and-inversions/)
- [Learn Jazz Standards — Drop 2 Voicings](https://www.learnjazzstandards.com/blog/drop-2-voicings/)
- [PianoGroove — Modes of the Major Scale](https://www.pianogroove.com/jazz-piano-lessons/modes-major-scale-tutorial/)
