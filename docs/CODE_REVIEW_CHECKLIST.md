# Code Review & Refactoring Checkliste

**Letzte Aktualisierung**: Nach Refactoring-Session (visualization.js aufgeteilt, Helper-Funktionen erstellt)

## ✅ Bereits umgesetzt

### Duplikate entfernt
- ✅ **CONFIG.REMEMBER_TARGETS Helper**: `isRememberMode()` in `src/core/config.js` erstellt, alle 36+ Vorkommen ersetzt
- ✅ **Route-Polyline-Entfernung zentralisiert**: Alle direkten `layerGroup.removeLayer()` Aufrufe durch `MapRenderer.removePolylines()` oder `MapRenderer.clearRoutes()` ersetzt (23+ Stellen aktualisiert)

### Null-Checks hinzugefügt
- ✅ **LayerGroup-Zugriffe abgesichert**: Null-Checks in `RouteRenderer`, `MarkerManager`, `SchoolRenderer` und `Visualization` hinzugefügt

### visualization.js aufgeteilt
- ✅ **Colormap-Funktionen** → `src/visualization/colormap-utils.js` (133 Zeilen)
- ✅ **Histogram-Rendering** → `src/visualization/histogram-renderer.js` (220 Zeilen)
- ✅ **Marker-Management** → `src/visualization/marker-manager.js` (133 Zeilen)
- ✅ **School-Rendering** → `src/visualization/school-renderer.js` (260 Zeilen)
- ✅ **visualization.js reduziert**: Von 1448 Zeilen auf **791 Zeilen** (~45% Reduktion)

### UI-Komponenten bereits extrahiert
- ✅ **Distribution-Selector**: `src/ui/distribution-selector.js` existiert bereits
- ✅ **Colormap-Selector**: `src/ui/colormap-selector.js` existiert bereits
- ✅ **Targets-List**: `src/ui/targets-list.js` existiert bereits
- ✅ **Route-Handler**: `src/handlers/route-handler.js` existiert (teilweise, `handleMapClick()` noch in app.js)

---

## 🔍 Duplikate

### Code-Duplikate
- [ ] **Target-Marker-Verwaltung**: Ähnliche Logik zum Finden/Entfernen von Markern
  - `TargetService.removeTarget()` (target-service.js:70-110)
  - `MarkerManager.cleanupOrphanedTargetMarkers()` (marker-manager.js)
  - `App._migrateCurrentTargetToRememberMode()` (app.js)
  - **Lösung**: Zentralisierte Marker-Verwaltung in `MarkerManager` Service erweitern

- [ ] **Config-Update-Pattern**: `_updateConfigFromUI()` mit Fallback-Check wiederholt
  - `app.js`: Mehrere Stellen mit `typeof updateConfigFromUI === 'function'` Checks
  - **Lösung**: Entweder immer `config-helpers.js` verwenden oder Fallback entfernen

- [ ] **Route-Daten-Aktualisierung**: Ähnliche Logik in mehreren Services
  - `RouteService.updateRoute()` (route-service.js:157-205)
  - `Visualization.drawStartPoints()` drag handler (visualization.js:540-679)
  - **Lösung**: Zentralisierte Route-Update-Logik

- [ ] **Target-Index-Findung**: Mehrfach implementiert
  - `TargetService.findTargetIndex()` (target-service.js:20-23)
  - `Visualization._getTargetIndexForMarker()` (visualization.js:58-70)
  - `TargetService.removeTargetRoutes()` (target-service.js:211-230)
  - **Lösung**: Einheitliche Helper-Funktion

### Funktions-Duplikate
- [ ] **toggleAggregationUI()**: Wird geprüft ob existiert, sollte immer verfügbar sein
  - `app.js`: Mehrere Stellen mit `typeof toggleAggregationUI === 'function'` Checks
  - **Lösung**: Sicherstellen dass `config-helpers.js` immer geladen ist oder Fallback entfernen

- [ ] **updateConfigFromUI()**: Gleiche Prüfung wie oben
  - **Lösung**: Wie oben

## ⚠️ Fehleranfällige / Nicht robuste Stellen

### Fehlende Null-Checks
- [ ] **Array-Zugriffe ohne Bounds-Check**
  - `visualization.js`: `routeInfo.starts[index]` ohne Prüfung
  - `route-service.js`: `allRouteData[index]` ohne Prüfung
  - **Lösung**: Helper-Funktion `safeArrayAccess()` oder konsistente Checks

- [ ] **DOM-Element-Zugriffe**: Nicht alle verwenden `Utils.getElement()`
  - `visualization.js`: `document.querySelector()` direkt (mehrere Stellen)
  - `app.js`: `document.querySelector()` direkt
  - **Lösung**: Konsistent `Utils.getElement()` verwenden

### State-Management-Probleme
- [ ] **Direkte State-Mutationen**: State wird manchmal direkt mutiert statt Setter zu verwenden
  - `target-service.js`: `State.targetIdMap.clear()` (direkter Zugriff)
  - **Lösung**: Alle State-Zugriffe über Getter/Setter

