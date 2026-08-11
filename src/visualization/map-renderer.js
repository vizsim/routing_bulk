// ==== Map-Renderer: Karten-Rendering (MapLibre GL) ====
// Koordinaten-Konvention: App-intern [lat, lng] (GraphHopper/Geo), an der
// MapLibre-Grenze wird nach [lng, lat] konvertiert (toLngLat).
// Zoom-Konvention: CONFIG-Zoomwerte sind Leaflet-Zoom (256px-Tiles); MapLibre
// rechnet auf 512px-Basis, daher an der Grenze -1 (ZOOM_OFFSET).
import { Map as MapLibreMap, NavigationControl, Popup, LngLatBounds, addProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre lädt seinen Web-Worker über eine zur Laufzeit gebaute URL, die weder
// Vite-Dev noch der Rollup-Build auflösen kann. Der ?worker&url-Import lässt
// Vite den Worker als eigenes Bundle bauen und liefert dessen fertige URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

setWorkerUrl(maplibreWorkerUrl);
import { CONFIG, isRememberMode } from '../core/config.js';
import { EventBus, Events } from '../core/events.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';
import { OverpassService } from '../services/overpass-service.js';
import { RouteService } from '../services/route-service.js';
import { Visualization } from './visualization.js';

/** Attribution für Einwohner-Layer (Zensus/Destatis), wird in Karten-Attribution eingeblendet wenn Layer aktiv. */
export const POPULATION_ATTRIBUTION = '© <a href="https://atlas.zensus2022.de/" target="_blank" rel="noopener">Statistisches Bundesamt (Destatis)</a>';

/** Attribution für OSM-Datenlayer (Schulen) aus der unfallkarte-Pipeline. */
export const SCHOOLS_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL)';

// pmtiles://-Protokoll einmalig registrieren
const _pmtilesProtocol = new Protocol();
addProtocol('pmtiles', _pmtilesProtocol.tile);

