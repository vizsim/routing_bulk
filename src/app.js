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
    
    // Panel Collapse Handler
    this._setupPanelCollapse();
    
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
    
    // Geocoder initialisieren
    Geocoder.init((lat, lng, suggestion) => {
      this._handleGeocoderSelect(lat, lng, suggestion);
    });
    
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
    
    // Hinweis „Noch kein Ziel“ initial anzeigen/verstecken
    this._updateNoTargetHint();
    // Histogramm-Platzhalter anzeigen (keine Routen)
    Visualization.updateDistanceHistogram([], null, {});
  },
  
  /**
   * Zeigt oder versteckt den Hinweis „Noch kein Ziel“ je nach Ziel-Status
   */
  _updateNoTargetHint() {
    const hint = Utils.getElement('#no-target-hint');
    if (!hint) return;
    const hasTarget = State.getAllTargets().length > 0 || State.getLastTarget() !== null;
    hint.classList.toggle('is-hidden', hasTarget);
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
      // Verwaiste Marker entfernen (bevor neuer Marker hinzugefügt wird)
      Visualization.cleanupOrphanedTargetMarkers();
      // Marker zeichnen (falls noch nicht vorhanden)
      const targetMarkers = State.getTargetMarkers();
      if (!targetMarkers[data.index]) {
        const marker = Visualization.drawTargetPoint(data.target, data.index, data.targetId);
        // Stelle sicher, dass das Array groß genug ist
        while (targetMarkers.length <= data.index) {
          targetMarkers.push(null);
        }
        targetMarkers[data.index] = marker;
        State.setTargetMarkers(targetMarkers);
        // currentTargetMarker zurücksetzen, da der Marker jetzt in targetMarkers ist
        State.setCurrentTargetMarker(null);
      }
      // Liste aktualisieren
      TargetsList.update();
      this._updateNoTargetHint();
    });
    
    // Target entfernt
    EventBus.on(Events.TARGET_REMOVED, (data) => {
      // Verwaiste Marker entfernen
      Visualization.cleanupOrphanedTargetMarkers();
      // Liste aktualisieren
      TargetsList.update();
      if (isRememberMode()) {
        EventBus.emit(Events.VISUALIZATION_UPDATE);
      }
      RouteHandler._updateExportButtonState();
      this._updateNoTargetHint();
      // Wenn keine Routen mehr: Histogramm-Platzhalter anzeigen
      const hasRoutes = isRememberMode()
        ? State.getTargetRoutes().length > 0
        : State.getAllRouteData().length > 0;
      if (!hasRoutes) {
        Visualization.updateDistanceHistogram([], null, {});
      }
    });
    
    // Visualization Update
    EventBus.on(Events.VISUALIZATION_UPDATE, () => {
      if (isRememberMode()) {
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
      if (isRememberMode()) {
        RouteRenderer.drawAllTargetRoutes();
      } else {
        this._redrawCurrentRoutes();
      }
    });
    
    // Config: Remember Targets geändert
    this._setupRememberTargetsHandler();
    
    // Target Hover (für Marker-Highlighting)
    EventBus.on(Events.TARGET_HOVER, (data) => {
      Visualization.highlightTargetMarker(data.index);
    });
    
    EventBus.on(Events.TARGET_UNHOVER, () => {
      Visualization.unhighlightAllTargetMarkers();
    });
    
    // Profil-Buttons und Aggregation-Toggle
    this._setupProfileButtons();
    this._setupAggregationToggle();
    this._setupAggregationMethod();
    
    // Anzahl Routen und Radius
    this._setupRouteCountInput();
    this._setupRadiusInput();
    
    // Längenverteilungs-Buttons
    DistributionSelector.init();

    // Histogramm-Modus: Beeline vs. Echte Routenlänge
    this._setupHistogramModeButtons();
    
    // Colormap-Selector
    ColormapSelector.init();
    
    // Route-Warnung initialisieren
    RouteWarning.init();
    
    // Startpunkte ausblenden
    this._setupHideStartPoints();
    
    // Zielpunkte ausblenden
    this._setupHideTargetPoints();
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
        this._updateConfigFromUI();
        if (typeof updateConfigFromUI !== 'function') {
          CONFIG.PROFILE = btn.dataset.profile || CONFIG.PROFILE;
        }
        
        // Wenn ein Zielpunkt ausgewählt ist, nichts automatisch tun (wie bei anderen Config-Werten)
        const selectedIndex = State.getSelectedTargetIndex();
        if (selectedIndex !== null && isRememberMode()) {
          // Nichts tun - Benutzer muss auf Stift-Icon klicken, um Änderungen zu übernehmen
          return;
        }
        
        // Nur wenn kein Zielpunkt ausgewählt ist, sofort umsetzen
        EventBus.emit(Events.CONFIG_PROFILE_CHANGED, { profile: CONFIG.PROFILE });
      });
    });
  },

  /**
   * Histogramm-Modus: Beeline vs. Echte Routenlänge
   */
  _setupHistogramModeButtons() {
    const btns = Utils.getElements('.histogram-mode-btn');
    if (!btns || btns.length === 0) return;
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._refreshHistogram();
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
      this._updateConfigFromUI();
      if (typeof updateConfigFromUI !== 'function') {
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
      this._updateConfigFromUI();
      if (typeof updateConfigFromUI !== 'function') {
        CONFIG.AGGREGATION_METHOD = methodInput.value || CONFIG.AGGREGATION_METHOD;
      }
      
      EventBus.emit(Events.CONFIG_AGGREGATION_CHANGED);
    });
  },
  
  
  /**
   * Berechnet Routen für einen Zielpunkt neu und aktualisiert die Anzeige
   */
  async _recalculateTargetRoutes(target, targetIndex) {
    if (!isRememberMode()) return;
    
    // Routen neu berechnen
    const routeInfo = await RouteService.calculateRoutes(target, { silent: true });
    if (!routeInfo) return;
    
    // RouteInfo im targetRoutes aktualisieren
    const targetRoutes = State.getTargetRoutes();
    const targetRouteIndex = targetRoutes.findIndex(tr => 
      TargetService.isEqual(tr.target, target)
    );
    
    if (targetRouteIndex >= 0) {
      targetRoutes[targetRouteIndex] = {
        target: target,
        routeData: routeInfo.routeData,
        routeResponses: routeInfo.routeResponses,
        routePolylines: [],
        starts: routeInfo.starts,
        colors: routeInfo.colors,
        distributionType: routeInfo.distributionType,
        config: routeInfo.config
      };
      State.setTargetRoutes(targetRoutes);
    }
    
    // Alle Routen neu zeichnen
    RouteRenderer.drawAllTargetRoutes();
    
    // Startpunkte anzeigen
    if (routeInfo.starts && routeInfo.colors) {
      Visualization._clearStartMarkers();
      Visualization.drawStartPoints(routeInfo.starts, routeInfo.colors, target);
    }
    
    // Histogramm aktualisieren
    if (routeInfo.starts && routeInfo.starts.length > 0) {
      Visualization.updateDistanceHistogram(routeInfo.starts, target, { routeData: routeInfo.routeData, routeDistances: RouteService.getRouteDistances(routeInfo) });
    }
    
    // Panel aktualisieren (damit Config-Informationen angezeigt werden)
    TargetsList.update();
    
    // lastTarget aktualisieren
    State.setLastTarget(target);
  },
  
  /**
   * Helper: Aktualisiert CONFIG aus UI (mit Fallback)
   */
  _updateConfigFromUI() {
    if (typeof updateConfigFromUI === 'function') {
      updateConfigFromUI();
    }
  },
  
  /**
   * Helper: Entfernt alte Routen im normalen Modus
   */
  _clearRoutesInNormalMode() {
    if (!isRememberMode()) {
      const routePolylines = State.getRoutePolylines();
      MapRenderer.removePolylines(routePolylines);
      MapRenderer.clearRoutes();
      State.setRoutePolylines([]);
    }
  },
  
  /**
   * Helper: Berechnet Routen neu, wenn Zielpunkt vorhanden
   */
  async _recalculateRoutesIfTargetExists() {
    const lastTarget = State.getLastTarget();
    if (lastTarget) {
      this._clearRoutesInNormalMode();
      await RouteService.calculateRoutes(lastTarget);
    }
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
      this._updateConfigFromUI();
      if (typeof updateConfigFromUI !== 'function') {
        CONFIG.N = Utils.validateNumber(nInput.value, 1, 1000, CONFIG.N);
        nInput.value = CONFIG.N; // Korrigierter Wert zurücksetzen
      }
      
      // Routen neu berechnen, wenn Zielpunkt vorhanden
      await this._recalculateRoutesIfTargetExists();
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
      this._updateConfigFromUI();
      if (typeof updateConfigFromUI !== 'function') {
        const radiusKm = Utils.validateNumber(radiusInput.value, 0.1, 100, CONFIG.RADIUS_M / 1000);
        CONFIG.RADIUS_M = radiusKm * 1000;
        radiusInput.value = radiusKm; // Korrigierter Wert zurücksetzen
      }
      
      // Wenn ein Zielpunkt ausgewählt ist, nichts automatisch tun
      // Benutzer muss explizit auf Stift-Icon klicken, um Änderungen zu übernehmen
      const selectedIndex = State.getSelectedTargetIndex();
      if (selectedIndex !== null && isRememberMode()) {
        return; // Nicht automatisch berechnen
      }
      
      // Routen neu berechnen, wenn Zielpunkt vorhanden
      await this._recalculateRoutesIfTargetExists();
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
      this._updateConfigFromUI();
      if (typeof updateConfigFromUI !== 'function') {
        CONFIG.HIDE_START_POINTS = hideStartPointsInput.checked;
      }
      
      // Startpunkte sofort ausblenden/einblenden
      Visualization.toggleStartPointsVisibility();
    });
  },
  
  /**
   * Richtet den Event-Handler für "Zielpunkte ausblenden" ein
   */
  _setupHideTargetPoints() {
    const hideTargetPointsInput = Utils.getElement('#config-hide-target-points');
    if (!hideTargetPointsInput) return;
    
    // Initialer Wert
    hideTargetPointsInput.checked = CONFIG.HIDE_TARGET_POINTS;
    
    // Event-Listener
    hideTargetPointsInput.addEventListener('change', () => {
      // Config aktualisieren
      this._updateConfigFromUI();
      if (typeof updateConfigFromUI !== 'function') {
        CONFIG.HIDE_TARGET_POINTS = hideTargetPointsInput.checked;
      }
      
      // Zielpunkte sofort ausblenden/einblenden
      Visualization.toggleTargetPointsVisibility();
    });
  },
  
  /**
   * Migriert aktuellen Zielpunkt zum "Zielpunkte merken" Modus
   */
  _migrateCurrentTargetToRememberMode(currentTarget) {
    const added = TargetService.addTarget(currentTarget);
    if (!added) return;
    
    // Prüfe ob bereits ein Marker für diesen Zielpunkt existiert (ohne Index)
    // Wenn ja, entferne ihn und erstelle einen neuen mit Index
    const layerGroup = State.getLayerGroup();
    let oldMarker = null;
    if (layerGroup) {
      layerGroup.eachLayer(layer => {
        if (layer instanceof L.Marker && 
            layer._targetLatLng && 
            TargetService.isEqual(layer._targetLatLng, currentTarget) &&
            layer._targetIndex === undefined) {
          // Alten Marker ohne Index merken und entfernen
          oldMarker = layer;
          layerGroup.removeLayer(layer);
        }
      });
    }
    
    // Neuen Marker mit Index zeichnen
    const index = State.getAllTargets().length - 1;
    const marker = Visualization.drawTargetPoint(currentTarget, index);
    
    const targetMarkers = State.getTargetMarkers();
    // Stelle sicher, dass das Array groß genug ist
    while (targetMarkers.length <= index) {
      targetMarkers.push(null);
    }
    targetMarkers[index] = marker;
    State.setTargetMarkers(targetMarkers);
    
    // currentTargetMarker zurücksetzen, da der Marker jetzt in targetMarkers ist
    // Auch wenn es der alte Marker war, sollte er jetzt null sein
    if (oldMarker === State.getCurrentTargetMarker()) {
      State.setCurrentTargetMarker(null);
    }
    
    // Routen zum aktuellen Zielpunkt speichern (falls vorhanden)
    const allRouteData = State.getAllRouteData();
    const allRouteResponses = State.getAllRouteResponses();
    const routePolylines = State.getRoutePolylines();
    const lastStarts = State.getLastStarts();
    const lastColors = State.getLastColors();
    
    if (allRouteData.length > 0 || allRouteResponses.length > 0) {
      // Verteilungstyp ermitteln
      const activeDistBtn = document.querySelector('.dist-btn.active');
      const distType = activeDistBtn ? activeDistBtn.dataset.dist : 'lognormal';
      
      TargetService.updateTargetRoutes(currentTarget, {
        routeData: allRouteData,
        routeResponses: allRouteResponses,
        routePolylines: routePolylines,
        starts: lastStarts,
        colors: lastColors,
        distributionType: distType,
        config: {
          profile: CONFIG.PROFILE,
          n: CONFIG.N,
          radiusKm: CONFIG.RADIUS_M / 1000
        }
      });
      
      // Alle Routen neu zeichnen
      RouteRenderer.drawAllTargetRoutes();
    }
  },
  
  /**
   * Richtet den Event-Handler für "Zielpunkte merken" ein
   */
  _setupRememberTargetsHandler() {
    const rememberTargetsInput = Utils.getElement('#config-remember-targets');
    if (!rememberTargetsInput) return;
    
    rememberTargetsInput.addEventListener('change', () => {
      // Config aktualisieren
      this._updateConfigFromUI();
      if (typeof updateConfigFromUI !== 'function') {
        CONFIG.REMEMBER_TARGETS = rememberTargetsInput.checked;
      }
      
      // UI aktualisieren
      TargetsList.toggle(CONFIG.REMEMBER_TARGETS);
      
      // Wenn aktiviert, aktuellen Zielpunkt und Routen zur Liste hinzufügen (falls vorhanden)
      if (isRememberMode()) {
        const currentTarget = State.getLastTarget();
        if (currentTarget) {
          this._migrateCurrentTargetToRememberMode(currentTarget);
        }
      } else {
        // Wenn deaktiviert, alle gespeicherten Zielpunkte und Routen löschen
        TargetService.clearAll();
        
        // Auswahl zurücksetzen
        State.setSelectedTargetIndex(null);
        Visualization.updateSelectedTargetMarker();
        
        // Aktuellen Zielpunkt beibehalten und neu zeichnen
        const currentTarget = State.getLastTarget();
        if (currentTarget) {
          // Schulen behalten
          MapRenderer.clearLayersExceptSchools();
          const marker = Visualization.drawTargetPoint(currentTarget);
          // Marker im State speichern, damit er ausgeblendet werden kann
          State.setCurrentTargetMarker(marker);
        }
      }
      
      EventBus.emit(Events.CONFIG_CHANGED);
    });
  },
  
  /**
   * Behandelt Geocoder-Auswahl
   */
  async _handleGeocoderSelect(lat, lng, suggestion) {
    const map = State.getMap();
    if (!map) return;

    // Karte zur ausgewählten Position bewegen
    map.setView([lat, lng], Math.max(map.getZoom(), 15));

    // Zielpunkt setzen und Routen berechnen
    const target = [lat, lng];
    State.setLastTarget(target);

    // Wenn "Zielpunkte merken" aktiviert ist, Zielpunkt hinzufügen
    if (isRememberMode()) {
      State.setCurrentTargetMarker(null);
      const added = TargetService.addTarget(target);
    } else {
      // Im normalen Modus: Karte leeren und Zielpunkt zeichnen
      MapRenderer.clearLayersExceptSchools();
      const marker = Visualization.drawTargetPoint(target);
      State.setCurrentTargetMarker(marker);
    }

    this._updateNoTargetHint();
    // Routen berechnen
    await RouteService.calculateRoutes(target);
  },

  /**
   * Behandelt Map-Click
   */
  async handleMapClick(latlng) {
    const target = [latlng.lat, latlng.lng];
    State.setLastTarget(target);
    
    // Wenn "Zielpunkte merken" aktiviert ist, Zielpunkt hinzufügen
    if (isRememberMode()) {
      // currentTargetMarker zurücksetzen, da wir im "Zielpunkte merken" Modus sind
      State.setCurrentTargetMarker(null);
      
      const added = TargetService.addTarget(target);
      // Marker wird durch Event-Handler (TARGET_ADDED) gezeichnet
      // Die ID wird bereits in addTarget() vergeben
    } else {
      // Im normalen Modus: Karte leeren und Zielpunkt zeichnen
      // Schulen behalten
      MapRenderer.clearLayersExceptSchools();
      const marker = Visualization.drawTargetPoint(target);
      // Marker im State speichern, damit er ausgeblendet werden kann
      State.setCurrentTargetMarker(marker);
    }
    
    this._updateNoTargetHint();
    // Routen berechnen
    await RouteService.calculateRoutes(target);
  },
  
  /**
   * Behandelt aktualisierte Route (delegiert an RouteHandler)
   */
  _handleRouteUpdated(data) {
    RouteHandler.handleRouteUpdated(data);
  },
  
  /**
   * Histogramm mit aktuellem State neu zeichnen (z. B. nach Modus-Umschaltung)
   */
  _refreshHistogram() {
    const lastTarget = State.getLastTarget();
    if (lastTarget) {
      const updatedStarts = State.getLastStarts();
      let routeData = State.getAllRouteData();
      let routeDistances = (State.getAllRouteResponses?.() || []).map(r => r?.distance ?? 0);
      const targetRoutes = State.getTargetRoutes();
      if (targetRoutes && targetRoutes.length > 0) {
        const tr = targetRoutes.find(t => TargetService.isEqual(t.target, lastTarget));
        if (tr) {
          if (tr.routeData) routeData = tr.routeData;
          routeDistances = RouteService.getRouteDistances(tr);
        }
      }
      Visualization.updateDistanceHistogram(updatedStarts, lastTarget, { routeData: routeData || [], routeDistances });
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
    const lastTarget = State.getLastTarget();
    
    // Routen neu zeichnen, wenn Route-Daten vorhanden sind
    if (allRouteData.length > 0 || (allRouteResponses && allRouteResponses.length > 0)) {
      MapRenderer.clearRoutes();
      
      // Startpunkte neu zeichnen (mit neuer Größe basierend auf Modus)
      if (lastStarts && colors && lastTarget) {
        Visualization.drawStartPoints(lastStarts, colors, lastTarget);
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
      if (isRememberMode()) {
        // Im "Zielpunkte merken" Modus: Routen zum aktuellen Zielpunkt entfernen
        const targetRoutes = State.getTargetRoutes();
        const targetIndex = targetRoutes.findIndex(tr => 
          TargetService.isEqual(tr.target, lastTarget)
        );
        if (targetIndex >= 0) {
          const oldRouteInfo = targetRoutes[targetIndex];
          if (oldRouteInfo && oldRouteInfo.routePolylines) {
            MapRenderer.removePolylines(oldRouteInfo.routePolylines);
          }
        }
        // Alle Polylines entfernen (werden neu gezeichnet mit allen Zielpunkten)
        MapRenderer.clearRoutes();
      } else {
        // Im normalen Modus: Alle Routen entfernen
        const routePolylines = State.getRoutePolylines();
        MapRenderer.removePolylines(routePolylines);
        State.setRoutePolylines([]);
        MapRenderer.clearRoutes();
      }
      
      // Startpunkte wiederverwenden
      const routeInfo = await RouteService.calculateRoutes(lastTarget, { reuseStarts: true });
      if (routeInfo) {
        // Im "Zielpunkte merken" Modus: Routen zum Zielpunkt aktualisieren
        if (isRememberMode()) {
          // RouteInfo enthält bereits die neuen Routen, werden in RouteService gespeichert
          // Jetzt alle Routen neu zeichnen
          RouteRenderer.drawAllTargetRoutes();
        } else {
          // Visualisierung aktualisieren
          RouteHandler.handleRoutesCalculated({ target: lastTarget, routeInfo });
        }
      }
    }
  },
  
  /**
   * Richtet Panel-Ein-/Ausklappen ein
   */
  _setupPanelCollapse() {
    const collapseBtn = Utils.getElement('#collapse-panel');
    const panel = Utils.getElement('#main-panel');
    const arrow = collapseBtn?.querySelector('svg');
    
    if (!collapseBtn || !panel || !arrow) return;
    
    // Arrow-Klasse hinzufügen
    if (arrow) {
      arrow.classList.add('toggle-arrow');
    }
    
    collapseBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  },
  
};

// ==== Start ====
// Warte bis DOM und Leaflet geladen sind
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}

