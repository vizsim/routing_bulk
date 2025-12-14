# Code-Refactoring: Neue Struktur

## Übersicht

Die Codebasis wurde refactored, um besser strukturiert, wartbar und erweiterbar zu sein.

## Neue Ordnerstruktur

```
src/
├── core/                    # Kern-Module
│   ├── config.js           # Konfiguration (nur CONFIG-Objekt)
│   ├── state.js            # State-Management
│   ├── utils.js            # Utility-Funktionen
│   └── events.js           # Event-Bus für lose Kopplung
│
├── services/               # Business-Logik
│   ├── target-service.js   # Zielpunkt-Verwaltung
│   ├── route-service.js    # Route-Berechnung
│   ├── export-service.js  # Export-Funktionalität
│   └── aggregation-service.js # Routen-Aggregierung
│
├── domain/                 # Domain-Modelle & Utilities
│   ├── geo.js             # Geo-Funktionen
│   ├── distribution.js    # Verteilungs-Funktionen
│   └── api.js             # API-Calls
│
├── visualization/          # Visualisierung
│   ├── visualization.js   # (vorläufig: alte Datei kopiert)
│   └── map-renderer.js    # Karten-Rendering
│
└── ui/                     # UI-Komponenten
    └── targets-list.js     # Zielpunkte-Liste
```

## Wichtige Änderungen

### 1. Event-Bus (`src/core/events.js`)
- Lose Kopplung zwischen Modulen
- Events: `TARGET_ADDED`, `ROUTES_CALCULATED`, `CONFIG_CHANGED`, etc.
- Verwendung: `EventBus.emit(Events.TARGET_ADDED, data)`

### 2. Services
- **TargetService**: Verwaltung von Zielpunkten
- **RouteService**: Route-Berechnung & -Verwaltung
- **ExportService**: Export-Funktionalität
- **AggregationService**: Routen-Aggregierung

### 3. UI-Komponenten
- **TargetsList**: Isolierte Komponente für Zielpunkte-Liste
- Weitere Komponenten können hinzugefügt werden

## Verwendung

### Services verwenden

```javascript
// Zielpunkt hinzufügen
TargetService.addTarget([52.52, 13.405]);

// Routen berechnen
const routeInfo = await RouteService.calculateRoutes(target);

// Exportieren
ExportService.exportToGeoJSON();
```

### Events nutzen

```javascript
// Event-Listener registrieren
EventBus.on(Events.TARGET_ADDED, (data) => {
  console.log('Neuer Zielpunkt:', data.target);
});

// Event emittieren
EventBus.emit(Events.ROUTES_CALCULATED, { target, routeInfo });
```

## Migration

Die alte Struktur funktioniert noch parallel. Um vollständig zu migrieren:

1. **Aggregation umbenennen**: `Aggregation` → `AggregationService`
2. **App.js neu erstellen**: Services verwenden, Event-Bus nutzen
3. **index.html anpassen**: Neue Script-Reihenfolge
4. **Visualization aufteilen**: Route-Renderer, Marker-Renderer, etc.
5. **UI-Komponenten vervollständigen**: Config-Panel, etc.

Siehe `MIGRATION_GUIDE.md` für Details.

## Vorteile

✅ **Klare Trennung**: Jedes Modul hat eine klare Verantwortlichkeit  
✅ **Erweiterbar**: Neue Features können isoliert hinzugefügt werden  
✅ **Testbar**: Module können einzeln getestet werden  
✅ **Wartbar**: Änderungen sind lokalisiert  
✅ **Lose Kopplung**: Event-Bus ermöglicht Kommunikation ohne direkte Abhängigkeiten

## Nächste Schritte

1. Vollständige Migration durchführen
2. Visualization weiter aufteilen
3. UI-Komponenten vervollständigen
4. Tests hinzufügen
5. Dokumentation erweitern

