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
  COLORMAP: "viridis_r" // Colormap: "viridis_r", "plasma_r", "inferno_r", "magma_r"
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
  
  // Initiale Werte setzen
  if (nInput) nInput.value = CONFIG.N;
  if (radiusInput) radiusInput.value = CONFIG.RADIUS_M / 1000; // m zu km
  if (aggregatedInput) aggregatedInput.checked = CONFIG.AGGREGATED;
  if (methodInput) methodInput.value = CONFIG.AGGREGATION_METHOD;
  if (hideStartPointsInput) hideStartPointsInput.checked = CONFIG.HIDE_START_POINTS;

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
      if (State.getLastTarget() && State.getAllRouteData().length > 0) {
        await App.redrawRoutes();
      }
    });
  }
  
  // Aggregierungsmethode
  if (methodInput) {
    methodInput.addEventListener('change', async () => {
      updateConfigFromUI();
      // Wenn Routen vorhanden sind, Darstellung aktualisieren
      if (State.getLastTarget() && State.getAllRouteData().length > 0 && CONFIG.AGGREGATED) {
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
  
  // Initiale UI-Sichtbarkeit setzen
  toggleAggregationUI();
  
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
  
  // Legende-Gradient aktualisieren wenn sichtbar
  if (CONFIG.AGGREGATED && legend && legend.style.display === 'block') {
    Visualization.updateLegendGradient();
  }
}

function initColormapSelector() {
  const colormapButton = Utils.getElement('#colormap-button');
  const colormapMenu = Utils.getElement('#colormap-menu');
  const colormapLabel = Utils.getElement('#colormap-label');
  const colormapOptions = Utils.getElements('.colormap-option');
  
  if (!colormapButton || !colormapMenu) return;
  
  // Initiale Colormap setzen
  if (colormapLabel) {
    colormapLabel.textContent = CONFIG.COLORMAP || 'viridis_r';
  }
  
  // Aktive Option markieren
  colormapOptions.forEach(option => {
    if (option.dataset.colormap === CONFIG.COLORMAP) {
      option.classList.add('active');
    }
  });
  
  // Button-Klick: Menü öffnen/schließen
  colormapButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = colormapMenu.style.display === 'block';
    colormapMenu.style.display = isVisible ? 'none' : 'block';
  });
  
  // Option-Klick: Colormap ändern
  colormapOptions.forEach(option => {
    option.addEventListener('click', async (e) => {
      e.stopPropagation();
      const colormap = option.dataset.colormap;
      
      // CONFIG aktualisieren
      CONFIG.COLORMAP = colormap;
      
      // Label aktualisieren
      if (colormapLabel) {
        colormapLabel.textContent = colormap;
      }
      
      // Aktive Option aktualisieren
      colormapOptions.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      
      // Menü schließen
      colormapMenu.style.display = 'none';
      
      // Legende aktualisieren
      Visualization.updateLegendGradient();
      
      // Routen neu zeichnen wenn vorhanden
      if (State.getLastTarget() && State.getAllRouteData().length > 0 && CONFIG.AGGREGATED) {
        await App.redrawRoutes();
      }
    });
  });
  
  // Klick außerhalb: Menü schließen
  document.addEventListener('click', (e) => {
    if (!colormapButton.contains(e.target) && !colormapMenu.contains(e.target)) {
      colormapMenu.style.display = 'none';
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

