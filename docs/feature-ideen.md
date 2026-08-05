# Was aus der Recherche für die App folgt

Sortiert nach Verhältnis von Nutzen zu Aufwand. Jeder Punkt nennt die Datei, an
der er ansetzt.

> **Stand 5. August 2026 — schon erledigt:** A2 (Nonakkorde), A5 (D Standard und
> Drop C), B1 (Voice Leading), B4 (Swing — Sechzehntel noch nicht) und **der
> ganze Abschnitt C**: C1 (Tone Stack), C2 (Amp-Archetypen), C3 (Reverb), C4
> (Delay) und C5 (Pickup). Die Einträge stehen unten weiter drin, weil ihre
> Begründung und ihre Fallstricke gültig bleiben; sie sind mit **[erledigt]**
> markiert.

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

### C1 — Tone Stack als Regler — **[erledigt]**
`src/synth/toneStack.ts` (neu), `src/audio.ts`.

Bass 160 Hz (Low-Shelf), Mitten 500 Hz (Peaking), Höhen 2400 Hz (High-Shelf), je
−6…+6 dB in ganzen Dezibel. Die Frequenzen sind die gemessenen 5F6-A-Zahlen aus
[`verstaerker.md`](verstaerker.md) §2 und keine runden Wunschwerte.

**Die eine Entscheidung, die alles andere trägt: der Stack sitzt hinter der
Summe, nicht im Verstärker.** Damit gibt er die Hälfte auf, die
`verstaerker.md` §1 ihm zuschreibt — er entscheidet nicht mehr mit, *was* danach
verzerrt wird. Der Grund ist `AMP.makeup`: das ist ein **Verhältnis** zwischen
dem cleanen und dem verzerrten Weg, ein gemessener Wert pro Amp. Ein Stack
*innerhalb* des Verstärkers würde dieses Verhältnis bei jeder Reglerbewegung
verschieben, weil die Kennlinie komprimiert — und dann könnte keine einzelne
gemessene Zahl mehr stimmen. Hinter der Summe skaliert er beide Wege um denselben
Faktor, und das Verhältnis bleibt.

`StageKind` musste dafür um `'highshelf'` wachsen. Der neue Zweig in
`coefficients()` ist der Low-Shelf mit umgedrehtem Vorzeichen am Kosinusterm —
ein Parameter `lean`, kein zweiter Block. Geprüft wird er nicht durch Hinsehen,
sondern über zwei Eigenschaften: ein Shelf liegt auf seiner Eckfrequenz bei
**exakt der Hälfte seiner dB-Verstärkung**, und +g und −g sind dort auf 0,01 dB
zueinander invers.

**Was flach heißt, ist messbar:** bei 0/0/0 ist A = 1, damit ist jeder RBJ-Zähler
sein eigener Nenner, und `toneStack.test.ts` hält das auf 1e-12 fest. Genau
deshalb mussten die vier `makeup`-Werte für dieses Feature nicht neu gemessen
werden — und die Messseite hat es im Browser bestätigt: mit dem Stack im Graphen
kommen alle vier Rohpegel auf die letzte Stelle gleich heraus.

**Nicht modelliert und bewusst so:** der echte Stack ist passiv, kann also nur
dämpfen, und seine Regler sind nicht orthogonal. Drei getrennte Biquads sind
beides nicht. Ein Test hält immerhin fest, dass Bass voll aufgedreht bei 500 Hz
unter 1,5 dB bewegt — die Vereinfachung darf nicht auslaufen.

### C2 — Amp-Voicings statt einem Amp — **[erledigt]**
`src/synth/amp.ts`, `scripts/measure-makeup.html`.

`AMPS` hält vier Archetypen; `british-crunch` ist der bisherige Amp, unverändert
bis zur letzten Stelle. Die Auswahl steht in der URL (`?amp=…`) und wird über
`applyAmpSpec()` in die schon verdrahteten Nodes geschrieben — dasselbe Muster
wie `applyTone`, kein Umstecken im Graphen.

**Der Fallstrick war real, und die Zahlen sagen wie sehr:** `makeup` muss pro
Archetyp in einem `OfflineAudioContext` mit den echten Aufnahmen gemessen werden.
Geschätzt und danach gemessen lagen 6,2 dB (American Clean), 4,4 dB (British
Chime) und 2,1 dB (Modern High Gain) dazwischen.

Das Skript ist eine Seite und kein Test, weil es in Node keinen
`OfflineAudioContext` gibt und der Referenz-Renderer aus `amp.ts` für den Pegel
nicht taugt (Crest-Faktor 7,95 gegen 13,02 dB).

