// ==== Map-Initialisierung ====
const MapInit = {
  init() {
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
    const map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19 
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    
    // State setzen
    State.setMap(map);
    State.setLayerGroup(layerGroup);

    // Event Listener
    map.on("click", App.handleMapClick);
  }
};

