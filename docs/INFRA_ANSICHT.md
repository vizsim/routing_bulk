# Infrastruktur-Ansicht der aggregierten Darstellung (v1)

Stand: 2026-10-23 · Der Server-Patch `backward_*` läuft seit 2026-10-23 auf
ghroute; ohne ihn fällt der Client automatisch zurück.

## Was v1 kann

- **Färben nach: Anzahl | Infrastruktur** (Panel „Routendarstellung“, sichtbar
  bei aggregierter Darstellung). Die Linienbreite zeigt in beiden Fällen die Menge.
- **Modus Fuß | Rad**: Fuß zählt ÖPNV-Zubringer mit (im Routing-Tab sind sie
  schon `foot`, in der Gebietsanalyse heißen sie `transit`). Auto- und
  Transitous-Legs haben keine Infrastruktur-Sicht.
- **Merkmal**: Führung, Untergrund, Tempo, Licht; für Rad zusätzlich Steigung.
- **Legende** mit Anteil je Klasse an den Routen-km (Gebietsanalyse: Wege-km/Tag).
- **Klick auf eine Linie** öffnet das Infopanel (Desktop unten links, Handy über
  dem Panel-Streifen; offenes Sheet blendet es aus) statt ein neues Ziel zu setzen; daneben klicken setzt weiter
  Ziele. „‹ x von n ›“ blättert durch die Abschnitte derselben Klasse, sortiert
  nach Menge. Links: OSM-Way, Mapillary (wenn `mapillary_coverage`).
- **Gebietsanalyse**: dieselbe Leiste im Ergebnis; im Infrastruktur-Modus
  ersetzt „Modus“ die Checkboxen „Angezeigte Wege“.
- **Export**: zusätzliche Spalten je Kante, z. B. `length_m`, `count_ab`/`count_ba`
  (Analyse: `trips_ab`/`trips_ba`), `foot_class`, `sidewalk_right`/`sidewalk_left`,
  `bike_class_ab`/`bike_class_ba`, `bicycle_infra_ab`/`_ba`, `max_speed_ab`/`_ba`,
  `road_class`, `surface`, `lit`, `street_name`, `osm_way_id`; für Querungen
  `crossing_type`, `crossed_road`, `crossed_road_maxspeed`. Weiterhin keine `edge_id`.

## Datenfluss

1. `API.fetchRoute` fragt je Profil die Path Details aus `CONFIG.INFRA_DETAILS`
   an (zusätzlich zu `edge_id`). Lehnt der Server Details ab (HTTP 400
   „Cannot find the path details: […]“), merkt sich der Client sie für die
   Sitzung und fragt ohne sie erneut. Die erste Anfrage je Profil läuft allein,
   parallele warten — ohne Patch kostet das genau eine 400 pro Profil.
2. `AggregationService.aggregateRoutes` führt je Kante zusätzlich
   `dir.ab`/`dir.ba` = `{ count, byProfile, attrs }`, dazu `edgeId`, `lengthM`
   und `key`. Die Geometrie liegt immer in Schlüsselrichtung a→b; `ab` heißt
   „entlang `coords`“.
3. `src/domain/infra.js` klassifiziert beim Zeichnen (reine Funktionen, keine
   Neuberechnung bei Regeländerungen): `classifyFoot`, `classifyBike`,
   `classifySurface`, `classifySpeed`, `classifyLit`, `classifySlope`,
   `describeSegment` (Panel), `exportProperties` (Export).
4. `RouteRenderer.drawAggregatedRoutes` färbt nach der aktuellen Ansicht
   (`CONFIG.COLOR_BY`, `INFRA_MODE`, `INFRA_ATTR`) und meldet
   `Events.AGGREGATION_DRAWN`; `InfraControls` (Leiste/Legende) und
   `SegmentPanel` reagieren darauf. Ansichtswechsel zeichnen mit
   `RouteRenderer.redrawAggregated()` neu, ohne neu zu aggregieren.
5. Im Infrastruktur-Modus schlägt `CrossingRoadService.annotate` danach die
   Querungen nach (siehe „Querungen“) und zeichnet einmal neu.

## Richtung und Straßenseite

GraphHopper speichert `sidewalk`, `cycleway`, `bicycle_infra` und `max_speed`
je Richtung; das Path Detail liefert den Wert **in Laufrichtung**:
`sidewalk` = Gehweg **rechts** in Laufrichtung. Für Rad passt das (man fährt
rechts), für Fuß fehlt die zweite Straßenseite.

- **Ohne Server-Patch (v1-Stand auf ghroute):** Die linke Seite ist bekannt,
  sobald eine Route die Kante in Gegenrichtung nutzt (`dir.ba.attrs.sidewalk`).
  Sonst heißt die Klasse „Gehweg, Gegenseite offen“ bzw. „Kein Gehweg,
  Gegenseite offen“. Bei vielen Routen zum selben Ziel ist das der Normalfall.
