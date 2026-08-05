# Was aus der Recherche für die App folgt

Sortiert nach Verhältnis von Nutzen zu Aufwand. Jeder Punkt nennt die Datei, an
der er ansetzt.

> **Stand 5. August 2026 — schon erledigt:** A2 (Nonakkorde), A5 (D Standard und
> Drop C), B1 (Voice Leading), B4 (Swing — Sechzehntel noch nicht) und C2
> (Amp-Archetypen). Die Einträge stehen unten weiter drin, weil ihre Begründung
> und ihre Fallstricke gültig bleiben; sie sind mit **[erledigt]** markiert.

**Der Maßstab, an dem sich alles messen lassen muss:** Der Fretboard Atlas
kartiert den Hals. Er ist kein Amp-Simulator und kein Multieffekt. Ein
Audio-Feature ist nur dann eins, wenn es hilft zu *hören*, was man *sieht* —
sonst ist es ein Hobby im Hobby.

---

## A. Theorie: viel Nutzen, wenig Aufwand

### A1 — Mehr Skalentypen
`src/theory/ScaleType.ts`, reine Datenerweiterung.

Phrygisch Dominant, Lydisch Dominant, Altered, Dur-Blues, Harmonisch Dur,
Ganzton, HTGT/GTHT. Halbtonwerte stehen in [`musiktheorie.md`](musiktheorie.md).

**Der Haken:** Symmetrische Skalen haben keine saubere
Sieben-Buchstaben-Schreibung. `diatonicSteps` muss dort Dopplungen enthalten
(die Blues-Skala macht das schon vor), und der bestehende Test „jeder Buchstabe
genau einmal" darf für diese Typen nicht gelten. Das ist die eigentliche Arbeit,
nicht die Zahlen.

### A2 — Erweiterte Akkorde — **[erledigt für Nonakkorde]**
`src/theory/Chord.ts`.

`ChordSize` ist jetzt `3 | 4 | 5`, und elf Nonakkord-Qualitäten stehen in der
Tabelle. Sie wurden nicht nach Geschmack gewählt: ein Test stapelt fünf Terzen
auf jeder Stufe jeder angebotenen 7-stufigen Skala und verlangt, dass jeder
Stapel einen Namen hat. Die letzte Lücke war die VI. Stufe in Harmonisch Moll —
ein maj7 mit übermäßiger None, den niemand absichtlich schreibt.

`voicingSearch.ts` hat dafür eine dritte Suchstufe bekommen (Quinte weg, Spanne
aber weiterhin handbreit); ohne sie fand ein Fünfklang auf sechs Saiten nichts.

**Noch offen:** 11er und 13er, sus- und alterierte Erweiterungen (7#9, 7#5,
7sus4, 6/9). Bei 11 über Dur fliegt die Terz statt der Quinte — `droppableTones`
in `voicingSearch.ts` ist die Stelle dafür.

### A3 — Charakteristischer Ton und Avoid Note pro Modus
`ScaleType.ts` (zwei optionale Felder), `FretboardView.tsx` (Darstellung).

Der eine Ton, der Dorisch von Äolisch unterscheidet, hervorgehoben. Didaktisch
der höchste Ertrag pro Codezeile im ganzen Dokument: Modi sind genau deshalb
schwer, weil man sie ohne diesen Ton nicht hört.

### A4 — Dreiklänge auf Saitensets
`src/theory/ChordShape.ts` oder neue Datei.

Grundstellung + zwei Umkehrungen auf 6-5-4, 5-4-3, 4-3-2, 3-2-1. Zwölf Formen
pro Qualität. Klein, klanglich sofort brauchbar, und der beste Weg, Umkehrungen
zu begreifen. Der bestehende Test „jede Form auf jedem Grundton nachspielen und
mit dem Akkord vergleichen" trägt das direkt mit.

### A5 — Mehr Stimmungen — **[erledigt für D Standard und Drop C]**
`src/theory/Tuning.ts` (Daten), `ChordShape.ts` (Formsets).

MIDI-Werte und Intervallmuster stehen in [`e-gitarre.md`](e-gitarre.md).
D Standard und Drop C haben **nichts** gekostet: sie teilen sich das
Intervallmuster mit Standard bzw. Drop D und erben deshalb alle Griffe. Ein Test
in `Tuning.test.ts` hält das fest — wer eine Stimmung mit neuem Muster ergänzt,
erfährt dort, dass er auch ein Formen-Set braucht.

**Noch offen:** **Alle Quarten** (`[5,5,5,5,5]`) wäre ein eigenes, besonders
einfaches Set — keine G→B-Ausnahme, jede Form überall gleich. Open-Tunings
liefern über `voicingsFor` weiterhin `[]`; das ist die richtige Antwort, solange
`voicingSearch.ts` einspringt.

