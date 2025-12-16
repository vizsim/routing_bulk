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
      // Eindeutige ID vergeben
      const targetId = State.getNextTargetId();
      State.incrementNextTargetId();
      // ID in Map speichern für schnellen Zugriff
      State.setTargetId(target, targetId);
      State.setAllTargets(allTargets);
      EventBus.emit(Events.TARGET_ADDED, { target, index, targetId });
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
    
    // Marker entfernen und neu indizieren
    const targetMarkers = State.getTargetMarkers();
    const layerGroup = State.getLayerGroup();
    
    // Marker von der Karte entfernen (falls vorhanden)
    // Prüfe sowohl über Index als auch über Koordinaten-Vergleich
    let markerToRemove = null;
    if (index < targetMarkers.length && targetMarkers[index]) {
      markerToRemove = targetMarkers[index];
    } else {
      // Fallback: Marker über Koordinaten finden
      markerToRemove = targetMarkers.find(m => 
        m && m._targetLatLng && this.isEqual(m._targetLatLng, target)
      );
    }
    
    if (markerToRemove && layerGroup) {
      try {
        layerGroup.removeLayer(markerToRemove);
      } catch (error) {
        console.warn('Fehler beim Entfernen des Markers:', error);
      }
    }
    
    // Marker-Array neu aufbauen (ohne den entfernten Marker)
    const updatedMarkers = [];
    targetMarkers.forEach((marker, i) => {
      // Entferne Marker über Index ODER über Koordinaten-Vergleich
      const isMarkerToRemove = (i === index) || 
        (marker && marker._targetLatLng && this.isEqual(marker._targetLatLng, target));
      
      if (!isMarkerToRemove && marker) {
        updatedMarkers.push(marker);
        // Index im Marker aktualisieren (für Tooltip und Kontextmenü)
        if (marker._targetIndex !== undefined) {
          // Neuer Index ist die Position im neuen Array
          marker._targetIndex = updatedMarkers.length - 1;
        }
      }
    });
    State.setTargetMarkers(updatedMarkers);
    
    // ID aus Map entfernen
    State.removeTargetId(target);
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
    State.targetIdMap.clear(); // Alle IDs aus Map entfernen
    
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
    
    // targetId aus bestehenden Routen, Map oder Marker holen
    let targetId = null;
    if (targetIndex >= 0 && targetRoutes[targetIndex] && targetRoutes[targetIndex].targetId) {
      // ID aus bestehenden Routen übernehmen (bevorzugt)
      targetId = targetRoutes[targetIndex].targetId;
    } else {
      // ID aus Map holen (schnellster Zugriff)
      targetId = State.getTargetId(target);
      if (!targetId) {
        // Fallback: ID aus Marker holen
        const targetMarkers = State.getTargetMarkers();
        const marker = targetMarkers.find(m => 
          m && m._targetLatLng && this.isEqual(m._targetLatLng, target)
        );
        if (marker && marker._targetId) {
          targetId = marker._targetId;
        }
      }
      // Falls keine ID gefunden wird, sollte das eigentlich nicht passieren,
      // da die ID beim Hinzufügen des Zielpunkts vergeben wird
    }
    
    if (targetIndex >= 0) {
      // Bestehende Routen ersetzen
      const oldRouteInfo = targetRoutes[targetIndex];
      // Alte Polylines entfernen
      if (oldRouteInfo && oldRouteInfo.routePolylines) {
        MapRenderer.removePolylines(oldRouteInfo.routePolylines);
      }
      targetRoutes[targetIndex] = { ...routeInfo, target, targetId };
    } else {
      // Neue Routen hinzufügen
      targetRoutes.push({ ...routeInfo, target, targetId });
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
        MapRenderer.removePolylines(routeInfo.routePolylines);
      }
      targetRoutes.splice(routeInfoIndex, 1);
      State.setTargetRoutes(targetRoutes);
      EventBus.emit(Events.ROUTES_UPDATED, { target, removed: true });
    }
  }
};

