# routing_bulk – Review & Verbesserungsvorschläge

Stand: 2026-08-07 · Basis: Code-Review von `vizsim/routing_bulk` (main) und Vergleich mit `vizsim/miso`
Aktualisiert: 2026-08-11 · Ergänzt: Overpass → PMTiles (Abschnitt 6), Vite-Erklärung (Abschnitt 7), aktualisierte Reihenfolge (Abschnitt 8), **Umsetzungsstand (Abschnitt 0)**

---

## 0. Umsetzungsstand (2026-08-11, Branch `feat/maplibre-rework`)

| Schritt | Status | Anmerkungen |
|---|---|---|
| Vite/ES-Module-Migration (Abschnitt 4/7) | ✅ erledigt | 29 Script-Tags → ein Module-Entry; `npm run dev` / `npm run build` |
| MapLibre + Single-Source-Rendering (Abschnitt 1) | ✅ erledigt | Basemap: OpenFreeMap Positron (Vector); Routen + Aggregation als je eine GeoJSON-Source, data-driven Styling; Marker nativ MapLibre |
| Schulen: Overpass → PMTiles (Abschnitt 6) | ✅ erledigt | Layer-Toggle unter „Darstellung“; `overpass-service.searchSchools` + `school-renderer` entfernt |
| edge_id-Aggregation (Abschnitt 2) | ✅ erledigt | `details:["edge_id"]` im Request; einzige Aggregationsmethode (die geometrischen Methoden `simple`/`lazyOverlap` samt Methoden-Dropdown wurden entfernt); Export liefert Geometrien (nie edge_ids) |
| GitHub-Pages-CI | ✅ vorbereitet | `.github/workflows/deploy.yml`; nach Merge einmalig Pages-Source auf „GitHub Actions“ umstellen |
| ÖPNV-Routing via `/plan` (Abschnitt 5) | ⬜ offen | nächster großer Schritt |
| platforms.pmtiles in unfallkarte-Pipeline | ⬜ offen | bis dahin Haltestellen-Suche weiter via Overpass |
| Zensus-PMTiles aus Legacy-Bucket umziehen | ⬜ offen | `POPULATION_PMTILES_URL` zeigt noch auf `unfallkarte-data` (ohne `-v2`) |
| Web Worker / inkrementelle Aggregation (Abschnitt 2) | ⬜ offen | Druck ist raus: Kanten-Aggregation ist O(Kanten) statt O(Segmentpaare) |
| Gemeinsames Package mit miso (Abschnitt 4) | ⬜ offen | opportunistisch |

Erkenntnisse aus der Umsetzung, die vom Plan abweichen bzw. ihn ergänzen:

- **MapLibre v6 + Bundler:** v6 ist ESM-only und lädt seinen Web-Worker als
  separate Datei über eine Laufzeit-URL. Symptom bei fehlender Konfiguration:
  Karte lädt endlos, ohne Fehlermeldung. Lösung (offiziell): `setWorkerUrl()` +
  Vite-Import `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`
  (nicht nur `?url` — der Worker importiert einen Shared-Chunk, der sonst im
  Build fehlt), dazu `optimizeDeps.exclude` und `worker.format: 'es'`.
- **pbf 5:** die alte `Pbf`-Klasse ist in `PbfReader`/`PbfWriter` aufgeteilt;
  für den MVT-Parser im population-service reicht `PbfReader` als Drop-in.
- **edge_id in der Praxis:** ghroute.vizsim.de liefert auch für virtuelle
  Snap-Kanten die ID der zugrundeliegenden echten Kante (ggf. partiell
  traversiert). Der Aggregations-Schlüssel ist daher edge_id **plus**
  richtungsnormalisierte Endpunkte des gefahrenen Stücks — volle
  Traversierungen matchen exakt, Zubringer-Stummel bleiben getrennt (count=1).

---

## 1. Leaflet → MapLibre: ja – und zwar aus einem konkreten Grund

