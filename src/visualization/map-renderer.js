// ==== Map-Renderer: Karten-Rendering ====
const MapRenderer = {
  _map: null,
  _layerGroup: null,
  
  /**
   * Initialisiert die Karte
   */
  init() {
    // Unterdrücke Leaflet Mozilla-Deprecation-Warnungen
    const originalWarn = console.warn;
    console.warn = function(...args) {
      if (args[0] && typeof args[0] === 'string') {
        const message = args[0];
        if (message.includes('mozPressure') || message.includes('mozInputSource')) {
          return;
        }
      }
      originalWarn.apply(console, args);
    };
    
    // Leaflet Setup
    const map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19 
    }).addTo(map);
    
    const layerGroup = L.layerGroup().addTo(map);
    
    this._map = map;
    this._layerGroup = layerGroup;
    
    // State setzen
    State.setMap(map);
    State.setLayerGroup(layerGroup);
    
    // Event Listener
    map.on("click", (e) => {
      EventBus.emit(Events.MAP_CLICK, { latlng: e.latlng });
    });
    
    EventBus.emit(Events.MAP_READY);
  },
  
  /**
   * Gibt die Karte zurück
   */
  getMap() {
    return this._map;
  },
  
  /**
   * Gibt die Layer-Gruppe zurück
   */
  getLayerGroup() {
    return this._layerGroup;
  },
  
  /**
   * Löscht alle Layer
   */
  clearLayers() {
    if (this._layerGroup) {
      this._layerGroup.clearLayers();
    }
  },
  
  /**
   * Löscht nur Routen (Polylines)
   */
  clearRoutes() {
    if (!this._layerGroup) return;
    
    const polylinesToRemove = [];
    this._layerGroup.eachLayer(layer => {
      if (layer instanceof L.Polyline) {
        polylinesToRemove.push(layer);
      }
    });
    polylinesToRemove.forEach(layer => this._layerGroup.removeLayer(layer));
  },
  
  /**
   * Löscht nur Marker
   */
  clearMarkers() {
    if (!this._layerGroup) return;
    
    const markersToRemove = [];
    this._layerGroup.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        markersToRemove.push(layer);
      }
    });
    markersToRemove.forEach(layer => this._layerGroup.removeLayer(layer));
  }
};

