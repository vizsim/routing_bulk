// ==== Konfiguration ====
const CONFIG = {
  GH_ROUTE_URL: "https://ghroute.duckdns.org/route", // GraphHopper Route API
  PROFILE: "bike", // anpassen (z.B. "bike", "bike2", "mtb"...)
  N: 10, // Anzahl der Routen
  RADIUS_M: 2000, // Radius in Metern für Startpunkte
  MAP_CENTER: [52.52, 13.405], // [lat, lon]
  MAP_ZOOM: 13,
  AGGREGATED: false, // Aggregierte Darstellung
  AGGREGATION_METHOD: "simple", // "simple" oder "lazyOverlap"
  HIDE_START_POINTS: false, // Startpunkte ausblenden
  COLORMAP: "viridis_r", // Colormap: "viridis_r", "plasma_r", "inferno_r", "magma_r"
  REMEMBER_TARGETS: false // Zielpunkte merken
};

// ==== Config-Management ====
function updateConfigFromUI() {
  // Profil vom aktiven Button
  const activeProfileBtn = Utils.getElement('.profile-btn.active');
  if (activeProfileBtn) {
    CONFIG.PROFILE = activeProfileBtn.dataset.profile || CONFIG.PROFILE;
  }
  
  // Anzahl der Routen validieren
  const nInput = Utils.getElement('#config-n');
  if (nInput) {
    CONFIG.N = Utils.validateNumber(nInput.value, 1, 1000, CONFIG.N);
  }
  
  // Radius validieren und von km zu m konvertieren
  const radiusInput = Utils.getElement('#config-radius');
  if (radiusInput) {
    const radiusKm = Utils.validateNumber(radiusInput.value, 0.1, 100, CONFIG.RADIUS_M / 1000);
    CONFIG.RADIUS_M = radiusKm * 1000;
  }
  
  // Aggregierte Darstellung
  const aggregatedInput = Utils.getElement('#config-aggregated');
  if (aggregatedInput) {
    CONFIG.AGGREGATED = aggregatedInput.checked;
  }
  
  // Aggregierungsmethode
  const methodInput = Utils.getElement('#config-aggregation-method');
  if (methodInput) {
    CONFIG.AGGREGATION_METHOD = methodInput.value || CONFIG.AGGREGATION_METHOD;
  }
  
  // Startpunkte ausblenden
  const hideStartPointsInput = Utils.getElement('#config-hide-start-points');
  if (hideStartPointsInput) {
    CONFIG.HIDE_START_POINTS = hideStartPointsInput.checked;
  }
  
  // Zielpunkte merken
  const rememberTargetsInput = Utils.getElement('#config-remember-targets');
  if (rememberTargetsInput) {
    CONFIG.REMEMBER_TARGETS = rememberTargetsInput.checked;
  }
}

