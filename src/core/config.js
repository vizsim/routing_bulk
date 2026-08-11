// ==== Konfiguration ====
export const CONFIG = {
  //GH_ROUTE_URL: "https://ghroute.duckdns.org/route", // GraphHopper Route API
  GH_ROUTE_URL: "https://ghroute.vizsim.de/route", // GraphHopper Route API
  //GH_ROUTE_URL: "http://localhost:8989/route", // GraphHopper Route API
  BASEMAP_STYLE_URL: "https://tiles.openfreemap.org/styles/positron", // MapLibre-Style (Vector-Basemap)

  // ÖPNV-Routing (Beta) via Transitous/MOTIS. Community-Dienst — die Limits
  // hier sind bewusst konservativ, um die API zu schonen:
  TRANSIT_PLAN_URL: "https://api.transitous.org/api/v1/plan",
  TRANSIT_MAX_ROUTES: 30, // hartes Cap im ÖPNV-Modus (unabhängig von N)
  TRANSIT_CONCURRENCY: 2, // max. parallele Plan-Anfragen
  TRANSIT_ARRIVE_HOUR: 8, // Ankunft nächster Werktag um diese Stunde (Schulwege)
  PROFILE: "foot", // anpassen (z.B. "foot", "bike", "bike2", "mtb"...)
  N: 10, // Anzahl der Routen
  ROUTE_CONCURRENCY: 12, // Max. parallele GH-Requests (schont Server; HTTP/1.1-Browserlimit liegt ähnlich)
  RADIUS_M: 2000, // Radius in Metern für Startpunkte
  MAP_CENTER: [52.6858, 14.10078], // [lat, lon]
  MAP_ZOOM: 13,
  AGGREGATED: false, // Aggregierte Darstellung (exakt über GH edge_id, siehe aggregation-service.js)
  HIDE_START_POINTS: false, // Startpunkte ausblenden
  HIDE_TARGET_POINTS: false, // Zielpunkte ausblenden
  COLORMAP: "viridis_r", // Colormap: "viridis_r", "plasma_r", "inferno_r", "magma_r"
  REMEMBER_TARGETS: false, // Zielpunkte merken
  // Einwohner-Gewichtung (PMTiles): Startpunkte nach Bevölkerungsdichte
  //POPULATION_PMTILES_URL: "https://tiles.vizsim.de/file/erreichbarad/bb_coeff_rasters_25-05-20.pmtiles", // URL des PMTiles (100×100 m Polygone mit Einwohner); leer = deaktiviert
  POPULATION_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data/Zensus2022_100m_poly_GER_wPLZ_wRS_ew_10.pmtiles", // URL des PMTiles (100×100 m Polygone mit Einwohner); leer = deaktiviert

  
  // Nachfragedetails: wer startet wo?
  // Kapazität ist fix: aus einer Zensus-Zelle können höchstens so viele
  // Startpunkte kommen, wie dort Personen der gewählten Basis wohnen.
  DEMAND_BASIS: "population", // "population" (alle Einwohner) oder "under18" (unter 18-Jährige)
  DEMAND_TRANSIT_SHARE: 0, // % der Startpunkte an ÖPNV-Haltestellen statt an Wohnorten (0-100)
  // Wie viele der zielnächsten Haltestellen als Ausstiegspunkte dienen. Für ÖPNV
  // gilt die Längenverteilung NICHT — wer mit Bus/Bahn kommt, steigt zielnah aus.
  DEMAND_TRANSIT_STOPS: 3,

  POPULATION_PROPERTY: "Einwohner", // Attributname für Einwohnerzahl im PMTiles-Layer
  POPULATION_LAYER_NAME: "rasters-polys", // Layer-Name im PMTiles (leer = erster Layer mit Features)
  POPULATION_ZOOM: 14, // Wunsch-Zoom für Tile-Abfrage; wird durch maxZoom des PMTiles-Archivs begrenzt
  POPULATION_LAYER_VISIBLE: false, // Einwohnerlayer optional auf Karte anzeigen
  POPULATION_LAYER_MAX_NATIVE_ZOOM: 14, // Höchster Zoom im PMTiles; darüber wird überzoomed (Layer bleibt sichtbar)

  // Schulen & Kindergärten (PMTiles aus der unfallkarte-Pipeline, ersetzt die Overpass-Suche)
  SCHOOLS_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/schools.pmtiles", // leer = Toggle ausblenden
  SCHOOLS_LAYER_NAME: "germany_osm_schools", // Source-Layer im PMTiles
  SCHOOLS_LAYER_VISIBLE: false, // Schul-Layer initial anzeigen

  // ÖPNV-Haltestellen (PMTiles aus der unfallkarte-Pipeline, ersetzt die Overpass-Livesuche)
  PLATFORMS_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/platforms.pmtiles", // leer = Toggle ausblenden
  PLATFORMS_LAYER_NAME: "germany_osm_platforms", // Source-Layer im PMTiles
  PLATFORMS_LAYER_VISIBLE: false // Haltestellen-Layer initial anzeigen
};

/**
 * Prüft ob der "Zielpunkte merken" Modus aktiv ist
 * @returns {boolean} - true wenn aktiv, false sonst
 */
export function isRememberMode() {
  return CONFIG.REMEMBER_TARGETS === true;
}

