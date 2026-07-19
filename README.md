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

### Zwei Entscheidungen, die den Rest tragen

**Töne sind Buchstabe + Vorzeichen, keine Zahlen 0–11.** Sonst lassen sich
Tonarten nicht korrekt buchstabieren: F#-Dur braucht ein **E#**, kein F, und
Gb-Dur ein **Cb**, kein B. Ein Test prüft für alle 14 Dur-Tonarten, dass jeder
Buchstabe genau einmal vorkommt.

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

Netlify baut aus diesem Repo (siehe `netlify.toml`). Über HTTPS registriert sich
der Service Worker, danach läuft die App **offline** — praktisch, wenn im
Proberaum kein Netz ist.