function initConfigUI() {
  // Initiale Werte setzen (Radius in km)
  // Profil-Buttons initialisieren
  const profileBtns = Utils.getElements('.profile-btn');
  profileBtns.forEach(btn => {
    if (btn.dataset.profile === CONFIG.PROFILE) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Input-Felder holen (einmalig)
  const nInput = Utils.getElement('#config-n');
  const radiusInput = Utils.getElement('#config-radius');
  const aggregatedInput = Utils.getElement('#config-aggregated');
  const methodInput = Utils.getElement('#config-aggregation-method');
  const hideStartPointsInput = Utils.getElement('#config-hide-start-points');
  const rememberTargetsInput = Utils.getElement('#config-remember-targets');
  
  // Initiale Werte setzen
  if (nInput) nInput.value = CONFIG.N;
  if (radiusInput) radiusInput.value = CONFIG.RADIUS_M / 1000; // m zu km
  if (aggregatedInput) aggregatedInput.checked = CONFIG.AGGREGATED;
  if (methodInput) methodInput.value = CONFIG.AGGREGATION_METHOD;
  if (hideStartPointsInput) hideStartPointsInput.checked = CONFIG.HIDE_START_POINTS;
  if (rememberTargetsInput) rememberTargetsInput.checked = CONFIG.REMEMBER_TARGETS;

  // Event Listener für Profil-Buttons
  profileBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      // Alle Buttons deaktivieren
      profileBtns.forEach(b => b.classList.remove('active'));
      // Aktiven Button aktivieren
      btn.classList.add('active');
      
      updateConfigFromUI();
      // Wenn ein Zielpunkt vorhanden ist, Routen neu abfragen
      if (State.getLastTarget()) {
        await App.recalculateRoutes();
      }
    });
  });
  
  // Input-Event-Listener mit Validierung
  if (nInput) {
    nInput.addEventListener('change', updateConfigFromUI);
  }
  
  if (radiusInput) {
    radiusInput.addEventListener('change', updateConfigFromUI);
  }
  
  // Aggregierte Darstellung Toggle
  if (aggregatedInput) {
    aggregatedInput.addEventListener('change', async () => {
      updateConfigFromUI();
      toggleAggregationUI();
      // Wenn Routen vorhanden sind, Darstellung aktualisieren
      if (CONFIG.REMEMBER_TARGETS) {
        // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten neu zeichnen
        App.drawAllTargetRoutes();
      } else if (State.getLastTarget() && State.getAllRouteData().length > 0) {
        await App.redrawRoutes();
      }
    });
  }
  
  // Aggregierungsmethode
  if (methodInput) {
    methodInput.addEventListener('change', async () => {
      updateConfigFromUI();
      // Wenn Routen vorhanden sind, Darstellung aktualisieren
      if (CONFIG.REMEMBER_TARGETS && CONFIG.AGGREGATED) {
        // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten neu zeichnen
        App.drawAllTargetRoutes();
      } else if (State.getLastTarget() && State.getAllRouteData().length > 0 && CONFIG.AGGREGATED) {
        await App.redrawRoutes();
      }
    });
  }
  
  // Startpunkte ausblenden
  if (hideStartPointsInput) {
    hideStartPointsInput.addEventListener('change', () => {
      updateConfigFromUI();
      // Startpunkte sofort ausblenden/einblenden
      Visualization.toggleStartPointsVisibility();
    });
  }
  
  // Zielpunkte merken
  if (rememberTargetsInput) {
    rememberTargetsInput.addEventListener('change', () => {
      updateConfigFromUI();
      toggleTargetsListUI();
      
      // Wenn aktiviert, aktuellen Zielpunkt und Routen zur Liste hinzufügen (falls vorhanden)
      if (CONFIG.REMEMBER_TARGETS) {
        const currentTarget = State.getLastTarget();
        if (currentTarget) {
          const allTargets = State.getAllTargets();
          const targetExists = allTargets.some(t => 
            Math.abs(t[0] - currentTarget[0]) < 0.0001 && 
            Math.abs(t[1] - currentTarget[1]) < 0.0001
          );
          
          if (!targetExists) {
            allTargets.push(currentTarget);
            State.setAllTargets(allTargets);
            
            // Marker für aktuellen Zielpunkt zeichnen
            const marker = Visualization.drawTargetPoint(currentTarget);
            const targetMarkers = State.getTargetMarkers();
            targetMarkers.push(marker);
            State.setTargetMarkers(targetMarkers);
            
            // Routen zum aktuellen Zielpunkt speichern (falls vorhanden)
            const allRouteData = State.getAllRouteData();
            const allRouteResponses = State.getAllRouteResponses();
            const routePolylines = State.getRoutePolylines();
            const lastStarts = State.getLastStarts();
            const lastColors = State.getLastColors();
            
            if (allRouteData.length > 0 || allRouteResponses.length > 0) {
              const targetRoutes = State.getTargetRoutes();
              targetRoutes.push({
                target: currentTarget,
                routeData: allRouteData,
                routeResponses: allRouteResponses,
                routePolylines: routePolylines,
                starts: lastStarts,
                colors: lastColors
              });
              State.setTargetRoutes(targetRoutes);
              
              // Alle Routen neu zeichnen
              App.drawAllTargetRoutes();
            }
            
            // Liste aktualisieren
            updateTargetsList();
          }
        }
      }
      
      // Wenn deaktiviert, alle gespeicherten Zielpunkte und Routen löschen
      if (!CONFIG.REMEMBER_TARGETS) {
        const layerGroup = State.getLayerGroup();
        const targetMarkers = State.getTargetMarkers();
        const targetRoutes = State.getTargetRoutes();
        
        // Alle Routen-Polylines entfernen
        if (targetRoutes && layerGroup) {
          targetRoutes.forEach(routeInfo => {
            if (routeInfo && routeInfo.routePolylines) {
              routeInfo.routePolylines.forEach(polyline => {
                if (polyline) layerGroup.removeLayer(polyline);
              });
            }
          });
        }
        
        // Alle Polylines entfernen (falls welche übrig sind)
        if (layerGroup) {
          const polylinesToRemove = [];
          layerGroup.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
              polylinesToRemove.push(layer);
            }
          });
          polylinesToRemove.forEach(layer => layerGroup.removeLayer(layer));
        }
        
        // Alle Zielpunkt-Marker von der Karte entfernen
        if (layerGroup && targetMarkers) {
          targetMarkers.forEach(marker => {
            if (marker) {
              layerGroup.removeLayer(marker);
            }
          });
        }
        
        // State zurücksetzen
        State.setAllTargets([]);
        State.setTargetMarkers([]);
        State.setTargetRoutes([]);
        
        // Aktuellen Zielpunkt beibehalten und neu zeichnen
        const currentTarget = State.getLastTarget();
        if (currentTarget && layerGroup) {
          // Alle verbleibenden Zielpunkt-Marker entfernen (falls welche übrig sind)
          layerGroup.eachLayer(layer => {
            if (layer instanceof L.Marker && layer.options && layer.options.icon && 
                layer.options.icon.options && layer.options.icon.options.className === 'target-point-icon') {
              layerGroup.removeLayer(layer);
            }
          });
          // Aktuellen Zielpunkt neu zeichnen
          Visualization.drawTargetPoint(currentTarget);
        }
      }
    });
  }
  
  // Initiale UI-Sichtbarkeit setzen
  toggleAggregationUI();
  toggleTargetsListUI();
  
  // Colormap-Selector initialisieren
  initColormapSelector();
  
  // Export-Button Handler
  const exportBtn = Utils.getElement('#export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      App.exportToGeoJSON();
    });
  }
  
  // Initiale Button-Status setzen
  updateExportButtonState();
  
  // Verteilungs-Buttons initialisieren
  initDistributionButtons();
  
  // Initiale Verteilung setzen (lognormal) - wird beim ersten Klick gesetzt
  const defaultDistBtn = Utils.getElement('.dist-btn[data-dist="lognormal"]');
  if (defaultDistBtn) {
    defaultDistBtn.classList.add('active');
  }
}

