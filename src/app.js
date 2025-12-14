// ==== Haupt-Orchestrierung (neu strukturiert) ====
const App = {
  /**
   * Initialisiert die Anwendung
   */
  async init() {
    // Map initialisieren
    MapRenderer.init();
    
    // UI-Komponenten initialisieren
    await this._initUI();
    
    // Event-Listener registrieren
    this._registerEventListeners();
    
    console.log('App initialisiert');
  },
  
  /**
   * Initialisiert UI-Komponenten
   */
  async _initUI() {
    // Targets-List initialisieren
    TargetsList.init();
    
    // Initiale Sichtbarkeit der Targets-Liste setzen
    TargetsList.toggle(CONFIG.REMEMBER_TARGETS);
    
    // Initiale Aggregation-UI Sichtbarkeit setzen
    if (typeof toggleAggregationUI === 'function') {
      toggleAggregationUI();
    }
    
    // Export-Button Handler
    const exportBtn = Utils.getElement('#export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        ExportService.exportToGeoJSON();
      });
    }
    
    // Initiale Button-Status setzen
    RouteHandler._updateExportButtonState();
  },
  
  /**
   * Registriert Event-Listener
   */
  _registerEventListeners() {
    // Map-Click
    EventBus.on(Events.MAP_CLICK, (data) => {
      this.handleMapClick(data.latlng);
    });
    
    // Routes berechnet
    EventBus.on(Events.ROUTES_CALCULATED, (data) => {
      RouteHandler.handleRoutesCalculated(data);
    });
    
    // Route aktualisiert
    EventBus.on(Events.ROUTE_UPDATED, (data) => {
      RouteHandler.handleRouteUpdated(data);
    });
    
    // Target hinzugefügt
    EventBus.on(Events.TARGET_ADDED, (data) => {
      // Marker zeichnen (falls noch nicht vorhanden)
      const targetMarkers = State.getTargetMarkers();
      if (!targetMarkers[data.index]) {
        const marker = Visualization.drawTargetPoint(data.target);
        targetMarkers[data.index] = marker;
        State.setTargetMarkers(targetMarkers);
      }
      // Liste aktualisieren
      TargetsList.update();
    });
    
    // Target entfernt
    EventBus.on(Events.TARGET_REMOVED, (data) => {
      // Liste aktualisieren
      TargetsList.update();
      if (CONFIG.REMEMBER_TARGETS) {
        EventBus.emit(Events.VISUALIZATION_UPDATE);
      }
      RouteHandler._updateExportButtonState();
    });
    
    // Visualization Update
    EventBus.on(Events.VISUALIZATION_UPDATE, () => {
      if (CONFIG.REMEMBER_TARGETS) {
        RouteRenderer.drawAllTargetRoutes();
      }
    });
    
    // Config geändert
    EventBus.on(Events.CONFIG_CHANGED, () => {
      this._handleConfigChanged();
    });
    
    // Config: Profil geändert
    EventBus.on(Events.CONFIG_PROFILE_CHANGED, async (data) => {
      // Routen neu berechnen mit neuem Profil
      const lastTarget = State.getLastTarget();
      if (lastTarget) {
        await this.recalculateRoutes();
      }
    });
    
    // Config: Aggregation geändert
    EventBus.on(Events.CONFIG_AGGREGATION_CHANGED, () => {
      if (CONFIG.REMEMBER_TARGETS) {
        RouteRenderer.drawAllTargetRoutes();
      } else {
        this._redrawCurrentRoutes();
      }
    });
    
    // Config: Remember Targets geändert
    this._setupRememberTargetsHandler();
    
    // Profil-Buttons und Aggregation-Toggle
    this._setupProfileButtons();
    this._setupAggregationToggle();
    this._setupAggregationMethod();
    
    // Anzahl Routen und Radius
    this._setupRouteCountInput();
    this._setupRadiusInput();
    
    // Längenverteilungs-Buttons
    DistributionSelector.init();
    
    // Colormap-Selector
    ColormapSelector.init();
    
    // Startpunkte ausblenden
    this._setupHideStartPoints();
  },
  
  /**
   * Richtet die Profil-Buttons ein
   */
  _setupProfileButtons() {
    const profileBtns = Utils.getElements('.profile-btn');
    if (!profileBtns || profileBtns.length === 0) return;
    
    // Initiale Aktivierung
    profileBtns.forEach(btn => {
      if (btn.dataset.profile === CONFIG.PROFILE) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Event-Listener
    profileBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        // Alle Buttons deaktivieren
        profileBtns.forEach(b => b.classList.remove('active'));
        // Aktiven Button aktivieren
        btn.classList.add('active');
        
        // Config aktualisieren
        if (typeof updateConfigFromUI === 'function') {
          updateConfigFromUI();
        } else {
          CONFIG.PROFILE = btn.dataset.profile || CONFIG.PROFILE;
        }
        
        EventBus.emit(Events.CONFIG_PROFILE_CHANGED, { profile: CONFIG.PROFILE });
        
        // Wenn ein Zielpunkt vorhanden ist, Routen neu abfragen
        const lastTarget = State.getLastTarget();
        if (lastTarget) {
          await this.recalculateRoutes();
        }
      });
    });
  },
  
  /**
   * Richtet den Aggregation-Toggle ein
   */
  _setupAggregationToggle() {
    const aggregatedInput = Utils.getElement('#config-aggregated');
    if (!aggregatedInput) return;
    
    // Initialer Wert
    aggregatedInput.checked = CONFIG.AGGREGATED;
    
    // Event-Listener
    aggregatedInput.addEventListener('change', () => {
      // Config aktualisieren
      if (typeof updateConfigFromUI === 'function') {
        updateConfigFromUI();
      } else {
        CONFIG.AGGREGATED = aggregatedInput.checked;
      }
      
      // UI aktualisieren
      if (typeof toggleAggregationUI === 'function') {
        toggleAggregationUI();
      } else {
        // Fallback: UI manuell aktualisieren
        const legend = Utils.getElement('#legend');
        const methodGroup = Utils.getElement('#aggregation-method-group');
        const hideStartPointsGroup = Utils.getElement('#hide-start-points-group');
        
        if (legend) {
          legend.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
        }
        if (methodGroup) {
          methodGroup.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
        }
        if (hideStartPointsGroup) {
          hideStartPointsGroup.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
        }
        
        // Legende-Gradient aktualisieren wenn sichtbar
        if (CONFIG.AGGREGATED && legend && legend.style.display === 'block') {
          Visualization.updateLegendGradient();
          Visualization.updateColormapPreviews();
        }
      }
      
      EventBus.emit(Events.CONFIG_AGGREGATION_CHANGED);
    });
  },
  
  /**
   * Richtet die Aggregierungsmethode ein
   */
  _setupAggregationMethod() {
    const methodInput = Utils.getElement('#config-aggregation-method');
    if (!methodInput) return;
    
    // Initialer Wert
    methodInput.value = CONFIG.AGGREGATION_METHOD;
    
    // Event-Listener
    methodInput.addEventListener('change', () => {
      // Config aktualisieren
      if (typeof updateConfigFromUI === 'function') {
        updateConfigFromUI();
      } else {
        CONFIG.AGGREGATION_METHOD = methodInput.value || CONFIG.AGGREGATION_METHOD;
      }
      
      EventBus.emit(Events.CONFIG_AGGREGATION_CHANGED);
    });
  },
  
  /**
   * Richtet den Event-Handler für Anzahl Routen ein
   */
  _setupRouteCountInput() {
    const nInput = Utils.getElement('#config-n');
    if (!nInput) return;
    
    // Initialer Wert
    nInput.value = CONFIG.N;
    
    // Event-Listener
    nInput.addEventListener('change', async () => {
      // Config aktualisieren
      if (typeof updateConfigFromUI === 'function') {
        updateConfigFromUI();
      } else {
        CONFIG.N = Utils.validateNumber(nInput.value, 1, 1000, CONFIG.N);
        nInput.value = CONFIG.N; // Korrigierter Wert zurücksetzen
      }
      
      // Wenn Routen vorhanden sind, neu berechnen
      const lastTarget = State.getLastTarget();
      if (lastTarget) {
        // Alte Routen entfernen
        if (!CONFIG.REMEMBER_TARGETS) {
          MapRenderer.clearRoutes();
          const routePolylines = State.getRoutePolylines();
          const layerGroup = State.getLayerGroup();
          if (layerGroup) {
            routePolylines.forEach(polyline => {
              if (polyline) layerGroup.removeLayer(polyline);
            });
          }
          State.setRoutePolylines([]);
        }
        
        await RouteService.calculateRoutes(lastTarget);
      }
    });
  },
  
  /**
   * Richtet den Event-Handler für Radius ein
   */
  _setupRadiusInput() {
    const radiusInput = Utils.getElement('#config-radius');
    if (!radiusInput) return;
    
    // Initialer Wert (in km)
    radiusInput.value = CONFIG.RADIUS_M / 1000;
    
    // Event-Listener
    radiusInput.addEventListener('change', async () => {
      // Config aktualisieren
      if (typeof updateConfigFromUI === 'function') {
        updateConfigFromUI();
      } else {
        const radiusKm = Utils.validateNumber(radiusInput.value, 0.1, 100, CONFIG.RADIUS_M / 1000);
        CONFIG.RADIUS_M = radiusKm * 1000;
        radiusInput.value = radiusKm; // Korrigierter Wert zurücksetzen
      }
      
      // Wenn Routen vorhanden sind, neu berechnen
      const lastTarget = State.getLastTarget();
      if (lastTarget) {
        // Alte Routen entfernen
        if (!CONFIG.REMEMBER_TARGETS) {
          MapRenderer.clearRoutes();
          const routePolylines = State.getRoutePolylines();
          const layerGroup = State.getLayerGroup();
          if (layerGroup) {
            routePolylines.forEach(polyline => {
              if (polyline) layerGroup.removeLayer(polyline);
            });
          }
          State.setRoutePolylines([]);
        }
        
        await RouteService.calculateRoutes(lastTarget);
      }
    });
  },
  
  
  /**
   * Richtet den Event-Handler für "Startpunkte ausblenden" ein
   */
  _setupHideStartPoints() {
    const hideStartPointsInput = Utils.getElement('#config-hide-start-points');
    if (!hideStartPointsInput) return;
    
    // Initialer Wert
    hideStartPointsInput.checked = CONFIG.HIDE_START_POINTS;
    
    // Event-Listener
    hideStartPointsInput.addEventListener('change', () => {
      // Config aktualisieren
      if (typeof updateConfigFromUI === 'function') {
        updateConfigFromUI();
      } else {
        CONFIG.HIDE_START_POINTS = hideStartPointsInput.checked;
      }
      
      // Startpunkte sofort ausblenden/einblenden
      Visualization.toggleStartPointsVisibility();
    });
  },
  
  /**
   * Richtet den Event-Handler für "Zielpunkte merken" ein
   */
  _setupRememberTargetsHandler() {
    const rememberTargetsInput = Utils.getElement('#config-remember-targets');
    if (!rememberTargetsInput) return;
    
    rememberTargetsInput.addEventListener('change', () => {
      // Config aktualisieren (wenn updateConfigFromUI existiert)
      if (typeof updateConfigFromUI === 'function') {
        updateConfigFromUI();
      } else {
        CONFIG.REMEMBER_TARGETS = rememberTargetsInput.checked;
      }
      
      // UI aktualisieren
      TargetsList.toggle(CONFIG.REMEMBER_TARGETS);
      
      // Wenn aktiviert, aktuellen Zielpunkt und Routen zur Liste hinzufügen (falls vorhanden)
      if (CONFIG.REMEMBER_TARGETS) {
        const currentTarget = State.getLastTarget();
        if (currentTarget) {
          const added = TargetService.addTarget(currentTarget);
          if (added) {
            // Marker zeichnen
            const marker = Visualization.drawTargetPoint(currentTarget);
            const targetMarkers = State.getTargetMarkers();
            const index = State.getAllTargets().length - 1;
            targetMarkers[index] = marker;
            State.setTargetMarkers(targetMarkers);
            
            // Routen zum aktuellen Zielpunkt speichern (falls vorhanden)
            const allRouteData = State.getAllRouteData();
            const allRouteResponses = State.getAllRouteResponses();
            const routePolylines = State.getRoutePolylines();
            const lastStarts = State.getLastStarts();
            const lastColors = State.getLastColors();
            
            if (allRouteData.length > 0 || allRouteResponses.length > 0) {
              TargetService.updateTargetRoutes(currentTarget, {
                routeData: allRouteData,
                routeResponses: allRouteResponses,
                routePolylines: routePolylines,
                starts: lastStarts,
                colors: lastColors
              });
              
              // Alle Routen neu zeichnen
              RouteRenderer.drawAllTargetRoutes();
            }
          }
        }
      } else {
        // Wenn deaktiviert, alle gespeicherten Zielpunkte und Routen löschen
        TargetService.clearAll();
        
        // Aktuellen Zielpunkt beibehalten und neu zeichnen
        const currentTarget = State.getLastTarget();
        if (currentTarget) {
          // Schulen behalten
          MapRenderer.clearLayersExceptSchools();
          Visualization.drawTargetPoint(currentTarget);
        }
      }
      
      EventBus.emit(Events.CONFIG_CHANGED);
    });
  },
  
  /**
   * Behandelt Map-Click
   */
  async handleMapClick(latlng) {
    const target = [latlng.lat, latlng.lng];
    State.setLastTarget(target);
    
    // Wenn "Zielpunkte merken" aktiviert ist, Zielpunkt hinzufügen
    if (CONFIG.REMEMBER_TARGETS) {
      const added = TargetService.addTarget(target);
      if (added) {
        // Marker wird durch Event-Handler gezeichnet
        // Aber sicherstellen, dass er sofort sichtbar ist
        const allTargets = State.getAllTargets();
        const targetMarkers = State.getTargetMarkers();
        const index = allTargets.length - 1;
        if (!targetMarkers[index]) {
          const marker = Visualization.drawTargetPoint(target);
          targetMarkers[index] = marker;
          State.setTargetMarkers(targetMarkers);
        }
      }
    } else {
      // Im normalen Modus: Karte leeren und Zielpunkt zeichnen
      // Schulen behalten
      MapRenderer.clearLayersExceptSchools();
      Visualization.drawTargetPoint(target);
    }
    
    // Routen berechnen
    await RouteService.calculateRoutes(target);
  },
  
  /**
   * Behandelt berechnete Routen
   */
  _handleRoutesCalculated(data) {
    const { target, routeInfo } = data;
    
    // Startpunkte zeichnen (nur im normalen Modus oder beim ersten Klick im "Zielpunkte merken" Modus)
    if (routeInfo.starts && routeInfo.colors) {
      if (!CONFIG.REMEMBER_TARGETS) {
        // Im normalen Modus: Startpunkte normal zeichnen
        Visualization.drawStartPoints(routeInfo.starts, routeInfo.colors);
      } else {
        // Im "Zielpunkte merken" Modus: Alte Startpunkte entfernen, neue zeichnen
        const startMarkers = State.getStartMarkers();
        const layerGroup = State.getLayerGroup();
        if (layerGroup) {
          startMarkers.forEach(marker => {
            if (marker) layerGroup.removeLayer(marker);
          });
        }
        Visualization.drawStartPoints(routeInfo.starts, routeInfo.colors);
      }
    }
    
    // Routen visualisieren
    if (CONFIG.REMEMBER_TARGETS) {
      // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten anzeigen
      // (inklusive der gerade berechneten)
      RouteRenderer.drawAllTargetRoutes();
    } else {
      // Normaler Modus: Nur Routen zum aktuellen Zielpunkt
      // Alte Routen entfernen (falls noch vorhanden)
      const routePolylines = State.getRoutePolylines();
      const layerGroup = State.getLayerGroup();
      if (layerGroup) {
        routePolylines.forEach(polyline => {
          if (polyline) layerGroup.removeLayer(polyline);
        });
      }
      // Alle Polylines entfernen
      MapRenderer.clearRoutes();
      
      // Neue Routen zeichnen
      RouteRenderer.drawRoutesForTarget(
        routeInfo.routeData,
        routeInfo.routeResponses,
        routeInfo.colors
      );
    }
    
    // Histogramm aktualisieren
    if (routeInfo.starts && target && routeInfo.starts.length > 0) {
      Visualization.updateDistanceHistogram(routeInfo.starts, target);
    }
    
    // Export-Button aktualisieren
    this._updateExportButtonState();
    
    // Info anzeigen
    if (routeInfo.stats && routeInfo.stats.ok === 0 && routeInfo.stats.fail > 0) {
      Utils.showError(`Alle ${routeInfo.stats.fail} Routen fehlgeschlagen. Bitte Browser-Konsole prüfen.`, true);
    }
  },
  
  /**
   * Behandelt aktualisierte Route
   */
  _handleRouteUpdated(data) {
    const { index } = data;
    
    // Visualisierung aktualisieren
    if (CONFIG.REMEMBER_TARGETS) {
      RouteRenderer.drawAllTargetRoutes();
    } else if (CONFIG.AGGREGATED) {
      // Aggregierte Darstellung neu berechnen
      const allRouteData = State.getAllRouteData();
      const aggregatedSegments = AggregationService.aggregateRoutes(allRouteData);
      if (aggregatedSegments.length > 0) {
        const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
        RouteRenderer.drawAggregatedRoutes(aggregatedSegments, maxCount);
      }
    } else {
      // Einzelne Route neu zeichnen
      const allRouteResponses = State.getAllRouteResponses();
      const colors = State.getLastColors();
      if (allRouteResponses[index]) {
        const polyline = RouteRenderer.drawRoute(
          allRouteResponses[index].response,
          allRouteResponses[index].color || colors[index]
        );
        const routePolylines = State.getRoutePolylines();
        routePolylines[index] = polyline;
        State.setRoutePolylines(routePolylines);
      }
    }
    
    // Histogramm aktualisieren
    const lastTarget = State.getLastTarget();
    if (lastTarget) {
      const updatedStarts = State.getLastStarts();
      Visualization.updateDistanceHistogram(updatedStarts, lastTarget);
    }
  },
  
  /**
   * Behandelt Config-Änderungen
   */
  _handleConfigChanged() {
    // Reagieren auf Config-Änderungen
    TargetsList.toggle(CONFIG.REMEMBER_TARGETS);
  },
  
  /**
   * Zeichnet aktuelle Routen neu
   */
  _redrawCurrentRoutes() {
    const allRouteData = State.getAllRouteData();
    const allRouteResponses = State.getAllRouteResponses();
    const colors = State.getLastColors();
    const lastStarts = State.getLastStarts();
    
    if (allRouteData.length > 0) {
      MapRenderer.clearRoutes();
      
      // Startpunkte neu zeichnen (mit neuer Größe basierend auf Modus)
      if (lastStarts && colors) {
        Visualization.drawStartPoints(lastStarts, colors);
        Visualization.toggleStartPointsVisibility();
      }
      
      RouteRenderer.drawRoutesForTarget(allRouteData, allRouteResponses, colors);
    }
  },
  
  /**
   * Berechnet Routen neu (z.B. nach Profilwechsel)
   */
  async recalculateRoutes() {
    const lastTarget = State.getLastTarget();
    if (lastTarget) {
      // Alte Routen entfernen (bevor neue berechnet werden)
      if (CONFIG.REMEMBER_TARGETS) {
        // Im "Zielpunkte merken" Modus: Routen zum aktuellen Zielpunkt entfernen
        const targetRoutes = State.getTargetRoutes();
        const targetIndex = targetRoutes.findIndex(tr => 
          TargetService.isEqual(tr.target, lastTarget)
        );
        if (targetIndex >= 0) {
          const oldRouteInfo = targetRoutes[targetIndex];
          if (oldRouteInfo && oldRouteInfo.routePolylines) {
            const layerGroup = State.getLayerGroup();
            if (layerGroup) {
              oldRouteInfo.routePolylines.forEach(polyline => {
                if (polyline) layerGroup.removeLayer(polyline);
              });
            }
          }
        }
        // Alle Polylines entfernen (werden neu gezeichnet mit allen Zielpunkten)
        MapRenderer.clearRoutes();
      } else {
        // Im normalen Modus: Alle Routen entfernen
        const routePolylines = State.getRoutePolylines();
        const layerGroup = State.getLayerGroup();
        if (layerGroup) {
          routePolylines.forEach(polyline => {
            if (polyline) layerGroup.removeLayer(polyline);
          });
        }
        State.setRoutePolylines([]);
        MapRenderer.clearRoutes();
      }
      
      // Startpunkte wiederverwenden
      const routeInfo = await RouteService.calculateRoutes(lastTarget, { reuseStarts: true });
      if (routeInfo) {
        // Im "Zielpunkte merken" Modus: Routen zum Zielpunkt aktualisieren
        if (CONFIG.REMEMBER_TARGETS) {
          // RouteInfo enthält bereits die neuen Routen, werden in RouteService gespeichert
          // Jetzt alle Routen neu zeichnen
          RouteRenderer.drawAllTargetRoutes();
        } else {
          // Visualisierung aktualisieren
          this._handleRoutesCalculated({ target: lastTarget, routeInfo });
        }
      }
    }
  },
  
};

// ==== Start ====
// Warte bis DOM und Leaflet geladen sind
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}

