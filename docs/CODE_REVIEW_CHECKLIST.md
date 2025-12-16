# Code Review & Refactoring Checkliste

## 🔍 Duplikate

### Code-Duplikate
- [ ] **Route-Polyline-Entfernung**: Logik zum Entfernen von Routen-Polylines ist an mehreren Stellen dupliziert
  - `MapRenderer.clearRoutes()` (map-renderer.js:273)
  - `MapRenderer.removePolylines()` (map-renderer.js:289)
  - `RouteHandler.handleRoutesCalculated()` (route-handler.js:31,33)
  - `Visualization._handleTargetDragInNormalMode()` (visualization.js:299-302)
  - `Visualization.drawStartPoints()` drag handler (visualization.js:784-794)
  - **Lösung**: Zentralisierte Funktion in `MapRenderer` verwenden

- [ ] **CONFIG.REMEMBER_TARGETS Checks**: Überall im Code verstreut
  - `app.js`: Zeile 100, 108, 129, 291, 351, 422, 422, 569, 574, 612, 634, 709, 735, 837
  - `route-handler.js`: Zeile 12, 23, 73, 109
  - `route-service.js`: Zeile 50, 109
  - `route-renderer.js`: Zeile 84, 97, 131, 137
  - `visualization.js`: Zeile 134, 175, 297, 753, 804, 837, 861
  - **Lösung**: Helper-Funktion `isRememberMode()` oder State-basierte Abfrage

- [ ] **Target-Marker-Verwaltung**: Ähnliche Logik zum Finden/Entfernen von Markern
  - `TargetService.removeTarget()` (target-service.js:70-110)
  - `Visualization.cleanupOrphanedTargetMarkers()` (visualization.js:1370-1435)
  - `App._migrateCurrentTargetToRememberMode()` (app.js:481-549)
  - **Lösung**: Zentralisierte Marker-Verwaltung in `MarkerManager` Service

- [ ] **Config-Update-Pattern**: `_updateConfigFromUI()` mit Fallback-Check wiederholt
  - `app.js`: Zeile 198-201, 229-232, 277-280, 341-344, 388-392, 412-417, 445-448, 468-471, 560-563
  - **Lösung**: Entweder immer `config-helpers.js` verwenden oder Fallback entfernen

- [ ] **Route-Daten-Aktualisierung**: Ähnliche Logik in mehreren Services
  - `RouteService.updateRoute()` (route-service.js:157-205)
  - `Visualization.drawStartPoints()` drag handler (visualization.js:752-882)
  - **Lösung**: Zentralisierte Route-Update-Logik

- [ ] **Target-Index-Findung**: Mehrfach implementiert
  - `TargetService.findTargetIndex()` (target-service.js:20-23)
  - `Visualization._getTargetIndexForMarker()` (visualization.js:58-70)
  - `TargetService.removeTargetRoutes()` (target-service.js:211-230)
  - **Lösung**: Einheitliche Helper-Funktion

### Funktions-Duplikate
- [ ] **toggleAggregationUI()**: Wird geprüft ob existiert, sollte immer verfügbar sein
  - `app.js`: Zeile 38-40, 235-258
  - **Lösung**: Sicherstellen dass `config-helpers.js` immer geladen ist oder Fallback entfernen

- [ ] **updateConfigFromUI()**: Gleiche Prüfung wie oben
  - **Lösung**: Wie oben

## ⚠️ Fehleranfällige / Nicht robuste Stellen

### Fehlende Null-Checks
- [ ] **LayerGroup-Zugriffe**: Nicht überall abgesichert
  - `visualization.js`: Zeile 87, 686, 1098, 1230, 1260, 1371
  - `route-renderer.js`: Zeile 15, 31, 77
  - **Lösung**: Konsistente Null-Checks oder Assertions

