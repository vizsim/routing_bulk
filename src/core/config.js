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

