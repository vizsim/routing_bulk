// ==== Distribution-Selector: Längenverteilungs-Auswahl ====
const DistributionSelector = {
  /**
   * Initialisiert den Distribution-Selector
   */
  init() {
    const distBtns = Utils.getElements('.dist-btn');
    if (!distBtns || distBtns.length === 0) return;
    
    // Initiale Aktivierung
    distBtns.forEach(btn => {
      if (btn.dataset.dist === 'lognormal') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Event-Listener
    distBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        await this._handleDistributionChange(btn, distBtns);
      });
    });
  },
  
  /**
   * Behandelt Änderung der Verteilung
   * @param {HTMLElement} clickedBtn - Der geklickte Button
   * @param {NodeList} allBtns - Alle Buttons
   */
  async _handleDistributionChange(clickedBtn, allBtns) {
    // Alle Buttons deaktivieren
    allBtns.forEach(b => b.classList.remove('active'));
    // Aktiven Button aktivieren
    clickedBtn.classList.add('active');
    
    const distType = clickedBtn.dataset.dist;
    if (!distType) {
      Utils.logError('Distribution', 'Button hat kein data-dist Attribut');
      return;
    }
    
    // Wenn Routen vorhanden sind, Verteilung aktualisieren
    const lastTarget = State.getLastTarget();
    const lastStarts = State.getLastStarts();
    
    if (lastTarget && lastStarts && lastStarts.length > 0) {
      try {
        // Berechne Verteilung basierend auf aktuellen Parametern
        const numBins = Math.min(15, CONFIG.N);
        Distribution.setDistribution(distType, numBins, CONFIG.RADIUS_M, CONFIG.N);
        
        // Neue Startpunkte generieren basierend auf der Verteilung
        const newStarts = Geo.generatePointsFromDistribution(
          lastTarget[0],
          lastTarget[1],
          CONFIG.RADIUS_M,
          CONFIG.N
        );
        
        // Startpunkte aktualisieren
        State.setLastStarts(newStarts);
        
        // Routen neu berechnen (mit neuen Startpunkten)
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
        
        const routeInfo = await RouteService.calculateRoutes(lastTarget, { reuseStarts: false });
        if (routeInfo) {
          // Histogramm aktualisieren
          Visualization.updateDistanceHistogram(newStarts, lastTarget);
          
          // Event emittieren, damit App die Visualisierung aktualisiert
          EventBus.emit(Events.ROUTES_CALCULATED, { 
            target: lastTarget, 
            routeInfo 
          });
        }
      } catch (error) {
        Utils.logError('Distribution', error);
        Utils.showError('Fehler beim Ändern der Verteilung', true);
      }
    }
  }
};

