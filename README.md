# Fretboard Atlas

Tonarten auf dem Gitarrengriffbrett sichtbar machen: Skalen, Lagen, leitereigene
Akkorde und Griffe. Läuft komplett im Browser — kein Backend, keine API.

Ein Atlas kartiert und lässt navigieren — genau das tut die App mit dem Hals.

Offen wird zuerst die Karte selbst gezeigt: **jeder Ton auf dem Hals**, darunter
drei Wege hinein („Eine Tonart erkunden", „Akkorde zu einem Song", „Einen Ton
finden") und ein paar Tonarten zum Antippen. Eine Tonart ist etwas, das man
wählt — über den einen Knopf „Tonart wählen" — und erst mit ihr kommen Stufen,
Lagen, Stufenakkorde und die Akkordfolge dazu.

Die schwarzen Tasten tragen auf der offenen Karte **einen** Namen — ♯ oder ♭, per
Schalter neben dem Tonart-Knopf. Beide gleichzeitig waren richtig, aber
zweizeilige 9-px-Schrift; der andere Name steht weiter im Titel jedes Punkts.

**Ein Ton wird gefunden, indem man ihn antippt.** Er klingt, und jede Stelle mit
demselben Ton leuchtet auf; die Stellen mit *genau derselben Tonhöhe* sind
zusätzlich umrandet, damit „dieses C" von „jedem C" zu unterscheiden ist. Derselbe Ton
noch einmal angetippt hebt das wieder auf; mit gewählter Lage bleiben die Treffer
außerhalb sichtbar, nur etwas leiser. Auf der Karte ohne Tonart sind die
schwarzen Tasten dunkler gezeichnet, wie auf einer Klaviatur. Unter
einer Tonart wählt das Antippen die passende Stufe. Während ein Akkord
hervorgehoben ist, bleibt er stehen — man spielt dann über ihn.

## Bedienung in drei Ebenen

Die Oberfläche ist nach Häufigkeit geordnet, nicht nach Vollständigkeit:

1. **Immer sichtbar:** Tonart-Knopf, Hals, Lagen (1 Tipp je Lage), Stufen-Chips,
   Stufenakkorde, Akkordfolge, ▶.
2. **Ein Klick:** „Ansicht" (Notennamen/Stufen, Lagen-Ausschnitt, CAGED),
   Griffwahl je Akkord, Rhythmus-Stile, Klang-Voreinstellungen.
3. **Für Fortgeschrittene, eingeklappt:** Stimmung, Kapo, Bünde, Verstärker,
   Tonabnehmer, EQ, Hall, Delay, Taktart, Schlagmuster, Groove.

Faustregel für Neues: *Hilft es, den Hals zu verstehen? Ebene 1–2. Klingt es nur
schöner? Ebene 3.*

## Entwicklung

```bash
npm install
npm run dev        # localhost:5173
npm run dev:lan    # zusätzlich im WLAN erreichbar, z.B. fürs Handy
npm test           # Vitest
npm run build      # Typecheck + Produktions-Build nach dist/
```

`npm run icons` rendert die PWA-Icons aus `scripts/icon.svg` neu. Nur nötig, wenn
sich das Icon ändert — die PNGs liegen fertig im Repo.

## Aufbau

`App.tsx` setzt nur zusammen. Was aus dem Zustand folgt, steckt in Hooks:
`useNeckModel` (Tonart, Hals, Lagen, CAGED), `useProgression` (Folge und Griffe),
`useHighlight` (was hervorgehoben ist), `useAudioPlayer`, `useScaleRun` und
`useTransport`.

Die Musiktheorie steckt vollständig in `src/theory/` und kennt weder React noch
das DOM:

| Datei | Aufgabe |
| --- | --- |
| `Note.ts` | Ton als **Buchstabe + Vorzeichen**, nicht als Halbtonzahl |
| `ScaleType.ts` | Intervallmuster der Skalentypen |
| `Scale.ts` | Tonart = Grundton + Typ; Skalentöne, Stufen |
| `Tuning.ts` | Stimmungen (Standard, Drop D), Kapo |
| `Fretboard.ts` | Ton pro Saite/Bund, Lagen ("Boxen") |
| `Chord.ts` | Leitereigene Akkorde durch Terzschichtung |
| `ChordShape.ts` | Greifbare Akkordformen je Stimmung |
| `voicingPath.ts` | Ein Griff je Akkord — als Folge, nicht einzeln |
| `transpose.ts` | Akkordsymbole in eine andere Tonart verschieben, richtig buchstabiert |
| `Progression.ts` | Gängige Akkordfolgen |
| `format.ts` | Namen für die Anzeige: `#`/`b` werden zu ♯/♭ |

### Zwei Entscheidungen, die den Rest tragen

**Töne sind Buchstabe + Vorzeichen, keine Zahlen 0–11.** Sonst lassen sich
Tonarten nicht korrekt buchstabieren: F#-Dur braucht ein **E#**, kein F, und
Gb-Dur ein **Cb**, kein B. Ein Test prüft für alle 14 Dur-Tonarten, dass jeder
Buchstabe genau einmal vorkommt.

Auf dem Schirm steht dann **F♯** und **C♭**. Das ist bewusst eine eigene Schicht
(`format.ts`) und keine Änderung an `name()`: die ASCII-Schreibweise trägt die
URL (`?root=Eb`, `prog=custom:C,G,Am,F`) und wird von `parse()` wieder
eingelesen. Ein ♭ an dieser Stelle hätte jeden geteilten Link zerlegt.

**Akkordformen hängen an den Intervallen zwischen den Saiten, nicht an den
Tonhöhen.** Deshalb sind die Formen nach Intervallmuster gruppiert
(`SHAPE_SETS`): Standard ist `[5,5,5,4,5]`, Drop D ist `[7,5,5,4,5]`. Ein Kapo
verschiebt alle Saiten gleich, lässt das Muster also unberührt — deshalb gelten
dieselben Griffe. Für eine Stimmung ohne passendes Set liefert `voicingsFor`
bewusst `[]`, statt einen Griff zu zeigen, der dort anders klingen würde.

Die Griffe sind nicht auf gut Glück abgetippt: ein Test spielt **jede Form jedes
Sets auf jedem Grundton** in ihrer Stimmung nach und vergleicht die klingenden
Tonhöhen mit dem Akkord.

**Welcher Griff gespielt wird, entscheidet die ganze Folge, nicht der einzelne
Akkord.** Jeden für sich am bequemsten zu wählen schickt die Hand über den Hals,
obwohl der nächste Akkord meist einen Griff dort hat, wo sie schon steht.
`voicingPath.ts` sucht deshalb den kürzesten Weg durch alle Kandidaten:
gemeinsame Töne zählen als Gewinn, Handweg als Kosten. Über alle Presets in sechs
Tonarten sank die Handbewegung von 240 auf 128 Bünde.

Das Gewicht der Bequemlichkeit gegen den Weg ist gemessen und nicht geraten — bei
vollem Gewicht wandert die Hand zehn Bünde weit für eine offene Saite, und der
12-Takt-Blues in A wurde damit schlechter statt besser.

**Der kürzeste Weg allein war aber blind dafür, *wo* die Hand ist.** G – D – Em – C
kam als vier Barrés zwischen dem 7. und 10. Bund heraus: ein kurzer Weg, den kein
Anfänger greifen kann. Zwei Dinge haben das behoben. Erstens kennt
`ChordShape.ts` jetzt die offenen Griffe, die jeder zuerst lernt (C, G, D, Dm, D7,
G7, B7, Cmaj7 …) — als `openOnly`-Formen, die nur am Sattel platziert werden und
deshalb nie als unspielbare Streckgriffe den Hals hinaufwandern — und die „kleine
Form" auf den oberen vier Saiten, mit der fast jeder das F zuerst spielt. Zweitens
zieht `voicingPath` mit `preferOpen` jeden Akkord leicht zum Sattel
(`NUT_PULL`). Das ist die Vorgabe („Offene Griffe zuerst"); „Kürzeste Wege"
schaltet den Zug ab.

Eine Lage ("Box") ist übrigens nichts anderes als ein **Fünf-Bund-Fenster**. Die
berühmte Box 1 der A-Moll-Pentatonik ist exakt "alle Skalentöne zwischen Bund 4
und 8". Die Fenster liegen dort, wo die Skalenstufen der Reihe nach auf der
tiefsten Saite landen — für A-Moll-Pentatonik ergibt das die Bünde 5, 8, 10, 12
und 15, also genau die fünf Positionen, die man lernt.

### Fachliches Hintergrundwissen

`docs/` sammelt Recherche zu Musiktheorie, E-Gitarre, Effektpedalen und
Verstärkern — was es in Musik und Hardware gibt, mit Quellen, plus eine
Bewertung, was davon in diese App gehört. Nachschlagen, bevor eine neue Skala,
ein Akkordtyp oder ein Klangbaustein aus dem Gedächtnis entsteht.

### Der Verstärker ist eine Tabelle, und jeder Eintrag ist gemessen

`src/synth/amp.ts` hält vier Archetypen — American Clean, British Chime, British
Crunch, Modern High Gain. Der Ausgleichspegel `makeup` jedes einzelnen kommt aus
`scripts/measure-makeup.html`, das die echten Aufnahmen durch den echten Graphen
in einem `OfflineAudioContext` schickt. Er lässt sich nicht ausrechnen: Modell
und Aufnahme treiben die Kennlinie unterschiedlich stark, und beim Anlegen der
drei neuen Amps lagen Schätzung und Messung bis zu 6,2 dB auseinander. Wer an
`preGain`, `drive` oder einem Filter dreht, misst neu — sonst ändert der
Umschalter die Lautstärke statt den Klang.

Wie ernst das gemeint ist, zeigt ein Fehler, den es lange gab: die Messseite
hatte eine Pegelkonstante aus `audio.ts` nachgebaut statt sie zu importieren,
mit 0,7 im Exponenten statt 0,65. Damit hat sie jeden Verstärker bei einem Pegel
angehört, den die App nie spielt — und weil die Kennlinie komprimiert, war der
Fehler beim High-Gain-Amp dreimal so groß wie beim cleanen. **Eine
Messvorrichtung darf nichts nachbauen, was sie importieren kann.**

### Davor die Gitarre, danach der Raum

Vor dem Verstärker sitzt der Tonabnehmer (`src/synth/pickup.ts`), dahinter die
Klangregelung (`toneStack.ts`) und die beiden Effekte (`delay.ts`, `reverb.ts`).
Die Reihenfolge ist die eines echten Rigs, und die Stelle jedes Bausteins ist
jeweils eine Entscheidung mit einem Grund — beide Dateien sagen ihn im Kopf.

Was sie eint: **ihre Vorgaben sind arithmetisch nicht vorhanden.** Der Pickup
steht auf „wie aufgenommen" und ist damit ein Draht, die Regler stehen auf 0 dB
und sind es auch, und Hall und Delay hängen an Sends mit Verstärkung 0 — und
`x + 0` ist in IEEE 754 exakt. Im Browser nachgemessen liefern alle vier
Verstärker mit diesen Bausteinen im Graphen denselben Rohpegel wie ohne sie, auf
die letzte Stelle; `scripts/measure-space.html` zeigt dasselbe für Hall und Delay
sample-genau.

**Eine Sache hat sich trotzdem verschoben, und sie gehört genannt.** Die cleane
Stimme trug bisher fest verdrahtet +2 dB bei 2600 Hz. Das war eine
Pickup-Resonanz, sie steht jetzt zur Wahl statt im Code, und die Vorgabe ist
damit die Aufnahme ohne Zutat. Weil die cleane Stimme die **Referenz** ist,
gegen die jeder Verstärker ausgeglichen wird, sind alle vier `makeup`-Werte um
dieselben 0,22 dB mitgewandert. Der verzerrte Weg ist unverändert; der cleane ist
eine Spur schlichter als vorher.

## Zustand

Alles steht in der URL (`?root=Eb&scale=minor-pentatonic&tuning=drop-d&capo=3`).
Damit übersteht die Ansicht einen Reload und lässt sich als Link verschicken —
was `localStorage` nicht könnte. Geschrieben wird nur, was vom Default abweicht;
Unsinn in der URL fällt auf die Defaults zurück, statt zu werfen.

`scale` fehlt genau dann, wenn keine Tonart gewählt ist — `scaleTypeId: null` ist
der Default und damit die leere URL. Ein unbekannter Skalenname landet ebenfalls
dort statt in irgendeiner Tonart, nach der die URL nie gefragt hat: alle Töne zu
zeigen ist die eine Antwort, die nicht falsch sein kann.

**Ausnahmen: Darstellung (hell/dunkel), Linkshänder, Halsausrichtung und ♯/♭
liegen im `localStorage`** (`useTheme`, `useViewPrefs`). Auf dem Handy steht der
Hals unter „Automatisch" senkrecht — dann sind alle Bünde lesbar untereinander
statt fünf und ein Wisch. Deshalb setzt ein schmaler Bildschirm auch keine
12 Bünde mehr in die URL: ein Link liest sich auf jedem Gerät gleich.

Für die Darstellung im Einzelnen: Genau
das Argument für die URL spricht hier dagegen — ein Link soll die Musik
transportieren, nicht die Augen des Absenders. `?theme=dark` würde dem Empfänger
im Sonnenlicht eine fremde Vorliebe aufzwingen. Jedes Feld in `AppState`
beschreibt das Instrument oder die Musik; keines den Betrachter.

## Deployment

Live unter <https://jannes105.github.io/Fretboard-Atlas/>.

GitHub Actions baut die Seite bei jedem Push auf `main`, lässt die Tests laufen
und veröffentlicht sie auf GitHub Pages (siehe `.github/workflows/deploy.yml`).
Für ein öffentliches Repository sind die Actions-Minuten unbegrenzt und Pages
kostenlos — die weichen Grenzen (1 GB Seite, 100 GB Traffic im Monat, 10 Builds
pro Stunde) liegen für dieses Projekt außer Reichweite: der ganze Build wiegt
unter 1 MB.

Über HTTPS registriert sich der Service Worker, danach läuft die App **offline**
— praktisch, wenn im Proberaum kein Netz ist.

Zwei Eigenheiten, die daraus folgen:

**Die Seite liegt unter einem Unterpfad** (`/Fretboard-Atlas/`), nicht im
Wurzelverzeichnis. `vite.config.ts` setzt `base` deshalb nur, wenn die Umgebungs-
variable `GITHUB_PAGES` gesetzt ist — lokal bleibt alles unter `/`. Wer den
Pages-Stand nachstellen will: `GITHUB_PAGES=true npm run build`.

**GitHub Pages kennt keine Weiterleitungen und keine eigenen HTTP-Header.** Den
SPA-Fallback erledigt eine Kopie von `index.html` als `404.html`, die der
Workflow anlegt. Eigene Cache-Regeln gibt es nicht; GitHub liefert `sw.js` mit
`max-age=600` aus, ein Update erreicht ein offenes Gerät also nach spätestens
zehn Minuten.
