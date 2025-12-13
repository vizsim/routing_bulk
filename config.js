// ==== Konfiguration ====
const CONFIG = {
  GH_ROUTE_URL: "https://ghroute.duckdns.org/route", // GraphHopper Route API
  PROFILE: "bike", // anpassen (z.B. "bike", "bike2", "mtb"...)
  N: 10, // Anzahl der Routen
  RADIUS_M: 2000, // Radius in Metern für Startpunkte
  MAP_CENTER: [52.52, 13.405], // [lat, lon]
  MAP_ZOOM: 13,
  AGGREGATED: false, // Aggregierte Darstellung
  AGGREGATION_METHOD: "simple" // "simple" oder "lazyOverlap"
};

// ==== Config-Management ====
function updateConfigFromUI() {
  // Profil vom aktiven Button
  const activeProfileBtn = document.querySelector('.profile-btn.active');
  if (activeProfileBtn) {
    CONFIG.PROFILE = activeProfileBtn.dataset.profile;
  }
  CONFIG.N = parseInt(document.getElementById('config-n').value, 10);
  // Radius von km zu m konvertieren
  const radiusKm = parseFloat(document.getElementById('config-radius').value);
  CONFIG.RADIUS_M = radiusKm * 1000;
  CONFIG.AGGREGATED = document.getElementById('config-aggregated').checked;
  CONFIG.AGGREGATION_METHOD = document.getElementById('config-aggregation-method').value;
}

function initConfigUI() {
  // Initiale Werte setzen (Radius in km)
  // Profil-Buttons initialisieren
  const profileBtns = document.querySelectorAll('.profile-btn');
  profileBtns.forEach(btn => {
    if (btn.dataset.profile === CONFIG.PROFILE) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  document.getElementById('config-n').value = CONFIG.N;
  document.getElementById('config-radius').value = CONFIG.RADIUS_M / 1000; // m zu km
  document.getElementById('config-aggregated').checked = CONFIG.AGGREGATED;
  document.getElementById('config-aggregation-method').value = CONFIG.AGGREGATION_METHOD;

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
  
  document.getElementById('config-n').addEventListener('change', updateConfigFromUI);
  document.getElementById('config-radius').addEventListener('change', updateConfigFromUI);
  
  document.getElementById('config-aggregated').addEventListener('change', async () => {
    updateConfigFromUI();
    // Legende und Methode-Auswahl ein-/ausblenden
    const legend = document.getElementById('legend');
    const methodGroup = document.getElementById('aggregation-method-group');
    if (legend) {
      legend.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
    }
    if (methodGroup) {
      methodGroup.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
    }
    // Wenn Routen vorhanden sind, Darstellung aktualisieren
    if (State.getLastTarget() && State.getAllRouteData().length > 0) {
      await App.redrawRoutes();
    }
  });
  
  document.getElementById('config-aggregation-method').addEventListener('change', async () => {
    updateConfigFromUI();
    // Wenn Routen vorhanden sind, Darstellung aktualisieren
    if (State.getLastTarget() && State.getAllRouteData().length > 0 && CONFIG.AGGREGATED) {
      await App.redrawRoutes();
    }
  });
  
  // Initiale Legende- und Methode-Sichtbarkeit setzen
  const legend = document.getElementById('legend');
  const methodGroup = document.getElementById('aggregation-method-group');
  if (legend) {
    legend.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
  if (methodGroup) {
    methodGroup.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
  
  // Export-Button Handler
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      App.exportToGeoJSON();
    });
  }
  
  // Initiale Button-Status setzen
  updateExportButtonState();
}

// ==== Export-Button State Management ====
function updateExportButtonState() {
  const exportBtn = document.getElementById('export-btn');
  if (!exportBtn) return;
  
  const hasRoutes = State.getAllRouteData() && State.getAllRouteData().length > 0;
  exportBtn.disabled = !hasRoutes;
}

