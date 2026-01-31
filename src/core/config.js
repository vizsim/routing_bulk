// ==== Konfiguration ====
const CONFIG = {
  // Overpass API: Reihenfolge = Fallback bei Fehlern (erster nicht erreichbar → nächster)
  OVERPASS_SERVERS: [
    "https://overpass-api.de/api/",
    "https://overpass.kumi.systems/api/",
    "https://maps.mail.ru/osm/tools/overpass/api/",
    "https://overpass.openstreetmap.ru/api/"
  ],
  //GH_ROUTE_URL: "https://ghroute.duckdns.org/route", // GraphHopper Route API
  GH_ROUTE_URL: "https://ghroute.vizsim.de/route", // GraphHopper Route API
  //GH_ROUTE_URL: "http://localhost:8989/route", // GraphHopper Route API
  PROFILE: "foot", // anpassen (z.B. "foot", "bike", "bike2", "mtb"...)
  N: 10, // Anzahl der Routen
  RADIUS_M: 2000, // Radius in Metern für Startpunkte
  MAP_CENTER: [52.6858, 14.10078], // [lat, lon]
  MAP_ZOOM: 13,
  AGGREGATED: false, // Aggregierte Darstellung
  AGGREGATION_METHOD: "simple", // "simple" oder "lazyOverlap"
  HIDE_START_POINTS: false, // Startpunkte ausblenden
  HIDE_TARGET_POINTS: false, // Zielpunkte ausblenden
  COLORMAP: "viridis_r", // Colormap: "viridis_r", "plasma_r", "inferno_r", "magma_r"
  REMEMBER_TARGETS: false, // Zielpunkte merken
  // Einwohner-Gewichtung (PMTiles): Startpunkte nach Bevölkerungsdichte
  //POPULATION_PMTILES_URL: "https://f003.backblazeb2.com/file/erreichbarad/bb_coeff_rasters_25-05-20.pmtiles", // URL des PMTiles (100×100 m Polygone mit Einwohner); leer = deaktiviert
  POPULATION_PMTILES_URL: "https://f003.backblazeb2.com/file/unfallkarte-data/Zensus2022_100m_poly_GER_wPLZ_wRS_ew_10.pmtiles", // URL des PMTiles (100×100 m Polygone mit Einwohner); leer = deaktiviert

  
  POPULATION_PROPERTY: "Einwohner", // Attributname für Einwohnerzahl im PMTiles-Layer
  POPULATION_LAYER_NAME: "rasters-polys", // Layer-Name im PMTiles (leer = erster Layer mit Features)
  POPULATION_ZOOM: 14, // Wunsch-Zoom für Tile-Abfrage; wird durch maxZoom des PMTiles-Archivs begrenzt
  POPULATION_LAYER_VISIBLE: false, // Einwohnerlayer optional auf Karte anzeigen
  POPULATION_LAYER_MAX_NATIVE_ZOOM: 14 // Höchster Zoom im PMTiles; darüber wird überzoomed (Layer bleibt sichtbar)
};

/**
 * Prüft ob der "Zielpunkte merken" Modus aktiv ist
 * @returns {boolean} - true wenn aktiv, false sonst
 */
function isRememberMode() {
  return CONFIG.REMEMBER_TARGETS === true;
}