// ==== Helper-Funktionen für Config-UI ====
function toggleAggregationUI() {
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
  
  // Legende-Gradient und Vorschau-Bars aktualisieren wenn sichtbar
  if (CONFIG.AGGREGATED && legend && legend.style.display === 'block') {
    Visualization.updateLegendGradient();
    Visualization.updateColormapPreviews();
  }
}

function toggleTargetsListUI() {
  const targetsListGroup = Utils.getElement('#targets-list-group');
  if (targetsListGroup) {
    targetsListGroup.style.display = CONFIG.REMEMBER_TARGETS ? 'block' : 'none';
  }
  // Liste aktualisieren wenn sichtbar
  if (CONFIG.REMEMBER_TARGETS) {
    updateTargetsList();
  }
}

function updateTargetsList() {
  const targetsList = Utils.getElement('#targets-list');
  if (!targetsList) return;
  
  const allTargets = State.getAllTargets();
  
  // Liste leeren
  targetsList.innerHTML = '';
  
  if (allTargets.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'target-item';
    emptyMsg.style.fontSize = '12px';
    emptyMsg.style.color = '#999';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.textContent = 'Keine Zielpunkte gespeichert';
    targetsList.appendChild(emptyMsg);
    return;
  }
  
  // Zielpunkte anzeigen
  allTargets.forEach((target, index) => {
    const item = document.createElement('div');
    item.className = 'target-item';
    
    const label = document.createElement('span');
    label.className = 'target-item-label';
    label.textContent = `z${index + 1}:`;
    
    const coords = document.createElement('span');
    coords.className = 'target-item-coords';
    coords.textContent = `${target[0].toFixed(5)}, ${target[1].toFixed(5)}`;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'target-item-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Zielpunkt entfernen';
    removeBtn.addEventListener('click', async () => {
      const layerGroup = State.getLayerGroup();
      const targetRoutes = State.getTargetRoutes();
      
      // Routen zu diesem Zielpunkt entfernen
      const routeInfoIndex = targetRoutes.findIndex(tr => 
        Math.abs(tr.target[0] - target[0]) < 0.0001 && 
        Math.abs(tr.target[1] - target[1]) < 0.0001
      );
      
      if (routeInfoIndex >= 0) {
        const routeInfo = targetRoutes[routeInfoIndex];
        // Polylines von der Karte entfernen
        if (routeInfo.routePolylines && layerGroup) {
          routeInfo.routePolylines.forEach(polyline => {
            if (polyline) layerGroup.removeLayer(polyline);
          });
        }
        // Route-Info aus State entfernen
        targetRoutes.splice(routeInfoIndex, 1);
        State.setTargetRoutes(targetRoutes);
      }
      
      // Zielpunkt aus State entfernen
      const updatedTargets = allTargets.filter((_, i) => i !== index);
      State.setAllTargets(updatedTargets);
      
      // Marker von der Karte entfernen
      if (layerGroup) {
        const targetMarkers = State.getTargetMarkers();
        if (targetMarkers[index]) {
          layerGroup.removeLayer(targetMarkers[index]);
          targetMarkers[index] = null;
          State.setTargetMarkers(targetMarkers.filter(m => m !== null));
        }
      }
      
      // Liste aktualisieren
      updateTargetsList();
      
      // Wenn es der aktuelle Zielpunkt war, State zurücksetzen
      if (State.getLastTarget() && 
          Math.abs(State.getLastTarget()[0] - target[0]) < 0.0001 &&
          Math.abs(State.getLastTarget()[1] - target[1]) < 0.0001) {
        State.setLastTarget(null);
        State.resetRouteData();
      }
      
      // Alle verbleibenden Routen neu zeichnen
      if (CONFIG.REMEMBER_TARGETS) {
        App.drawAllTargetRoutes();
      }
      
      updateExportButtonState();
    });
    
    item.appendChild(label);
    item.appendChild(coords);
    item.appendChild(removeBtn);
    targetsList.appendChild(item);
  });
}

