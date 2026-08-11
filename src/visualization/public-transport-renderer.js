// ==== Public Transport Renderer: ÖPNV-Haltestellen-Visualisierung (MapLibre) ====
// Haltestellen (aus Overpass) werden als eine GeoJSON-Source gerendert:
// Polygone als Fill/Outline, Punkte (+ Polygon-Zentren) als Symbol-Layer mit
// zoomabhängiger Icon-Größe. Popups über Klick auf die Layer.
import { Popup } from 'maplibre-gl';
import { State } from '../core/state.js';

const PLATFORM_COLOR = '#10b981';

// Bus-Icon als eigenständiges Badge (weißer Kreis, grüner Rand, Bus-Symbol) —
// wird als Rasterbild in die Map geladen und per icon-size zoomskaliert.
const PLATFORM_ICON_SVG = `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="29" fill="white" stroke="${PLATFORM_COLOR}" stroke-width="5"/>
  <g transform="translate(14, 14) scale(1.5)">
    <path fill="${PLATFORM_COLOR}" d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
  </g>
</svg>`;

export const PublicTransportRenderer = {
  _pointFeatures: [],
  _polygonFeatures: [],
  _initialized: false,
  _iconLoaded: false,

  /**
   * Legt Source/Layer für Haltestellen und Suchradius an (einmalig, nach Style-Load).
   */
  _ensureLayers(map) {
    if (this._initialized) return;
    this._initialized = true;

    // Suchradius unter allem eigenen
    map.addSource('platform-search-radius', { type: 'geojson', data: this._emptyFC() });
    map.addLayer({
      id: 'platform-search-radius-fill',
      type: 'fill',
      source: 'platform-search-radius',
      paint: { 'fill-color': '#999999', 'fill-opacity': 0.2 }
    });
    map.addLayer({
      id: 'platform-search-radius-line',
      type: 'line',
      source: 'platform-search-radius',
      paint: { 'line-color': '#666666', 'line-width': 2, 'line-opacity': 0.5 }
    });

    map.addSource('platforms', { type: 'geojson', data: this._emptyFC() });
    map.addLayer({
      id: 'platforms-fill',
      type: 'fill',
      source: 'platforms',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': PLATFORM_COLOR, 'fill-opacity': 0.3 }
    });
    map.addLayer({
      id: 'platforms-outline',
      type: 'line',
      source: 'platforms',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': PLATFORM_COLOR, 'line-width': 2, 'line-opacity': 0.8 }
    });
    map.addLayer({
      id: 'platforms-icon',
      type: 'symbol',
      source: 'platforms',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'icon-image': 'platform-icon',
        // Icon-PNG ist 64px; Zielgröße wie zuvor ~10px (Zoom 9) bis ~36px (Zoom 18)
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 10 / 64, 14, 28 / 64, 18, 36 / 64],
        'icon-allow-overlap': true
      }
    });

    // Popup bei Klick auf Haltestelle
    const onClick = (e) => {
      const f = e.features && e.features[0];
      if (!f || !f.properties || !f.properties.popupHtml) return;
      new Popup({ closeButton: true, className: 'platform-popup', maxWidth: '250px' })
        .setLngLat(e.lngLat)
        .setHTML(f.properties.popupHtml)
        .addTo(map);
    };
    ['platforms-icon', 'platforms-fill'].forEach(layerId => {
      map.on('click', layerId, onClick);
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });

    this._loadIcon(map);
  },

  _loadIcon(map) {
    if (this._iconLoaded) return;
    const img = new Image(64, 64);
    img.onload = () => {
      if (!map.hasImage('platform-icon')) map.addImage('platform-icon', img);
      this._iconLoaded = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLATFORM_ICON_SVG)}`;
  },

  _emptyFC() {
    return { type: 'FeatureCollection', features: [] };
  },

  _refresh(map) {
    const src = map.getSource('platforms');
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [...this._polygonFeatures, ...this._pointFeatures]
      });
    }
  },

  /**
   * Baut den Popup-Inhalt für eine Haltestelle (wie zuvor).
   */
  _createPopupContent(platform) {
    let popupContent = `<strong>${platform.name}</strong>`;

    if (platform.tags) {
      if (platform.tags['addr:street'] && platform.tags['addr:housenumber']) {
        popupContent += `<br>${platform.tags['addr:street']} ${platform.tags['addr:housenumber']}`;
      }
      if (platform.tags['addr:postcode'] && platform.tags['addr:city']) {
        popupContent += `<br>${platform.tags['addr:postcode']} ${platform.tags['addr:city']}`;
      }
      if (platform.tags.network) {
        popupContent += `<br>Netzwerk: ${platform.tags.network}`;
      }
      if (platform.tags.operator) {
        popupContent += `<br>Betreiber: ${platform.tags.operator}`;
      }
      if (platform.tags.tram) {
        popupContent += `<br>Straßenbahn: ${platform.tags.tram === 'yes' ? 'Ja' : 'Nein'}`;
      }
      if (platform.tags.bus) {
        popupContent += `<br>Bus: ${platform.tags.bus === 'yes' ? 'Ja' : 'Nein'}`;
      }
    }

    return popupContent;
  },

  /**
   * Zeichnet ÖPNV-Haltestellen auf der Karte (additiv).
   * - Nodes/Relations als Icon-Punkte
   * - Ways als Polygone + Icon im Zentrum
   * @param {Array} platforms - Array von Haltestellen-Objekten mit {type, lat, lng, coordinates, name, tags}
   * @returns {Array} Die übergebenen Haltestellen-Objekte (für State-Verwaltung)
   */
  drawPlatforms(platforms) {
    const map = State.getMap();
    if (!map) {
      console.warn('[PublicTransportRenderer] Karte nicht verfügbar');
      return [];
    }
    this._ensureLayers(map);

    platforms.forEach(platform => {
      const popupHtml = this._createPopupContent(platform);

      if (platform.type === 'way' && platform.coordinates) {
        // Way als Polygon zeichnen ([lat,lng] -> [lng,lat])
        const ring = platform.coordinates.map(c => [c[1], c[0]]);
        this._polygonFeatures.push({
          type: 'Feature',
          properties: { popupHtml, platformId: platform.id },
          geometry: { type: 'Polygon', coordinates: [ring] }
        });

        // Icon im Zentrum des Polygons
        const coords = platform.coordinates;
        const uniqueCoords = coords.length > 0 &&
          coords[0][0] === coords[coords.length - 1][0] &&
          coords[0][1] === coords[coords.length - 1][1]
          ? coords.slice(0, -1)
          : coords;
        let centerLat = 0, centerLng = 0;
        uniqueCoords.forEach(coord => {
          centerLat += coord[0];
          centerLng += coord[1];
        });
        centerLat /= uniqueCoords.length;
        centerLng /= uniqueCoords.length;

        this._pointFeatures.push({
          type: 'Feature',
          properties: { popupHtml, platformId: platform.id },
          geometry: { type: 'Point', coordinates: [centerLng, centerLat] }
        });
      } else if (platform.lat && platform.lng) {
        // Node oder Relation als Icon-Punkt
        this._pointFeatures.push({
          type: 'Feature',
          properties: { popupHtml, platformId: platform.id },
          geometry: { type: 'Point', coordinates: [platform.lng, platform.lat] }
        });
      }
    });

    this._refresh(map);
    return platforms;
  },

  /**
   * Entfernt alle Haltestellen von der Karte.
   */
  clearPlatforms() {
    this._pointFeatures = [];
    this._polygonFeatures = [];
    const map = State.getMap();
    if (map) this._refresh(map);
  },

  /**
   * Zeichnet einen Radius-Kreis für die Haltestellen-Suche
   * @param {number} lat - Breitengrad des Zentrums
   * @param {number} lng - Längengrad des Zentrums
   * @param {number} radiusMeters - Radius in Metern
   */
  drawPlatformSearchRadius(lat, lng, radiusMeters) {
    const map = State.getMap();
    if (!map) return;
    this._ensureLayers(map);

    // Geodätischer Kreis als 64-Eck
    const points = [];
    const latRad = lat * Math.PI / 180;
    const dLat = radiusMeters / 111320;
    const dLng = radiusMeters / (111320 * Math.cos(latRad));
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * 2 * Math.PI;
      points.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)]);
    }

    const src = map.getSource('platform-search-radius');
    if (src) {
      src.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [points] }
      });
    }
  },

  /**
   * Entfernt den Radius-Kreis für die Haltestellen-Suche
   */
  clearPlatformSearchRadius() {
    const map = State.getMap();
    if (!map || !this._initialized) return;
    const src = map.getSource('platform-search-radius');
    if (src) src.setData(this._emptyFC());
  }
};
