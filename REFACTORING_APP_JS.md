# Vorschlag: app.js weiter aufteilen

## Aktueller Status
- `app.js`: **829 Zeilen** - zu lang!

## Problem
Die `app.js` enthält zu viele verschiedene Verantwortlichkeiten:
1. UI-Setup (9 verschiedene `_setup*` Funktionen)
2. Event-Handler (4 verschiedene `_handle*` Funktionen)
3. Route-Logik (`recalculateRoutes`, `handleMapClick`)
4. Visualisierung (`_redrawCurrentRoutes`)

## Vorschlag: Aufteilung in UI-Komponenten

### 1. Profile-Selector (`src/ui/profile-selector.js`)
- `_setupProfileButtons()` → `ProfileSelector.init()`

### 2. Route-Config (`src/ui/route-config.js`)
- `_setupRouteCountInput()` → `RouteConfig.init()`
- `_setupRadiusInput()` → `RouteConfig.init()`

### 3. Distribution-Selector (`src/ui/distribution-selector.js`)
- `_setupDistributionButtons()` → `DistributionSelector.init()`

### 4. Aggregation-Controls (`src/ui/aggregation-controls.js`)
- `_setupAggregationToggle()` → `AggregationControls.init()`
- `_setupAggregationMethod()` → `AggregationControls.init()`
- `_setupHideStartPoints()` → `AggregationControls.init()`

### 5. Colormap-Selector (`src/ui/colormap-selector.js`)
- `_setupColormapSelector()` → `ColormapSelector.init()`

### 6. Targets-Handler (`src/ui/targets-handler.js`)
- `_setupRememberTargetsHandler()` → `TargetsHandler.init()`

## Vorschlag: Event-Handler extrahieren

### 7. Route-Handler (`src/handlers/route-handler.js`)
- `_handleRoutesCalculated()` → `RouteHandler.handleRoutesCalculated()`
- `_handleRouteUpdated()` → `RouteHandler.handleRouteUpdated()`
- `handleMapClick()` → `RouteHandler.handleMapClick()`

### 8. Config-Handler (`src/handlers/config-handler.js`)
- `_handleConfigChanged()` → `ConfigHandler.handleConfigChanged()`

## Neue app.js Struktur

Nach der Aufteilung würde `app.js` nur noch enthalten:
- `init()` - Initialisierung
- `_initUI()` - UI-Komponenten initialisieren
- `_registerEventListeners()` - Event-Listener registrieren
- `recalculateRoutes()` - Route-Neuberechnung (könnte auch in RouteService)
- `_redrawCurrentRoutes()` - Visualisierung (könnte auch in RouteRenderer)
- `_updateExportButtonState()` - UI-Helper (könnte auch in ExportButton-Komponente)

**Geschätzte Größe nach Refactoring: ~150-200 Zeilen**

## Vorteile
- ✅ Klare Trennung von Concerns
- ✅ Einzelne Komponenten testbar
- ✅ Wartbarer Code
- ✅ Einfacher zu erweitern

## Nachteile
- ⚠️ Mehr Dateien
- ⚠️ Eventuell etwas mehr Boilerplate

## Empfehlung
Die Aufteilung ist sinnvoll, da:
1. Jede UI-Komponente eine klare Verantwortlichkeit hat
2. Die Komponenten wiederverwendbar sind
3. Die app.js viel übersichtlicher wird

