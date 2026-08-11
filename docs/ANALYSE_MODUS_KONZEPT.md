# Konzept: Analysemodus (experimentell)

Stand: 2026-08-11 · Status: **umgesetzt** (Beta) — eigener Panel-Tab „Gebietsanalyse";
Abweichung vom Konzept unten: statt Accordion-Bereich ein eigener Tab, Zensus +
Haltestellen werden einmal fürs Gesamtgebiet geladen (nicht je Einrichtung),
OSM-Doppel (Node + Way gleicher Name im Nahbereich) werden dedupliziert

## Idee

Der bisherige Modus beantwortet „wie kommen N Leute zu **einem** Ziel?".
Der Analysemodus dreht das zu einer kleinen **Gebietsanalyse**: Bereich
aufziehen → alle Schulen/Kitas darin finden → pro Einrichtung eine
Fahrtenzahl und einen Modal Split annehmen → alle Wege rechnen und als
**eine aggregierte Belastungskarte** darstellen und exportieren.

Damit wird aus dem Bulk-Router faktisch ein Mini-Verkehrsmodell mit den
klassischen Stufen: Erzeugung (Fahrten je Ziel) → Aufteilung (Modal Split)
→ Umlegung (Routing + Kanten-Aggregation). Fast alle Bausteine existieren
schon — Nachfragemodell, Kapazitätsgrenze, Haltestellen-Zubringer,
edge_id-Aggregation, Export.

## Ablauf aus Nutzersicht

Eigener Accordion-Bereich **„Analyse (experimentell)"** unten im Panel:

1. **„Bereich zeichnen"** klicken → Punkte auf der Karte setzen,
   Doppelklick/Enter schließt das Polygon. (Eigene ~100-Zeilen-Lösung,
   keine Zusatzbibliothek — wir brauchen genau ein Polygon.)
2. Die App findet alle **Schulen & Kindergärten im Polygon** (aus dem
   vorhandenen schools.pmtiles) und listet sie auf.
3. Je Einrichtung steht eine **editierbare Fahrtenzahl** (Defaults nach
   Typ, siehe unten). Darunter: **Modal Split** (vier Felder, Summe 100 %)
   und ggf. Einzugsradien je Typ.
