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
- 📤 **Export**: Export von Routen als GeoJSON
- 🎛️ **Konfigurierbar**: Anpassbare Anzahl von Routen, Radius, Aggregierungsmethode und mehr

## Verwendung

1. Öffne `index.html` in einem modernen Webbrowser
2. Klicke auf die Karte, um einen Zielpunkt zu setzen
3. Die Anwendung generiert automatisch zufällige Startpunkte und berechnet Routen zum Zielpunkt
4. Nutze die Konfigurationsoptionen, um die Darstellung anzupassen:
   - **Profil**: Wähle zwischen verschiedenen Routing-Profilen
   - **Anzahl Routen**: Anzahl der zu berechnenden Routen
   - **Radius**: Radius für die Generierung von Startpunkten
   - **Längenverteilung**: Verteilungsfunktion für Startpunkte
   - **Aggregierte Darstellung**: Zeigt Routen mit Farbcodierung basierend auf der Anzahl
   - **Zielpunkte merken**: Speichert mehrere Zielpunkte und ihre Routen

## Projektstruktur

```
routing_bulk/
├── index.html              # Haupt-HTML-Datei
├── style.css              # Stylesheet
├── README.md              # Diese Datei
│
└── src/
    ├── core/              # Kern-Module
    │   ├── config.js      # Konfiguration
    │   ├── state.js       # State-Management
    │   ├── utils.js       # Utility-Funktionen
    │   └── events.js      # Event-Bus
    │
    ├── services/          # Business-Logik
    │   ├── route-service.js        # Route-Berechnung
    │   ├── target-service.js      # Zielpunkt-Verwaltung
    │   ├── export-service.js      # Export-Funktionalität
    │   └── aggregation-service.js  # Routen-Aggregierung
    │
    ├── domain/            # Domain-Modelle & Utilities
    │   ├── geo.js         # Geo-Funktionen
    │   ├── distribution.js # Verteilungs-Funktionen
    │   └── api.js         # API-Calls
    │
    ├── visualization/     # Visualisierung
    │   ├── visualization.js  # Visualisierungs-Utilities
    │   ├── map-renderer.js  # Karten-Rendering
    │   └── route-renderer.js # Route-Rendering
    │
    ├── ui/                # UI-Komponenten
    │   ├── targets-list.js      # Zielpunkte-Liste
    │   └── config-helpers.js    # Config-UI-Helper
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
  GH_ROUTE_URL: "https://ghroute.duckdns.org/route",
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

Weitere Details zur Aggregierung finden sich in `AGGREGATION_PARAMETERS.md` und `AGGREGATION_PROBLEM.md`.

## Entwicklung

### Architektur

Die Anwendung folgt einer modularen Architektur mit klarer Trennung von Concerns:

- **Core**: Kern-Funktionalität (Config, State, Events)
- **Services**: Business-Logik (Route-Berechnung, Zielpunkt-Verwaltung, Export)
- **Domain**: Domain-Modelle und Utilities
- **Visualization**: Visualisierungs-Logik
- **UI**: UI-Komponenten

### Event-Bus

Die Anwendung nutzt einen Event-Bus für lose Kopplung zwischen Modulen:

```javascript
// Event-Listener registrieren
EventBus.on(Events.TARGET_ADDED, (data) => {
  console.log('Neuer Zielpunkt:', data.target);
});

// Event emittieren
EventBus.emit(Events.ROUTES_CALCULATED, { target, routeInfo });
```

## Lizenz

[Lizenz hier angeben]

## Autor

[Autor hier angeben]

