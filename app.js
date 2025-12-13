// ==== Konfiguration ====
const CONFIG = {
  GH_ROUTE_URL: "https://ghroute.duckdns.org/route", // GraphHopper Route API
  PROFILE: "bike", // anpassen (z.B. "bike", "bike2", "mtb"...)
  N: 10, // Anzahl der Routen
  RADIUS_M: 2000, // Radius in Metern für Startpunkte
  MAP_CENTER: [52.52, 13.405], // [lat, lon]
  MAP_ZOOM: 13
};

// ==== Globale Variablen ====
let map;
let layerGroup;
let lastTarget = null; // Speichert den letzten Zielpunkt für Neuberechnung
let lastStarts = null; // Speichert die letzten Startpunkte für Neuberechnung
let lastColors = null; // Speichert die letzten Farben für Neuberechnung
let startMarkers = []; // Referenzen zu den Startpunkt-Markern
let routePolylines = []; // Referenzen zu den Route-Polylines

// ==== Config-Management ====
function updateConfigFromUI() {
  CONFIG.PROFILE = document.getElementById('config-profile').value;
  CONFIG.N = parseInt(document.getElementById('config-n').value, 10);
  // Radius von km zu m konvertieren
  const radiusKm = parseFloat(document.getElementById('config-radius').value);
  CONFIG.RADIUS_M = radiusKm * 1000;
}

function initConfigUI() {
  // Initiale Werte setzen (Radius in km)
  document.getElementById('config-profile').value = CONFIG.PROFILE;
  document.getElementById('config-n').value = CONFIG.N;
  document.getElementById('config-radius').value = CONFIG.RADIUS_M / 1000; // m zu km

  // Event Listener für Config-Änderungen
  document.getElementById('config-profile').addEventListener('change', async () => {
    updateConfigFromUI();
    // Wenn ein Zielpunkt vorhanden ist, Routen neu abfragen
    if (lastTarget) {
      await recalculateRoutes();
    }
  });
  document.getElementById('config-n').addEventListener('change', updateConfigFromUI);
  document.getElementById('config-radius').addEventListener('change', updateConfigFromUI);
}

// ==== Initialisierung ====
function init() {
  // Unterdrücke Leaflet Mozilla-Deprecation-Warnungen
  const originalWarn = console.warn;
  console.warn = function(...args) {
    if (args[0] && typeof args[0] === 'string') {
      const message = args[0];
      // Unterdrücke mozPressure und mozInputSource Warnungen
      if (message.includes('mozPressure') || message.includes('mozInputSource')) {
        return; // Unterdrücke diese Warnungen
      }
    }
    originalWarn.apply(console, args);
  };
  
  // Config UI initialisieren
  initConfigUI();

  // Leaflet Setup
  map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19 
  }).addTo(map);

  layerGroup = L.layerGroup().addTo(map);

  // Event Listener
  map.on("click", handleMapClick);
}

// ==== Geo-Helfer ====
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

// Gleichverteilte Zufallspunkte in einem Kreis (nicht am Rand "häufiger")
function randomPointInRadius(lat, lon, radiusM) {
  const R = 6371000; // Erdradius
  const u = Math.random();
  const v = Math.random();
  const w = radiusM * Math.sqrt(u);
  const t = 2 * Math.PI * v;

  const dLat = (w * Math.sin(t)) / R;
  const dLon = (w * Math.cos(t)) / (R * Math.cos(toRad(lat)));

  return [lat + toDeg(dLat), lon + toDeg(dLon)];
}

// Leaflet [lat,lon] -> GraphHopper [lon,lat]
function llToGhPoint(lat, lon) { 
  return [lon, lat]; 
}