4. **„Berechnen"** — bewusst ein expliziter Button, kein Automatismus.
   Vorher zeigt die UI, wie viele Routen das werden
   („~480 Routen an ghroute.vizsim.de").
5. Ergebnis: aggregierte Belastungskarte (erzwingt die aggregierte
   Darstellung) + **GeoJSON-Export** mit Fahrten je Kante und Modus.
   „Analyse zurücksetzen" räumt alles wieder weg.

## Bausteine im Detail

### Ziele finden (Schulen/Kitas im Polygon)

- Quelle: das vorhandene `schools.pmtiles` — aber **nicht** über
  `queryRenderedFeatures` (funktioniert nur im sichtbaren Ausschnitt bei
  passendem Zoom), sondern über den generischen PMTiles-Reader im
  population-service: Tiles über der Polygon-BBox auf z15 lesen,
  Punkt-in-Polygon-Test (Raycasting existiert), Features über osm_id
  deduplizieren (Kacheln überlappen), Polygon-Features über ihren Zentroid.
- **Typ-Erkennung** für die Fahrten-Defaults:

  | Typ | Erkennung | Default Fahrten/Tag |
  |---|---|---|
  | Kindergarten | `amenity=kindergarten` | 50 |
  | Grundschule | `amenity=school` + `isced:level` enthält 1 | 200 |
  | Weiterführende Schule | `isced:level` enthält 2/3 **oder** Name enthält Gymnasium/Oberschule/Gesamtschule/Sekundarschule | 500 |
  | Schule (unbekannt) | `amenity=school` ohne Merkmale | 200 |

  `isced:level` ist in den Tiles vorhanden (steht im osmconf der
  Pipeline), aber in OSM lückenhaft gepflegt — deshalb die Namens-Heuristik
  als Fallback und **die Zahl bleibt pro Einrichtung editierbar**; die
  Erkennung liefert nur den Startwert.

### Modal Split

- Ein globaler Split für die Analyse (v1), Default:
  **Fuß 40 % · Rad 20 % · ÖPNV 20 % · Auto 20 %**, vier Zahlenfelder,
  Validierung auf Summe 100.
- „Je ruraler, desto mehr Auto": Die Zensus-Kacheln enthalten
  **RegioStaR7** (Regionalstatistische Raumtypologie). Damit ließe sich
  der Default automatisch vorschlagen (z.B. Metropole 30/25/25/20,
  ländlich 25/15/5/55). Für v1 nur als **Vorschlags-Knopf** („Split aus
  Raumtyp vorschlagen") oder ganz weglassen — Entscheidung offen.

### Nachfrage & Startpunkte

- Basis ist im Analysemodus **fix „unter 18"** (Zensus `Unter18` je
  100×100-m-Zelle) — dafür ist der Modus da.
- **Einzugsradius je Typ** (editierbar): Kita 1 km, Grundschule 2 km,
  weiterführende Schule 4 km. Startpunkte werden wie im bestehenden
  Nachfragemodell gezogen: Längenverteilung → Zellen gewichtet, **mit
  Kapazitätsgrenze**.
- **ÖPNV-Anteil = Zubringer-Modell**: Diese Fahrten starten an den
  zielnächsten Haltestellen (bestehende Logik: N nächste Stops, Dedup,
  Nähe-Gewichtung) und werden **zu Fuß via GraphHopper** geroutet.
  **Kein Transitous** im Analysemodus — bei den Mengen wäre das mit der
  Fair-Use-Vorgabe unvereinbar. Alle Requests gehen an den eigenen
  GH-Server.
- Fuß/Rad/Auto: normale GH-Profile ab Wohnort.

### Stichprobe & Gewichte (der wichtige Kniff)

500 Schüler × 10 Einrichtungen × 4 Modi wären zigtausend Requests — auch
für den eigenen Server unnötig. Stattdessen **gewichtete Stichprobe**:

- Pro (Einrichtung × Modus) werden höchstens `SAMPLE_PER_MODE` Routen
  gerechnet (Default 30, konfigurierbar).
- Jede Route trägt ein **Gewicht** = Fahrten dieses Modus ÷ Stichprobengröße
  (z.B. 200 Fußwege, 30 Routen → Gewicht 6,67).
- Die Kanten-Aggregation summiert **Gewichte statt +1** — die Karte zeigt
  dann „Fahrten/Tag" pro Kante, nicht Routen-Stichproben.
- Beispielrechnung: 10 Einrichtungen × 4 Modi × 30 = **1.200 Requests**
  statt ~10.000 — bei Pool 12 wenige Minuten, mit Fortschrittsanzeige.

Das ist die einzige nennenswerte Änderung an bestehendem Code: die
Aggregation bekommt ein optionales `weight` je Route (Default 1 — der
normale Modus bleibt exakt wie er ist).

### Darstellung & Export

- Ergebnis läuft durch die vorhandene edge_id-Aggregation in die
  bestehende Aggregations-Source; Hover zeigt „~123 Fahrten/Tag".
- Colormap/Legende wie gehabt; Beschriftung der Legende im Analysemodus
  „Fahrten/Tag" statt „Anzahl Routen".
- **Export** (GeoJSON je Kante):
  - `trips` (gewichtete Gesamtfahrten, gerundet)
  - `trips_foot`, `trips_bike`, `trips_car`, `trips_transit_feeder`
  - Metadaten: Polygon, Einrichtungsliste mit Fahrtenzahlen, Modal Split,
    Stichprobengrößen — damit der Export reproduzierbar dokumentiert ist.
- Einzelrouten-Export im Analysemodus eher nicht (Stichprobe wäre
  irreführend) — Entscheidung offen.

## Technische Umsetzung (grob)

| Baustein | Wo | Aufwand |
|---|---|---|
| Polygon-Zeichnen (Klickpunkte, Vorschau-Layer, Enter/Doppelklick/Esc) | neu: `ui/polygon-draw.js` + Layer im map-renderer | mittel |
| Ziele im Polygon finden (PMTiles-Reader um Polygon-/BBox-Lesen + Zentroide erweitern) | `services/population-service.js` | klein–mittel |
| Analyse-Orchestrierung (Ziele, Fahrten, Split, Stichprobe, Rechnen) | neu: `services/analysis-service.js` | mittel |
| Accordion-UI (Liste, Eingaben, Berechnen-Button, Fortschritt) | neu: `ui/analysis-panel.js` + index.html | mittel |
| Gewichte in Aggregation + Export | `aggregation-service.js`, `export-service.js` | klein |
| Routing wiederverwenden (Pool, Abbruch, Fortschritts-Badge) | `route-service.js` (Funktion herauslösen) | klein |

Größenordnung insgesamt: ein solider Arbeitstag, gut in 2–3 Commits
schneidbar (1. Zeichnen + Ziele finden, 2. Rechnen + Gewichts-Aggregation,
3. Export + Feinschliff).

## Bewusste Vereinfachungen (v1)

- **Kapazität je Ziel separat**: Jede Einrichtung zieht unabhängig aus den
  Zensus-Zellen — dasselbe Kind kann rechnerisch zu zwei Schulen laufen.
  Eine echte gemeinsame Zuordnung (jedes Kind genau eine Schule,
  z.B. nächstgelegene oder Einzugsbereiche) wäre v2.
- **Keine Schulwahl-Modellierung**: Fahrtenzahl je Einrichtung ist eine
  Setzung, keine Ableitung aus der Bevölkerung.
- **ÖPNV ohne Fahrplan**: nur der Fußweg ab Haltestelle, keine echte
  Verbindung (das bleibt dem ÖPNV-Beta-Profil im Normalmodus vorbehalten).
- **Ein Modal Split fürs ganze Gebiet** (nicht je Einrichtung).

## Offene Fragen

1. **Einzugsradien-Defaults** (1/2/4 km) — plausibel für deine Anwendung?
2. **Modal Split global oder je Einrichtungstyp?** (Kita-Kinder werden
   eher gebracht → mehr Auto/Fuß, kaum Rad)
3. **Stichprobengröße** 30 je Ziel×Modus okay, oder lieber abhängig von
   der Fahrtenzahl (z.B. min(30, Fahrten))?
4. **RegioStaR7-Vorschlag** für den Split in v1 einbauen oder erst mal
   weglassen?
5. Sollen im Analysemodus die **normalen Klick-Ziele deaktiviert** sein
   (klare Trennung), oder parallel nutzbar bleiben?
