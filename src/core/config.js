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

  // Gebietsanalyse (experimentell): max. Routen je Einrichtung×Modus.
  // Jede Route trägt das Gewicht Wege/Stichprobe; die Aggregation
  // summiert Gewichte. Alle Requests gehen an den eigenen GH-Server.
  ANALYSIS_MAX_SAMPLE: 150,
  PROFILE: "foot", // anpassen (z.B. "foot", "bike", "bike2", "mtb"...)
  N: 10, // Anzahl der Routen
  ROUTE_CONCURRENCY: 12, // Max. parallele GH-Requests (schont Server; HTTP/1.1-Browserlimit liegt ähnlich)
  RADIUS_M: 2000, // Radius in Metern für Startpunkte
  MAP_CENTER: [52.6858, 14.10078], // [lat, lon]
  MAP_ZOOM: 13,
  AGGREGATED: false, // Aggregierte Darstellung (exakt über GH edge_id, siehe aggregation-service.js)

  // ---- Infrastruktur-Ansicht der aggregierten Darstellung (siehe docs/INFRA_ANSICHT.md) ----
  // Farbe nach Anzahl (Colormap) oder nach Infrastruktur-Klasse; die Linienbreite
  // zeigt in beiden Fällen die Menge.
  COLOR_BY: 'count', // 'count' | 'infra'
  INFRA_MODE: null, // 'foot' | 'bike' | null = aus Profil bzw. Daten ableiten
  INFRA_ATTR: 'guidance', // Merkmal: 'guidance' | 'surface' | 'speed' | 'lit' | 'slope'
  // Path Details je GraphHopper-Profil, zusätzlich zu edge_id. Kennt der Server
  // ein Detail nicht (HTTP 400 "Cannot find the path details"), lässt
  // API.fetchRoute es für die Sitzung weg und fragt erneut — so funktioniert
  // 'backward_sidewalk' automatisch, sobald der Server-Patch läuft, und ohne
  // Patch fällt es einfach weg.
  INFRA_DETAILS: {
    foot: ['sidewalk', 'backward_sidewalk', 'footway', 'road_class', 'max_speed', 'lit', 'crossing',
           'surface', 'smoothness', 'foot_road_access', 'street_name', 'osm_way_id', 'mapillary_coverage'],
    bike: ['bicycle_infra', 'cycleway', 'bike_road_access', 'road_class', 'max_speed', 'lanes',
           'surface', 'smoothness', 'average_slope', 'lit', 'street_name', 'osm_way_id', 'mapillary_coverage'],
    car: []
  },
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

  // Schülerzahlen je Schule für die Gebietsanalyse (index.json + <LAND>.json,
  // erzeugt von preprocessing/schuelerzahlen/build_schuelerzahlen.py).
  // Relativ zur Seite; leer = keine Vorbelegung (Platzhalter je Schultyp).
  SCHOOL_STATS_BASE_URL: "data/schuelerzahlen/",

  // Schulen & Kindergärten (PMTiles aus der unfallkarte-Pipeline, ersetzt die Overpass-Suche)
  SCHOOLS_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/schools.pmtiles", // leer = Toggle ausblenden
  SCHOOLS_LAYER_NAME: "germany_osm_schools", // Source-Layer im PMTiles
  SCHOOLS_LAYER_VISIBLE: false, // Schul-Layer initial anzeigen

  // ÖPNV-Haltestellen (PMTiles aus der unfallkarte-Pipeline, ersetzt die Overpass-Livesuche)
  PLATFORMS_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/platforms.pmtiles", // leer = Toggle ausblenden
  PLATFORMS_LAYER_NAME: "germany_osm_platforms", // Source-Layer im PMTiles
  PLATFORMS_LAYER_VISIBLE: false, // Haltestellen-Layer initial anzeigen

  // Kartenebenen aus der Unfallkarte: dieselben PMTiles, hier zurückhaltender
  // gezeichnet (src/visualization/context-layers.js). Leere URL = Toggle ausblenden.
  ACCIDENTS_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/accidents/accidents_single_mlt.pmtiles", // Unfallatlas, MLT-Kacheln
  ACCIDENTS_LAYER_VISIBLE: false,
  ACCIDENTS_ONLY_BIKE_FOOT: true, // nur Unfälle mit Rad- oder Fußbeteiligung
  CROSSINGS_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/crossings.pmtiles",
  CROSSINGS_LAYER_VISIBLE: false,
  MAXSPEED_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/maxspeed_major.pmtiles", // Hauptstraßen
  MAXSPEED_MINOR_PMTILES_URL: "https://tiles.vizsim.de/file/unfallkarte-data-v2/osm/maxspeed_minor.pmtiles", // Nebenstraßen
  MAXSPEED_LAYER_VISIBLE: false
};

/**
 * Prüft ob der "Zielpunkte merken" Modus aktiv ist
 * @returns {boolean} - true wenn aktiv, false sonst
 */
export function isRememberMode() {
  return CONFIG.REMEMBER_TARGETS === true;
}

