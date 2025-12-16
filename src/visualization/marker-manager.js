// ==== Marker-Manager: Verwaltung von Target-Markern ====
const MarkerManager = {
  /**
   * Highlightet einen Target-Marker auf der Karte
   * @param {number} index - Index des Zielpunkts
   */
  highlightTargetMarker(index) {
    const targetMarkers = State.getTargetMarkers();
    if (index >= 0 && index < targetMarkers.length && targetMarkers[index]) {
      const marker = targetMarkers[index];
      const iconElement = marker._icon;
      if (iconElement) {
        iconElement.classList.add('target-marker-highlighted');
      }
    }
  },
  
  /**
   * Entfernt Highlighting von allen Target-Markern
   */
  unhighlightAllTargetMarkers() {
    const targetMarkers = State.getTargetMarkers();
    targetMarkers.forEach(marker => {
      if (marker && marker._icon) {
        marker._icon.classList.remove('target-marker-highlighted');
      }
    });
    // Auch currentTargetMarker im normalen Modus
    const currentTargetMarker = State.getCurrentTargetMarker();
    if (currentTargetMarker && currentTargetMarker._icon) {
      currentTargetMarker._icon.classList.remove('target-marker-highlighted');
    }
  },
  
  /**
   * Markiert den ausgewählten Zielpunkt-Marker (blauer Rahmen)
   */
  updateSelectedTargetMarker() {
    const selectedIndex = State.getSelectedTargetIndex();
    const targetMarkers = State.getTargetMarkers();
    const currentTargetMarker = State.getCurrentTargetMarker();
    
    // Alle Marker zurücksetzen
    targetMarkers.forEach(marker => {
      if (marker && marker._icon) {
        marker._icon.classList.remove('target-marker-selected');
      }
    });
    if (currentTargetMarker && currentTargetMarker._icon) {
      currentTargetMarker._icon.classList.remove('target-marker-selected');
    }
    
    // Ausgewählten Marker markieren
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < targetMarkers.length) {
      const marker = targetMarkers[selectedIndex];
      if (marker && marker._icon) {
        marker._icon.classList.add('target-marker-selected');
      }
    }
  },
  
  /**
   * Entfernt verwaiste Target-Marker (Marker ohne zugehörigen Zielpunkt im State)
   * Optimiert: Nur eine Iteration über Layer, Set für schnelle Lookups
   */
  cleanupOrphanedTargetMarkers() {
    const layerGroup = State.getLayerGroup();
    const allTargets = State.getAllTargets();
    const targetMarkers = State.getTargetMarkers();
    
    if (!layerGroup || !allTargets) return;
    
    // Set für schnelle Lookups: Welche Marker sind gültig?
    const validMarkerSet = new Set();
    const validMarkers = [];
    const markersToRemove = [];
    
    // Prüfe alle Marker im State
    targetMarkers.forEach((marker, index) => {
      if (!marker) return; // Marker existiert nicht mehr
      
      // Prüfe ob Marker noch gültig ist
      const isValid = index < allTargets.length && 
                      allTargets[index] &&
                      marker._targetLatLng &&
                      TargetService.isEqual(marker._targetLatLng, allTargets[index]);
      
      if (isValid) {
        validMarkers[index] = marker;
        validMarkerSet.add(marker);
      } else {
        markersToRemove.push(marker);
      }
    });
    
    // Prüfe auch alle Marker auf der Karte, die nicht im State sind
    // (in einem Durchgang, Performance-Optimierung)
    layerGroup.eachLayer(layer => {
      if (layer instanceof L.Marker && 
          layer._targetLatLng && 
          layer._targetIndex !== undefined) {
        
        // Wenn Marker nicht im validMarkerSet ist, prüfe ob er verwaist ist
        if (!validMarkerSet.has(layer)) {
          const targetIndex = allTargets.findIndex(t => 
            TargetService.isEqual(t, layer._targetLatLng)
          );
          
          if (targetIndex < 0) {
            // Zielpunkt existiert nicht mehr - Marker entfernen
            markersToRemove.push(layer);
          }
        }
      }
    });
    
    // Entferne alle verwaisten Marker von der Karte (batch operation)
    markersToRemove.forEach(marker => {
      try {
        if (layerGroup.hasLayer(marker)) {
          layerGroup.removeLayer(marker);
        }
      } catch (err) {
        // Marker wurde bereits entfernt oder existiert nicht mehr
        console.warn('Fehler beim Entfernen verwaister Marker:', err);
      }
    });
    
    // Aktualisiere State mit nur noch gültigen Markern
    State.setTargetMarkers(validMarkers);
  }
};

