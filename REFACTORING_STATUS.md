# Refactoring Status

## ✅ Abgeschlossen

1. **Ordnerstruktur erstellt**
   - `src/core/` - Kern-Module (config, state, utils, events)
   - `src/services/` - Business-Logik (target-service, route-service, export-service, aggregation-service)
   - `src/domain/` - Domain-Modelle (geo, distribution, api)
   - `src/visualization/` - Visualisierung (noch zu erstellen)
   - `src/ui/` - UI-Komponenten (noch zu erstellen)

2. **Event-Bus implementiert** (`src/core/events.js`)
   - Event-System für lose Kopplung
   - Event-Konstanten definiert

3. **Config extrahiert** (`src/core/config.js`)
   - Nur CONFIG-Objekt, keine UI-Logik

4. **Services erstellt**
   - `target-service.js` - Zielpunkt-Verwaltung
   - `route-service.js` - Route-Berechnung
   - `export-service.js` - Export-Funktionalität
   - `aggregation-service.js` - Aggregierung (aus aggregation.js kopiert)

## 🔄 In Arbeit

- Visualization aufteilen
- UI-Komponenten isolieren
- App.js vereinfachen
- index.html anpassen

## 📝 Nächste Schritte

1. **Visualization aufteilen**:
   - `map-renderer.js` - Karten-Rendering
   - `route-renderer.js` - Route-Rendering
   - `marker-renderer.js` - Marker-Rendering
   - `colormap.js` - Colormap-Funktionen

2. **UI-Komponenten**:
   - `config-panel.js` - Config-Panel Management
   - `targets-list.js` - Zielpunkte-Liste
   - Weitere UI-Komponenten nach Bedarf

3. **App.js vereinfachen**:
   - Nur Orchestrierung
   - Event-Listener registrieren
   - Services koordinieren

4. **index.html anpassen**:
   - Neue Script-Reihenfolge
   - Alte Scripts entfernen

## ⚠️ Wichtige Hinweise

- **Aggregation** muss zu **AggregationService** umbenannt werden
- Alle Referenzen zu `Aggregation.` müssen aktualisiert werden
- Alte Dateien können nach erfolgreicher Migration entfernt werden

## 🎯 Ziel

- Klare Trennung von Concerns
- Erweiterbare Struktur
- Wartbarer Code
- Testbare Module

