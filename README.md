# Fretboard Atlas

Tonarten auf dem Gitarrengriffbrett sichtbar machen: Skalen, Lagen, leitereigene
Akkorde und Griffe. Läuft komplett im Browser — kein Backend, keine API.

Ein Atlas kartiert und lässt navigieren — genau das tut die App mit dem Hals.

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

Eine Lage ("Box") ist übrigens nichts anderes als ein **Fünf-Bund-Fenster**. Die
berühmte Box 1 der A-Moll-Pentatonik ist exakt "alle Skalentöne zwischen Bund 4
und 8". Die Fenster liegen dort, wo die Skalenstufen der Reihe nach auf der
tiefsten Saite landen — für A-Moll-Pentatonik ergibt das die Bünde 5, 8, 10, 12
und 15, also genau die fünf Positionen, die man lernt.

## Zustand

Alles steht in der URL (`?root=Eb&scale=minor-pentatonic&tuning=drop-d&capo=3`).
Damit übersteht die Ansicht einen Reload und lässt sich als Link verschicken —
was `localStorage` nicht könnte. Geschrieben wird nur, was vom Default abweicht;
Unsinn in der URL fällt auf die Defaults zurück, statt zu werfen.

**Eine Ausnahme: die Darstellung (hell/dunkel) liegt im `localStorage`.** Genau
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
