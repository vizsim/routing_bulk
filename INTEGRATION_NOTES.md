# Integration Notes

## Status

Die neue Struktur ist erstellt, aber noch nicht vollständig integriert. Die alte Struktur funktioniert weiterhin.

## Was funktioniert

- ✅ Neue Ordnerstruktur erstellt
- ✅ Services erstellt (target, route, export, aggregation)
- ✅ Event-Bus implementiert
- ✅ Map-Renderer erstellt
- ✅ Route-Renderer erstellt
- ✅ Targets-List UI-Komponente
- ✅ Neue App.js erstellt
- ✅ index_new.html mit neuer Struktur

## Was noch zu tun ist

1. **Referenzen aktualisieren**:
   - `Aggregation` → `AggregationService` in allen Dateien
   - Alte `App.` Aufrufe durch Services ersetzen

2. **Config UI migrieren**:
   - `config.js` Funktionen in UI-Komponenten aufteilen
   - Event-Bus für Config-Änderungen nutzen

3. **Visualization komplett aufteilen**:
   - Marker-Renderer extrahieren
   - Colormap-Funktionen extrahieren
   - Histogram-Funktionen extrahieren

4. **Testen**:
   - `index_new.html` testen
   - Fehler beheben
   - Alte Dateien entfernen

## Migration

Um die neue Struktur zu nutzen:

1. `index_new.html` in `index.html` umbenennen (Backup der alten erstellen)
2. Fehler in der Browser-Konsole beheben
3. Schrittweise alte Referenzen ersetzen
4. Alte Dateien entfernen

## Kompatibilität

- Alte Dateien bleiben erhalten
- Neue Struktur ist parallel vorhanden
- Event-Bus ermöglicht lose Kopplung
- Services können schrittweise integriert werden