function initColormapSelector() {
  const colormapPreviews = Utils.getElements('.colormap-preview');
  const colormapContainer = Utils.getElement('.colormap-preview-container');
  const legendGradientBar = Utils.getElement('#legend-gradient-bar');
  
  if (!colormapContainer) return;
  
  // Vorschau-Bars initialisieren
  Visualization.updateColormapPreviews();
  
  // Aktive Colormap markieren
  colormapPreviews.forEach(preview => {
    if (preview.dataset.colormap === CONFIG.COLORMAP) {
      preview.classList.add('active');
    }
  });
  
  // Funktion zum Ein-/Ausblenden der Vorschau-Bars
  const togglePreviews = (e) => {
    if (e) e.stopPropagation();
    const isVisible = colormapContainer.classList.contains('show');
    if (isVisible) {
      colormapContainer.classList.remove('show');
    } else {
      colormapContainer.classList.add('show');
    }
  };
  
  // Gradient-Bar-Klick: Vorschau-Bars ein-/ausblenden
  if (legendGradientBar) {
    legendGradientBar.style.cursor = 'pointer';
    legendGradientBar.addEventListener('click', togglePreviews);
  }
  
  // Klick auf Vorschau-Bar: Colormap ändern
  colormapPreviews.forEach(preview => {
    preview.addEventListener('click', async (e) => {
      e.stopPropagation();
      const colormap = preview.dataset.colormap;
      
      // CONFIG aktualisieren
      CONFIG.COLORMAP = colormap;
      
      // Aktive Vorschau aktualisieren
      colormapPreviews.forEach(p => p.classList.remove('active'));
      preview.classList.add('active');
      
      // Legende aktualisieren
      Visualization.updateLegendGradient();
      
      // Vorschau-Bars ausblenden nach Auswahl
      colormapContainer.classList.remove('show');
      
      // Routen neu zeichnen wenn vorhanden
      if (CONFIG.REMEMBER_TARGETS && CONFIG.AGGREGATED) {
        // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten neu zeichnen
        App.drawAllTargetRoutes();
      } else if (State.getLastTarget() && State.getAllRouteData().length > 0 && CONFIG.AGGREGATED) {
        await App.redrawRoutes();
      }
    });
  });
  
  // Klick außerhalb: Vorschau-Bars schließen
  document.addEventListener('click', (e) => {
    if (!colormapContainer.contains(e.target) && 
        !(legendGradientBar && legendGradientBar.contains(e.target))) {
      colormapContainer.classList.remove('show');
    }
  });
}

function initDistributionButtons() {
  const distBtns = Utils.getElements('.dist-btn');
  distBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      // Alle Buttons deaktivieren
      distBtns.forEach(b => b.classList.remove('active'));
      // Aktiven Button aktivieren
      btn.classList.add('active');
      
      const distType = btn.dataset.dist;
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
          const numBins = Math.min(15, lastStarts.length);
          Distribution.setDistribution(distType, numBins, CONFIG.RADIUS_M, CONFIG.N);
          
          // Histogramm aktualisieren
          Visualization.updateDistanceHistogram(lastStarts, lastTarget);
          
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
          await App.calculateRoutes(lastTarget, false);
        } catch (error) {
          Utils.logError('Distribution', error);
          Utils.showError('Fehler beim Ändern der Verteilung', true);
        }
      }
    });
  });
}

// ==== Export-Button State Management ====
function updateExportButtonState() {
  const exportBtn = Utils.getElement('#export-btn');
  if (!exportBtn) return;
  
  const hasRoutes = State.getAllRouteData() && State.getAllRouteData().length > 0;
  exportBtn.disabled = !hasRoutes;
}