- [ ] **Array-Zugriffe ohne Bounds-Check**
  - `visualization.js`: `routeInfo.starts[index]` (Zeile 762) ohne Prüfung
  - `route-service.js`: `allRouteData[index]` (Zeile 168) ohne Prüfung
  - **Lösung**: Helper-Funktion `safeArrayAccess()` oder konsistente Checks

- [ ] **DOM-Element-Zugriffe**: Nicht alle verwenden `Utils.getElement()`
  - `visualization.js`: `document.querySelector()` direkt (Zeile 12, 25, 32, 41, 478, 529)
  - `app.js`: `document.querySelector()` direkt (Zeile 529)
  - **Lösung**: Konsistent `Utils.getElement()` verwenden

### State-Management-Probleme
- [ ] **Direkte State-Mutationen**: State wird manchmal direkt mutiert statt Setter zu verwenden
  - `target-service.js`: Zeile 136 (`State.targetIdMap.clear()`)
  - **Lösung**: Alle State-Zugriffe über Getter/Setter

- [ ] **Inkonsistente State-Updates**: State wird an mehreren Stellen aktualisiert
  - `targetRoutes` wird in `RouteService`, `TargetService`, `App` und `Visualization` aktualisiert
  - **Lösung**: Single Source of Truth, nur über Service-Methoden

### Error Handling
- [ ] **Try-Catch-Blöcke**: Inkonsistent verwendet
  - `visualization.js`: `_handleTargetDrag()` hat try-catch (Zeile 164-194), aber viele andere Funktionen nicht
  - `route-service.js`: `calculateRoutes()` hat try-catch, aber `updateRoute()` nicht vollständig
  - **Lösung**: Konsistentes Error-Handling-Pattern

- [ ] **Fehlerbehandlung bei API-Calls**: Nicht alle API-Fehler werden behandelt
  - `route-service.js`: `Promise.all()` mit `.catch()` (Zeile 57), aber Fehler werden nur geloggt
  - **Lösung**: Retry-Logik oder bessere Fehlerbehandlung

### Magic Numbers & Strings
- [ ] **Hardcoded Werte**: Viele Magic Numbers im Code
  - `visualization.js`: `0.0001` (Zeile 11), `0.3` (Zeile 893), `0.15` (Zeile 45), `500` (route-warning.js:83)
  - **Lösung**: Konstanten in `CONFIG` oder separate Constants-Datei

- [ ] **Hardcoded Strings**: CSS-Klassen, Event-Namen, etc.
  - `'target-marker-highlighted'`, `'target-marker-selected'`, etc.
  - **Lösung**: Constants-Datei für UI-Klassen und Event-Namen

### Race Conditions & Async-Probleme
- [ ] **Async ohne Await**: Potenzielle Race Conditions
  - `app.js`: `_recalculateRoutesIfTargetExists()` (Zeile 367-373) - async aber nicht immer awaited
  - **Lösung**: Konsistente async/await-Verwendung

- [ ] **State-Updates während async Operations**: State könnte zwischenzeitlich geändert werden
  - `visualization.js`: `_handleTargetDragInRememberMode()` (Zeile 200-291) - komplexe async Logik
  - **Lösung**: Transaction-Pattern oder State-Locking

## 📦 Große Dateien aufteilen

### visualization.js (1438 Zeilen)
- [ ] **Marker-Rendering** in separate Datei auslagern
  - `drawTargetPoint()` (Zeile 86-156)
  - `drawStartPoints()` (Zeile 682-889)
  - `createSchoolIcon()` (Zeile 1023-1069)
  - `drawSchools()` (Zeile 1097-1205)
  - → `src/visualization/marker-renderer.js`

- [ ] **Histogram-Rendering** in separate Datei
  - `updateDistanceHistogram()` (Zeile 423-633)
  - → `src/visualization/histogram-renderer.js`