### A6 — Progressions-Presets
`src/theory/Progression.ts`, reine Daten.

Andalusisch, Royal Road, Canon, Rhythm Changes, Blues Quick Change, Minor Blues,
Modal Vamps. Tabelle in [`musiktheorie.md`](musiktheorie.md).

### A7 — Harmonische Funktion anzeigen
`Progression.ts` / `ProgressionChord.tsx`.

T/S/D neben der Stufenbezeichnung. Drei Zeilen Logik, und die Progression wird
lesbar statt nur benennbar.

---

## B. Theorie: mehr Aufwand, deutlicher Sprung

### B1 — Voice Leading in der Voicing-Suche — **[erledigt]**
`src/theory/voicingPath.ts` (neu), `App.tsx`.

Die Griffe einer Folge werden als **Kette** gewählt statt Akkord für Akkord: ein
Viterbi über die Kandidatenlisten, Kosten aus Handweg minus gemeinsamen Tönen
plus Greifbarkeit. Über alle acht Presets in sechs Tonarten sank die
Gesamt-Handbewegung von 240 auf 128 Bünde, ohne dass eine einzige Folge
schlechter wurde.

**Die Lehre, die im Kommentar steht:** Das Gewicht der Greifbarkeit war der
ganze Kampf. Bei vollem Gewicht wandert die Hand zehn Bünde weit für eine offene
Saite — der 12-Takt-Blues in A wurde damit von 6 auf 18 Bünde schlechter, weil
A7 und E7 einen offenen Griff haben und D7 keinen.

### B2 — Drop-2- und Drop-3-Voicings
Neue Datei neben `ChordShape.ts`.

Algorithmisch erzeugbar, nicht abzutippen: enge Lage → vier Umkehrungen → aus
jeder das Drop-2 bilden → auf Saitensets legen. **Reihenfolge beachten:** erst
umkehren, dann droppen.

### B3 — Zwischendominanten und Modal Interchange
`Progression.ts`, `keyMatch.ts`.

`keyMatch.ts` kennt schon `outsiders`. Statt „passt nicht" könnte dort stehen
„V7/vi" oder „bVII aus Moll geliehen". Das macht aus dem KeyFinder ein
Analysewerkzeug.

### B4 — Sechzehntel und Swing im Rhythmus — **[Swing erledigt]**
`src/theory/rhythm.ts`.

Swing ist **kein neues Raster**, sondern eine Zahl, und genau so ist er gebaut:
`slotTime()` ist die einzige Stelle, an der Slots zu Zeit werden, und `SwingFeel`
verschiebt dort nur das Offbeat. Muster, Länge und URL-Serialisierung bleiben
unberührt; bei `straight` kommt exakt die alte Multiplikation heraus, und ein
Test hält das fest.

Der subtile Teil war nicht das Timing, sondern `untilNext`: unter Swing sind die
Abstände ungleich, und daran bemisst sich, wie lang ein abgestoppter Ton klingt.

**Noch offen:** Sechzehntel — `SLOTS_PER_BEAT` von 2 auf 4, mit
Rückwärtskompatibilität für die URL, sonst zerlegt es jeden geteilten Link.
`audio.ts` und `urlState.ts` lesen die Konstante inzwischen, statt selbst durch 2
zu teilen; das war die Voraussetzung dafür.

### B5 — Bending, Hammer-On, Slide
`src/audio.ts`, `src/theory/rhythm.ts`.

Alles davon ist ein Tonhöhenverlauf auf einer bestehenden Note, kein neuer Ton —
in Web Audio ein `linearRampToValueAtTime` auf `playbackRate`. Für die
Blues-Darstellung der fehlende Baustein: die b3→3-Bewegung ist der Blues, und
sie lässt sich derzeit weder zeigen noch hören.

---

## C. Klang: was sich lohnt

### C1 — Tone Stack als Regler
`src/synth/amp.ts`, `src/audio.ts`.

Bass/Mitten/Höhen als drei Biquads (Low-Shelf, Peaking, High-Shelf), Werte aus
[`verstaerker.md`](verstaerker.md). Der Nutzer versteht sofort, was er dreht, und
der bestehende Referenz-Renderer in `amp.ts` kann die Kurven testen. Eine exakte
Nachbildung des FMV-Netzwerks (Übertragungsfunktion 3. Ordnung, bilineare
Transformation) wäre möglich, ist aber für einen Trainer Overkill.

### C2 — Amp-Voicings statt einem Amp — **[erledigt]**
`src/synth/amp.ts`, `scripts/measure-makeup.html`.