/** Leaflet-Zoom (CONFIG) -> MapLibre-Zoom */
const ZOOM_OFFSET = 1;

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
      this._initRouteHover();
      if (CONFIG.POPULATION_LAYER_VISIBLE) this.setPopulationLayerVisible(true);
    });

    // Kontextmenü initialisieren
    this._initContextMenu();

    // Einwohner-Bereich (Startpunkte gewichten + Layer anzeigen)
    this._initPopulationUI();

    // Schul-Layer-Toggle
    this._initSchoolsToggle();

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
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.8
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
   * @param {Array<number>} ids
   */
  removePolylines(ids) {
    if (!ids) return;
    let changed = false;
    ids.forEach(id => {
      if (id != null && this._routeFeatures.delete(id)) changed = true;
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
    map.on('mousemove', 'agg-lines', show('aggregated-route-tooltip'));
    map.on('mouseleave', 'agg-lines', hide);
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
      attribution: SCHOOLS_ATTRIBUTION
    });
    // Polygone (Schulgelände) unter den Routen einordnen
    map.addLayer({
      id: 'schools-fill',
      type: 'fill',
      source: 'schools',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility },
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.18 }
    }, 'agg-lines');
    map.addLayer({
      id: 'schools-outline',
      type: 'line',
      source: 'schools',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility },
      paint: { 'line-color': '#3b82f6', 'line-width': 1.5, 'line-opacity': 0.7 }
    }, 'agg-lines');
    // Punkte über den Routen (klickbar)
    map.addLayer({
      id: 'schools-points',
      type: 'circle',
      source: 'schools',
      'source-layer': srcLayer,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { visibility },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12, 4.5, 15, 7, 18, 10],
        'circle-color': '#ffffff',
        'circle-stroke-color': '#3b82f6',
        'circle-stroke-width': 2
      }
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
        .setHTML(`<strong>${Utils.escapeHtml ? Utils.escapeHtml(name) : name}</strong><br>${typ}`)
        .addTo(this._map);
    };
    map.on('click', 'schools-points', onClick);
    map.on('click', 'schools-fill', onClick);
    ['schools-points', 'schools-fill'].forEach(layerId => {
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });
  },

  setSchoolsLayerVisible(visible) {
    if (!this._ready) {
      this._map?.once('load', () => this.setSchoolsLayerVisible(visible));
      return;
    }
    const value = visible ? 'visible' : 'none';
    ['schools-fill', 'schools-outline', 'schools-points'].forEach(id => {
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
    checkbox.addEventListener('change', () => {
      CONFIG.SCHOOLS_LAYER_VISIBLE = checkbox.checked;
      this.setSchoolsLayerVisible(checkbox.checked);
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

  _initPopulationUI() {
    const populationWeightGroup = Utils.getElement('#population-weight-group');
    const populationLayerCheckbox = Utils.getElement('#config-population-layer-visible');
    const populationWeightCheckbox = Utils.getElement('#config-population-weight-starts');
    if (CONFIG.POPULATION_PMTILES_URL && CONFIG.POPULATION_PMTILES_URL.trim()) {
      if (populationWeightGroup) populationWeightGroup.style.display = 'block';
      this._renderPopulationLegend();
      this._setPopulationLegendVisible(!!CONFIG.POPULATION_LAYER_VISIBLE);
      if (populationLayerCheckbox) {
        populationLayerCheckbox.checked = !!CONFIG.POPULATION_LAYER_VISIBLE;
        populationLayerCheckbox.addEventListener('change', () => {
          CONFIG.POPULATION_LAYER_VISIBLE = populationLayerCheckbox.checked;
          this.setPopulationLayerVisible(CONFIG.POPULATION_LAYER_VISIBLE);
        });
      }
      // Beim Umschalten Einwohner-Gewichtung: Routen neu berechnen (wie bei Längenverteilung)
      if (populationWeightCheckbox) {
        populationWeightCheckbox.addEventListener('change', async () => {
          const lastTarget = State.getLastTarget();
          const lastStarts = State.getLastStarts();
          if (!lastTarget || !lastStarts || lastStarts.length === 0 || isRememberMode()) return;
          try {
            MapRenderer.removePolylines(State.getRoutePolylines());
            MapRenderer.clearRoutes();
            State.setRoutePolylines([]);
            const routeInfo = await RouteService.calculateRoutes(lastTarget, { reuseStarts: false });
            if (routeInfo) {
              Visualization.updateDistanceHistogram(routeInfo.starts, lastTarget, { routeData: routeInfo.routeData, routeDistances: RouteService.getRouteDistances(routeInfo) });
              EventBus.emit(Events.ROUTES_CALCULATED, { target: lastTarget, routeInfo });
            }
          } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.logError) Utils.logError('MapRenderer', e);
          }
        });
      }
    } else if (populationWeightGroup) {
      populationWeightGroup.style.display = 'none';
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

    // ÖPNV-Haltestellen suchen (weiterhin via Overpass, bis platforms.pmtiles existiert)
    const platformsBtn = Utils.getElement('#context-menu-platforms');
    if (platformsBtn) {
      platformsBtn.addEventListener('click', async () => {
        if (!contextMenuLatLng) return;
        contextMenu.style.display = 'none';

        Visualization.clearPlatformSearchRadius();
        const searchRadius = 1000;
        Visualization.drawPlatformSearchRadius(contextMenuLatLng.lat, contextMenuLatLng.lng, searchRadius);
        Utils.showInfo('Suche nach ÖPNV-Haltestellen...', false);

        try {
          const platforms = await OverpassService.searchPublicTransportPlatforms(
            contextMenuLatLng.lat,
            contextMenuLatLng.lng,
            searchRadius
          );

          if (platforms.length === 0) {
            Utils.showInfo('Keine ÖPNV-Haltestellen in der Nähe gefunden.', false);
            setTimeout(() => Visualization.clearPlatformSearchRadius(), 3000);
            return;
          }

          // Alte Haltestellen behalten und neue hinzufügen (nicht ersetzen)
          const oldPlatforms = State.getPlatformMarkers() || [];
          const drawn = Visualization.drawPlatforms(platforms);
          State.setPlatformMarkers([...oldPlatforms, ...drawn]);

          Utils.showInfo(`${platforms.length} Haltestelle${platforms.length !== 1 ? 'n' : ''} gefunden.`, false);
          setTimeout(() => Visualization.clearPlatformSearchRadius(), 3000);

          // Karte zu den neuen Haltestellen zoomen
          const bounds = new LngLatBounds();
          drawn.forEach(p => {
            if (p.type === 'way' && p.coordinates) {
              p.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
            } else if (p.lat != null && p.lng != null) {
              bounds.extend([p.lng, p.lat]);
            }
          });
          bounds.extend([contextMenuLatLng.lng, contextMenuLatLng.lat]);
          if (!bounds.isEmpty()) {
            this._map.fitBounds(bounds, { padding: 50, maxZoom: 16 - ZOOM_OFFSET });
          }
        } catch (error) {
          console.error('Fehler bei Haltestellen-Suche:', error);
          Utils.showError('Fehler beim Laden der ÖPNV-Haltestellen.', true);
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
