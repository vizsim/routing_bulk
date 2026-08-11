# Bulk-Router

Eine interaktive Web-Anwendung zur Visualisierung von Routen mit mehreren Startpunkten zu einem Zielpunkt. Die Anwendung nutzt die GraphHopper Routing API, um Routen zu berechnen und bietet verschiedene Visualisierungs- und Analyseoptionen.

## Features

- 🗺️ **Interaktive Karte** (MapLibre GL, OpenFreeMap Positron): Klick auf die Karte, um einen Zielpunkt zu setzen; Kartenausschnitt als Permalink (`#zoom/lat/lng`)
- 🎯 **Nachfragemodell**: Startpunkte nach Zensus 2022 gewichtet, mit Kapazitätsgrenze je 100×100-m-Zelle (aus einer Zelle mit 10 Personen kommen höchstens 10 Starts); Basis wahlweise alle Einwohner oder nur unter 18-Jährige
- 🚌 **ÖPNV-Anteil**: einstellbarer Prozentsatz der Startpunkte beginnt an den zielnächsten Haltestellen statt am Wohnort — Wege ab Haltestelle werden immer zu Fuß gerechnet
- 🚴 **Profile**: Fuß, Fahrrad, Auto (GraphHopper) sowie **ÖPNV (Beta)** via
  [Transitous](https://transitous.org)/MOTIS — echte Bus-/Bahnverbindungen mit
  Ankunft am nächsten Werktag 08:00; Fußwege gestrichelt, Verkehrsmittel farbig.
  Zum Schutz der Community-API: max. 30 Routen, 2 parallele Anfragen, Session-Cache
- 📈 **Längenverteilung**: Verteilungsfunktionen für die Wohnort-Startpunkte (lognormal, uniform, normal, …) mit Live-Histogramm (Beeline oder echte Routenlänge)
- 📊 **Exakte Aggregation**: Zählung pro Straßengraph-Kante über GraphHopper-`edge_id` (kein Geometrie-Matching), Farbcodierung über wählbare Colormaps (viridis, plasma, inferno, magma)
- ⚡ **Schnell**: Requests über Concurrency-Pool, progressives Zeichnen mit Fortschrittsanzeige, Abbruch laufender Berechnungen bei neuem Klick
- 🏫 **Kartenebenen**: deutschlandweite PMTiles-Layer für Schulen & Kindergärten sowie ÖPNV-Haltestellen (OpenStreetMap) und Einwohnerdichte (Zensus 2022)
- 💾 **Zielpunkte merken**: Speichern und Verwalten mehrerer Zielpunkte mit ihren zugehörigen Routen
- 📤 **Export**: GeoJSON — aggregiert je Kante mit Gesamtsumme (`count`) plus Aufschlüsselung nach Verkehrsmittel (`count_foot`, …) und Quelle (`count_residential`/`count_transit`); einzeln mit `profile` und `startSource` je Route
- 🧪 **Gebietsanalyse (experimentell)**: eigener Panel-Tab — Bereich auf der Karte zeichnen, Schulen & Kitas darin finden, Wege/Tag je Einrichtung und Modal Split je Typ annehmen, alle Wege als gewichtete Belastungskarte rechnen (Wege/Tag je Kante, nach Verkehrsmittel filterbar, GeoJSON-Export mit `trips`, `trips_<modus>` und Metadaten); Konzept in [docs/ANALYSE_MODUS_KONZEPT.md](docs/ANALYSE_MODUS_KONZEPT.md)

## Verwendung

### Online (GitHub Pages)

Die Anwendung ist verfügbar unter: [https://vizsim.github.io/routing_bulk/](https://vizsim.github.io/routing_bulk/)

### Lokal entwickeln

```bash
npm install     # einmalig
npm run dev     # Dev-Server mit Auto-Reload (Vite)
npm run build   # Produktions-Build nach dist/
```

Das Deployment auf GitHub Pages läuft automatisch: Jeder Push auf `main` baut
und deployt über die GitHub Action (`.github/workflows/deploy.yml`).

### Nutzung

1. Klicke auf die Karte, um einen Zielpunkt zu setzen
2. Die Anwendung erzeugt Startpunkte nach dem Nachfragemodell und berechnet Routen zum Zielpunkt
3. Die Panel-Bereiche (einklappbar):
   - **Einstellungen**: Profil, Anzahl Routen, Radius, Längenverteilung, Histogramm
   - **Nachfragedetails**: Einwohner-Gewichtung, Basis (alle / nur unter 18), ÖPNV-Anteil
   - **Kartenebenen**: Einwohner, Schulen & Kindergärten, ÖPNV-Haltestellen
   - **Routendarstellung**: aggregierte Darstellung, Colormap, Punkte ausblenden
   - **Export**: Routen als GeoJSON herunterladen
4. Über den Tab **Gebietsanalyse** (oben im Panel) lässt sich alternativ ein Bereich zeichnen und für alle Schulen/Kitas darin eine Belastungskarte in Wege/Tag rechnen

## Projektstruktur

```text
routing_bulk/
├── index.html              # Einstiegspunkt (ein ES-Module-Script)
├── style.css               # Stylesheet
├── vite.config.js          # Vite (base './', MapLibre-Worker)
├── package.json            # Scripts + Dependencies (maplibre-gl, pmtiles, pbf)
├── .github/workflows/      # GitHub-Pages-Deployment (Vite-Build)
│
├── docs/                   # Dokumentation
│   ├── routing_bulk_review.md      # Review, Plan & Umsetzungsstand
│   ├── AGGREGATION_PROBLEM.md      # (historisch) Geometrie-Aggregation
│   └── ...
│
└── src/
    ├── core/               # Konfiguration, State, Event-Bus, Utils
    ├── domain/             # Geo-Funktionen, Verteilungen, GraphHopper-API
    ├── services/           # Business-Logik
    │   ├── route-service.js        # Routen-Berechnung (Pool, Abbruch, Profile)
    │   ├── demand-service.js       # Nachfragemodell (Kapazität, unter-18, ÖPNV-Mix)
    │   ├── population-service.js   # Zensus-/PMTiles-Reader (Tiles direkt lesen)
    │   ├── aggregation-service.js  # exakte Kanten-Aggregation (edge_id)
    │   ├── target-service.js       # Zielpunkt-Verwaltung
    │   └── export-service.js       # GeoJSON-Export
    ├── visualization/      # MapLibre-Rendering
    │   ├── map-renderer.js         # Karte, Layer (Routen, Schulen, ÖPNV, Zensus), Kontextmenü
    │   ├── route-renderer.js       # Routen als GeoJSON-Sources (data-driven Styling)
    │   ├── visualization.js        # Orchestrierung, Marker (Start/Ziel)
    │   ├── marker-manager.js       # Ziel-Marker-Verwaltung
    │   ├── histogram-renderer.js   # Histogramm (Canvas)
    │   └── colormap-utils.js       # Colormap-Berechnungen
    ├── ui/                 # Panel-Komponenten
    │   ├── accordion.js            # einklappbare Bereiche (mit localStorage)
    │   ├── demand-selector.js      # Bereich "Nachfragedetails"
    │   ├── info-hints.js           # ⓘ-Tooltips (fixed, Viewport-Klemmung)
    │   ├── targets-list.js / config-helpers.js / distribution-selector.js
    │   └── colormap-selector.js / route-warning.js
    ├── handlers/           # Event-Handler (Routen berechnet/progressiv)
    ├── utils/              # Geocoder (Adresssuche)
    └── app.js              # Haupt-Orchestrierung
```

## Technologie-Stack

- **MapLibre GL JS**: GPU-Karten-Rendering (Vector-Basemap: OpenFreeMap Positron)
- **PMTiles**: Datenlayer (Zensus, Schulen, Haltestellen) als statische Tile-Archive, ohne Tile-Server
- **GraphHopper API**: Routing (eigene Instanz, mit `edge_id`-Path-Details)
- **Vite**: Dev-Server + Build; Vanilla JavaScript (ES-Module), kein Framework
- **Event-Bus Pattern**: Lose Kopplung zwischen Modulen

## Konfiguration

Die Hauptkonfiguration befindet sich in `src/core/config.js`:

```javascript
export const CONFIG = {
  GH_ROUTE_URL: "https://ghroute.vizsim.de/route",
  BASEMAP_STYLE_URL: "https://tiles.openfreemap.org/styles/positron",
  PROFILE: "foot",
  N: 10,
  RADIUS_M: 2000,
  ROUTE_CONCURRENCY: 12,
  // PMTiles-Quellen: POPULATION_*, SCHOOLS_*, PLATFORMS_*
  // Nachfragemodell: DEMAND_BASIS, DEMAND_TRANSIT_SHARE, DEMAND_TRANSIT_STOPS
};
```

## Aggregierung

Die Aggregation zählt exakt pro Kante des Straßengraphen: GraphHopper liefert
per Path Detail `edge_id`, welche Kanten jede Route benutzt — zwei Routen teilen
sich ein Segment genau dann, wenn sie dieselbe Kanten-ID haben. Kein
Geometrie-Matching, keine Toleranzen. Die früheren geometrischen Methoden und
ihr Grundproblem sind historisch dokumentiert in
[`docs/AGGREGATION_PROBLEM.md`](docs/AGGREGATION_PROBLEM.md); Plan und
Umsetzungsstand in [`docs/routing_bulk_review.md`](docs/routing_bulk_review.md).

## Entwicklung

### Architektur

Die Anwendung folgt einer modularen Architektur mit klarer Trennung von Concerns:

- **Core**: Kern-Funktionalität (Config, State, Events, Utils)
- **Services**: Business-Logik (Route-Berechnung, Zielpunkt-Verwaltung, Export, Aggregation)
- **Domain**: Domain-Modelle und Utilities (Geo-Funktionen, Verteilungen, API-Calls)
- **Visualization**: Visualisierungs-Logik (modular aufgeteilt in spezialisierte Renderer)
  - `visualization.js`: Orchestrierung und Marker (Start/Ziel)
  - `map-renderer.js`: MapLibre-Karte, Sources/Layer, Kontextmenü, Legenden
  - `route-renderer.js`: Routen und Aggregation als GeoJSON-Features
  - `colormap-utils.js`: Colormap-Berechnungen
  - `histogram-renderer.js`: Histogramm-Visualisierung
  - `marker-manager.js`: Ziel-Marker-Verwaltung
- **UI**: UI-Komponenten (modulare, wiederverwendbare Komponenten)
- **Handlers**: Event-Handler für lose Kopplung zwischen Modulen
- **Utils**: Zusätzliche Utilities (Geocoding)

Die Kommunikation zwischen Modulen erfolgt über einen Event-Bus (`EventBus`), was eine lose Kopplung und einfache Erweiterbarkeit ermöglicht.



## Ausblick

### Modellierung von Schulwegen

Der Kern-Use-Case ist die Modellierung von Schulwegen. Zwei der drei dafür
nötigen Bausteine sind inzwischen umgesetzt:

1. **Nachfrage (Schülerinnen und Schüler)** — ✅ umgesetzt:
   - Zensus-2022-Raster (100×100 m) mit `Einwohner` und `Unter18` als PMTiles
   - Startpunkte werden danach gewichtet, mit Kapazitätsgrenze je Zelle;
     Basis „nur unter 18“ wählbar (siehe Panel „Nachfragedetails“)
   - siehe https://atlas.zensus2022.de/

2. **Bushaltestellen und Fußverkehr** — ✅ umgesetzt:
   - ÖPNV-Haltestellen (OpenStreetMap) als deutschlandweiter PMTiles-Layer
   - Ein einstellbarer Anteil der Startpunkte beginnt an den zielnächsten
     Haltestellen; diese Wege werden immer als Fußwege gerechnet
   - Echtes ÖPNV-Routing (Bus-/Bahnfahrt selbst) ist als **Beta** über das
     ÖPNV-Profil verfügbar (Transitous/MOTIS `/plan`); die Aggregation zählt
     dort pro Linie und Ein-/Ausstiegspaar — siehe `docs/routing_bulk_review.md`

3. **Einzugsbereiche der Schulen** — offen:
   - Die Einzugsbereiche definieren, welche Wohnorte welcher Schule zugeordnet sind
   - Die Datenlage ist für verschiedene Bezirke in Berlin sehr unterschiedlich
   - Stand jetzt wurden nur Daten für Grundschulen gefunden

#### Verfügbare Datenquellen für Einzugsbereiche (von Grundschulen)

| Bezirk | Format | Beschreibung | Link |
|--------|--------|--------------|------|
| Treptow-Köpenick | PDF Karte | Einschulungsbereiche als PDF-Karte verfügbar | [Link](https://www.berlin.de/ba-treptow-koepenick/politik-und-verwaltung/aemter/schul-und-sportamt/schule/artikel.841674.php) |
| Neukölln | Digital(?) | Einschulungsbereiche in digitaler Form verfügbar, aber nicht öffentlich nutzbar (kein echtes WMS) | [Link](https://www.berlin.de/ba-neukoelln/politik-und-verwaltung/aemter/schul-und-sportamt/schulamt/artikel.1131196.php) |
| Steglitz-Zehlendorf | PDF mit Karte und Adressen | Einschulungsbereiche als PDF mit Karte und Adressliste | [Link](https://www.berlin.de/ba-steglitz-zehlendorf/politik-und-verwaltung/aemter/schul-und-sportamt/schulen/artikel.86435.php) |
| Mitte | PDF mit Karte und Adressliste | Einschulungsbereiche als PDF mit Karte und Adressliste | [Link](https://www.berlin.de/ba-mitte/politik-und-verwaltung/aemter/schul-und-sportamt/schule/artikel.1419606.php) |

Die Integration dieser Datenquellen würde es ermöglichen:
- synthetische Startpunkte basierend auf tatsächlichen Wohnorten von Schülerinnen und Schülern zu generieren
- wahrscheinliche Schulwege zu visualisieren und zu analysieren
- zusätzliche Fußwege von Bushaltestellen zu Schulen zu modellieren und zu visualisieren

## Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Siehe [LICENSE](LICENSE) für Details.