Der größte Performance-Hebel liegt genau hier. Aktuell erzeugt `drawAggregatedRoutes()`
für **jedes** aggregierte Segment eine eigene `L.polyline` – bei vielen Routen sind das
tausende SVG-DOM-Knoten, jeder mit eigenem Tooltip. Das ist der Hauptgrund für die zähe Karte.

In MapLibre wird daraus **eine** GeoJSON-Source mit **einem** Line-Layer und
data-driven Styling:

```js
map.addSource('agg', { type: 'geojson', data: featureCollection });
map.addLayer({
  id: 'agg-lines', type: 'line', source: 'agg',
  paint: {
    'line-width':   ['interpolate', ['linear'], ['get', 'level'], 0, 2, 1, 12],
    'line-color':   ['get', 'color'],   // oder interpolate über eine Colormap
    'line-opacity': ['interpolate', ['linear'], ['get', 'level'], 0, 0.7, 1, 1]
  },
  layout: { 'line-sort-key': ['get', 'count'] }  // hohe Counts oben zeichnen
});
```

Das rendert auf der GPU und skaliert praktisch beliebig. Bonus-Effekte:

- **Colormap-Wechsel** wird ein `setPaintProperty()` statt „alles löschen und neu
  zeichnen“ – fühlt sich sofort smoother an.
- **Hover-Tooltips** über `queryRenderedFeatures` + `feature-state` statt tausender
  gebundener Tooltips.
- **PMTiles-Bevölkerungslayer und Basemap-Logik aus miso** lassen sich 1:1 wiederverwenden.
- Den Leaflet-Kompatibilitäts-Wrapper aus misos `map-renderer.js` (Marker/Popup-Emulation)
  dabei **nicht** mitschleppen, sondern gleich nativ MapLibre schreiben – der Wrapper ist
  historisch gewachsen und macht den Code unnötig indirekt.

---

## 2. Aggregation: das Problem an der Wurzel lösen statt Geometrie zu matchen

`docs/AGGREGATION_PROBLEM.md` beschreibt das Kernproblem (lange vs. kurze überlappende
Segmente) sehr sauber – aber alle Lösungsversuche inkl. `lazyOverlap` kämpfen mit dem
Symptom. Die eigentliche Ursache: es wird **nachträglich per Geometrie** rekonstruiert,
dass zwei Routen dieselbe Kante im Straßengraph benutzen. Diese Information hat
GraphHopper aber bereits.

### Lösung: GraphHopper Path Details (`edge_id`)

Im POST-Body:

```js
{
  profile,
  points,
  points_encoded: false,
  details: ["edge_id"]
}
```

GraphHopper liefert dann pro Route Intervalle `[fromIndex, toIndex, edge_id]` über das
Koordinaten-Array. Aggregation wird damit trivial und **exakt**:

```js
// Map<edge_id, count> hochzählen – fertig.
```

- Kein Grid-Size-Tuning, keine Winkel-Toleranzen, kein Overlap-Splitting.
- Das Long/Short-Segment-Problem verschwindet komplett, weil alle Routen dieselben
  Kanten-IDs referenzieren.
- Eigener GH-Server (ghroute.vizsim.de) läuft bereits → keine Hürde.

**Caveats:**

- Die erste/letzte Kante pro Route ist eine „virtuelle“ Kante (Snap-Punkt) mit
  request-spezifischer ID – die matchen nicht untereinander. Für die Visualisierung egal
  (Zubringer-Stummel haben eh count=1), oder nur diese Randstücke geometrisch behandeln.
- Gegenläufige Richtungen auf derselben Kante haben dieselbe `edge_id` – für den
  Use Case (alle Routen zum selben Ziel) sogar erwünscht.
- `edge_id`s sind nur **innerhalb eines Graph-Builds** stabil: Nach einem OSM-Update
  auf ghroute.vizsim.de sind alle IDs neu vergeben. Für die Session-Aggregation egal,
  aber der Export (`export-service.js`) muss weiterhin **Geometrien** exportieren,
  niemals edge_ids.

### Weitere Perf-Punkte (unabhängig davon)