- [ ] **Colormap-Funktionen** in separate Datei
  - `getColormapColor()` (Zeile 907-979)
  - `generateGradientForColormap()` (Zeile 982-991)
  - `updateLegendGradient()` (Zeile 994-1000)
  - `updateColormapPreviews()` (Zeile 1003-1011)
  - `getColorForCount()` (Zeile 1013-1016)
  - `calculateWeightedLevel()` (Zeile 893-904)
  - → `src/visualization/colormap-utils.js`

- [ ] **Target-Drag-Handling** in separate Datei
  - `_handleTargetDrag()` (Zeile 163-195)
  - `_handleTargetDragInRememberMode()` (Zeile 200-292)
  - `_handleTargetDragInNormalMode()` (Zeile 297-315)
  - → `src/handlers/target-drag-handler.js`

- [ ] **Target-Marker-Management** in separate Datei
  - `cleanupOrphanedTargetMarkers()` (Zeile 1370-1435)
  - `highlightTargetMarker()` (Zeile 1270-1279)
  - `unhighlightAllTargetMarkers()` (Zeile 1284-1296)
  - `updateSelectedTargetMarker()` (Zeile 1301-1323)
  - → `src/services/marker-manager.js`

- [ ] **School-Rendering** in separate Datei
  - `drawSchools()` (Zeile 1097-1205)
  - `clearSchools()` (Zeile 1211-1220)
  - `drawSchoolSearchRadius()` (Zeile 1229-1250)
  - `clearSchoolSearchRadius()` (Zeile 1255-1264)
  - `updateSchoolIcons()` (Zeile 1074-1088)
  - → `src/visualization/school-renderer.js`

### app.js (777 Zeilen)
- [ ] **Event-Handler-Setup** in separate Datei
  - `_setupProfileButtons()` (Zeile 176-214)
  - `_setupAggregationToggle()` (Zeile 219-262)
  - `_setupAggregationMethod()` (Zeile 267-284)
  - `_setupRouteCountInput()` (Zeile 378-397)
  - `_setupRadiusInput()` (Zeile 402-429)
  - `_setupHideStartPoints()` (Zeile 435-453)
  - `_setupHideTargetPoints()` (Zeile 458-476)
  - `_setupRememberTargetsHandler()` (Zeile 554-595)
  - → `src/handlers/config-handlers.js`

- [ ] **UI-Initialisierung** in separate Datei
  - `_initUI()` (Zeile 25-52)
  - `_setupPanelCollapse()` (Zeile 750-765)
  - → `src/ui/app-ui.js`

- [ ] **Route-Recalculations** in separate Datei
  - `_recalculateTargetRoutes()` (Zeile 290-336)
  - `recalculateRoutes()` (Zeile 705-745)
  - `_recalculateRoutesIfTargetExists()` (Zeile 367-373)
  - → `src/handlers/route-recalculation-handler.js`

### geocoder.js (575 Zeilen)
- [ ] **UI-Logik** in separate Datei
  - `_createInputField()` (Zeile 168-248)
  - `_createSuggestionsContainer()` (Zeile 253-266)
  - `_setupEventListeners()` (Zeile 271-336)
  - `_showSuggestions()` (Zeile 391-416)
  - `_createSuggestionHTML()` (Zeile 421-431)
  - → `src/ui/geocoder-ui.js`

- [ ] **API-Logik** bleibt in geocoder.js
  - `search()` (Zeile 18-47)
  - `reverse()` (Zeile 118-143)
  - `_formatResults()` (Zeile 54-110)

### style.css (982 Zeilen)
- [ ] **Komponenten-basierte Aufteilung**
  - Panel-Styles → `styles/components/panel.css`
  - Button-Styles → `styles/components/buttons.css`
  - Form-Styles → `styles/components/forms.css`
  - Modal-Styles → `styles/components/modal.css`
  - Geocoder-Styles → `styles/components/geocoder.css`
  - Context-Menu-Styles → `styles/components/context-menu.css`
  - Base/Reset → `styles/base.css`

