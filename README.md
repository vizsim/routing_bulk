# Bulk-Router

Eine interaktive Web-Anwendung zur Visualisierung von Routen mit mehreren Startpunkten zu einem Zielpunkt. Die Anwendung nutzt die GraphHopper Routing API, um Routen zu berechnen und bietet verschiedene Visualisierungs- und Analyseoptionen.

## Features

- 🗺️ **Interaktive Karte**: Klick auf die Karte, um einen Zielpunkt zu setzen
- 🎯 **Mehrere Startpunkte**: Automatische Generierung von zufälligen Startpunkten in einem konfigurierbaren Radius
- 🚴 **Verschiedene Profile**: Unterstützung für verschiedene Routing-Profile (Fahrrad, Auto, etc.)
- 📊 **Aggregierte Darstellung**: Visualisierung von Routen mit Farbcodierung basierend auf der Anzahl der Routen pro Segment
- 🎨 **Colormaps**: Verschiedene Farbschemata für die aggregierte Darstellung (viridis, plasma, inferno, magma)
- 💾 **Zielpunkte merken**: Speichern und Verwalten mehrerer Zielpunkte mit ihren zugehörigen Routen
- 📈 **Längenverteilung**: Verschiedene Verteilungsfunktionen für Startpunkte (lognormal, uniform, normal, etc.)
- 🏫 **Schulen anzeigen**: Suche und Visualisierung von Schulen über OpenStreetMap (Rechtsklick-Menü)
- 📤 **Export**: Export von Routen als GeoJSON
- 🎛️ **Konfigurierbar**: Anpassbare Anzahl von Routen, Radius, Aggregierungsmethode und mehr

## Verwendung

### Online (GitHub Pages)

