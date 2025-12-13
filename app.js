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

// ==== Globale Variablen ====
let map;
let layerGroup;
let lastTarget = null; // Speichert den letzten Zielpunkt für Neuberechnung
let lastStarts = null; // Speichert die letzten Startpunkte für Neuberechnung
let lastColors = null; // Speichert die letzten Farben für Neuberechnung
let startMarkers = []; // Referenzen zu den Startpunkt-Markern
let routePolylines = []; // Referenzen zu den Route-Polylines
let allRouteData = []; // Speichert alle Route-Daten für Aggregation
let allRouteResponses = []; // Speichert alle Route-Responses für Modus-Wechsel

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
    if (lastTarget) {
      await recalculateRoutes();
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
    if (lastTarget && allRouteData.length > 0) {
      await redrawRoutes();
    }
  });
  
  // Initiale Legende-Sichtbarkeit setzen
  const legend = document.getElementById('legend');
  if (legend) {
    legend.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
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

// ==== Route-Daten-Extraktion ====
function extractRouteCoordinates(ghResponse) {
  const path = ghResponse.paths?.[0];
  if (!path) {
    return null;
  }

  let coords = null;
  
  // Versuche verschiedene Formate
  if (path.points?.coordinates) {
    coords = path.points.coordinates;
  } else if (path.geometry?.coordinates) {
    coords = path.geometry.coordinates;
  } else if (path.points && typeof path.points === 'string') {
    return null;
  }

  if (!coords || !coords.length) {
    return null;
  }

  // GraphHopper gibt [lon, lat] zurück, konvertiere zu [lat, lon]
  return coords.map(([lon, lat]) => [lat, lon]);
}

// ==== Visualisierung ====
function drawRoute(ghResponse, color) {
  const latlngs = extractRouteCoordinates(ghResponse);
  if (!latlngs) {
    return null;
  }

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
  
  // Größe basierend auf Modus
  const size = CONFIG.AGGREGATED ? 6 : 12;
  const borderWidth = CONFIG.AGGREGATED ? 1 : 2;
  const shadowWidth = CONFIG.AGGREGATED ? 1 : 2;
  
  starts.forEach((s, index) => {
    const color = colors[index] || '#0066ff'; // Fallback falls keine Farbe vorhanden
    
    // Erstelle ein Circle-Icon für den Marker
    const icon = L.divIcon({
      className: 'start-point-marker',
      html: `<div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background-color: ${color};
        border: ${borderWidth}px solid white;
        box-shadow: 0 0 0 ${shadowWidth}px ${color};
        cursor: move;
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
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

// ==== Aggregierung ====
function aggregateRoutes(routeDataArray) {
  const TOLERANCE = 0.0001; // ~10m in Grad
  const segmentCounts = new Map();
  
  // Hilfsfunktion: Normalisiere Koordinate
  const normalize = (coord) => {
    return [
      Math.round(coord[0] / TOLERANCE) * TOLERANCE,
      Math.round(coord[1] / TOLERANCE) * TOLERANCE
    ];
  };
  
  // Hilfsfunktion: Erstelle Segment-Key (normalisiert, sortiert)
  const createSegmentKey = (p1, p2) => {
    const np1 = normalize(p1);
    const np2 = normalize(p2);
    // Sortiere, damit Richtung egal ist
    const key = np1[0] < np2[0] || (np1[0] === np2[0] && np1[1] < np2[1])
      ? `${np1[0]},${np1[1]}-${np2[0]},${np2[1]}`
      : `${np2[0]},${np2[1]}-${np1[0]},${np1[1]}`;
    return key;
  };
  
  // Alle Routen durchgehen und Segmente zählen
  routeDataArray.forEach(routeCoords => {
    if (!routeCoords || routeCoords.length < 2) return;
    
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const p1 = routeCoords[i];
      const p2 = routeCoords[i + 1];
      const key = createSegmentKey(p1, p2);
      segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1);
    }
  });
  
  // Aggregierte Segmente zurückgeben
  const aggregatedSegments = [];
  segmentCounts.forEach((count, key) => {
    const [startStr, endStr] = key.split('-');
    const start = startStr.split(',').map(Number);
    const end = endStr.split(',').map(Number);
    aggregatedSegments.push({
      start: start,
      end: end,
      count: count
    });
  });
  
  return aggregatedSegments;
}

function getColorForCount(count, maxCount) {
  // Klassischer Heatmap-Gradient: Blau → Cyan → Grün → Gelb → Rot
  const ratio = count / maxCount;
  let hue;
  
  if (ratio <= 0.2) {
    // Blau zu Cyan (0-20%)
    hue = 240 - (ratio / 0.2) * 40; // 240 -> 200
  } else if (ratio <= 0.4) {
    // Cyan zu Grün (20-40%)
    hue = 200 - ((ratio - 0.2) / 0.2) * 80; // 200 -> 120
  } else if (ratio <= 0.6) {
    // Grün zu Gelb (40-60%)
    hue = 120 - ((ratio - 0.4) / 0.2) * 60; // 120 -> 60
  } else if (ratio <= 0.8) {
    // Gelb zu Orange (60-80%)
    hue = 60 - ((ratio - 0.6) / 0.2) * 30; // 60 -> 30
  } else {
    // Orange zu Rot (80-100%)
    hue = 30 - ((ratio - 0.8) / 0.2) * 30; // 30 -> 0
  }
  
  return `hsl(${hue}, 70%, 50%)`;
}

function drawAggregatedRoutes(aggregatedSegments, maxCount) {
  aggregatedSegments.forEach(seg => {
    const ratio = seg.count / maxCount;
    const weight = 2 + (ratio * 10); // 2-12px
    const opacity = 0.3 + (ratio * 0.7); // 0.3-1.0
    const color = getColorForCount(seg.count, maxCount);
    
    const polyline = L.polyline([seg.start, seg.end], {
      weight: weight,
      opacity: opacity,
      color: color
    });
    
    // Tooltip mit Anzahl hinzufügen
    polyline.bindTooltip(`${seg.count} Route${seg.count !== 1 ? 'n' : ''}`, {
      permanent: false,
      direction: 'top',
      className: 'aggregated-route-tooltip'
    });
    
    polyline.addTo(layerGroup);
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

  // Route-Polylines und Daten zurücksetzen
  routePolylines = [];
  allRouteData = [];
  allRouteResponses = [];
  
  // Startpunkte mit Farben zeichnen
  drawStartPoints(starts, colors);

  // N Requests parallel
  try {
    const results = await Promise.all(
      starts.map(s => fetchRoute(s, target).catch(err => ({ __err: err })))
    );

    let ok = 0, fail = 0;
    const validRoutes = [];
    
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.__err) { 
        fail++; 
        console.error("Route-Fehler:", r.__err);
        routePolylines.push(null);
        allRouteResponses.push(null);
        continue; 
      }
      ok++;
      
      // Route-Daten extrahieren und speichern
      const coords = extractRouteCoordinates(r);
      if (coords) {
        allRouteData.push(coords);
        allRouteResponses.push({ response: r, color: colors[i], index: i });
        validRoutes.push({ response: r, color: colors[i], index: i });
      } else {
        allRouteResponses.push(null);
      }
    }
    
    // Visualisierung basierend auf Modus
    if (CONFIG.AGGREGATED && allRouteData.length > 0) {
      // Aggregierte Darstellung
      const aggregatedSegments = aggregateRoutes(allRouteData);
      const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
      drawAggregatedRoutes(aggregatedSegments, maxCount);
    } else {
      // Einzelne Routen zeichnen
      validRoutes.forEach(({ response, color, index }) => {
        const polyline = drawRoute(response, color);
        routePolylines[index] = polyline;
      });
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

async function redrawRoutes() {
  if (!lastTarget || allRouteData.length === 0) return;
  
  // Alle Routen-Polylines entfernen (Markers sind keine Polylines, bleiben erhalten)
  routePolylines.forEach(polyline => {
    if (polyline) layerGroup.removeLayer(polyline);
  });
  
  // Alle Polylines aus layerGroup entfernen (sind die Routen)
  const polylinesToRemove = [];
  layerGroup.eachLayer(layer => {
    if (layer instanceof L.Polyline) {
      polylinesToRemove.push(layer);
    }
  });
  polylinesToRemove.forEach(layer => layerGroup.removeLayer(layer));
  
  routePolylines = [];
  
  // Startpunkte neu zeichnen (mit neuer Größe basierend auf Modus)
  if (lastStarts && lastColors) {
    drawStartPoints(lastStarts, lastColors);
  }
  
  // Neu zeichnen basierend auf Modus
  if (CONFIG.AGGREGATED) {
    const aggregatedSegments = aggregateRoutes(allRouteData);
    if (aggregatedSegments.length > 0) {
      const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
      drawAggregatedRoutes(aggregatedSegments, maxCount);
    }
  } else {
    // Einzelne Routen aus gespeicherten Responses zeichnen
    allRouteResponses.forEach((routeInfo, index) => {
      if (routeInfo) {
        const polyline = drawRoute(routeInfo.response, routeInfo.color);
        routePolylines[index] = polyline;
      }
    });
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