- **Web Worker** für die Aggregation, damit die UI beim Rechnen nicht einfriert.
- **Inkrementell aggregieren** im „Zielpunkte merken“-Modus: Count-Map behalten und beim
  Hinzufügen/Löschen eines Ziels nur dessen Routen addieren/subtrahieren, statt alles
  neu zu rechnen.
- `points_encoded: true` (Polyline5) statt `false` schrumpft die Response-Payloads
  massiv – Decoding im Client ist billig.
- Falls doch geometrisch: String-Keys wie `"13.4051,52.52-…"` erzeugen viel GC-Druck;
  Integer-Keys (zwei gerundete Koordinaten in eine Zahl gepackt) sind deutlich schneller.

---

## 3. Requests & UX

`Promise.all(starts.map(fetchRoute))` feuert alle N Requests gleichzeitig ab und wartet
dann auf alles. Drei Verbesserungen:

1. **Concurrency-Pool** (z. B. 8–12 parallel) statt unbegrenzt – schont den GH-Server
   und ist bei HTTP/1.1 ohnehin das Browserlimit.
2. **AbortController**: Wenn der User schnell hintereinander klickt, laufen aktuell alte
   Requests weiter und können Race Conditions im State erzeugen. Beim neuen Klick alte
   Requests abbrechen.
3. **Progressiv rendern**: Routen zeichnen, sobald sie ankommen (mit Fortschrittsanzeige
   „34/100“), statt auf die langsamste zu warten. Fühlt sich dramatisch schneller an,
   auch wenn die Gesamtzeit gleich bleibt.

Kleinere UI-Ideen:

- **Permalink-State** (Ziel, N, Radius, Profil in der URL) – gut zum Teilen.
- **Legende** zur Colormap.
- Config-Änderungen sauber trennen in:
  „braucht neue Routen“ vs. „braucht nur Neu-Aggregation“ vs. „braucht nur Restyling“.

---

## 4. Architektur

- `index.html` lädt **33 Script-Tags** mit globalen Objekten. Funktioniert, macht aber
  Reihenfolge-Abhängigkeiten fragil und Tree-Shaking unmöglich → auf **ES-Module + Vite**
  umstellen.
- routing_bulk und miso teilen sehr viel **identischen Code** (`geocoder.js` mit
  574 Zeilen in beiden Repos, dazu `colormap-utils`, `histogram-renderer`,
  `marker-manager`, `state`/`events`, `population-service`). Das schreit nach einem
  **gemeinsamen Package oder Monorepo** – sonst driften die Kopien auseinander.
- misos Ordnerstruktur mit `features/` ist die bessere von beiden → übernehmen.

---

## 5. ÖPNV-Routing aus miso adaptieren: geht – aber nicht mit dem, was miso aktuell nutzt

**Wichtige Unterscheidung:** miso nutzt Transitous **one-to-all** – das liefert nur
*Reisezeiten pro Haltestelle*, keine Routengeometrien (deshalb die Turf-Buffer-Approximation
zu Polygonen). Für routing_bulk braucht es aber Geometrien pro Route, sonst gibt es nichts
zu aggregieren. One-to-all direkt übernehmen klappt also **nicht**.

**Was stattdessen geht:** MOTIS/Transitous hat einen `/api/v1/plan`-Endpoint für
Punkt-zu-Punkt-Routing, der Itineraries mit Legs inkl. `legGeometry` (encoded Polyline)
zurückgibt. Damit ist das Muster identisch zu heute:

```
N Plan-Requests → Legs decodieren → aggregieren
```

Und für die Aggregation gibt es sogar ein Äquivalent zum edge_id-Trick: Transit-Legs
haben `routeId`/Trip-Infos und Haltestellensequenzen – exaktes Matching auf
**(Linie, Haltestellenpaar)** statt auf Geometrie. Damit zählt man faktisch
„Fahrgäste pro Linienabschnitt“ – eine Mini-Umlegung (Streckenbelastung), für den
Schulwege-Use-Case genau das richtige Konzept. Fußwege-Legs werden wie gehabt über
GraphHopper-Kanten oder geometrisch aggregiert.

