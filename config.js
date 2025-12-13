// ==== Konfiguration ====
const CONFIG = {
  GH_ROUTE_URL: "https://ghroute.duckdns.org/route", // GraphHopper Route API
  PROFILE: "bike", // anpassen (z.B. "bike", "bike2", "mtb"...)
  N: 10, // Anzahl der Routen
  RADIUS_M: 2000, // Radius in Metern für Startpunkte
  MAP_CENTER: [52.52, 13.405], // [lat, lon]
  MAP_ZOOM: 13,
  AGGREGATED: false // Aggregierte Darstellung
};

// ==== Config-Management ====
function updateConfigFromUI() {
  CONFIG.PROFILE = document.getElementById('config-profile').value;
  CONFIG.N = parseInt(document.getElementById('config-n').value, 10);
  // Radius von km zu m konvertieren
  const radiusKm = parseFloat(document.getElementById('config-radius').value);
  CONFIG.RADIUS_M = radiusKm * 1000;
  CONFIG.AGGREGATED = document.getElementById('config-aggregated').checked;
}

function initConfigUI() {
  // Initiale Werte setzen (Radius in km)
  document.getElementById('config-profile').value = CONFIG.PROFILE;
  document.getElementById('config-n').value = CONFIG.N;
  document.getElementById('config-radius').value = CONFIG.RADIUS_M / 1000; // m zu km
  document.getElementById('config-aggregated').checked = CONFIG.AGGREGATED;

  // Event Listener für Config-Änderungen
  document.getElementById('config-profile').addEventListener('change', async () => {
    updateConfigFromUI();
    // Wenn ein Zielpunkt vorhanden ist, Routen neu abfragen
    if (State.getLastTarget()) {
      await App.recalculateRoutes();
    }
  });
  
  document.getElementById('config-n').addEventListener('change', updateConfigFromUI);
  document.getElementById('config-radius').addEventListener('change', updateConfigFromUI);
  
  document.getElementById('config-aggregated').addEventListener('change', async () => {
    updateConfigFromUI();
    // Legende ein-/ausblenden
    const legend = document.getElementById('legend');
    if (legend) {
      legend.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
    }
    // Wenn Routen vorhanden sind, Darstellung aktualisieren
    if (State.getLastTarget() && State.getAllRouteData().length > 0) {
      await App.redrawRoutes();
    }
  });
  
  // Initiale Legende-Sichtbarkeit setzen
  const legend = document.getElementById('legend');
  if (legend) {
    legend.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
}

