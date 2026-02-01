// ==== Map-Renderer: Karten-Rendering ====
/** Attribution für Einwohner-Layer (Zensus/Destatis), wird in Karten-Attribution eingeblendet wenn Layer aktiv. */
const POPULATION_ATTRIBUTION = '© <a href="https://atlas.zensus2022.de/" target="_blank" rel="noopener">Statistisches Bundesamt (Destatis)</a>';

const MapRenderer = {
  _map: null,
  _layerGroup: null,
  _populationLayer: null,
  _populationTooltip: null,
  _populationHoverTimeout: null,
  _populationHoverAttached: false,

  /** Stellt sicher, dass die Overlay-LayerGroup (Routen, Marker) über dem Einwohner-Layer liegt. */
  _bringOverlayLayerToFront() {
    if (this._layerGroup && typeof this._layerGroup.bringToFront === 'function') {
      this._layerGroup.bringToFront();
    }
  },

  /**
   * Zeigt oder versteckt den optionalen Einwohner-PMTiles-Layer.
   * Funktioniert nur, wenn CONFIG.POPULATION_PMTILES_URL gesetzt und protomaps-leaflet geladen ist.
   * @param {boolean} visible - true = Layer anzeigen, false = entfernen
   */
  setPopulationLayerVisible(visible) {
    if (!this._map) return;
    const url = CONFIG.POPULATION_PMTILES_URL && CONFIG.POPULATION_PMTILES_URL.trim();
    if (!url) return;

    if (visible) {
      this._setPopulationLegendVisible(true);
      if (this._map && this._map.attributionControl) {
        this._map.attributionControl.addAttribution(POPULATION_ATTRIBUTION);
      }
      if (this._populationLayer) {
        this._populationLayer.addTo(this._map);
        this._bringOverlayLayerToFront();
        this._attachPopulationHover();
        return;
      }
      if (typeof protomapsL !== 'undefined' && protomapsL.leafletLayer) {
        const layerName = (CONFIG.POPULATION_LAYER_NAME && CONFIG.POPULATION_LAYER_NAME.trim()) || 'default';
        const propName = (CONFIG.POPULATION_PROPERTY && CONFIG.POPULATION_PROPERTY.trim()) || 'Einwohner';
        // Deutlicher Kontrast: 0 = sehr hell, hohe Werte = kräftig dunkel (log-Skala, stärkere Spreizung)
        const popToRatio = function (pop) {
          return Math.min(1, Math.pow(Math.log(1 + Math.max(0, pop)) / Math.log(1 + 2000), 0.7));
        };
        // Alpha-Bereich für Layer: transparenter (0.06 … 0.5), Legende nutzt dieselbe Formel
        const populationAlpha = function (ratio) { return 0.06 + ratio * 0.44; };
        const fillByPopulation = function (z, f) {
          const props = f && f.props ? f.props : {};
          let pop = 0;
          const v = props[propName] ?? props[propName.toLowerCase()];
          if (typeof v === 'number') pop = v;
          else if (typeof v === 'string') pop = parseFloat(v) || 0;
          const ratio = popToRatio(pop);
          const r = Math.round(255 - ratio * 245);
          const g = Math.round(255 - ratio * 205);
          const b = Math.round(255 - ratio * 135);
          const a = populationAlpha(ratio);
          return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
        };
        const strokeByPopulation = function (z, f) {
          const props = f && f.props ? f.props : {};
          let pop = 0;
          const v = props[propName] ?? props[propName.toLowerCase()];
          if (typeof v === 'number') pop = v;
          else if (typeof v === 'string') pop = parseFloat(v) || 0;
          const ratio = popToRatio(pop);
          const r = Math.round(200 - ratio * 80);
          const g = Math.round(220 - ratio * 100);
          const b = Math.round(240 - ratio * 100);
          return 'rgba(' + r + ',' + g + ',' + b + ',0.12)';
        };
        const addLayer = function (maxDataZoom) {
          try {
            const opts = {
              url: url,
              maxDataZoom: maxDataZoom,
              maxZoom: 22
            };
            if (protomapsL.PolygonSymbolizer) {
              opts.paintRules = [{
                dataLayer: layerName,
                symbolizer: new protomapsL.PolygonSymbolizer({
                  fill: fillByPopulation,
                  stroke: strokeByPopulation,
                  width: 0.8,
                  perFeature: true
                })
              }];
              opts.labelRules = [];
            } else {
              opts.flavor = opts.flavor || 'light';
            }
            const layer = protomapsL.leafletLayer(opts);
            layer.addTo(this._map);
            this._populationLayer = layer;
            this._bringOverlayLayerToFront();
            this._attachPopulationHover();
          } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.logError) Utils.logError('MapRenderer', e);
          }
        }.bind(this);
        if (typeof PopulationService !== 'undefined' && PopulationService.getPopulationPMTilesMaxZoom) {
          PopulationService.getPopulationPMTilesMaxZoom().then(function (maxDataZoom) {
            const stillWanted = document.getElementById('config-population-layer-visible') && document.getElementById('config-population-layer-visible').checked;
            if (this._map && !this._populationLayer && stillWanted) addLayer(maxDataZoom);
          }.bind(this)).catch(function () {
            const stillWanted = document.getElementById('config-population-layer-visible') && document.getElementById('config-population-layer-visible').checked;
            if (this._map && !this._populationLayer && stillWanted) addLayer((typeof CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM === 'number') ? CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM : 14);
          });
        } else {
          addLayer((typeof CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM === 'number') ? CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM : 14);
        }
      } else if (typeof Utils !== 'undefined' && Utils.showError) {
        Utils.showError('Einwohnerlayer: protomaps-leaflet nicht geladen.', true);
      }
    } else {
      this._setPopulationLegendVisible(false);
      this._detachPopulationHover();
      if (this._map && this._map.attributionControl) {
        this._map.attributionControl.removeAttribution(POPULATION_ATTRIBUTION);
      }
      if (this._populationLayer) {
        this._map.removeLayer(this._populationLayer);
      }
    }
  },

  _attachPopulationHover() {
    if (!this._map || this._populationHoverAttached) return;
    this._populationHoverAttached = true;
    const self = this;
    const onMove = function (e) {
      if (self._populationHoverTimeout) clearTimeout(self._populationHoverTimeout);
      self._populationHoverTimeout = setTimeout(function () {
        self._populationHoverTimeout = null;
        const latlng = e.latlng;
        if (typeof PopulationService === 'undefined' || !PopulationService.getPopulationAtPoint) return;
        PopulationService.getPopulationAtPoint(latlng.lat, latlng.lng).then(function (result) {
          if (!self._map || !self._populationLayer) return;
          if (!self._populationTooltip) {
            self._populationTooltip = L.tooltip({
              permanent: false,
              direction: 'top',
              opacity: 0.95,
              className: 'population-tooltip'
            });
          }
          if (result && result.population != null) {
            if (!self._populationTooltip._map) self._populationTooltip.addTo(self._map);
            self._populationTooltip.setLatLng(latlng);
            self._populationTooltip.setContent('Einwohner: ' + result.population);
          } else {
            if (self._populationTooltip._map) self._populationTooltip.remove();
          }
        }).catch(function () {});
      }, 80);
    };
    const onOut = function () {
      if (self._populationTooltip && self._populationTooltip._map) self._populationTooltip.remove();
    };
    this._map.on('mousemove', onMove);
    this._map.on('mouseout', onOut);
    this._populationHoverHandler = onMove;
    this._populationHoverOutHandler = onOut;
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

  _detachPopulationHover() {
    if (this._populationHoverTimeout) {
      clearTimeout(this._populationHoverTimeout);
      this._populationHoverTimeout = null;
    }
    if (this._map) {
      if (this._populationHoverHandler) {
        this._map.off('mousemove', this._populationHoverHandler);
        this._populationHoverHandler = null;
      }
      if (this._populationHoverOutHandler) {
        this._map.off('mouseout', this._populationHoverOutHandler);
        this._populationHoverOutHandler = null;
      }
    }
    this._populationHoverAttached = false;
    if (this._populationTooltip && this._populationTooltip._map) {
      this._populationTooltip.remove();
    }
  },

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
    
    // Nach Kartenbewegung/Zoom: Marker-Positionen neu berechnen (Fix für Mobile Pinch-Zoom).
    // Günstig: nur Projektion + style setzen pro Marker, läuft nur 1× pro Geste (debounced).
    const syncMarkerPositions = () => {
      const startMarkers = State.getStartMarkers() || [];
      const targetMarkers = State.getTargetMarkers() || [];
      if (startMarkers.length === 0 && targetMarkers.length === 0 && !State.getCurrentTargetMarker()) return;
      const update = (m) => { if (m && typeof m._updatePosition === 'function') m._updatePosition(); };
      startMarkers.forEach(update);
      targetMarkers.forEach(update);
      const currentTargetMarker = State.getCurrentTargetMarker();
      if (currentTargetMarker && !targetMarkers.includes(currentTargetMarker)) update(currentTargetMarker);
    };

    // Zoom-Event: Schul- und Haltestellen-Icons aktualisieren + Marker-Positionen synchronisieren (Debounce)
    let zoomUpdateTimeout = null;
    const onViewChange = () => {
      if (zoomUpdateTimeout) clearTimeout(zoomUpdateTimeout);
      zoomUpdateTimeout = setTimeout(() => {
        zoomUpdateTimeout = null;
        syncMarkerPositions();
        Visualization.updateSchoolIcons();
        Visualization.updatePlatformIcons();
      }, 100);
    };
    map.on("zoomend", onViewChange);
    map.on("moveend", onViewChange);
    
    // Kontextmenü initialisieren
    this._initContextMenu();

    // Einwohner-Bereich (Startpunkte gewichten + Layer anzeigen)
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
        if (CONFIG.POPULATION_LAYER_VISIBLE) this.setPopulationLayerVisible(true);
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
          const searchRadius = 1000;
          
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
    
    // ÖPNV-Haltestellen suchen
    const platformsBtn = Utils.getElement('#context-menu-platforms');
    if (platformsBtn) {
      platformsBtn.addEventListener('click', async () => {
        if (contextMenuLatLng) {
          contextMenu.style.display = 'none';
          
          // Alten Radius-Kreis entfernen (falls vorhanden)
          Visualization.clearPlatformSearchRadius();
          
          // Radius für Suche (500m)
          const searchRadius = 1000;
          
          // Radius-Kreis anzeigen
          Visualization.drawPlatformSearchRadius(
            contextMenuLatLng.lat,
            contextMenuLatLng.lng,
            searchRadius
          );
          
          // Lade-Indikator anzeigen
          Utils.showInfo('Suche nach ÖPNV-Haltestellen...', false);
          
          try {
            // Haltestellen suchen
            const platforms = await OverpassService.searchPublicTransportPlatforms(
              contextMenuLatLng.lat,
              contextMenuLatLng.lng,
              searchRadius
            );
            
            if (platforms.length === 0) {
              Utils.showInfo('Keine ÖPNV-Haltestellen in der Nähe gefunden.', false);
              // Kreis nach 3 Sekunden ausblenden
              setTimeout(() => {
                Visualization.clearPlatformSearchRadius();
              }, 3000);
              return;
            }
            
            // Alte Haltestellen holen und neue hinzufügen (nicht ersetzen)
            const oldPlatformLayers = State.getPlatformMarkers() || [];
            const newPlatformLayers = Visualization.drawPlatforms(platforms);
            
            // Alle Haltestellen zusammenführen
            const allPlatformLayers = [...oldPlatformLayers, ...newPlatformLayers];
            State.setPlatformMarkers(allPlatformLayers);
            
            // Erfolgsmeldung
            Utils.showInfo(`${platforms.length} Haltestelle${platforms.length !== 1 ? 'n' : ''} gefunden.`, false);
            
            // Radius-Kreis nach 3 Sekunden ausblenden
            setTimeout(() => {
              Visualization.clearPlatformSearchRadius();
            }, 3000);
            
            // Karte zu den neuen Haltestellen zoomen (falls mehrere gefunden)
            if (newPlatformLayers.length > 0) {
              const bounds = [];
              newPlatformLayers.forEach(layer => {
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
            console.error('Fehler bei Haltestellen-Suche:', error);
            Utils.showError('Fehler beim Laden der ÖPNV-Haltestellen.', true);
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
   * Löscht alle Layer außer Schul- und Haltestellen-Markern und Radius-Kreisen
   * Verwendet selektive Entfernung statt clearLayers() für bessere Performance
   */
  clearLayersExceptSchools() {
    // Aktuellen Zielpunkt-Marker zurücksetzen, da er gelöscht wird
    State.setCurrentTargetMarker(null);
    if (!this._layerGroup) return;
    
    // Schul- und Haltestellen-Marker und Radius-Kreise behalten
    const schoolLayers = State.getSchoolMarkers() || [];
    const schoolSearchRadiusCircle = State.getSchoolSearchRadiusCircle();
    const platformLayers = State.getPlatformMarkers() || [];
    const platformSearchRadiusCircle = State.getPlatformSearchRadiusCircle();
    
    // Erstelle Set von Schul- und Haltestellen-Layer-Referenzen für schnellen Lookup
    const schoolLayerSet = new Set(schoolLayers);
    const platformLayerSet = new Set(platformLayers);
    
    // Alle anderen Layer entfernen
    const layersToRemove = [];
    this._layerGroup.eachLayer(layer => {
      // Prüfe auf mehrere Arten, ob es ein Schul- oder Haltestellen-Layer ist:
      // 1. Direkte Referenz im Set
      // 2. Custom-Property _isSchoolLayer oder _isPlatformLayer
      const isSchoolLayer = schoolLayerSet.has(layer) || layer._isSchoolLayer === true;
      const isPlatformLayer = platformLayerSet.has(layer) || layer._isPlatformLayer === true;
      const isRadiusCircle = layer === schoolSearchRadiusCircle || layer === platformSearchRadiusCircle;
      if (!isSchoolLayer && !isPlatformLayer && !isRadiusCircle) {
        layersToRemove.push(layer);
      }
    });
    
    layersToRemove.forEach(layer => this._layerGroup.removeLayer(layer));
  },
  
  /**
   * Löscht nur Routen (Polylines), aber nicht Schul- oder Haltestellen-Polygone
   * Wichtig: L.Polygon erweitert L.Polyline, daher müssen wir _isSchoolLayer und _isPlatformLayer prüfen
   */
  clearRoutes() {
    if (!this._layerGroup) return;
    
    const polylinesToRemove = [];
    this._layerGroup.eachLayer(layer => {
      if (layer instanceof L.Polyline && !layer._isSchoolLayer && !layer._isPlatformLayer) {
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

