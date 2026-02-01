// ==== Route-Handler: Behandelt Route-Events ====
const RouteHandler = {
  /**
   * Behandelt berechnete Routen
   * @param {Object} data - { target, routeInfo }
   */
  handleRoutesCalculated(data) {
    const { target, routeInfo } = data;
    
    // Startpunkte zeichnen (nur im normalen Modus oder beim ersten Klick im "Zielpunkte merken" Modus)
    if (routeInfo.starts && routeInfo.colors) {
      if (!isRememberMode()) {
        // Im normalen Modus: Startpunkte normal zeichnen
        Visualization.drawStartPoints(routeInfo.starts, routeInfo.colors, target);
      } else {
        // Im "Zielpunkte merken" Modus: Alte Startpunkte entfernen, neue zeichnen
        Visualization._clearStartMarkers();
        Visualization.drawStartPoints(routeInfo.starts, routeInfo.colors, target);
      }
    }
    
    // Routen visualisieren
    if (isRememberMode()) {
      // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten anzeigen
      // (inklusive der gerade berechneten)
      RouteRenderer.drawAllTargetRoutes();
    } else {
      // Normaler Modus: Nur Routen zum aktuellen Zielpunkt
      // Alte Routen entfernen (falls noch vorhanden)
      const routePolylines = State.getRoutePolylines();
      MapRenderer.removePolylines(routePolylines);
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
      Visualization.updateDistanceHistogram(routeInfo.starts, target, { routeData: routeInfo.routeData, routeDistances: RouteService.getRouteDistances(routeInfo) });
    }
    
    // Export-Button aktualisieren
    this._updateExportButtonState();
    
    // Panel aktualisieren (damit Config-Informationen angezeigt werden)
    if (isRememberMode()) {
      TargetsList.update();
    }
    
    // Info anzeigen
    if (routeInfo.stats && routeInfo.stats.ok === 0 && routeInfo.stats.fail > 0) {
      Utils.showError(`Alle ${routeInfo.stats.fail} Routen fehlgeschlagen. Bitte Browser-Konsole prüfen.`, true);
    }
    
    // Warnung bei vielen Routen anzeigen
    RouteWarning.checkAndShow();
  },
  
  /**
   * Behandelt aktualisierte Route
   * @param {Object} data - { index }
   */
  handleRouteUpdated(data) {
    const { index } = data;
    
    // Visualisierung aktualisieren
    if (isRememberMode()) {
      RouteRenderer.drawAllTargetRoutes();
    } else {
      // Normaler Modus: Nur aktualisierte Route neu zeichnen
      const allRouteData = State.getAllRouteData();
      const allRouteResponses = State.getAllRouteResponses();
      const colors = State.getLastColors();
      
      if (allRouteData.length > 0 && allRouteResponses.length > 0) {
        // Alte Route entfernen
        const routePolylines = State.getRoutePolylines();
        if (routePolylines[index]) {
          MapRenderer.removePolylines([routePolylines[index]]);
        }
        
        // Neue Route zeichnen
        if (allRouteResponses[index]) {
          const polyline = RouteRenderer.drawRoute(
            allRouteResponses[index].response,
            allRouteResponses[index].color || colors[index]
          );
          routePolylines[index] = polyline;
          State.setRoutePolylines(routePolylines);
        }
      }
    }
  },
  
  /**
   * Aktualisiert den Export-Button Status
   */
  _updateExportButtonState() {
    const exportBtn = Utils.getElement('#export-btn');
    if (!exportBtn) return;
    
    const hasRoutes = isRememberMode() 
      ? State.getTargetRoutes().length > 0
      : State.getAllRouteData().length > 0;
    exportBtn.disabled = !hasRoutes;
    exportBtn.title = hasRoutes
      ? 'Routen als GeoJSON herunterladen'
      : 'Zuerst Routen berechnen';
  }
};