- **Mit Patch:** `backward_sidewalk` liefert die andere Seite in jeder Richtung;
  die „offen“-Klassen lösen sich in beidseitig/einseitig/kein Gehweg auf.

`footSides(seg)` setzt beides zusammen: rechts = `ab.sidewalk ?? ba.backward_sidewalk`,
links = `ba.sidewalk ?? ab.backward_sidewalk` (relativ zu `coords`).

## Querungen

Fuß-Klassen: „mit Ampel“, „ohne Ampel, Straße bis 30 km/h“, „ohne Ampel, Straße
über 30 km/h“, „Straße oder Tempo unbekannt“. GraphHopper liefert für eine
Querung (`footway=crossing`) nur den Fußweg selbst; zwei Lücken füllt der Client
aus den Kacheln der Unfallkarte (`src/domain/crossing-roads.js`,
`src/services/crossing-road-service.js`; z14, jede Kachel einmal je Sitzung):

- **Gequerte Straße und Tempo** aus den Tempolimit-Kacheln: Eine Straße gilt als
  gequert, wenn ein Ende des Überwegs höchstens 2,5 m von ihr liegt oder er sie
  schneidet — Nähe allein reicht nicht (Überwege über Straßenbahngleise neben
  einer Hauptstraße). GraphHopper teilt den Überweg am Straßenknoten; die übrigen
  Stücke desselben Überwegs (`osm_way_id`) übernehmen das Ergebnis.
- **Querungsart**: GraphHopper (`OSMCrossingParser`) liest sie nur aus
  Knoten-Tags, `crossing=*` am Weg geht verloren. Ersatz: andere Stücke desselben
  Überwegs, sonst `crossing` des Wegs aus den Querungs-Kacheln.

Bis das Nachschlagen fertig ist (asynchron, danach wird neu gezeichnet), stehen
Querungen ohne Ampel unter „Straße oder Tempo unbekannt“. Das Merkmal Tempo nimmt
für Querungen das Tempo der gequerten Straße.

## Server-Patch `backward_*` (seit 2026-10-23 auf ghroute)

Im GraphHopper-Fork (`bikelanes_ec_upstream_2026-10`, Commit 1137a8450): neue
Klasse `BackwardDetails`, eine Schleife in `PathDetailsBuilderFactory`, Test
`BackwardDetailsTest`, Eintrag im CHANGELOG. `backward_<ev>` liefert den Wert,
den ein Encoded Value für die Gegenrichtung speichert — dieselbe Semantik wie das
Präfix `backward_` in Custom Models.

- Ohne Reimport live gegangen (neues JAR, Neustart): der Graph-Stand war derselbe.
- Prüfen: `mvn -pl core -am test -Dtest=BackwardDetailsTest -Dsurefire.failIfNoSpecifiedTests=false`
  (der Fork braucht JDK 25)
- Der Client fragt `backward_sidewalk` immer an (`CONFIG.INFRA_DETAILS.foot`);
  lehnt ein Server ohne Patch es ab, lässt er es für die Sitzung weg.

## Grenzen von v1

- `lit=false` heißt „nicht als beleuchtet erfasst“ (GraphHopper setzt `true`
  nur bei `lit=yes|24/7|automatic`); das Panel formuliert es so.
- `max_speed` ist ohne `maxspeed`-Tag `null` („Tempo nicht erfasst“); für die
  Rad-Klasse „Mischverkehr“ entscheidet dann die Straßenklasse.
- „Prüffall“ (violett): Route nutzt die Fahrbahn, obwohl ein separater
  Gehweg/Radweg erfasst ist (`sidewalk=separate`, `cycleway=separate`,
  `bike_road_access=use_sidepath`) — meist eine fehlende Verbindung im Graph.
- Die Routen sind schon infrastrukturbewusst geroutet (`foot_priority`,
  `bicycle_infra` im Rad-Profil): die Ansicht zeigt die Infrastruktur auf den
  bevorzugten Wegen, nicht auf dem kürzesten.
- Noch keine Bewertung/Lücken (Schritt 2: Stressstufe je Kante, Defizit
  gegenüber Zielstufe, Wege × Länge × Defizit).

## Entwicklung und Tests

```bash
npm test                                       # node --test: Cursor, Fallback, Aggregation, Klassen
node tools/mock-graphhopper.mjs                # Mock-GraphHopper auf :8989, ohne backward_*
node tools/mock-graphhopper.mjs --backward --port 8990   # mit backward_*
```

Für einen lokalen Lauf gegen den Mock `CONFIG.GH_ROUTE_URL` auf
`http://localhost:8989/route` setzen (die Zeile steht auskommentiert in
`src/core/config.js`) und `npm run dev` starten. Der Mock ist ein
synthetisches Raster um Berlin-Mitte (52.52, 13.40) mit gemischten Gehweg-,
Radweg-, Tempo- und Belagswerten — gedacht zum Testen, nicht als Datenquelle.