`AMPS` hält vier Archetypen; `british-crunch` ist der bisherige Amp, unverändert
bis zur letzten Stelle. Die Auswahl steht in der URL (`?amp=…`) und wird über
`applyAmpSpec()` in die schon verdrahteten Nodes geschrieben — dasselbe Muster
wie `applyTone`, kein Umstecken im Graphen.

**Der Fallstrick war real, und die Zahlen sagen wie sehr:** `makeup` muss pro
Archetyp in einem `OfflineAudioContext` mit den echten Aufnahmen gemessen werden.
Geschätzt und danach gemessen lagen 6,2 dB (American Clean), 4,4 dB (British
Chime) und 2,1 dB (Modern High Gain) dazwischen. Dass die Messvorrichtung selbst
stimmt, zeigt der Crunch-Amp: Sie liefert 0,0477 für die unabhängig gemessenen
0,0478 — 0,02 dB.

Das Skript ist eine Seite und kein Test, weil es in Node keinen
`OfflineAudioContext` gibt und der Referenz-Renderer aus `amp.ts` für den Pegel
nicht taugt (Crest-Faktor 7,95 gegen 13,02 dB).

### C3 — Reverb
`src/audio.ts`.

`ConvolverNode` mit einer **generierten** Impulsantwort: Rauschen mit
exponentiell fallender Hüllkurve, 0,8–2 s. Kostet keine Datei, keinen Download,
und eine trockene Gitarre klingt in einer Trainer-App unangenehm klinisch. Der
größte wahrgenommene Klanggewinn pro Zeile im ganzen Audioteil.

### C4 — Delay
`src/audio.ts`.

`DelayNode` + `GainNode` im Feedback + Tiefpass im Feedbackpfad (das macht aus
digital „analog"). An die BPM des Transports gebunden: Viertel = 60000/BPM ms,
punktierte Achtel = 45000/BPM ms. Passt zum vorhandenen Transport, ohne dass ein
neues Zeitkonzept nötig wäre.

### C5 — Pickup-Position
`src/audio.ts`, `VOICES`.

Neck/Bridge als **Peaking-Filter an der Resonanz**: Humbucker/Neck bei 2–4 kHz,
Single Coil/Bridge bei 5–8 kHz, dazu ein Low-Shelf für den Pegelunterschied.
Zwei Filter, ein hörbarer Unterschied, und fachlich korrekt — die Resonanz *ist*
der Unterschied zwischen den Pickup-Typen, nicht ein Nebeneffekt.

---

## D. Klang: eher nicht

Aufgeführt, damit die Entscheidung dagegen nicht in jeder Sitzung neu getroffen
werden muss.

| Idee | Warum nicht |
| --- | --- |
| **Modulation (Chorus/Phaser/Flanger)** | Technisch trivial, aber verwischt Tonhöhen. Genau das Gegenteil dessen, was eine Griffbrett-App tun soll. |
| **Vollständige Pedalkette** | Ein Multieffekt im Browser ist ein eigenes Projekt. Die App würde ihren Zweck verlieren. |
| **Cabinet-IR statt Filter** | Klänge besser, kostet aber eine Datei, einen Download und den Offline-Betrieb-Vorteil. Die zwei Butterworth-Pole in `amp.ts` sind für den Zweck genug. |
| **Pitch Shifter / Harmonizer** | Kein fertiger Web-Audio-Node, Phase Vocoder von Hand. Sehr viel Aufwand für ein Detail. |
| **Sag / Endstufenkompression** | Hörbar nur bei Pegeln, die niemand in einer Web-App fährt. |
| **Fuzz** | Klingt nur mit dem echten Zusammenspiel aus Pickup-Impedanz und Volume-Poti richtig. Ohne das ist es nur ein harter Clipper. |

---

## Zwei Regeln, die aus der Historie dieses Projekts stammen

**Nichtlinearitäten gehören auf den Bus.** Sechs einzeln verzerrte Saiten sind
kein verzerrter Akkord — die Intermodulation zwischen den Saiten ist der ganze
Punkt. Das gilt für jeden neuen Verzerrer, Kompressor oder Gate. Filter und
Delays dürfen dagegen überall stehen. Steht ausführlich im Kopf von
`src/synth/amp.ts`; es hat drei Anläufe gekostet, das herauszufinden.

**Was nicht im `OfflineAudioContext` messbar ist, ist nicht fertig.** Der Amp
hat einen Referenz-Renderer in reiner Arithmetik, weil es in Node keinen
AudioContext gibt. Jeder neue Audiobaustein sollte denselben Weg gehen, sonst
gibt es für ihn keinen Test.
