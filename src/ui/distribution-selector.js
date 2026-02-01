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
    const distType = clickedBtn.dataset.dist;
    if (!distType) {
      Utils.logError('Distribution', 'Button hat kein data-dist Attribut');
      return;
    }

    // Alle Buttons deaktivieren, aktiven aktivieren
    allBtns.forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
    
    // Wenn ein Zielpunkt ausgewählt ist, nichts automatisch tun
    const selectedIndex = State.getSelectedTargetIndex();
    if (selectedIndex !== null && isRememberMode()) {
      return; // Früh beenden, nicht automatisch berechnen
    }
    
    // Wenn Routen vorhanden sind, Verteilung aktualisieren und neu berechnen
    const lastTarget = State.getLastTarget();
    const lastStarts = State.getLastStarts();
    
    if (lastTarget && lastStarts && lastStarts.length > 0) {
      try {
        if (!isRememberMode()) {
          const routePolylines = State.getRoutePolylines();
          MapRenderer.removePolylines(routePolylines);
          MapRenderer.clearRoutes();
          State.setRoutePolylines([]);
        }
        const routeInfo = await RouteService.calculateRoutes(lastTarget, { reuseStarts: false });
        if (routeInfo) {
          Visualization.updateDistanceHistogram(routeInfo.starts, lastTarget, { routeData: routeInfo.routeData, routeDistances: RouteService.getRouteDistances(routeInfo) });
          EventBus.emit(Events.ROUTES_CALCULATED, { target: lastTarget, routeInfo });
        }
      } catch (error) {
        Utils.logError('Distribution', error);
        Utils.showError('Fehler beim Ändern der Verteilung', true);
      }
    }
  }
};