- [ ] **Inkonsistente State-Updates**: State wird an mehreren Stellen aktualisiert
  - `targetRoutes` wird in `RouteService`, `TargetService`, `App` und `Visualization` aktualisiert
  - **Lösung**: Single Source of Truth, nur über Service-Methoden

### Error Handling
- [ ] **Try-Catch-Blöcke**: Inkonsistent verwendet
  - `visualization.js`: `_handleTargetDrag()` hat try-catch, aber viele andere Funktionen nicht
  - `route-service.js`: `calculateRoutes()` hat try-catch, aber `updateRoute()` nicht vollständig
  - **Lösung**: Konsistentes Error-Handling-Pattern

- [ ] **Fehlerbehandlung bei API-Calls**: Nicht alle API-Fehler werden behandelt
  - `route-service.js`: `Promise.all()` mit `.catch()`, aber Fehler werden nur geloggt
  - **Lösung**: Retry-Logik oder bessere Fehlerbehandlung

### Magic Numbers & Strings
- [ ] **Hardcoded Werte**: Viele Magic Numbers im Code
  - `colormap-utils.js`: `0.3` (weight parameter)
  - `visualization.js`: `0.0001`, `0.15`, etc.
  - `route-warning.js`: `500` (route count threshold)
  - **Lösung**: Konstanten in `CONFIG` oder separate Constants-Datei

- [ ] **Hardcoded Strings**: CSS-Klassen, Event-Namen, etc.
  - `'target-marker-highlighted'`, `'target-marker-selected'`, etc.
  - **Lösung**: Constants-Datei für UI-Klassen und Event-Namen

### Race Conditions & Async-Probleme
- [ ] **Async ohne Await**: Potenzielle Race Conditions
  - `app.js`: `_recalculateRoutesIfTargetExists()` - async aber nicht immer awaited
  - **Lösung**: Konsistente async/await-Verwendung

- [ ] **State-Updates während async Operations**: State könnte zwischenzeitlich geändert werden
  - `visualization.js`: `_handleTargetDragInRememberMode()` - komplexe async Logik
  - **Lösung**: Transaction-Pattern oder State-Locking

## 📦 Große Dateien aufteilen

### visualization.js (791 Zeilen) ✅ **TEILWEISE UMGESETZT**
- ✅ **Colormap-Funktionen** → `src/visualization/colormap-utils.js` ✅
- ✅ **Histogram-Rendering** → `src/visualization/histogram-renderer.js` ✅
- ✅ **Marker-Management** → `src/visualization/marker-manager.js` ✅
- ✅ **School-Rendering** → `src/visualization/school-renderer.js` ✅
- [ ] **Target-Drag-Handling** in separate Datei
  - `_handleTargetDrag()` (visualization.js:167-199)
  - `_handleTargetDragInRememberMode()` (visualization.js:204-296)
  - `_handleTargetDragInNormalMode()` (visualization.js:301-319)
  - → `src/handlers/target-drag-handler.js`

### app.js (771 Zeilen) ⚠️ **TEILWEISE UMGESETZT**

#### Bereits extrahiert:
- ✅ **Distribution-Selector**: `src/ui/distribution-selector.js` existiert
- ✅ **Colormap-Selector**: `src/ui/colormap-selector.js` existiert
- ✅ **Route-Handler**: `src/handlers/route-handler.js` existiert (teilweise)

#### Noch zu extrahieren:

- [ ] **Profile-Selector** (`src/ui/profile-selector.js`)
  - `_setupProfileButtons()` → `ProfileSelector.init()`
  - **Status**: Noch in `app.js`
  - **Komplexität**: Mittel

- [ ] **Route-Config** (`src/ui/route-config.js`)
  - `_setupRouteCountInput()` → `RouteConfig.init()`
  - `_setupRadiusInput()` → `RouteConfig.init()`
  - **Status**: Noch in `app.js`
  - **Komplexität**: Mittel

- [ ] **Aggregation-Controls** (`src/ui/aggregation-controls.js`)
  - `_setupAggregationToggle()` → `AggregationControls.init()`
  - `_setupAggregationMethod()` → `AggregationControls.init()`
  - `_setupHideStartPoints()` → `AggregationControls.init()`
  - `_setupHideTargetPoints()` → `AggregationControls.init()`
  - **Status**: Noch in `app.js`
  - **Komplexität**: Mittel-Hoch

- [ ] **Targets-Handler** (`src/ui/targets-handler.js`)
  - `_setupRememberTargetsHandler()` → `TargetsHandler.init()`
  - **Status**: Noch in `app.js`
  - **Komplexität**: Hoch (viel Logik)

- [ ] **Config-Handler** (`src/handlers/config-handler.js`)
  - `_handleConfigChanged()` → `ConfigHandler.handleConfigChanged()`
  - **Status**: Noch in `app.js`
  - **Komplexität**: Niedrig