**Nachtrag, und die härteste Lehre des ganzen Abschnitts: die Messvorrichtung
selbst war falsch.** Die Seite hatte `voicePeak` aus `audio.ts` „sinngemäß"
nachgebaut, mit Exponent 0,7 statt 0,65. Bei sechs Stimmen sind das 0,82 dB — sie
hat also jeden Verstärker bei einem Pegel angehört, den die App nie spielt. Ein
Pegelausgleich, der am falschen Pegel gemessen wird, ist einfach falsch, und
nicht um einen festen Betrag: die Kennlinie komprimiert, also wuchs der Fehler
mit dem Gain — 0,20 dB beim cleanen Amp, 0,43 beim Chime, 0,57 beim Crunch,
0,66 beim High Gain.

Damit fällt auch die Bestätigung weg, die früher hier stand: dass die Seite mit
0,0477 für die unabhängig gemessenen 0,0478 des Crunch-Amps auf 0,02 dB
danebenlag. Beide Zahlen kamen vom selben falschen Pegel — **zwei Fehler, die
sich einig sind, sind keine Bestätigung.** Die Seite importiert `voicePeak` jetzt,
statt ihn zu wiederholen; das ist die einzige Korrektur, die nicht wieder
auseinanderlaufen kann.

### C3 — Reverb — **[erledigt]**
`src/synth/reverb.ts` (neu), `src/audio.ts`.

`ConvolverNode` mit einer generierten Impulsantwort, zwei Räume: Raum (RT60
0,9 s) und Halle (1,8 s). Keine Datei, kein Download, kein Verlust des
Offline-Betriebs.

Drei Zahlen machen daraus einen Raum statt eines Rauschstoßes:

1. **Die Hüllkurve erreicht bei `rt60` genau −60 dB.** Damit *ist* die Zahl in
   der Tabelle die Nachhallzeit, und der Test misst sie zurück statt dem Etikett
   zu glauben.
2. **Die Dämpfung wandert**, von 9000 auf 1800 Hz (Raum) bzw. 7000 auf 900 Hz
   (Halle) — ein Raum verliert seine Höhen lange bevor ihm die Energie ausgeht.
   **Und zwar mit zwei Polen, nicht mit einem:** ein 6-dB/Okt-Pol bei 2,5 kHz
   ließ gemessen immer noch die Hälfte der Energie über 4 kHz stehen und
   verschob den Spektralschwerpunkt in der halben Abklingzeit nur von 10,3 auf
   9,5 kHz. Das ist kein Raum, das ist Rauschen mit einer Meinung. Der Preis
   dafür ist eine Varianzkorrektur, die bei zwei kaskadierten Polen
   `a(1+(1-a)²)/(2-a)³` lautet — ohne sie steilt die schließende Dämpfung das
   Abklingen mit auf, und `rt60` bedeutet still und leise nicht mehr `rt60`.
3. **Die Impulsantwort trägt Energie 1**, und der `ConvolverNode` steht deshalb
   auf `normalize = false`. Erst das Paar macht den Sendepegel zum Hallanteil:
   die Halle ist doppelt so lang wie der Raum und im Browser gemessen trotzdem
   nur 0,29 dB davon entfernt.

Zwei Kanäle aus zwei Saatwerten — der größte wahrgenommene Gewinn im ganzen
Feature und der billigste. Ein Mono-Hall sitzt mitten im Kopf.

**Der Fallstrick beim Messen war nicht der Hall, sondern die Messung.** Der erste
Versuch verglich den Pegel in einem späten Fenster und meldete 7,3 dB
Unterschied — bei 2,2 s ist der 0,9-s-Raum zweieinhalb Abklingzeiten alt und die
1,8-s-Halle erst eine. Was eine Impulsantwort mit Energie 1 verspricht, ist die
**Gesamtenergie**, nicht der Pegel zu irgendeinem Zeitpunkt.

### C4 — Delay — **[erledigt]**
`src/synth/delay.ts` (neu), `src/audio.ts`.

`DelayNode` + `GainNode` im Feedback + Tiefpass bei 3000 Hz im Feedbackpfad, an
die BPM gebunden: Viertel = 60000/BPM ms, punktierte Achtel = 45000/BPM ms. Im
Browser gemessen liegen die Echos 0,06 ms neben dem Sollwert.

**Das Tempo kommt aus `App.tsx`, nicht aus `useTransport`.** Ein einzeln
angeklickter Akkord geht nie durch den Transport und soll trotzdem im Takt
hallen — also bekommt der Player eine eigene `setTempo`-Methode, wie er schon
eine `setAmp` hat.