Die Anwendung ist verfügbar unter: [https://vizsim.github.io/routing_bulk/](https://vizsim.github.io/routing_bulk/)

### Nutzung

1. Klicke auf die Karte, um einen Zielpunkt zu setzen
2. Die Anwendung generiert automatisch zufällige Startpunkte und berechnet Routen zum Zielpunkt
3. Nutze die Konfigurationsoptionen, um die Darstellung anzupassen:
   - **Profil**: Wähle zwischen verschiedenen Routing-Profilen
   - **Anzahl Routen**: Anzahl der zu berechnenden Routen
   - **Radius**: Radius für die Generierung von Startpunkten
   - **Längenverteilung**: Verteilungsfunktion für Startpunkte
   - **Aggregierte Darstellung**: Zeigt Routen mit Farbcodierung basierend auf der Anzahl
   - **Zielpunkte merken**: Speichert mehrere Zielpunkte und ihre Routen
4. **Schulen anzeigen**: Rechtsklick auf die Karte → "Schulen suchen" um Schulen im Umkreis anzuzeigen

## Projektstruktur

```
routing_bulk/
├── index.html              # Haupt-HTML-Datei
├── style.css              # Stylesheet
├── README.md              # Diese Datei
├── LICENSE                # MIT-Lizenz
├── bulk_router_logo.svg   # Logo
│
├── docs/                  # Dokumentation
│   ├── AGGREGATION_PROBLEM.md      # Dokumentation zum Aggregierungs-Problem
│   ├── AGGREGATION_PARAMETERS.md   # Dokumentation zu Aggregierungs-Parametern
│   └── CODE_REVIEW_CHECKLIST.md    # Code Review & Refactoring Checkliste
│
└── src/
    ├── core/              # Kern-Module
    │   ├── config.js      # Konfiguration
    │   ├── state.js       # State-Management
    │   ├── utils.js       # Utility-Funktionen
    │   ├── events.js      # Event-Bus
    │   └── compat.js      # Kompatibilitäts-Helper
    │
    ├── services/          # Business-Logik
    │   ├── route-service.js        # Route-Berechnung
    │   ├── target-service.js       # Zielpunkt-Verwaltung
    │   ├── export-service.js       # Export-Funktionalität
    │   ├── aggregation-service.js  # Routen-Aggregierung
    │   └── overpass-service.js     # Overpass API (OSM-Daten)
    │
    ├── domain/            # Domain-Modelle & Utilities
    │   ├── geo.js         # Geo-Funktionen
    │   ├── distribution.js # Verteilungs-Funktionen
    │   └── api.js         # API-Calls
    │
    ├── visualization/     # Visualisierung
    │   ├── visualization.js       # Visualisierungs-Orchestrierung
    │   ├── map-renderer.js         # Karten-Rendering
    │   ├── route-renderer.js       # Route-Rendering
    │   ├── colormap-utils.js       # Colormap-Utilities
    │   ├── histogram-renderer.js   # Histogramm-Rendering
    │   ├── marker-manager.js       # Marker-Verwaltung
    │   └── school-renderer.js      # Schul-Rendering
    │
    ├── ui/                # UI-Komponenten
    │   ├── targets-list.js         # Zielpunkte-Liste
    │   ├── config-helpers.js       # Config-UI-Helper
    │   ├── distribution-selector.js # Verteilungs-Auswahl
    │   ├── colormap-selector.js    # Colormap-Auswahl
    │   └── route-warning.js        # Route-Warnung (Modal)
    │
    ├── handlers/          # Event-Handler
    │   └── route-handler.js        # Route-Event-Handler
    │
    ├── utils/             # Utilities
    │   └── geocoder.js    # Geocoding (Adresssuche)
    │
    └── app.js             # Haupt-Orchestrierung
```

## Technologie-Stack

- **Leaflet.js**: Karten-Visualisierung
- **GraphHopper API**: Routing-Berechnung
- **Vanilla JavaScript**: Keine externen Frameworks
- **Event-Bus Pattern**: Lose Kopplung zwischen Modulen

## Konfiguration

Die Hauptkonfiguration befindet sich in `src/core/config.js`:

```javascript
const CONFIG = {
  //GH_ROUTE_URL: "https://ghroute.duckdns.org/route",
  GH_ROUTE_URL: "https://ghroute.vizsim.de/route",
  PROFILE: "bike",
  N: 10,
  RADIUS_M: 2000,
  // ...
};
```

## Aggregierung

Die Anwendung unterstützt zwei Aggregierungsmethoden:

1. **Simple**: Schnelle Aggregierung basierend auf normalisierten Koordinaten
2. **Lazy Overlap Splitting**: Präzisere Aggregierung mit Overlap-Erkennung

Weitere Details zur Aggregierung finden sich in [`docs/AGGREGATION_PARAMETERS.md`](docs/AGGREGATION_PARAMETERS.md) und [`docs/AGGREGATION_PROBLEM.md`](docs/AGGREGATION_PROBLEM.md).

## Entwicklung

### Architektur

Die Anwendung folgt einer modularen Architektur mit klarer Trennung von Concerns:

- **Core**: Kern-Funktionalität (Config, State, Events, Utils)
- **Services**: Business-Logik (Route-Berechnung, Zielpunkt-Verwaltung, Export, Aggregation)
- **Domain**: Domain-Modelle und Utilities (Geo-Funktionen, Verteilungen, API-Calls)
- **Visualization**: Visualisierungs-Logik (modular aufgeteilt in spezialisierte Renderer)
  - `visualization.js`: Orchestrierung und Delegation
  - `map-renderer.js`: Karten-Rendering
  - `route-renderer.js`: Route-Rendering
  - `colormap-utils.js`: Colormap-Berechnungen
  - `histogram-renderer.js`: Histogramm-Visualisierung
  - `marker-manager.js`: Marker-Verwaltung
  - `school-renderer.js`: Schul-Visualisierung
- **UI**: UI-Komponenten (modulare, wiederverwendbare Komponenten)
- **Handlers**: Event-Handler für lose Kopplung zwischen Modulen
- **Utils**: Zusätzliche Utilities (Geocoding)

Die Kommunikation zwischen Modulen erfolgt über einen Event-Bus (`EventBus`), was eine lose Kopplung und einfache Erweiterbarkeit ermöglicht.



## Ausblick

### Modellierung von Schulwegen

Ein geplanter Use Case für die Anwendung ist die Modellierung von Schulwegen. Hierfür werden zusätzlich zu den Routenberechnungen weitere Datenquellen benötigt:

1. **Nachfrage (Schülerinnen und Schüler)**: 
   - **Zensus 2022 Daten**: 100x100m Raster mit Einwohnerzahlen und "Anteil unter 18 Jähriger"
   - Diese Daten ermöglichen die Abschätzung der Anzahl von Schülerinnen und Schülern pro Rasterzelle
   - siehe https://atlas.zensus2022.de/

2. **Bushaltestellen und Fußverkehr**:
   - Bushaltestellen in der Nähe von Schulen können als zusätzliche Startpunkte für Fußwege dienen
   - Von diesen Haltestellen aus können Fußwege zu den Schulen modelliert werden
   - Dies ermöglicht eine realistischere Darstellung von Schulwegen, die auch öffentliche Verkehrsmittel einbezieht
   - **Datenquelle**: Bushaltestellen sind in OpenStreetMap (OSM) verfügbar und können ähnlich wie Schulen über die Overpass API abgerufen werden

3. **Einzugsbereiche der Schulen**:
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