// ==== API-Funktionen ====
async function fetchRoute(startLatLng, endLatLng) {
  const body = {
    profile: CONFIG.PROFILE,
    points: [
      llToGhPoint(startLatLng[0], startLatLng[1]),
      llToGhPoint(endLatLng[0], endLatLng[1]),
    ],
    points_encoded: false, // Wichtig: unencoded coordinates zurückgeben
    instructions: false, // Nicht benötigt
    elevation: false
  };

  const res = await fetch(CONFIG.GH_ROUTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Route-Fehler ${res.status}: ${txt.slice(0,200)}`);
  }

  const data = await res.json();
  console.log("GraphHopper Response:", data); // Debug
  return data;
}

// ==== Visualisierung ====
function drawRoute(ghResponse, color) {
  // GraphHopper Response-Struktur kann variieren:
  // - paths[0].points.coordinates (wenn points_encoded: false)
  // - paths[0].geometry.coordinates (GeoJSON Format)
  // - paths[0].points (encoded string, braucht Decoding)
  
  const path = ghResponse.paths?.[0];
  if (!path) {
    console.warn("Kein path in Response:", ghResponse);
    return null;
  }

  let coords = null;
  
  // Versuche verschiedene Formate
  if (path.points?.coordinates) {
    coords = path.points.coordinates;
  } else if (path.geometry?.coordinates) {
    coords = path.geometry.coordinates;
  } else if (path.points && typeof path.points === 'string') {
    // Encoded polyline - würde Decoding benötigen, aber wir haben points_encoded: false gesetzt
    console.warn("Encoded points gefunden, aber Decoder nicht implementiert");
    return null;
  }

  if (!coords || !coords.length) {
    console.warn("Keine Koordinaten gefunden in:", path);
    return null;
  }

  // GraphHopper gibt [lon, lat] zurück, Leaflet braucht [lat, lon]
  const latlngs = coords.map(([lon, lat]) => [lat, lon]);
  const polyline = L.polyline(latlngs, { 
    weight: 4, 
    opacity: 0.8, 
    color: color
  }).addTo(layerGroup);
  
  return polyline; // Referenz zurückgeben
}

function drawTargetPoint(latlng) {
  L.circleMarker(latlng, { 
    radius: 6,
    color: '#ff0000',
    fillColor: '#ff0000',
    fillOpacity: 0.8
  }).addTo(layerGroup);
}

function drawStartPoints(starts, colors) {
  // Alte Marker entfernen
  startMarkers.forEach(marker => layerGroup.removeLayer(marker));
  startMarkers = [];
  
  starts.forEach((s, index) => {
    const color = colors[index] || '#0066ff'; // Fallback falls keine Farbe vorhanden
    
    // Erstelle ein Circle-Icon für den Marker
    const icon = L.divIcon({
      className: 'start-point-marker',
      html: `<div style="
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: ${color};
        border: 2px solid white;
        box-shadow: 0 0 0 2px ${color};
        cursor: move;
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
    
    // Erstelle einen draggable Marker
    const marker = L.marker(s, {
      icon: icon,
      draggable: true
    }).addTo(layerGroup);
    
    // Event Listener für Drag-Ende
    marker.on('dragend', async (e) => {
      const newPosition = e.target.getLatLng();
      const newStart = [newPosition.lat, newPosition.lng];
      
      // Startpunkt in lastStarts aktualisieren
      lastStarts[index] = newStart;
      
      // Alte Route entfernen
      if (routePolylines[index]) {
        layerGroup.removeLayer(routePolylines[index]);
        routePolylines[index] = null;
      }
      
      // Neue Route berechnen
      try {
        const result = await fetchRoute(newStart, lastTarget);
        if (result.paths?.[0]) {
          const newRoute = drawRoute(result, colors[index]);
          if (newRoute) {
            routePolylines[index] = newRoute;
          }
        }
      } catch (err) {
        console.error(`Route-Fehler für Startpunkt ${index}:`, err);
      }
    });
    
    startMarkers.push(marker);
  });
}

// ==== Route-Berechnung ====
async function calculateRoutes(target, reuseStarts = false) {
  // Config-Werte aktualisieren
  updateConfigFromUI();
  
  layerGroup.clearLayers();

  drawTargetPoint(target);

  // Startpunkte erzeugen oder wiederverwenden
  let starts;
  let colors;
  if (reuseStarts && lastStarts && lastColors) {
    starts = lastStarts; // Wiederverwende die gespeicherten Startpunkte
    colors = lastColors; // Wiederverwende die gespeicherten Farben
  } else {
    starts = Array.from({ length: CONFIG.N }, () => 
      randomPointInRadius(target[0], target[1], CONFIG.RADIUS_M)
    );
    lastStarts = starts; // Speichere die neuen Startpunkte
    
    // Farben für alle Routen/Startpunkte generieren
    colors = Array.from({ length: CONFIG.N }, () => 
      `hsl(${Math.random() * 360}, 70%, 50%)`
    );
    lastColors = colors; // Speichere die neuen Farben
  }

  // Route-Polylines zurücksetzen
  routePolylines = [];
  
  // Startpunkte mit Farben zeichnen
  drawStartPoints(starts, colors);

  // N Requests parallel
  try {
    const results = await Promise.all(
      starts.map(s => fetchRoute(s, target).catch(err => ({ __err: err })))
    );

    let ok = 0, fail = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.__err) { 
        fail++; 
        console.error("Route-Fehler:", r.__err);
        routePolylines.push(null); // Platzhalter für fehlgeschlagene Route
        continue; 
      }
      ok++;
      // Route mit der entsprechenden Farbe zeichnen und Referenz speichern
      const polyline = drawRoute(r, colors[i]);
      routePolylines.push(polyline);
    }
    console.log(`Routen ok=${ok}, fail=${fail}`);
    
    // Info anzeigen
    if (ok === 0 && fail > 0) {
      alert(`Alle ${fail} Routen fehlgeschlagen. Bitte Browser-Konsole prüfen.`);
    }
  } catch (err) {
    console.error(err);
    alert(String(err));
  }
}

// ==== Event Handler ====
async function handleMapClick(e) {
  const target = [e.latlng.lat, e.latlng.lng];
  lastTarget = target; // Zielpunkt speichern
  await calculateRoutes(target);
}

async function recalculateRoutes() {
  if (lastTarget) {
    // Beim Profilwechsel: Startpunkte wiederverwenden
    await calculateRoutes(lastTarget, true);
  }
}

// ==== Start ====
// Warte bis DOM und Leaflet geladen sind
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

