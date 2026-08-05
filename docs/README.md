# Recherche-Notizen

Fachliches Hintergrundwissen für die Weiterentwicklung des Fretboard Atlas.
Keine Dokumentation des Codes — das steht im `README.md` eine Ebene höher und in
den Kommentaren der Quelldateien. Hier steht, **was es in der Musik und in der
Hardware gibt**, damit eine neue Funktion nicht aus dem Gedächtnis erfunden
werden muss.

| Datei | Inhalt |
| --- | --- |
| [`musiktheorie.md`](musiktheorie.md) | Intervalle, Skalen, Akkorde, Harmonik, Voicings, Blues, Rhythmus |
| [`e-gitarre.md`](e-gitarre.md) | Pickups, Elektronik, Mensur, Saiten, Stimmungen, Tremolo |
| [`effektpedale.md`](effektpedale.md) | Signalkette, Effekttypen, Klassiker mit gemessenen Werten |
| [`verstaerker.md`](verstaerker.md) | Preamp, Tone Stack, Endstufe, Speaker, Klassiker |
| [`feature-ideen.md`](feature-ideen.md) | Was daraus für die App folgt — sortiert nach Aufwand |

## Wie das zu lesen ist

Jeder Abschnitt trennt drei Dinge, weil sie unterschiedlich belastbar sind:

- **Zahlen aus einer Quelle** — Bauteilwerte, gemessene Frequenzen. Quelle steht
  am Abschnittsende. Diese Zahlen darf man in Code übernehmen.
- **Faustregeln** — als solche gekennzeichnet. Brauchbar zum Einordnen, nicht
  als Referenzwert für einen Test.
- **Status in der App** — was davon schon implementiert ist. Steht am Ende
  jedes Kapitels, damit klar ist, wo eine Erweiterung ansetzt.

Die Statuszeilen sind der Stand vom 5. August 2026 und veralten. Im Zweifel im
Code nachsehen, nicht hier.
