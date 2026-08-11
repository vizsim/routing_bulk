// ==== Map-Renderer: Karten-Rendering (MapLibre GL) ====
// Koordinaten-Konvention: App-intern [lat, lng] (GraphHopper/Geo), an der
// MapLibre-Grenze wird nach [lng, lat] konvertiert (toLngLat).
// Zoom-Konvention: CONFIG-Zoomwerte sind Leaflet-Zoom (256px-Tiles); MapLibre
// rechnet auf 512px-Basis, daher an der Grenze -1 (ZOOM_OFFSET).
import { Map as MapLibreMap, NavigationControl, Popup, addProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre lädt seinen Web-Worker über eine zur Laufzeit gebaute URL, die weder
// Vite-Dev noch der Rollup-Build auflösen kann. Der ?worker&url-Import lässt
// Vite den Worker als eigenes Bundle bauen und liefert dessen fertige URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

setWorkerUrl(maplibreWorkerUrl);
import { CONFIG } from '../core/config.js';
import { EventBus, Events } from '../core/events.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';

/** Attribution für Einwohner-Layer (Zensus/Destatis), wird in Karten-Attribution eingeblendet wenn Layer aktiv. */
export const POPULATION_ATTRIBUTION = '© <a href="https://atlas.zensus2022.de/" target="_blank" rel="noopener">Statistisches Bundesamt (Destatis)</a>';

/** Attribution für OSM-Datenlayer (Schulen, Haltestellen) aus der unfallkarte-Pipeline. */
export const OSM_LAYER_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL)';

const PLATFORM_COLOR = '#10b981';      // ÖPNV-Haltestellen: Grün
const SCHOOL_COLOR = '#2563eb';        // Schulen: kräftiges Blau
const KINDERGARTEN_COLOR = '#60a5fa';  // Kindergärten: helleres Blau (noch kontrastreich auf Weiß)

// Schul-Glyphe (gekreuzte Stifte, aus der alten Overpass-Darstellung übernommen), 512er-viewBox
const SCHOOL_GLYPH_PATH = 'M463.313,346.29c-0.758-2.274-2.224-4.747-4.085-6.608l-83.683-83.682l131.503-131.502c6.603-6.603,6.603-17.307,0-23.909 L411.411,4.952C408.241,1.782,403.941,0,399.456,0s-8.785,1.782-11.954,4.952 c-4.677,4.677-123.793,123.793-131.502,131.502l-71.724-71.725c-0.001-0.001-0.002-0.002-0.003-0.005 c-0.001-0.002-0.002-0.002-0.005-0.003l-47.815-47.815c-19.819-19.821-51.904-19.826-71.727,0L16.908,64.726 c-19.776,19.775-19.776,51.952,0,71.727l119.547,119.547C134.263,258.19,16.761,375.691,4.952,387.5 c-6.603,6.603-6.603,17.307,0,23.909l95.637,95.639c3.171,3.17,7.47,4.952,11.954,4.952s8.785-1.782,11.954-4.952 l131.502-131.502l83.682,83.682c1.853,1.853,4.317,3.322,6.608,4.085l143.456,47.818c6.058,2.02,12.762,0.455,17.301-4.085 c4.529-4.528,6.11-11.226,4.085-17.301L463.313,346.29z M303.82,136.453l23.909,23.91c3.301,3.301,7.628,4.952,11.954,4.952 s8.654-1.651,11.954-4.952c6.603-6.601,6.603-17.307,0-23.909l-23.909-23.909l23.909-23.909l23.91,23.909 c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.65,11.954-4.952c6.603-6.603,6.603-17.307,0-23.909l-23.909-23.909 l23.909-23.909l71.728,71.728L351.638,232.09l-71.728-71.728L303.82,136.453z M423.366,351.637l-23.91,23.91L148.408,124.499 l23.909-23.909L423.366,351.637z M76.681,148.408l-35.864-35.864c-6.591-6.592-6.591-17.318,0-23.909l47.819-47.819 c6.607-6.606,17.301-6.609,23.909,0l35.864,35.864C145.133,79.956,79.944,145.145,76.681,148.408z M112.545,471.183l-71.728-71.728 l23.91-23.909l23.909,23.91c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.651,11.954-4.952c6.603-6.601,6.603-17.307,0-23.909 l-23.908-23.91l23.909-23.909l23.91,23.909c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.65,11.954-4.952 c6.603-6.603,6.603-17.307,0-23.909l-23.91-23.909l23.909-23.909l71.728,71.728L112.545,471.183z M351.637,423.366L100.59,172.317 l23.909-23.909l251.048,251.048L351.637,423.366z M382.935,439.886l56.952-56.952l28.475,85.427L382.935,439.886z';