- [ ] **Route-Handler erweitern**
  - `handleMapClick()` → `RouteHandler.handleMapClick()`
  - **Status**: Noch in `app.js`
  - **Komplexität**: Mittel

- [ ] **Route-Recalculations** (`src/handlers/route-recalculation-handler.js`)
  - `_recalculateTargetRoutes()` → `RouteRecalculationHandler.recalculateTargetRoutes()`
  - `recalculateRoutes()` → `RouteRecalculationHandler.recalculateRoutes()`
  - `_recalculateRoutesIfTargetExists()` → `RouteRecalculationHandler.recalculateIfTargetExists()`
  - **Status**: Noch in `app.js`
  - **Komplexität**: Mittel-Hoch

**Ziel-Größe für app.js nach vollständigem Refactoring: ~150-200 Zeilen**

### geocoder.js (575 Zeilen)
- [ ] **UI-Logik** in separate Datei
  - `_createInputField()` → `src/ui/geocoder-ui.js`
  - `_createSuggestionsContainer()` → `src/ui/geocoder-ui.js`
  - `_setupEventListeners()` → `src/ui/geocoder-ui.js`
  - `_showSuggestions()` → `src/ui/geocoder-ui.js`
  - `_createSuggestionHTML()` → `src/ui/geocoder-ui.js`

- [ ] **API-Logik** bleibt in geocoder.js
  - `search()`, `reverse()`, `_formatResults()`

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
  - `RouteService` - Route-Berechnung ✅
  - `TargetService` - Target-Verwaltung ✅
  - `MarkerManager` - Marker-Verwaltung ✅ (aus visualization.js extrahiert)
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
  - Geocoder hat Debouncing
  - Map Zoom hat Debouncing (map-renderer.js)
  - **Lösung**: Zentralisierte Debounce-Utility

- [ ] **Memoization für teure Berechnungen**
  - `ColormapUtils.calculateWeightedLevel()` könnte gecacht werden
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

### Hoch 🔴
1. ✅ ~~**Duplikate entfernen**: Route-Polyline-Entfernung zentralisieren~~ ✅ **ERLEDIGT**
2. ✅ ~~**Null-Checks hinzufügen**: Alle LayerGroup-Zugriffe absichern~~ ✅ **ERLEDIGT**
3. ✅ ~~**CONFIG.REMEMBER_TARGETS Helper**: Einheitliche Abfrage-Methode~~ ✅ **ERLEDIGT**
4. ✅ ~~**visualization.js aufteilen**: Größte Datei zuerst~~ ✅ **ERLEDIGT** (teilweise, noch Target-Drag-Handling)
5. [ ] **app.js aufteilen**: UI-Komponenten extrahieren (Profile-Selector, Route-Config, Aggregation-Controls)
6. [ ] **Constants-Datei**: Magic Numbers/Strings auslagern

### Mittel 🟡
7. [ ] **Target-Drag-Handling** aus visualization.js extrahieren
8. [ ] **Route-Recalculations** aus app.js extrahieren
9. [ ] **Error-Handling**: Konsistentes Pattern
10. [ ] **State-Management**: Single Source of Truth
11. [ ] **Config-Update-Pattern**: Fallback-Checks entfernen

### Niedrig 🟢
12. [ ] **CSS aufteilen**: Komponenten-basiert
13. [ ] **geocoder.js aufteilen**: UI/API trennen
14. [ ] **Performance-Optimierungen**: Debouncing, Memoization
15. [ ] **Dokumentation**: Entwickler-Docs

## 📝 Notizen

### Fortschritt
- ✅ **visualization.js erfolgreich aufgeteilt**: Von 1448 auf 791 Zeilen reduziert (~45% Reduktion)
- ✅ **Helper-Funktionen erstellt**: `isRememberMode()` zentralisiert CONFIG.REMEMBER_TARGETS Checks
- ✅ **Route-Polyline-Entfernung zentralisiert**: Alle Aufrufe über `MapRenderer.removePolylines()` oder `MapRenderer.clearRoutes()`
- ✅ **Null-Checks hinzugefügt**: Alle kritischen LayerGroup-Zugriffe abgesichert

### Nächste Schritte
1. **app.js weiter aufteilen**: Beginne mit einfacheren Komponenten (Profile-Selector, Route-Config)
2. **Constants-Datei erstellen**: Magic Numbers und Strings auslagern
3. **Target-Drag-Handling extrahieren**: Letzter großer Block in visualization.js

### Architektur-Status
- ✅ Klare Trennung von Services, Handlers, UI, Visualization
- ✅ Event-System vorhanden und funktional
- ⚠️ State-Management funktioniert, könnte aber konsistenter sein (Single Source of Truth)
- ⚠️ Error-Handling ist inkonsistent, sollte standardisiert werden
- ✅ Neue Module (ColormapUtils, HistogramRenderer, MarkerManager, SchoolRenderer) funktionieren korrekt mit Delegation über Visualization