## 🏗️ Strukturelle Verbesserungen

### Architektur
- [ ] **Service-Layer konsolidieren**: Services sollten klar getrennt sein
  - `RouteService` - Route-Berechnung
  - `TargetService` - Target-Verwaltung
  - `MarkerManager` (neu) - Marker-Verwaltung
  - `StateService` (neu) - State-Management mit Validierung

- [ ] **Event-System erweitern**: Mehr Events für bessere Entkopplung
  - `MARKER_CREATED`, `MARKER_REMOVED`
  - `STATE_CHANGED` (für State-Updates)
  - `CONFIG_LOADED`, `CONFIG_SAVED`

- [ ] **Dependency Injection**: Services sollten nicht direkt auf State zugreifen
  - Aktuell: Services greifen direkt auf `State` zu
  - **Lösung**: State als Parameter übergeben oder Service-Locator

### Code-Organisation
- [ ] **Constants-Datei erstellen**
  - Magic Numbers
  - CSS-Klassen
  - Event-Namen
  - API-Endpunkte
  - → `src/core/constants.js`

- [ ] **Type Definitions** (JSDoc erweitern)
  - Konsistente JSDoc-Typen
  - Type-Checker wie TypeScript oder JSDoc-Validierung

- [ ] **Validierung zentralisieren**
  - Input-Validierung
  - State-Validierung
  - → `src/core/validators.js`

### Performance
- [ ] **Debouncing konsolidieren**
  - Geocoder hat Debouncing (Zeile 343-355)
  - Map Zoom hat Debouncing (map-renderer.js:53-62)
  - **Lösung**: Zentralisierte Debounce-Utility

- [ ] **Memoization für teure Berechnungen**
  - `calculateWeightedLevel()` könnte gecacht werden
  - Colormap-Berechnungen

- [ ] **Batch-Updates für DOM**
  - Mehrere DOM-Updates zusammenfassen
  - `requestAnimationFrame` für visuelle Updates

### Testing & Wartbarkeit
- [ ] **Unit-Test-Struktur vorbereiten**
  - Services sollten testbar sein
  - Mocking für State und DOM

- [ ] **Logging-System**
  - Konsistentes Logging-Level
  - Debug-Modus
  - → `src/core/logger.js`

- [ ] **Dokumentation**
  - README für Entwickler
  - Architektur-Diagramm
  - API-Dokumentation für Services

## 🔧 Konkrete Refactoring-Schritte (Priorität)

### Hoch
1. [ ] **Duplikate entfernen**: Route-Polyline-Entfernung zentralisieren
2. [ ] **Null-Checks hinzufügen**: Alle LayerGroup-Zugriffe absichern
3. [ ] **CONFIG.REMEMBER_TARGETS Helper**: Einheitliche Abfrage-Methode
4. [ ] **visualization.js aufteilen**: Größte Datei zuerst

### Mittel
5. [ ] **app.js aufteilen**: Event-Handler auslagern
6. [ ] **Constants-Datei**: Magic Numbers/Strings auslagern
7. [ ] **Error-Handling**: Konsistentes Pattern
8. [ ] **State-Management**: Single Source of Truth

### Niedrig
9. [ ] **CSS aufteilen**: Komponenten-basiert
10. [ ] **geocoder.js aufteilen**: UI/API trennen
11. [ ] **Performance-Optimierungen**: Debouncing, Memoization
12. [ ] **Dokumentation**: Entwickler-Docs

## 📝 Notizen

- Die Codebase ist bereits gut strukturiert mit klarer Trennung von Services, Handlers, UI, etc.
- Hauptproblem: Große Dateien (visualization.js, app.js) und Code-Duplikate
- State-Management funktioniert, könnte aber konsistenter sein
- Event-System ist vorhanden, könnte erweitert werden
- Error-Handling ist inkonsistent, sollte standardisiert werden