// Kindergarten-Glyphe: Bauklötze (Kreis, Quadrat, Dreieck), 24er-viewBox
const KINDERGARTEN_GLYPH = `
    <circle cx="12" cy="6.2" r="4.2"/>
    <rect x="2.5" y="13" width="8.5" height="8.5" rx="1"/>
    <path d="M17.2 12.6 L22 21.5 L12.4 21.5 Z"/>`;

// Bus-Glyphe (24er-viewBox)
const PLATFORM_GLYPH = `
    <path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>`;

/**
 * Badge-Icon (weißer Kreis, farbiger Rand + Glyphe) als SVG-String, 64px.
 * Eine Quelle für Karten-Icon UND Legenden-Symbol.
 * @param {string} color - Rand-/Glyphenfarbe
 * @param {string} glyph - SVG-Inhalt der Glyphe
 * @param {number} viewBox - Koordinatensystem der Glyphe (24 oder 512)
 */
export function badgeSvg(color, glyph, viewBox = 24) {
  const scale = 30 / viewBox; // Glyphe auf ~30px im 64px-Badge
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="29" fill="white" stroke="${color}" stroke-width="5"/>
  <g transform="translate(17, 17) scale(${scale})" fill="${color}">${glyph}
  </g>
</svg>`;
}

/** Legenden-Einträge: id -> [{ color, glyph, viewBox, label }] */
const LAYER_LEGENDS = {
  'schools-legend': [
    { color: SCHOOL_COLOR, glyph: `<path d="${SCHOOL_GLYPH_PATH}"/>`, viewBox: 512, label: 'Schule' },
    { color: KINDERGARTEN_COLOR, glyph: KINDERGARTEN_GLYPH, viewBox: 24, label: 'Kindergarten' }
  ],
  'platforms-legend': [
    { color: PLATFORM_COLOR, glyph: PLATFORM_GLYPH, viewBox: 24, label: 'ÖPNV-Haltestelle' }
  ]
};

/** Bild-URL eines Badges (data:-URI, für addImage und Legende) */
function badgeUrl(color, glyph, viewBox) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(color, glyph, viewBox))}`;
}

// pmtiles://-Protokoll einmalig registrieren
const _pmtilesProtocol = new Protocol();
addProtocol('pmtiles', _pmtilesProtocol.tile);

/** Leaflet-Zoom (CONFIG) -> MapLibre-Zoom */
const ZOOM_OFFSET = 1;

/** Ab diesem MapLibre-Zoom tragen auch Flächen (Gelände, Bahnsteige) ein Badge. */
const POLYGON_ICON_MINZOOM = 13;

/** [lat,lng]-Array oder {lat,lng}-Objekt -> [lng,lat] für MapLibre */
export function toLngLat(pos) {
  if (Array.isArray(pos)) return [pos[1], pos[0]];
  return [pos.lng, pos.lat];
}

