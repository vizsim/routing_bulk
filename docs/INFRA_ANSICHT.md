# Infrastruktur-Ansicht der aggregierten Darstellung (v1)

Stand: 2026-10-22 · Läuft ohne Änderung am Routing-Server; der optionale
Server-Patch `backward_*` wird automatisch genutzt, sobald er deployt ist.

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
  `road_class`, `surface`, `lit`, `street_name`, `osm_way_id`. Weiterhin keine `edge_id`.

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

## Server-Patch `backward_*` (vorbereitet, nicht deployt)

Branch `backward-path-details` auf Basis von `bikelanes_ec_upstream_2026-10`
im GraphHopper-Fork: neue Klasse `BackwardDetails`, eine Schleife in
`PathDetailsBuilderFactory`, Test `BackwardDetailsTest`, Eintrag im CHANGELOG.
`backward_<ev>` liefert den Wert, den ein Encoded Value für die Gegenrichtung
speichert — dieselbe Semantik wie das Präfix `backward_` in Custom Models.

- Kein Reimport, sofern der Server schon aus diesem Fork-Stand läuft: die Werte
  liegen dann im Graph, Fork bauen, JAR tauschen, Server neu starten. Läuft ein
  anderer Build (z. B. das 11.0-JAR aus `myconfig/`), unterscheiden sich die
  Storage-Versionen — dann ist ein Reimport nötig. Vorher prüfen, welcher Build
  auf ghroute läuft.
- Prüfen: `mvn -pl core -am test -Dtest=BackwardDetailsTest -Dsurefire.failIfNoSpecifiedTests=false`
  (hier mangels Maven-Zugang mit javac 21 gegen die Fork-Klassen übersetzt; die
  vier Tests und ein Prüfprogramm mit virtuellen Kanten, zusammengeführten
  Teilstrecken und `-ea` liefen grün)
- Der Client braucht keine Änderung; `backward_sidewalk` steht schon in
  `CONFIG.INFRA_DETAILS.foot`.

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
