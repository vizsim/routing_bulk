# Migrations-Guide

## Aktueller Status

Die neue Struktur ist grundlegend erstellt, aber noch nicht vollständig integriert. 

## Was wurde erstellt

### ✅ Neue Struktur
- `src/core/` - Kern-Module (config, state, utils, events)
- `src/services/` - Services (target-service, route-service, export-service, aggregation-service)
- `src/domain/` - Domain-Modelle (geo, distribution, api)
- `src/visualization/` - Visualisierung (visualization.js kopiert, map-renderer.js neu)
- `src/ui/` - UI-Komponenten (targets-list.js)

### ⚠️ Noch zu tun

1. **Aggregation umbenennen**: 
   - `Aggregation` → `AggregationService` in `aggregation-service.js`
   - Alle Referenzen aktualisieren

2. **Visualization aufteilen**:
   - Route-Rendering extrahieren
   - Marker-Rendering extrahieren
   - Colormap-Funktionen extrahieren

3. **UI-Komponenten vervollständigen**:
   - Config-Panel Management
   - Weitere UI-Komponenten

4. **App.js neu erstellen**:
   - Services verwenden
   - Event-Bus nutzen
   - Orchestrierung vereinfachen

5. **index.html anpassen**:
   - Neue Script-Reihenfolge
   - Alte Scripts entfernen

## Empfohlener Migrationsweg

### Option 1: Schrittweise Migration (empfohlen)
1. Neue Module parallel zu alten Dateien erstellen
2. Schrittweise alte Code-Teile durch neue Services ersetzen
3. Alte Dateien entfernen, wenn alles funktioniert

### Option 2: Komplett neu
1. Alle neuen Module erstellen
2. Alte Dateien als Backup behalten
3. index.html auf neue Struktur umstellen
4. Testen und anpassen

## Nächste Schritte

1. **Aggregation umbenennen und Referenzen aktualisieren**
2. **App.js neu erstellen** (vereinfacht, nutzt Services)
3. **index.html anpassen** (neue Script-Reihenfolge)
4. **Testen** und Fehler beheben
5. **Alte Dateien entfernen**

## Wichtige Hinweise

- Die alte Struktur funktioniert noch
- Neue Struktur ist parallel vorhanden
- Event-Bus ermöglicht lose Kopplung
- Services kapseln Business-Logik