### Drei echte Hürden

1. **Fair Use / Rate Limits**: api.transitous.org ist ein Community-Dienst.
   50–200 Plan-Requests pro Kartenklick sind dort nicht okay – es braucht starkes
   Throttling + Caching oder (sauberer) eine **selbst gehostete MOTIS-Instanz**
   (→ siehe separates Dokument `motis_selfhosting.md`).
2. **Zeitabhängigkeit**: Anders als beim Fahrrad hängt das Ergebnis massiv von der
   Abfahrtszeit ab (Takte, Umstiege). Eine Zeit muss fixiert werden – für Schulwege
   bietet sich `arriveBy` Ziel 8:00 an, das passt sogar perfekt zum Use Case.
   Eine einzelne Stichprobe kann trotzdem irreführend sein (knapp verpasster Bus);
   ggf. 2–3 Zeitpunkte mitteln.
3. **Multimodalität in der Darstellung**: Legs haben Modi (Fuß/Bus/Bahn).
   Pro Modus getrennt aggregieren und stylen (z. B. Transit-Segmente dicker/anders
   eingefärbt als Fußwege), sonst wird die Karte unlesbar.

**Nettes Zusammenspiel:** one-to-all (reverse vom Ziel) lässt sich trotzdem nutzen –
nicht für die Flows, aber um Startpunkte vorab nach Erreichbarkeit einzufärben oder
unerreichbare auszufiltern, bevor die teuren Plan-Requests gefeuert werden.

---

## 6. Overpass ablösen: PMTiles aus der unfallkarte-Pipeline *(Ergänzung 2026-08-11)*

### Ist-Zustand

Overpass wird nur für zwei Kontextmenü-Features genutzt (`map-renderer.js`):
**Schulen** bzw. **ÖPNV-Haltestellen** im 1000-m-Radius suchen und als
Marker/Polygone anzeigen. Reine Anzeige, kein Routing-Input – idealer Kandidat
für Vector-Tile-Layer statt Live-API-Abfragen (keine Rate Limits, keine
Timeouts, kein Server-Fallback-Karussell).

### Schulen: sofort machbar

Die unfallkarte-Pipeline produziert bereits ein deutschlandweites Schul-PMTiles:

- URL: `https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/schools.pmtiles`
- Source-Layer: `germany_osm_schools` (Punkte + Polygone)
- Attribution: © OpenStreetMap-Mitwirkende (ODbL)

In MapLibre ist das ein `addSource` + zwei Layer (Symbol für Punkte, Fill für
Polygone) + ein Sichtbarkeits-Toggle. Damit entfallen komplett:
`overpass-service.js`, `school-renderer.js` und die Radius-Kreis-UX.

Zu beachten:

- Die Kachel enthält **auch Kindergärten** (`amenity=school,kindergarten`) –
  für den Schulwege-Use-Case eher ein Feature als ein Bug.
- Aus „Suche im 1000-m-Radius“ wird „Layer im Viewport ein-/ausblenden“ –
  einfachere und bessere UX (nichts zu warten, nichts zu klicken).
- „Schule anklicken → als Ziel setzen“ geht weiterhin, dann über
  `queryRenderedFeatures` auf dem Schul-Layer.
- Das Manifest-/local-first-Konstrukt aus unfallkarte (`resolveSources.js`)
  **nicht** übernehmen – routing_bulk hat keinen lokalen `data/`-Baum, eine
  direkte URL in `CONFIG` reicht (so wie beim Population-Layer heute schon).

### ÖPNV-Haltestellen: erst mal zurückstellen

Die Pipeline hat **noch keinen** `public_transport=platform`-Layer (nur schools,
health, playgrounds, crossings, maxspeed). Er wäre billig zu ergänzen – ein
Eintrag in `pipeline/config/osm.yaml` nach dem schools-Muster
(`nwr/public_transport=platform`, ggf. plus `highway=bus_stop`), bauen,
hochladen. **Kein neues Bucket nötig** – die Datei landet wie alle anderen im
bestehenden `unfallkarte-data-v2`.

