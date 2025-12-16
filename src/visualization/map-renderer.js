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
    const map = L.map('map', {
      zoomControl: false // Deaktiviere Standard-Zoom-Control
    }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    
    // Füge Zoom-Control unten links hinzu
    L.control.zoom({
      position: 'bottomleft'
    }).addTo(map);
    
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
    
    // Zoom-Event: Schul-Icons aktualisieren (mit Debouncing für bessere Performance)
    let zoomUpdateTimeout = null;
    map.on("zoomend", () => {
      // Debounce: Warte 100ms nach dem letzten Zoom-Event
      if (zoomUpdateTimeout) {
        clearTimeout(zoomUpdateTimeout);
      }
      zoomUpdateTimeout = setTimeout(() => {
        Visualization.updateSchoolIcons();
      }, 100);
    });
    
    // Kontextmenü initialisieren
    this._initContextMenu();
    
    EventBus.emit(Events.MAP_READY);
  },
  
  /**
   * Initialisiert das Rechtsklick-Kontextmenü
   */
  _initContextMenu() {
    const contextMenu = Utils.getElement('#context-menu');
    if (!contextMenu) return;
    
    let contextMenuLatLng = null;
    
    // Rechtsklick auf Karte
    this._map.on("contextmenu", (e) => {
      e.originalEvent.preventDefault();
      
      contextMenuLatLng = e.latlng;
      
      // Menü-Position an Mausposition setzen
      const point = this._map.mouseEventToContainerPoint(e.originalEvent);
      contextMenu.style.left = `${point.x}px`;
      contextMenu.style.top = `${point.y}px`;
      contextMenu.style.display = 'block';
      
      // Links mit aktuellen Koordinaten aktualisieren
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      const zoom = this._map.getZoom();
      
      // OSM Query Link
      const osmQueryLink = Utils.getElement('#context-menu-osm-query');
      if (osmQueryLink) {
        osmQueryLink.href = `https://www.openstreetmap.org/query?lat=${lat}&lon=${lng}`;
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
    
    // Schulen suchen
    const schoolsBtn = Utils.getElement('#context-menu-schools');
    if (schoolsBtn) {
      schoolsBtn.addEventListener('click', async () => {
        if (contextMenuLatLng) {
          contextMenu.style.display = 'none';
          
          // Alten Radius-Kreis entfernen (falls vorhanden)
          Visualization.clearSchoolSearchRadius();
          
          // Radius für Suche (500m)
          const searchRadius = 500;
          
          // Radius-Kreis anzeigen
          Visualization.drawSchoolSearchRadius(
            contextMenuLatLng.lat,
            contextMenuLatLng.lng,
            searchRadius
          );
          
          // Lade-Indikator anzeigen
          Utils.showInfo('Suche nach Schulen...', false);
          
          try {
            // Schulen suchen
            const schools = await OverpassService.searchSchools(
              contextMenuLatLng.lat,
              contextMenuLatLng.lng,
              searchRadius
            );
            
            if (schools.length === 0) {
              Utils.showInfo('Keine Schulen in der Nähe gefunden.', false);
              // Kreis nach 3 Sekunden ausblenden
              setTimeout(() => {
                Visualization.clearSchoolSearchRadius();
              }, 3000);
              return;
            }
            
            // Alte Schulen holen und neue hinzufügen (nicht ersetzen)
            const oldSchoolLayers = State.getSchoolMarkers() || [];
            const newSchoolLayers = Visualization.drawSchools(schools);
            
            // Alle Schulen zusammenführen
            const allSchoolLayers = [...oldSchoolLayers, ...newSchoolLayers];
            State.setSchoolMarkers(allSchoolLayers);
            
            // Erfolgsmeldung
            Utils.showInfo(`${schools.length} Schule${schools.length !== 1 ? 'n' : ''} gefunden.`, false);
            
            // Radius-Kreis nach 3 Sekunden ausblenden
            setTimeout(() => {
              Visualization.clearSchoolSearchRadius();
            }, 3000);
            
            // Karte zu den neuen Schulen zoomen (falls mehrere gefunden)
            if (newSchoolLayers.length > 0) {
              const bounds = [];
              newSchoolLayers.forEach(layer => {
                // Marker haben getLatLng(), Polygone haben getBounds()
                if (layer.getLatLng) {
                  bounds.push(layer.getLatLng());
                } else if (layer.getBounds) {
                  bounds.push(layer.getBounds().getCenter());
                }
              });
              bounds.push(contextMenuLatLng); // Auch die Klick-Position einbeziehen
              
              if (bounds.length > 0) {
                const latlngs = bounds.map(b => [b.lat, b.lng]);
                this._map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 16 });
              }
            }
          } catch (error) {
            console.error('Fehler bei Schul-Suche:', error);
            Utils.showError('Fehler beim Laden der Schulen.', true);
          }
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
   * Gibt die Layer-Gruppe zurück
   */
  getLayerGroup() {
    return this._layerGroup;
  },
  
  /**
   * Löscht alle Layer außer Schul-Markern und Radius-Kreis
   * Verwendet selektive Entfernung statt clearLayers() für bessere Performance
   */
  clearLayersExceptSchools() {
    // Aktuellen Zielpunkt-Marker zurücksetzen, da er gelöscht wird
    State.setCurrentTargetMarker(null);
    if (!this._layerGroup) return;
    
    // Schul-Marker und Radius-Kreis behalten
    const schoolLayers = State.getSchoolMarkers() || [];
    const schoolSearchRadiusCircle = State.getSchoolSearchRadiusCircle();
    
    // Erstelle Set von Schul-Layer-Referenzen für schnellen Lookup
    const schoolLayerSet = new Set(schoolLayers);
    
    // Alle anderen Layer entfernen
    const layersToRemove = [];
    this._layerGroup.eachLayer(layer => {
      // Prüfe auf mehrere Arten, ob es ein Schul-Layer ist:
      // 1. Direkte Referenz im Set
      // 2. Custom-Property _isSchoolLayer
      const isSchoolLayer = schoolLayerSet.has(layer) || layer._isSchoolLayer === true;
      const isRadiusCircle = layer === schoolSearchRadiusCircle;
      if (!isSchoolLayer && !isRadiusCircle) {
        layersToRemove.push(layer);
      }
    });
    
    layersToRemove.forEach(layer => this._layerGroup.removeLayer(layer));
  },
  
  /**
   * Löscht nur Routen (Polylines), aber nicht Schul-Polygone
   * Wichtig: L.Polygon erweitert L.Polyline, daher müssen wir _isSchoolLayer prüfen
   */
  clearRoutes() {
    if (!this._layerGroup) return;
    
    const polylinesToRemove = [];
    this._layerGroup.eachLayer(layer => {
      if (layer instanceof L.Polyline && !layer._isSchoolLayer) {
        polylinesToRemove.push(layer);
      }
    });
    polylinesToRemove.forEach(layer => this._layerGroup.removeLayer(layer));
  },
  
  /**
   * Entfernt eine Liste von Polylines aus dem LayerGroup
   * @param {Array} polylines - Array von Polyline-Objekten
   */
  removePolylines(polylines) {
    if (!this._layerGroup || !polylines) return;
    polylines.forEach(polyline => {
      if (polyline) {
        this._layerGroup.removeLayer(polyline);
      }
    });
  }
};

