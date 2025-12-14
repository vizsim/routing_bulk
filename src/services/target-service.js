// ==== Target-Service: Verwaltung von Zielpunkten ====
const TargetService = {
  /**
   * Prüft ob zwei Zielpunkte gleich sind (mit Toleranz)
   * @param {Array} target1 - [lat, lng]
   * @param {Array} target2 - [lat, lng]
   * @returns {boolean}
   */
  isEqual(target1, target2) {
    if (!target1 || !target2) return false;
    return Math.abs(target1[0] - target2[0]) < 0.0001 && 
           Math.abs(target1[1] - target2[1]) < 0.0001;
  },
  
  /**
   * Findet Index eines Zielpunkts in der Liste
   * @param {Array} target - [lat, lng]
   * @returns {number} - Index oder -1
   */
  findTargetIndex(target) {
    const allTargets = State.getAllTargets();
    return allTargets.findIndex(t => this.isEqual(t, target));
  },
  
  /**
   * Fügt einen Zielpunkt hinzu
   * @param {Array} target - [lat, lng]
   * @returns {boolean} - true wenn hinzugefügt, false wenn bereits vorhanden
   */
  addTarget(target) {
    if (!target || !Array.isArray(target) || target.length !== 2) {
      Utils.logError('TargetService', 'Ungültiger Zielpunkt');
      return false;
    }
    
    const allTargets = State.getAllTargets();
    const exists = allTargets.some(t => this.isEqual(t, target));
    
    if (!exists) {
      allTargets.push(target);
      const index = allTargets.length - 1;
      State.setAllTargets(allTargets);
      EventBus.emit(Events.TARGET_ADDED, { target, index });
      return true;
    }
    
    return false;
  },
  
  /**
   * Entfernt einen Zielpunkt
   * @param {number} index - Index des Zielpunkts
   * @returns {Array|null} - Entfernter Zielpunkt oder null
   */
  removeTarget(index) {
    const allTargets = State.getAllTargets();
    if (index < 0 || index >= allTargets.length) {
      return null;
    }
    
    const target = allTargets[index];
    const updatedTargets = allTargets.filter((_, i) => i !== index);
    State.setAllTargets(updatedTargets);
    
    // Marker entfernen
    const targetMarkers = State.getTargetMarkers();
    if (targetMarkers[index]) {
      const layerGroup = State.getLayerGroup();
      if (layerGroup) {
        layerGroup.removeLayer(targetMarkers[index]);
      }
      targetMarkers[index] = null;
      State.setTargetMarkers(targetMarkers.filter(m => m !== null));
    }
    
    EventBus.emit(Events.TARGET_REMOVED, { target, index });
    return target;
  },
  
  /**
   * Entfernt alle Zielpunkte
   */
  clearAll() {
    const allTargets = State.getAllTargets();
    const targetMarkers = State.getTargetMarkers();
    const layerGroup = State.getLayerGroup();
    
    // Alle Marker entfernen
    if (layerGroup && targetMarkers) {
      targetMarkers.forEach(marker => {
        if (marker) layerGroup.removeLayer(marker);
      });
    }
    
    State.setAllTargets([]);
    State.setTargetMarkers([]);
    State.setTargetRoutes([]);
    
    EventBus.emit(Events.TARGET_REMOVED, { all: true });
  },
  
  /**
   * Gibt alle Zielpunkte zurück
   * @returns {Array}
   */
  getAllTargets() {
    return State.getAllTargets();
  },
  
  /**
   * Gibt Routen zu einem Zielpunkt zurück
   * @param {Array} target - [lat, lng]
   * @returns {Object|null} - Route-Info oder null
   */
  getTargetRoutes(target) {
    const targetRoutes = State.getTargetRoutes();
    return targetRoutes.find(tr => this.isEqual(tr.target, target)) || null;
  },
  
  /**
   * Aktualisiert Routen zu einem Zielpunkt
   * @param {Array} target - [lat, lng]
   * @param {Object} routeInfo - Route-Informationen
   */
  updateTargetRoutes(target, routeInfo) {
    const targetRoutes = State.getTargetRoutes();
    const targetIndex = targetRoutes.findIndex(tr => this.isEqual(tr.target, target));
    
    if (targetIndex >= 0) {
      // Bestehende Routen ersetzen
      const oldRouteInfo = targetRoutes[targetIndex];
      // Alte Polylines entfernen
      if (oldRouteInfo && oldRouteInfo.routePolylines) {
        const layerGroup = State.getLayerGroup();
        if (layerGroup) {
          oldRouteInfo.routePolylines.forEach(polyline => {
            if (polyline) layerGroup.removeLayer(polyline);
          });
        }
      }
      targetRoutes[targetIndex] = { ...routeInfo, target };
    } else {
      // Neue Routen hinzufügen
      targetRoutes.push({ ...routeInfo, target });
    }
    
    State.setTargetRoutes(targetRoutes);
    EventBus.emit(Events.ROUTES_UPDATED, { target });
  },
  
  /**
   * Entfernt Routen zu einem Zielpunkt
   * @param {Array} target - [lat, lng]
   */
  removeTargetRoutes(target) {
    const targetRoutes = State.getTargetRoutes();
    const routeInfoIndex = targetRoutes.findIndex(tr => this.isEqual(tr.target, target));
    
    if (routeInfoIndex >= 0) {
      const routeInfo = targetRoutes[routeInfoIndex];
      // Polylines von der Karte entfernen
      if (routeInfo.routePolylines) {
        const layerGroup = State.getLayerGroup();
        if (layerGroup) {
          routeInfo.routePolylines.forEach(polyline => {
            if (polyline) layerGroup.removeLayer(polyline);
          });
        }
      }
      targetRoutes.splice(routeInfoIndex, 1);
      State.setTargetRoutes(targetRoutes);
      EventBus.emit(Events.ROUTES_UPDATED, { target, removed: true });
    }
  }
};