Entscheidung: zurückgestellt. Bis dahin bleibt Overpass ausschließlich für die
Haltestellen-Suche bestehen; nur die Schulen ziehen um.

### ⚠ Nebenfund: Population-PMTiles zeigt auf Legacy-Bucket

`CONFIG.POPULATION_PMTILES_URL` zeigt auf
`…/file/unfallkarte-data/Zensus2022_…pmtiles` – das **alte** Bucket ohne `-v2`,
das in unfallkarte als „LEGACY, wird nicht mehr gebraucht“ markiert ist. Wird es
gelöscht, bricht hier still der Einwohner-Layer. Das Zensus-PMTiles sollte in
den v2-Bucket (oder ein eigenes Bucket) umziehen und die URL angepasst werden.

---

## 7. Exkurs: Was ist Vite, und warum lohnt es sich hier? *(Ergänzung 2026-08-11)*

Kontext: `index.html` lädt 33 Script-Tags in fester Reihenfolge, jede Datei
hängt ihre Objekte ans globale `window`. Das funktioniert, aber die Reihenfolge
ist fragil und nichts ist explizit – wer `RouteService` benutzt, hofft, dass das
Script davor schon geladen wurde.

**Vite** ist ein Standard-Werkzeug (kein Framework!), das zwei Dinge liefert:

1. **Dev-Server** (`npm run dev`): Seite im Browser öffnen, Datei speichern,
   Browser lädt automatisch neu. Kein Build-Schritt beim Entwickeln.
2. **Build** (`npm run build`): erzeugt einen `dist/`-Ordner mit statischem
   HTML/JS/CSS – das Deployment bleibt exakt wie bisher (statische Dateien,
   z. B. GitHub Pages). Kein Server nötig.

Der Code selbst ändert sich dabei rein mechanisch: aus 33 Script-Tags wird
**ein** Tag (`<script type="module" src="src/app.js">`), und jede Datei sagt
explizit per `import`/`export`, was sie braucht und was sie anbietet:

```js
// vorher: window.RouteService = { … }  +  Script-Reihenfolge in index.html
// nachher:
import { CONFIG } from '../core/config.js';
export const RouteService = { … };
```

Kein Code-Verhalten ändert sich, es ist reines Umsortieren – und genau deshalb
gehört es **vor** die MapLibre-Migration: erst mechanisch umziehen (leicht zu
prüfen, dass alles noch geht), dann inhaltlich umbauen. Sonst vermischen sich
im Diff Umzug und Umbau. Risiko: gering; Rückweg: Branch verwerfen.

---

## 8. Empfohlene Reihenfolge *(aktualisiert 2026-08-11)*

1. **Vite/ES-Module-Migration** – rein mechanischer erster Commit auf
   `feat/maplibre-rework` (siehe Abschnitt 7).
2. **MapLibre + Single-Source-Rendering** – größter sichtbarer Gewinn. Dabei
   direkt: `overpass-service.js` + `school-renderer.js` **nicht portieren**,
   sondern durch den Schul-PMTiles-Layer ersetzen (Abschnitt 6). Haltestellen
   behalten übergangsweise Overpass. pmtiles-Protocol-Registrierung und
   Basemap-Logik aus miso/unfallkarte wiederverwenden (ohne Leaflet-Wrapper).
3. **edge_id-Aggregation** – löst das dokumentierte Kernproblem elegant;
   orthogonal zum Rendering (es ändert sich nur, *wie* die FeatureCollection
   berechnet wird, die Layer bleiben).
4. **ÖPNV via `/plan`** – als neues Feature obendrauf (inkl. Entscheidung
   selbst hosten vs. Transitous mit Throttling).

Später / unabhängig: platforms-Layer in der unfallkarte-Pipeline ergänzen
(ersetzt dann den letzten Overpass-Rest), Zensus-PMTiles aus dem Legacy-Bucket
umziehen, Extraktion des mit miso geteilten Codes.
