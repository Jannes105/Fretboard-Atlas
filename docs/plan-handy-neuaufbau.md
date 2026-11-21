# Plan: Neuaufbau für das Handy

Stand: 21. November 2026. Noch nicht begonnen.

Entwurf zum Durchklicken: [Fretboard Atlas – Handy-Entwurf](https://claude.ai/artifact/VFrzDZeF1yHpjt7zZhWcPw)
(privat, fünf Bildschirme: Start, Ton gefunden, Tonart wählen, Akkord, Akkordfolge).

## Warum

Die App wird fast nur am Handy benutzt, spontan, meistens um **einen Ton auf dem
Hals zu finden**. Heute ist sie eine lange Seite, die vom Desktop her gedacht ist:

- Der Hals beginnt erst nach ~310 px Kopfbereich und nutzt nur ~270 von 375 px Breite.
- Was man antippt (Stufen, Akkorde, Folge) liegt *unter* einem ~1000 px hohen
  Hals — die Wirkung auf dem Hals ist dann nicht zu sehen.
- Die Popover (Tonart, Ansicht, Klang) legen sich über die Bünde 0–5, also genau
  über das, was sie ändern.
- Die Legende („C4 — an 8 Stellen …") und „Hervorhebung aufheben" schieben beim
  Erscheinen die ganze Seite nach unten.
- Viel Dauer-Erklärtext, auf dem Handy drei- bis viermal so lang wie am Desktop.

## Grundsätze

1. **Handy zuerst.** Jede Entscheidung wird bei 375 × 812 getroffen und geprüft;
   der Desktop muss nur nicht kaputtgehen (gleiches Layout, breiter).
2. **Der Hals ist immer sichtbar.** Er ist die Bühne; alles andere legt sich
   von unten darüber und lässt den oberen Teil frei.
3. **Bedienung im Daumenbereich** — unten, nicht oben.
4. **Nichts springt.** Was erscheint, schwebt (Info-Leiste) oder hat
   reservierten Platz.
5. **Text nur, wo er etwas sagt, das man nicht sieht.** Dauerhinweise fallen weg.
6. **24 Bünde als Standard.** Kleiner machen geht unter „Ansicht" (12 · 15 · 24).

## Zielbild

```
┌──────────────────────────────┐
│ [A Moll-Pentatonik ▾]  [♯|♭] │  Kopfleiste, 64 px
│ LAGE [Ganz][1][2][3][4][5]   │  nur mit Tonart, +52 px
├──────────────────────────────┤
│   E   A   D   G   B   E      │  Saitennamen, sticky
│ 0 ●   ●   ●   ●       ●      │
│ ══════════════════════       │  Sattel
│ 1                 ●          │  Hals: volle Breite,
│ 2         ●   ●              │  Punkte 40 px,
│ …                            │  scrollt zwischen den Leisten
│        ( C4 · 8 Stellen  ✕ ) │  Info-Leiste, schwebt
├──────────────────────────────┤
│ Tonart  Akkorde  Folge Ansicht│  Unterleiste, 72 px
└──────────────────────────────┘
```

- **Ton finden braucht keinen Tab:** Antippen auf dem Hals, wie heute.
- Ein Tab öffnet ein **Blatt von unten** (über der Unterleiste); nochmal tippen
  oder „Fertig" schließt es. Der Hals bleibt darüber sichtbar und scrollbar.
- **Farben:** Orange = Grundton dessen, was gerade gezeigt wird (Tonart oder
  Akkord). Türkis = was ausgewählt ist. Hohl = Akkordton außerhalb der Skala.
- Akkorde/Folge ohne Tonart öffnen das Tonart-Blatt.

### Die vier Blätter

| Tab | Inhalt | kommt aus |
| --- | --- | --- |
| Tonart | Grundton-Raster 6×2, Skalen als Knöpfe, „Weitere Skalen", „Aus Akkorden erkennen", „Keine Tonart" | `KeyPicker`, `KeyFinder` |
| Akkorde | Stufenakkorde als 4er-Raster, Drei-/Vierklang, Griffwahl je Akkord, „+ zur Folge" | `ChordRow`, `ChordDiagram` |
| Folge | Vorlage, Schritte, ▶/Stopp, Tempo, Rhythmus (eingeklappt), Transponieren | `ProgressionPanel`, `RhythmControls`, `TransportDock` |
| Ansicht | Beschriftung Töne/Stufen, Bünde, CAGED, Linkshänder, Darstellung; eingeklappt: Stimmung, Kapo, Klang | `NeckViewPanel`, `AppFooter`, `SetupPanel`, `SoundPanel` |

## Phasen

Jede Phase ist für sich auslieferbar und lässt die App benutzbar.

### Phase 1 — Gerüst
- Neue Komponenten `AppShell` (Kopfleiste · Hals-Bühne · Unterleiste),
  `BottomTabs`, `Sheet` (Blatt von unten, Griff, Escape/Antippen außerhalb schließt).
- Die bestehenden Panels **unverändert** in die vier Blätter umziehen; die lange
  Seite fällt weg. `App.tsx` bleibt Zusammensetzer, der Zustand (`useAppState`,
  Hooks) bleibt wie er ist.
- Offenes Blatt: im Zustand der Seite, nicht in der URL.
- `TransportDock` entfällt — die Folge spielt aus dem Blatt, der aktuelle Akkord
  steht in der Info-Leiste.

### Phase 2 — Hals
- Senkrechter Hals über die volle Breite, Punkte 40 px, Saitennamen sticky.
- `DEFAULT_STATE.fretCount` in `src/urlState.ts` von 15 auf **24**
  (`FRET_COUNTS` kennt 24 schon). Achtung: geteilte Links ohne `frets=` zeigen
  danach 24.
- Bündezahl aus `SetupPanel` nach „Ansicht" holen.
- Lage antippen scrollt den Hals zur Lage.

### Phase 3 — Info-Leiste und Ruhe
- `NeckLegend` wird eine schwebende Leiste über der Unterleiste: Ton
  („C4 · 8 Stellen · Ring = genau diese Tonhöhe ✕") oder Akkord („i Am · A C E ✕").
  Ersetzt „Hervorhebung aufheben" an allen Stellen.
- Dauerhinweise entfernen (Antippen-Hinweis unter dem Hals, Absatz über den
  Stufenakkorden, Untertitel). Auf dem leeren Start ein einzeiliger Hinweis in
  der Info-Leiste.
- Startkarten (`StartScreen`) entfallen; der Start ist der Hals.

### Phase 4 — Tonart und Lage
- Grundton-Raster folgt der ♯/♭-Einstellung (heute immer ♭).
- Lage-Leiste kompakt in der Kopfleiste (eine Zeile, 44 px hoch).
- ♯/♭ bleibt in der Kopfleiste, auch mit Tonart (wirkt dann nur, wo die Tonart
  nichts vorgibt — oder ausblenden; siehe offene Fragen).

### Phase 5 — Akkorde, Folge, Ansicht
- Akkord-Raster mit großen Trefferflächen; „+" nicht mehr halb auf dem Rand,
  sondern als eigener Knopf im Blatt.
- Griffbilder: ausgewählter Akkord zeigt seinen Griff im Blatt.
- Folge: Rhythmus, Schlagmuster, Groove eingeklappt unter „Mehr".
- Ansicht: Klang-Feinabstimmung ganz unten, eingeklappt.

### Phase 6 — Aufräumen
- Instrument-Symbol (Sonne) entfällt mit dem Umzug nach „Ansicht".
- `:focus-visible` statt `:focus` (heute bekommt das ganze Griffbrett nach dem
  Antippen einen Rahmen).
- `App.css` (~1700 Zeilen) auf die neuen Komponenten verteilen.
- Inhaltlich: i–VI–III–VII ist nicht „andalusisch verwandt" (andalusisch =
  i–VII–VI–V).

## Prüfen

- Jede Phase im Browser bei 375 × 812 (senkrechter Hals) durchklicken:
  Ton antippen, Tonart wählen, Lage, Akkord, Folge abspielen. Danach kurz Desktop.
- `App.test.tsx` beschreibt die lange Seite — Tests mit den Phasen umziehen,
  nicht am Ende auf einmal.
- `npm test`, `npm run build`, `npm run lint` grün.

## Offene Fragen

- Klang-Einstellungen (Verstärker, Tonabnehmer, EQ, Hall, Delay) und
  Rhythmus-Editor: nur eingeklappt nach hinten schieben, oder ganz entfernen?
  Der Plan geht vom Einklappen aus.
- ♯/♭-Schalter unter einer Tonart: ausblenden oder als Vorrang für Töne außerhalb
  der Tonart behalten?
- Desktop: gleiches Layout breiter, oder Blätter dort als Seitenleiste neben dem
  waagerechten Hals?
