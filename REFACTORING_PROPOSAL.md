# Code-Refactoring Vorschlag

## Aktuelle Probleme

1. **config.js** (560 Zeilen) - Mischt mehrere Verantwortlichkeiten:
   - Konfiguration
   - UI-Initialisierung
   - Event-Handler
   - UI-Helper-Funktionen

2. **app.js** (462 Zeilen) - Zu viele Verantwortlichkeiten:
   - Route-Berechnung
   - Visualisierung-Logik
   - Export-Funktionalität
   - Event-Handler

3. **visualization.js** - Enthält Business-Logik (Drag-Handler)

4. Keine klare Trennung zwischen UI, Business-Logik und Daten

## Vorgeschlagene Struktur

```
routing_bulk/
├── index.html
├── style.css
│
├── src/
│   ├── core/                    # Kern-Funktionalität
│   │   ├── config.js            # Nur Konfiguration (CONFIG-Objekt)
│   │   ├── state.js             # State-Management (unverändert)
│   │   └── events.js            # Event-Bus für lose Kopplung
│   │
│   ├── services/                # Business-Logik
│   │   ├── route-service.js     # Route-Berechnung & -Verwaltung
│   │   ├── target-service.js    # Zielpunkt-Verwaltung
│   │   ├── export-service.js    # Export-Funktionalität
│   │   └── aggregation-service.js # Aggregierung (aus aggregation.js)
│   │
│   ├── domain/                  # Domain-Modelle & Utilities
│   │   ├── geo.js               # Geo-Funktionen (unverändert)
│   │   ├── distribution.js      # Verteilungs-Funktionen (unverändert)
│   │   └── api.js               # API-Calls (unverändert)
│   │
│   ├── visualization/            # Visualisierung
│   │   ├── map-renderer.js      # Karten-Rendering
│   │   ├── route-renderer.js    # Route-Rendering
│   │   ├── marker-renderer.js   # Marker-Rendering
│   │   └── colormap.js          # Colormap-Funktionen
│   │
│   ├── ui/                      # UI-Komponenten
│   │   ├── config-panel.js      # Config-Panel Management
│   │   ├── profile-selector.js  # Profil-Auswahl
│   │   ├── distribution-selector.js # Verteilungs-Auswahl
│   │   ├── colormap-selector.js # Colormap-Auswahl
│   │   ├── targets-list.js      # Zielpunkte-Liste
│   │   └── export-button.js     # Export-Button
│   │
│   └── app.js                   # Haupt-Orchestrierung (schlank)
│
└── README.md                    # Dokumentation
```

## Detaillierte Aufteilung

### 1. `src/core/config.js`
```javascript
// Nur das CONFIG-Objekt, keine UI-Logik
const CONFIG = {
  GH_ROUTE_URL: "...",
  PROFILE: "bike",
  // ...
};
```

### 2. `src/core/events.js` (NEU)
```javascript
// Event-Bus für lose Kopplung zwischen Modulen
const EventBus = {
  on(event, callback) { ... },
  emit(event, data) { ... },
  off(event, callback) { ... }
};

// Events:
// - 'config:changed'
// - 'target:added'
// - 'target:removed'
// - 'routes:calculated'
// - 'routes:updated'
// - 'visualization:mode-changed'
```

### 3. `src/services/route-service.js`
```javascript
// Route-Berechnung & -Verwaltung
const RouteService = {
  async calculateRoutes(target, options) { ... },
  async recalculateRoutes() { ... },
  updateRoute(index, newStart) { ... },
  getAllRoutesForTargets() { ... }
};
```

### 4. `src/services/target-service.js`
```javascript
// Zielpunkt-Verwaltung
const TargetService = {
  addTarget(target) { ... },
  removeTarget(index) { ... },
  getAllTargets() { ... },
  getTargetRoutes(target) { ... },
  updateTargetRoutes(target, routes) { ... }
};
```

### 5. `src/services/export-service.js`
```javascript
// Export-Funktionalität
const ExportService = {
  exportToGeoJSON() { ... },
  exportToCSV() { ... }, // Erweiterbar
  validateExportData() { ... }
};
```

### 6. `src/visualization/map-renderer.js`
```javascript
// Karten-Rendering
const MapRenderer = {
  init() { ... },
  clearLayers() { ... },
  clearRoutes() { ... },
  clearMarkers() { ... }
};
```

### 7. `src/visualization/route-renderer.js`
```javascript
// Route-Rendering
const RouteRenderer = {
  drawRoute(routeData, color) { ... },
  drawAggregatedRoutes(segments, maxCount) { ... },
  drawAllTargetRoutes() { ... },
  updateRouteVisualization() { ... }
};
```

### 8. `src/visualization/marker-renderer.js`
```javascript
// Marker-Rendering
const MarkerRenderer = {
  drawTargetPoint(latlng) { ... },
  drawStartPoints(starts, colors) { ... },
  updateStartPointVisibility() { ... },
  removeMarker(marker) { ... }
};
```

### 9. `src/ui/config-panel.js`
```javascript
// Config-Panel Management
const ConfigPanel = {
  init() { ... },
  updateFromUI() { ... },
  syncToUI() { ... },
  toggleAggregationUI() { ... },
  toggleTargetsListUI() { ... }
};
```

### 10. `src/ui/targets-list.js`
```javascript
// Zielpunkte-Liste UI
const TargetsList = {
  init() { ... },
  update() { ... },
  addTarget(target) { ... },
  removeTarget(index) { ... },
  onRemoveClick(callback) { ... }
};
```

### 11. `src/app.js` (schlank)
```javascript
// Haupt-Orchestrierung
const App = {
  init() {
    MapRenderer.init();
    ConfigPanel.init();
    // Event-Listener registrieren
    EventBus.on('map:click', this.handleMapClick);
    EventBus.on('config:changed', this.handleConfigChange);
    // ...
  },
  
  async handleMapClick(e) {
    const target = [e.latlng.lat, e.latlng.lng];
    await RouteService.calculateRoutes(target);
  },
  
  handleConfigChange(config) {
    // Reagieren auf Config-Änderungen
  }
};
```

## Vorteile dieser Struktur

1. **Klare Trennung**: Jedes Modul hat eine klare Verantwortlichkeit
2. **Erweiterbarkeit**: Neue Features können isoliert hinzugefügt werden
3. **Testbarkeit**: Module können einzeln getestet werden
4. **Wartbarkeit**: Änderungen sind lokalisiert
5. **Lose Kopplung**: Event-Bus ermöglicht Kommunikation ohne direkte Abhängigkeiten
6. **Nachvollziehbarkeit**: Klare Ordnerstruktur zeigt Architektur

## Migrations-Strategie

1. **Phase 1**: Neue Struktur parallel aufbauen
2. **Phase 2**: Schrittweise Migration (ein Modul nach dem anderen)
3. **Phase 3**: Alte Dateien entfernen
4. **Phase 4**: Tests & Dokumentation

## Nächste Schritte

1. Event-Bus implementieren
2. Services extrahieren
3. UI-Komponenten isolieren
4. Visualization aufteilen
5. App.js vereinfachen

Soll ich mit der Implementierung beginnen?