export const MapRenderer = {
  _map: null,
  _ready: false,

  // Routen als eine GeoJSON-Source (einzeln) + eine Source (aggregiert)
  _routeFeatures: new Map(), // featureId -> GeoJSON-Feature
  _routeIdCounter: 1,
  _aggFeatures: [],

  _hoverPopup: null,
  _populationHoverHandlers: null,

  /**
   * Initialisiert die Karte
   */
  init() {
    const map = new MapLibreMap({
      container: 'map',
      style: CONFIG.BASEMAP_STYLE_URL,
      center: toLngLat(CONFIG.MAP_CENTER),
      zoom: CONFIG.MAP_ZOOM - ZOOM_OFFSET,
      maxZoom: 19 - ZOOM_OFFSET,
      // Permalink: MapLibre schreibt #zoom/lat/lng in die URL und stellt den
      // Ausschnitt beim Laden daraus wieder her (center/zoom oben sind dann nur
      // Fallback ohne Hash). Gleiches Format wie svz/unfallkarte.
      hash: true,
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false
    });
    map.touchZoomRotate.disableRotation();

    // Zoom-Control unten links (wie zuvor)
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');

    this._map = map;
    State.setMap(map);
    // Debug-Zugriff (Konsole/Tests)
    window.__map = map;
    window.__state = State;

    // Wiederverwendetes Hover-Popup (Routen, Aggregation, Einwohner)
    this._hoverPopup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10
    });

    map.on('click', (e) => {
      EventBus.emit(Events.MAP_CLICK, { latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng } });
    });

    map.on('load', () => {
      this._ready = true;
      this._initRouteSources();
      this._initSchoolsLayer();
      this._initPlatformsLayer();
      this._initRouteHover();
      if (CONFIG.POPULATION_LAYER_VISIBLE) this.setPopulationLayerVisible(true);
    });

    // Kontextmenü initialisieren
    this._initContextMenu();

    // Einwohner-Bereich (Startpunkte gewichten + Layer anzeigen)
    this._initPopulationUI();

    // Layer-Toggles (Schulen, Haltestellen)
    this._initSchoolsToggle();
    this._initPlatformsToggle();

    EventBus.emit(Events.MAP_READY);
  },

  // ---- Routen-Sources: eine Source für Einzelrouten, eine für Aggregation ----

  _initRouteSources() {
    const map = this._map;
    // Eigene Layer unter die Basemap-Beschriftungen einordnen (erster Symbol-Layer)
    const labelLayerId = (map.getStyle().layers || []).find(l => l.type === 'symbol')?.id;
    this._labelLayerId = labelLayerId;
    map.addSource('agg-routes', { type: 'geojson', data: this._emptyFC() });
    map.addLayer({
      id: 'agg-lines',
      type: 'line',
      source: 'agg-routes',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'count'] // hohe Counts oben zeichnen
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'weight'],
        'line-opacity': ['get', 'opacity']
      }
    }, labelLayerId);
    map.addSource('routes', { type: 'geojson', data: this._emptyFC() });
    map.addLayer({
      id: 'routes-line',
      type: 'line',
      source: 'routes',
      // Fußweg-Legs der ÖPNV-Routen zeichnet der gestrichelte Layer darunter
      filter: ['!=', ['coalesce', ['get', 'legMode'], ''], 'WALK'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.8
      }
    }, labelLayerId);
    // Fußweg-Legs (ÖPNV, Beta) gestrichelt
    map.addLayer({
      id: 'routes-line-walk',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'legMode'], 'WALK'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.9,
        'line-dasharray': [1.5, 1.5]
      }
    }, labelLayerId);
  },

  _emptyFC() {
    return { type: 'FeatureCollection', features: [] };
  },

  // Gebatcht: beim progressiven Zeichnen kommen viele Features kurz
  // hintereinander an — ein setData pro ~50ms statt eines pro Feature.
  // Der Flush liest den Live-Zustand, späte Flushes sind daher immer konsistent.
  _routeRefreshTimer: null,
  _refreshRouteSource() {
    if (this._routeRefreshTimer) return;
    this._routeRefreshTimer = setTimeout(() => {
      this._routeRefreshTimer = null;
      const src = this._ready && this._map && this._map.getSource('routes');
      if (src) src.setData({ type: 'FeatureCollection', features: [...this._routeFeatures.values()] });
    }, 50);
  },

  _refreshAggSource() {
    const src = this._ready && this._map.getSource('agg-routes');
    if (src) src.setData({ type: 'FeatureCollection', features: this._aggFeatures });
  },

  /**
   * Fügt eine Einzelroute als Feature hinzu.
   * @param {Array} coordsLngLat - [[lng,lat], ...]
   * @param {Object} props - Feature-Properties (color, label, ...)
   * @returns {number} Feature-ID (Handle zum Entfernen)
   */
  addRouteFeature(coordsLngLat, props) {
    const id = this._routeIdCounter++;
    this._routeFeatures.set(id, {
      type: 'Feature',
      id,
      properties: props,
      geometry: { type: 'LineString', coordinates: coordsLngLat }
    });
    this._refreshRouteSource();
    return id;
  },

  /**
   * Setzt die aggregierten Segmente (ersetzt den kompletten Layer-Inhalt).
   * @param {Array} features - GeoJSON-Features mit {color, weight, opacity, count, label}
   */
  setAggregatedFeatures(features) {
    this._aggFeatures = features;
    this._refreshAggSource();
  },

  /**
   * Entfernt Einzelrouten anhand ihrer Feature-IDs (Handles aus drawRoute).
   * ÖPNV-Routen haben ein Array von IDs (ein Feature pro Leg).
   * @param {Array<number|Array<number>>} ids
   */
  removePolylines(ids) {
    if (!ids) return;
    let changed = false;
    ids.forEach(entry => {
      const list = Array.isArray(entry) ? entry : [entry];
      list.forEach(id => {
        if (id != null && this._routeFeatures.delete(id)) changed = true;
      });
    });
    if (changed) this._refreshRouteSource();
  },

  /**
   * Entfernt alle Routen (einzeln + aggregiert).
   */
  clearRoutes() {
    this._routeFeatures.clear();
    this._aggFeatures = [];
    this._refreshRouteSource();
    this._refreshAggSource();
  },

  // Hover-Tooltips für Routen (Routenlänge) und Aggregation (Anzahl Routen)
  _initRouteHover() {
    const map = this._map;
    const show = (className) => (e) => {
      const f = e.features && e.features[0];
      const label = f && f.properties && f.properties.label;
      if (!label) return;
      const el = this._hoverPopup;
      el.removeClassName?.('route-distance-tooltip');
      el.removeClassName?.('aggregated-route-tooltip');
      el.removeClassName?.('population-tooltip');
      el.setLngLat(e.lngLat).setText(label).addTo(map);
      el.addClassName?.(className);
    };
    const hide = () => this._hoverPopup.remove();
    map.on('mousemove', 'routes-line', show('route-distance-tooltip'));
    map.on('mouseleave', 'routes-line', hide);
    map.on('mousemove', 'routes-line-walk', show('route-distance-tooltip'));
    map.on('mouseleave', 'routes-line-walk', hide);
    map.on('mousemove', 'agg-lines', show('aggregated-route-tooltip'));
    map.on('mouseleave', 'agg-lines', hide);
  },

  // ---- Layer-Icons & Legenden ----

  /** Lädt ein Badge-Icon in die Karte (idempotent). */
  _addBadgeImage(name, color, glyph, viewBox) {
    const map = this._map;
    if (map.hasImage(name)) return;
    const img = new Image(64, 64);
    img.onload = () => {
      if (!map.hasImage(name)) map.addImage(name, img);
    };
    img.src = badgeUrl(color, glyph, viewBox);
  },

  /**
   * Füllt einen Legenden-Block mit Symbol + Beschriftung und zeigt/versteckt ihn.
   * Symbole stammen aus derselben SVG-Quelle wie die Karten-Icons.
   */
  _setLayerLegendVisible(legendId, visible) {
    const el = document.getElementById(legendId);
    if (!el) return;
    if (visible && !el.dataset.filled) {
      el.innerHTML = (LAYER_LEGENDS[legendId] || []).map(item => `
        <div class="layer-legend-row">
          <img class="layer-legend-icon" src="${badgeUrl(item.color, item.glyph, item.viewBox)}" alt="" />
          <span>${item.label}</span>
        </div>`).join('');
      el.dataset.filled = '1';
    }
    el.style.display = visible ? 'block' : 'none';
  },

  // ---- Schul-Layer (PMTiles aus der unfallkarte-Pipeline, ersetzt Overpass) ----

  _initSchoolsLayer() {
    const url = CONFIG.SCHOOLS_PMTILES_URL && CONFIG.SCHOOLS_PMTILES_URL.trim();
    if (!url) return;
    const map = this._map;
    const srcLayer = CONFIG.SCHOOLS_LAYER_NAME || 'germany_osm_schools';
    const visibility = CONFIG.SCHOOLS_LAYER_VISIBLE ? 'visible' : 'none';

    map.addSource('schools', {
      type: 'vector',
      url: `pmtiles://${url}`,
      attribution: OSM_LAYER_ATTRIBUTION
    });

    // Badge-Icons laden: Schule (Stifte, kräftiges Blau), Kindergarten (Bauklötze, helles Blau)
    this._addBadgeImage('school-icon', SCHOOL_COLOR, `<path d="${SCHOOL_GLYPH_PATH}"/>`, 512);
    this._addBadgeImage('kindergarten-icon', KINDERGARTEN_COLOR, KINDERGARTEN_GLYPH, 24);

    // Farbe nach Typ (amenity=school | kindergarten)
    const colorByType = ['match', ['get', 'amenity'], 'kindergarten', KINDERGARTEN_COLOR, SCHOOL_COLOR];

    // Polygone (Schulgelände) unter den Routen einordnen
    map.addLayer({
      id: 'schools-fill',
      type: 'fill',
      source: 'schools',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility },
      paint: { 'fill-color': colorByType, 'fill-opacity': 0.18 }
    }, 'agg-lines');
    map.addLayer({
      id: 'schools-outline',
      type: 'line',
      source: 'schools',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility },
      paint: { 'line-color': colorByType, 'line-width': 1.5, 'line-opacity': 0.7 }
    }, 'agg-lines');
    const iconByType = ['match', ['get', 'amenity'], 'kindergarten', 'kindergarten-icon', 'school-icon'];
    // Icon-Bild ist 64px; Zielgröße ~10px (Zoom 9) bis ~36px (Zoom 17)
    const iconSize = ['interpolate', ['linear'], ['zoom'], 9, 10 / 64, 13, 24 / 64, 17, 36 / 64];

    // Punkte über den Routen (klickbar), Badge-Icon nach Typ
    map.addLayer({
      id: 'schools-points',
      type: 'symbol',
      source: 'schools',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { visibility, 'icon-image': iconByType, 'icon-size': iconSize }
    });
    // Gelände-Polygone bekommen ab hohem Zoom dasselbe Badge im Flächen-Schwerpunkt.
    // Ohne icon-allow-overlap verdrängen sich Punkt- und Polygon-Badge gegenseitig —
    // gewünscht, wenn eine Einrichtung als Node UND als Fläche gemappt ist.
    map.addLayer({
      id: 'schools-polygon-icons',
      type: 'symbol',
      source: 'schools',
      'source-layer': srcLayer,
      minzoom: POLYGON_ICON_MINZOOM,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility, 'icon-image': iconByType, 'icon-size': iconSize }
    });

    // Klick-Popup mit Name/Typ
    const onClick = (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const p = f.properties || {};
      const typ = p.amenity === 'kindergarten' ? 'Kindergarten' : 'Schule';
      const name = p.name || `Unbenannte ${typ === 'Kindergarten' ? 'Einrichtung' : 'Schule'}`;
      new Popup({ closeButton: true, className: 'school-popup', maxWidth: '250px' })
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${Utils.escapeHtml(name)}</strong><br>${typ}`)
        .addTo(this._map);
    };
    ['schools-points', 'schools-polygon-icons', 'schools-fill'].forEach(layerId => {
      map.on('click', layerId, onClick);
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });
  },

  /**
   * Zeigt die in der Gebietsanalyse gefundenen Einrichtungen als Badge-Icons
   * (unabhängig vom deutschlandweiten Schul-Layer, der ein Toggle bleibt).
   * Nutzt die beim Schul-Layer registrierten Icon-Bilder.
   */
  setAnalysisFacilities(facilities) {
    const map = this._ready && this._map;
    if (!map) return;
    const data = {
      type: 'FeatureCollection',
      features: (facilities || []).map(f => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        properties: {
          amenity: f.type === 'kindergarten' ? 'kindergarten' : 'school',
          name: f.name
        }
      }))
    };
    const src = map.getSource('analysis-facilities');
    if (src) { src.setData(data); return; }
    map.addSource('analysis-facilities', { type: 'geojson', data });
    map.addLayer({
      id: 'analysis-facility-icons',
      type: 'symbol',
      source: 'analysis-facilities',
      layout: {
        'icon-image': ['match', ['get', 'amenity'], 'kindergarten', 'kindergarten-icon', 'school-icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 10 / 64, 13, 24 / 64, 17, 36 / 64],
        'icon-allow-overlap': true
      }
    });
    map.on('click', 'analysis-facility-icons', (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const p = f.properties || {};
      const typ = p.amenity === 'kindergarten' ? 'Kindergarten' : 'Schule';
      new Popup({ closeButton: true, className: 'school-popup', maxWidth: '250px' })
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${Utils.escapeHtml(p.name || typ)}</strong><br>${typ}`)
        .addTo(this._map);
    });
    map.on('mouseenter', 'analysis-facility-icons', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'analysis-facility-icons', () => { map.getCanvas().style.cursor = ''; });
  },

  clearAnalysisFacilities() {
    this.setAnalysisFacilities([]);
  },

  setSchoolsLayerVisible(visible) {
    this._setLayerLegendVisible('schools-legend', visible);
    if (!this._ready) {
      this._map?.once('load', () => this.setSchoolsLayerVisible(visible));
      return;
    }
    const value = visible ? 'visible' : 'none';
    ['schools-fill', 'schools-outline', 'schools-points', 'schools-polygon-icons'].forEach(id => {
      if (this._map.getLayer(id)) this._map.setLayoutProperty(id, 'visibility', value);
    });
  },

  _initSchoolsToggle() {
    const checkbox = Utils.getElement('#config-schools-visible');
    if (!checkbox) return;
    if (!(CONFIG.SCHOOLS_PMTILES_URL && CONFIG.SCHOOLS_PMTILES_URL.trim())) {
      const group = checkbox.closest('.config-group');
      if (group) group.style.display = 'none';
      return;
    }
    checkbox.checked = !!CONFIG.SCHOOLS_LAYER_VISIBLE;
    this._setLayerLegendVisible('schools-legend', checkbox.checked);
    checkbox.addEventListener('change', () => {
      CONFIG.SCHOOLS_LAYER_VISIBLE = checkbox.checked;
      this.setSchoolsLayerVisible(checkbox.checked);
    });
  },

  // ---- ÖPNV-Haltestellen (PMTiles aus der unfallkarte-Pipeline, ersetzt Overpass) ----

  _initPlatformsLayer() {
    const url = CONFIG.PLATFORMS_PMTILES_URL && CONFIG.PLATFORMS_PMTILES_URL.trim();
    if (!url) return;
    const map = this._map;
    const srcLayer = CONFIG.PLATFORMS_LAYER_NAME || 'germany_osm_platforms';
    const visibility = CONFIG.PLATFORMS_LAYER_VISIBLE ? 'visible' : 'none';

    map.addSource('platforms', {
      type: 'vector',
      url: `pmtiles://${url}`,
      attribution: OSM_LAYER_ATTRIBUTION
    });

    // Bus-Badge einmalig als Rasterbild laden
    this._addBadgeImage('platform-icon', PLATFORM_COLOR, PLATFORM_GLYPH, 24);

    // Bahnsteig-Flächen und lineare Bahnsteige unter den Routen
    map.addLayer({
      id: 'platforms-fill',
      type: 'fill',
      source: 'platforms',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility },
      paint: { 'fill-color': PLATFORM_COLOR, 'fill-opacity': 0.3 }
    }, 'agg-lines');
    map.addLayer({
      id: 'platforms-outline',
      type: 'line',
      source: 'platforms',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility },
      paint: { 'line-color': PLATFORM_COLOR, 'line-width': 1.5, 'line-opacity': 0.8 }
    }, 'agg-lines');
    map.addLayer({
      id: 'platforms-line',
      type: 'line',
      source: 'platforms',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { visibility, 'line-cap': 'round' },
      paint: { 'line-color': PLATFORM_COLOR, 'line-width': 3, 'line-opacity': 0.8 }
    }, 'agg-lines');
    // Icon-Bild ist 64px; Zielgröße ~10px (Zoom 9) bis ~36px (Zoom 17)
    const iconSize = ['interpolate', ['linear'], ['zoom'], 9, 10 / 64, 13, 24 / 64, 17, 36 / 64];

    // Punkte (Haltestellen-Badges) über den Routen; MapLibre blendet
    // kollidierende Icons bei niedrigen Zooms automatisch aus
    map.addLayer({
      id: 'platforms-points',
      type: 'symbol',
      source: 'platforms',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { visibility, 'icon-image': 'platform-icon', 'icon-size': iconSize }
    });
    // Bahnsteig-Flächen und -Linien bekommen ab hohem Zoom dasselbe Badge
    // (Schwerpunkt der Fläche bzw. Mitte der Linie)
    map.addLayer({
      id: 'platforms-polygon-icons',
      type: 'symbol',
      source: 'platforms',
      'source-layer': srcLayer,
      minzoom: POLYGON_ICON_MINZOOM,
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'LineString']],
      layout: { visibility, 'icon-image': 'platform-icon', 'icon-size': iconSize }
    });

    // Klick-Popup mit Name/Netzwerk/Betreiber
    const esc = (v) => Utils.escapeHtml(v);
    const onClick = (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const p = f.properties || {};
      let html = `<strong>${esc(p.name || 'Unbenannte Haltestelle')}</strong>`;
      if (p.network) html += `<br>Netzwerk: ${esc(p.network)}`;
      if (p.operator) html += `<br>Betreiber: ${esc(p.operator)}`;
      if (p.tram === 'yes') html += '<br>Straßenbahn: Ja';
      if (p.bus === 'yes' || p.highway === 'bus_stop') html += '<br>Bus: Ja';
      if (p.train === 'yes' || p.railway) html += '<br>Bahn: Ja';
      new Popup({ closeButton: true, className: 'platform-popup', maxWidth: '250px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(this._map);
    };
    ['platforms-points', 'platforms-polygon-icons', 'platforms-fill', 'platforms-line'].forEach(layerId => {
      map.on('click', layerId, onClick);
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });
  },

  setPlatformsLayerVisible(visible) {
    this._setLayerLegendVisible('platforms-legend', visible);
    if (!this._ready) {
      this._map?.once('load', () => this.setPlatformsLayerVisible(visible));
      return;
    }
    const value = visible ? 'visible' : 'none';
    ['platforms-fill', 'platforms-outline', 'platforms-line', 'platforms-points', 'platforms-polygon-icons'].forEach(id => {
      if (this._map.getLayer(id)) this._map.setLayoutProperty(id, 'visibility', value);
    });
  },

  _initPlatformsToggle() {
    const checkbox = Utils.getElement('#config-platforms-visible');
    if (!checkbox) return;
    if (!(CONFIG.PLATFORMS_PMTILES_URL && CONFIG.PLATFORMS_PMTILES_URL.trim())) {
      const group = checkbox.closest('.config-group');
      if (group) group.style.display = 'none';
      return;
    }
    checkbox.checked = !!CONFIG.PLATFORMS_LAYER_VISIBLE;
    this._setLayerLegendVisible('platforms-legend', checkbox.checked);
    checkbox.addEventListener('change', () => {
      CONFIG.PLATFORMS_LAYER_VISIBLE = checkbox.checked;
      this.setPlatformsLayerVisible(checkbox.checked);
    });
  },

  // ---- Einwohner-Layer (PMTiles-Vector-Source mit data-driven Einfärbung) ----

  /**
   * Zeigt oder versteckt den optionalen Einwohner-PMTiles-Layer.
   * @param {boolean} visible - true = Layer anzeigen, false = entfernen
   */
  setPopulationLayerVisible(visible) {
    if (!this._map) return;
    const url = CONFIG.POPULATION_PMTILES_URL && CONFIG.POPULATION_PMTILES_URL.trim();
    if (!url) return;
    if (!this._ready) {
      this._map.once('load', () => {
        const checkbox = document.getElementById('config-population-layer-visible');
        if (!checkbox || checkbox.checked === visible) this.setPopulationLayerVisible(visible);
      });
      return;
    }
    const map = this._map;

    if (visible) {
      this._setPopulationLegendVisible(true);
      if (map.getSource('population')) return;

      const propName = (CONFIG.POPULATION_PROPERTY && CONFIG.POPULATION_PROPERTY.trim()) || 'Einwohner';
      const layerName = (CONFIG.POPULATION_LAYER_NAME && CONFIG.POPULATION_LAYER_NAME.trim()) || 'default';

      // Gleiche Formel wie Legende: ratio = min(1, pow(log(1+pop)/log(2001), 0.7))
      const pop = ['max', 0, ['to-number', ['get', propName], 0]];
      const ratio = ['min', 1, ['^', ['/', ['ln', ['+', 1, pop]], Math.log(1 + 2000)], 0.7]];
      const fillColor = ['let', 'r', ratio, ['rgba',
        ['round', ['-', 255, ['*', ['var', 'r'], 245]]],
        ['round', ['-', 255, ['*', ['var', 'r'], 205]]],
        ['round', ['-', 255, ['*', ['var', 'r'], 135]]],
        ['+', 0.06, ['*', ['var', 'r'], 0.44]]
      ]];
      const strokeColor = ['let', 'r', ratio, ['rgba',
        ['round', ['-', 200, ['*', ['var', 'r'], 80]]],
        ['round', ['-', 220, ['*', ['var', 'r'], 100]]],
        ['round', ['-', 240, ['*', ['var', 'r'], 100]]],
        0.12
      ]];

      map.addSource('population', {
        type: 'vector',
        url: `pmtiles://${url}`,
        attribution: POPULATION_ATTRIBUTION
      });
      // Unter Routen/Schulen einordnen (erster eigener Layer über der Basemap)
      const beforeId = map.getLayer('schools-fill') ? 'schools-fill' : (map.getLayer('agg-lines') ? 'agg-lines' : undefined);
      map.addLayer({
        id: 'population-fill',
        type: 'fill',
        source: 'population',
        'source-layer': layerName,
        paint: { 'fill-color': fillColor, 'fill-outline-color': strokeColor }
      }, beforeId);

      this._attachPopulationHover(propName);
    } else {
      this._setPopulationLegendVisible(false);
      this._detachPopulationHover();
      if (map.getLayer('population-fill')) map.removeLayer('population-fill');
      if (map.getSource('population')) map.removeSource('population');
    }
  },

  _attachPopulationHover(propName) {
    if (this._populationHoverHandlers) return;
    const map = this._map;
    const onMove = (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      let v = f.properties ? (f.properties[propName] ?? f.properties[propName.toLowerCase()]) : null;
      if (typeof v === 'string') v = parseFloat(v);
      if (v == null || Number.isNaN(v)) { this._hoverPopup.remove(); return; }
      const el = this._hoverPopup;
      el.removeClassName?.('route-distance-tooltip');
      el.removeClassName?.('aggregated-route-tooltip');
      el.setLngLat(e.lngLat).setText(`Einwohner: ${v}`).addTo(map);
      el.addClassName?.('population-tooltip');
    };
    const onLeave = () => this._hoverPopup.remove();
    map.on('mousemove', 'population-fill', onMove);
    map.on('mouseleave', 'population-fill', onLeave);
    this._populationHoverHandlers = { onMove, onLeave };
  },

  _detachPopulationHover() {
    if (!this._populationHoverHandlers || !this._map) return;
    this._map.off('mousemove', 'population-fill', this._populationHoverHandlers.onMove);
    this._map.off('mouseleave', 'population-fill', this._populationHoverHandlers.onLeave);
    this._populationHoverHandlers = null;
    this._hoverPopup.remove();
  },

  // Einwohner-Layer (Kartenebene). Die Gewichtung der Startpunkte gehört zum
  // Nachfragemodell und wird im DemandSelector behandelt.
  _initPopulationUI() {
    const layerGroup = Utils.getElement('#population-layer-group');
    const weightGroup = Utils.getElement('#population-weight-group');
    const layerCheckbox = Utils.getElement('#config-population-layer-visible');

    if (!(CONFIG.POPULATION_PMTILES_URL && CONFIG.POPULATION_PMTILES_URL.trim())) {
      if (layerGroup) layerGroup.style.display = 'none';
      if (weightGroup) weightGroup.style.display = 'none';
      return;
    }

    this._renderPopulationLegend();
    this._setPopulationLegendVisible(!!CONFIG.POPULATION_LAYER_VISIBLE);
    if (layerCheckbox) {
      layerCheckbox.checked = !!CONFIG.POPULATION_LAYER_VISIBLE;
      layerCheckbox.addEventListener('change', () => {
        CONFIG.POPULATION_LAYER_VISIBLE = layerCheckbox.checked;
        this.setPopulationLayerVisible(CONFIG.POPULATION_LAYER_VISIBLE);
      });
    }
  },

  _renderPopulationLegend() {
    const el = document.getElementById('population-legend');
    if (!el) return;
    const ticks = [0, 10, 50, 100, 500, 2000];
    const popToRatio = function (pop) {
      return Math.min(1, Math.pow(Math.log(1 + Math.max(0, pop)) / Math.log(1 + 2000), 0.7));
    };
    // Gleiche Alpha-Formel wie beim Einwohner-Layer (transparenter Bereich)
    const populationAlpha = function (ratio) { return 0.06 + ratio * 0.44; };
    const fillForPop = function (pop) {
      const ratio = popToRatio(pop);
      const r = Math.round(255 - ratio * 245);
      const g = Math.round(255 - ratio * 205);
      const b = Math.round(255 - ratio * 135);
      const a = populationAlpha(ratio);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    };
    let html = '<div class="population-legend-bar">';
    ticks.forEach(function (v) {
      html += '<span class="population-legend-segment" style="background:' + fillForPop(v) + '" title="' + v + '"></span>';
    });
    html += '</div><div class="population-legend-labels">';
    ticks.forEach(function (v) {
      html += '<span class="population-legend-tick">' + v + '</span>';
    });
    html += '</div>';
    el.innerHTML = html;
    el.setAttribute('aria-hidden', 'false');
  },

  _setPopulationLegendVisible(visible) {
    const el = document.getElementById('population-legend');
    if (!el) return;
    el.style.display = visible ? 'block' : 'none';
  },

  // ---- Kontextmenü ----

  /**
   * Initialisiert das Rechtsklick-Kontextmenü
   */
  _initContextMenu() {
    const contextMenu = Utils.getElement('#context-menu');
    if (!contextMenu) return;

    let contextMenuLatLng = null;

    // Rechtsklick auf Karte
    this._map.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();

      contextMenuLatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };

      // Menü-Position an Mausposition setzen (Menü ist position:fixed)
      contextMenu.style.left = `${e.originalEvent.clientX}px`;
      contextMenu.style.top = `${e.originalEvent.clientY}px`;
      contextMenu.style.display = 'block';

      // Links mit aktuellen Koordinaten aktualisieren
      const lat = contextMenuLatLng.lat;
      const lng = contextMenuLatLng.lng;
      // OSM-Link erwartet Leaflet-Zoomsemantik (+ZOOM_OFFSET)
      const zoom = Math.round(this._map.getZoom()) + ZOOM_OFFSET;
      const osmQueryLink = Utils.getElement('#context-menu-osm-query');
      if (osmQueryLink) {
        osmQueryLink.href = `https://www.openstreetmap.org/query?lat=${lat}&lon=${lng}#map=${zoom}/${lat}/${lng}`;
      }
    });

    // Zielpunkt setzen
    const setEndBtn = Utils.getElement('#context-menu-set-end');
    if (setEndBtn) {
      setEndBtn.addEventListener('click', () => {
        if (contextMenuLatLng) {
          contextMenu.style.display = 'none';
          // Zielpunkt setzen (wie normaler Klick)
          EventBus.emit(Events.MAP_CLICK, { latlng: contextMenuLatLng });
        }
      });
    }

    // Menü schließen bei Klick außerhalb
    document.addEventListener('click', (e) => {
      if (contextMenu && !contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
      }
      // Auch Zielpunkt-Kontextmenü schließen
      const targetContextMenu = Utils.getElement('#target-context-menu');
      if (targetContextMenu && !targetContextMenu.contains(e.target)) {
        targetContextMenu.style.display = 'none';
      }
    });

    // Menü schließen bei ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (contextMenu) {
          contextMenu.style.display = 'none';
        }
        const targetContextMenu = Utils.getElement('#target-context-menu');
        if (targetContextMenu) {
          targetContextMenu.style.display = 'none';
        }
      }
    });
  },

  /**
   * Gibt die Karte zurück
   */
  getMap() {
    return this._map;
  },

  /**
   * Löscht Routen und Start-/Zielpunkt-Marker; Haltestellen und Schul-Layer bleiben.
   * (Name aus der Leaflet-Zeit beibehalten — Aufrufer erwarten diese Semantik.)
   */
  clearLayersExceptSchools() {
    this.clearRoutes();

    (State.getStartMarkers() || []).forEach(m => m && m.remove());
    State.setStartMarkers([]);

    (State.getTargetMarkers() || []).forEach(m => m && m.remove());
    State.setTargetMarkers([]);

    const current = State.getCurrentTargetMarker();
    if (current) current.remove();
    State.setCurrentTargetMarker(null);
  }
};