**Ein Test, der nach einer Formalie aussieht und keine ist:** `delayTime` wird
von Web Audio **ohne jede Meldung** auf `maxDelayTime` beschnitten. Ein späteres,
tieferes `MIN_BPM` würde das Delay also stillschweigend aus dem Takt nehmen,
ohne dass irgendwo ein Fehler entstünde. Deshalb prüft `delay.test.ts` die beiden
Grenzen gegeneinander.

**Weggelassen:** die Sättigung, die die Tabelle in
[`effektpedale.md`](effektpedale.md) §6 einem BBD zuschreibt. Eine
Nichtlinearität in einer Rückkopplungsschleife sieht ihre eigene Ausgabe, und die
stehende Regel dieses Projekts ist, dass Nichtlinearitäten auf den Bus gehören.
Den Charakter trägt der Tiefpass allein — dass jede Wiederholung dunkler wird als
die vorige, ist die Zusicherung, die auffliegt, wenn er je im falschen Pfad
landet.

### C5 — Pickup-Position — **[erledigt]**
`src/synth/pickup.ts` (neu), `src/audio.ts`.

Peaking-Filter an der Resonanz plus Low-Shelf bei 320 Hz für den Pegelunterschied.
2800 Hz und 6300 Hz sind die geometrischen Mitten der in
[`e-gitarre.md`](e-gitarre.md) §1 gemessenen Bänder, die Q-Werte kommen aus §2
(500 kΩ am Humbucker gegen 250 kΩ am Single Coil — die Quelle sagt selbst, dass
der Unterschied ein Q-Unterschied an der Resonanz ist).

**Drei Stellungen und nicht zwei, und die dritte ist die Vorgabe.** Man kann
einen Pickup nicht *heraus*-aufnehmen: die Archtop in `public/samples` wurde
durch einen abgenommen, und der steckt in jedem Ton. Also heißt die Vorgabe
**„wie aufgenommen"**, steht auf 0 dB und ist damit arithmetisch ein Draht;
Hals und Steg *neigen* den Klang, statt einen Pickup zu ersetzen, der gar nicht
zu ersetzen ist. Der Nebeneffekt ist der eigentliche Gewinn: der Verstärker sieht
in der Vorgabe genau den Eingang, gegen den seine vier Pegel gemessen wurden.

**Er sitzt vor dem Verstärker, und das ist der halbe Punkt.** Der Halspickup
fährt die Kennlinie kräftiger an, also verzerrt der Amp eine Spur früher — ein
Pickup *hinter* dem Amp könnte das nicht, und die 6,3 kHz des Stegpickups wären
dort hinter der 4200-Hz-Ecke des Lautsprechers ohnehin verschwunden.

**Was dabei herauskam und einen eigenen Absatz verdient:** vor dem Verstärker
liegen Hals und Steg 3,5 dB auseinander, dahinter nur noch 0,3 dB. Der Amp
schluckt den Pegelunterschied fast vollständig. Genau deshalb gibt es **keinen**
Pegelausgleich pro Pickup — er würde eine Korrektur nachtragen, die sich schon
selbst erledigt hat. Auf der cleanen Stimme hört man den Unterschied dagegen
ganz.

**Nebenwirkung, die ehrlich benannt gehört:** die cleane Stimme hat die +2 dB bei
2600 Hz verloren, die früher fest in `VOICES.clean.tone` standen. Das war eine
Pickup-Resonanz, und sie steht jetzt zur Wahl statt fest verdrahtet zu sein — die
Vorgabe ist damit die Aufnahme, ungefärbt. Sie hat die Referenz 0,22 dB leiser
gemacht und alle vier `makeup`-Werte mit ihr.

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
gibt es für ihn keinen Test. Hall und Delay haben dafür eine eigene Seite
bekommen, `scripts/measure-space.html`: was die beiden *sind*, prüfen ihre
Testdateien in Arithmetik, und was der **Graph** mit ihnen tut, prüft die Seite.

**Eine Messvorrichtung darf nichts nachbauen, was sie importieren kann.** Steht
oben bei C2 ausführlich; in einem Satz: die Makeup-Seite hatte eine Konstante aus
`audio.ts` „sinngemäß" wiederholt und damit vier gemessene Zahlen verdorben, ohne
dass irgendein Test etwas davon merken konnte. Dasselbe gilt für jede spätere
Seite in `scripts/`.

**Und eine, die beim Prüfen von „aus ist aus" auffiel:** dieselben Aufnahmen
zweimal durch denselben Graphen gerendert ergeben **nicht** dieselben Samples.
Sie werden resampelt (`playbackRate` ist nie 1), und Chromes Resampler ist nur
auf etwa 3e-8 reproduzierbar. Für einen Test auf bitgenaue Gleichheit muss die
Quelle deshalb synthetisch und auf Rate 1 sein — sonst misst man den Resampler.
