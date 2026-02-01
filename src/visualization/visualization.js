// ==== Visualisierung ====
const Visualization = {
  /**
   * Stellt Config-Werte eines Zielpunkts wieder her
   * @param {Object} routeInfo - Route-Info mit config und distributionType
   */
  _restoreTargetConfig(routeInfo) {
    if (!routeInfo) return;
    
    // Verteilung wiederherstellen (UI-Button aktivieren)
    if (routeInfo.distributionType) {
      const distBtns = document.querySelectorAll('.dist-btn');
      distBtns.forEach(btn => {
        if (btn.dataset.dist === routeInfo.distributionType) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    
    // Config-Werte wiederherstellen (N, RADIUS_M, PROFILE)
    if (routeInfo.config) {
      // Anzahl Routen (N)
      const nInput = document.querySelector('#config-n');
      if (nInput && routeInfo.config.n) {
        CONFIG.N = routeInfo.config.n;
        nInput.value = routeInfo.config.n;
      }
      
      // Radius (RADIUS_M)
      const radiusInput = document.querySelector('#config-radius');
      if (radiusInput && routeInfo.config.radiusKm) {
        CONFIG.RADIUS_M = routeInfo.config.radiusKm * 1000;
        radiusInput.value = routeInfo.config.radiusKm;
      }
      
      // Profil (PROFILE)
      if (routeInfo.config.profile) {
        CONFIG.PROFILE = routeInfo.config.profile;
        const profileBtns = document.querySelectorAll('.profile-btn');
        profileBtns.forEach(btn => {
          if (btn.dataset.profile === routeInfo.config.profile) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      }
    }
  },
  
  /**
   * Hilfsfunktion: Findet den Index eines Zielpunkts für einen Marker
   * @param {L.Marker} marker - Der Marker
   * @returns {number} - Index oder -1
   */
  _getTargetIndexForMarker(marker) {
    if (!marker) return -1;
    if (marker._targetIndex !== undefined) {
      return marker._targetIndex;
    }
    if (marker._targetLatLng) {
      const allTargets = State.getAllTargets();
      return allTargets.findIndex(t => 
        TargetService.isEqual(t, marker._targetLatLng)
      );
    }
    return -1;
  },
  
  /**
   * Hilfsfunktion: Entfernt alle Startpunkt-Marker
   */
  _clearStartMarkers() {
    const startMarkers = State.getStartMarkers();
    const layerGroup = State.getLayerGroup();
    if (layerGroup && startMarkers) {
      startMarkers.forEach(marker => {
        if (marker) layerGroup.removeLayer(marker);
      });
    }
    State.setStartMarkers([]);
  },
  
  drawTargetPoint(latlng, index = null, targetId = null) {
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      console.warn('[Visualization] LayerGroup nicht verfügbar');
      return null;
    }
    
    // SVG-Icon für Zielpunkt
    const targetIcon = L.divIcon({
      className: 'target-point-icon',
      html: `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <g transform="translate(12, 10) scale(0.4) translate(-16, -16)">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-miterlimit="10">
              <line x1="6" y1="28" x2="6" y2="5" stroke="white" stroke-width="3" stroke-linecap="round"></line>
              <polyline points="6,5 26,5 26,19 6,19" stroke="white" stroke-width="1.5"></polyline>
              <rect x="6" y="5" width="10" height="7" fill="white"></rect>
              <rect x="16" y="12" width="10" height="7" fill="white"></rect>
            </svg>
          </g>
        </svg>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    const marker = L.marker(latlng, { 
      icon: targetIcon,
      draggable: true,
      zIndexOffset: 200 // Höher als Startpunkte, damit Zielpunkte immer vorne sind
    }).addTo(layerGroup);
    
    // Opacity basierend auf CONFIG.HIDE_TARGET_POINTS setzen
    if (CONFIG.HIDE_TARGET_POINTS) {
      marker.setOpacity(0);
    }
    
    // Koordinaten im Marker speichern für Vergleich
    marker._targetLatLng = latlng;
    
    // Index speichern für Kontextmenü
    if (index !== null) {
      marker._targetIndex = index;
    }
    
    // Event Listener für Drag-Ende (funktioniert sowohl im normalen Modus als auch im "Zielpunkte merken" Modus)
    marker.on('dragend', async (e) => {
      await this._handleTargetDrag(marker, e);
    });
    
    // Tooltip nur im "Zielpunkte merken" Modus aktivieren
    if (isRememberMode()) {
      this._setupTargetTooltip(marker);
    }
    
    // Klick-Event: Startpunkte dieses Zielpunkts anzeigen
    marker.on('click', () => {
      const currentIndex = this._getTargetIndexForMarker(marker);
      if (currentIndex >= 0) {
        this._showStartPointsForTarget(currentIndex);
      }
    });
    
    // Rechtsklick-Event für Kontextmenü
    marker.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      const currentIndex = this._getTargetIndexForMarker(marker);
      if (currentIndex >= 0) {
        this._showTargetContextMenu(e, currentIndex);
      }
    });
    
    return marker; // Marker zurückgeben für State-Verwaltung
  },
  
  /**
   * Behandelt das Draggen eines Zielpunkt-Markers
   * @param {L.Marker} marker - Der Marker
   * @param {Object} e - Leaflet Drag-Event
   */
  async _handleTargetDrag(marker, e) {
    try {
      const newPosition = e.target.getLatLng();
      if (!newPosition) return;
      
      const newTarget = [newPosition.lat, newPosition.lng];
      const oldTarget = marker._targetLatLng;
      
      // Marker-Koordinaten aktualisieren
      marker._targetLatLng = newTarget;
      
      // Prüfen ob wir im "Zielpunkte merken" Modus sind
      if (isRememberMode()) {
        await this._handleTargetDragInRememberMode(marker, newTarget, oldTarget);
      } else {
        await this._handleTargetDragInNormalMode(marker, newTarget);
      }
      
      // Verwaiste Marker entfernen
      MarkerManager.cleanupOrphanedTargetMarkers();
      
      // Panel-Liste aktualisieren (damit Config-Informationen angezeigt werden)
      if (isRememberMode()) {
        TargetsList.update();
      }
      
      // Export-Button aktualisieren
      EventBus.emit(Events.EXPORT_REQUESTED);
    } catch (err) {
      console.error('Fehler beim Draggen des Zielpunkts:', err);
      Utils.showError('Fehler beim Verschieben des Zielpunkts', false);
    }
  },
  
  /**
   * Behandelt das Draggen im "Zielpunkte merken" Modus
   */
  async _handleTargetDragInRememberMode(marker, newTarget, oldTarget) {
    // Zielpunkt im State aktualisieren (Index verwenden statt Koordinaten-Vergleich)
    const allTargets = State.getAllTargets();
    if (!allTargets || allTargets.length === 0) return;
    
    const currentIndex = marker._targetIndex !== undefined ? marker._targetIndex : 
      allTargets.findIndex(t => TargetService.isEqual(t, oldTarget));
    
    if (currentIndex < 0 || currentIndex >= allTargets.length) return;
    // Alten Zielpunkt durch neuen ersetzen
    allTargets[currentIndex] = newTarget;
    State.setAllTargets(allTargets);
    
    // Wenn es der aktuelle Zielpunkt war, auch lastTarget aktualisieren
    const lastTarget = State.getLastTarget();
    if (lastTarget && TargetService.isEqual(lastTarget, oldTarget)) {
      State.setLastTarget(newTarget);
    }
    
    // Routen zu diesem Zielpunkt neu berechnen (alte Koordinaten verwenden)
    const targetRoutes = State.getTargetRoutes();
    const targetRouteIndex = targetRoutes.findIndex(tr => 
      TargetService.isEqual(tr.target, oldTarget)
    );
    
    if (targetRouteIndex >= 0) {
      // Alte Routen entfernen
      const oldRouteInfo = targetRoutes[targetRouteIndex];
      if (oldRouteInfo && oldRouteInfo.routePolylines) {
        MapRenderer.removePolylines(oldRouteInfo.routePolylines);
      }
      
      // RouteInfo im targetRoutes aktualisieren (target bereits auf newTarget setzen)
      // Wichtig: Dies muss VOR calculateRoutes passieren, damit die alten Routen nicht mehr gezeichnet werden
      targetRoutes[targetRouteIndex] = {
        target: newTarget,
        routeData: oldRouteInfo?.routeData || [],
        routeResponses: oldRouteInfo?.routeResponses || [],
        routePolylines: [], // Alte Polylines bereits entfernt
        starts: oldRouteInfo?.starts || [],
        colors: oldRouteInfo?.colors || [],
        distributionType: oldRouteInfo?.distributionType, // Verteilung beibehalten
        config: oldRouteInfo?.config // Config beibehalten
      };
      State.setTargetRoutes(targetRoutes);
      
      // Alle Routen entfernen (auch die, die nicht in routePolylines gespeichert sind)
      MapRenderer.clearRoutes();
      
      // Config-Werte des Zielpunkts wiederherstellen (BEVOR Routen berechnet werden)
      const savedDistributionType = oldRouteInfo?.distributionType;
      this._restoreTargetConfig(oldRouteInfo);
      
      // Neue Routen berechnen (silent=true, da wir die Routen direkt zeichnen)
      const routeInfo = await RouteService.calculateRoutes(newTarget, { 
        silent: true,
        distributionType: savedDistributionType 
      });
      if (routeInfo) {
        // RouteInfo im targetRoutes aktualisieren
        targetRoutes[targetRouteIndex] = {
          target: newTarget,
          routeData: routeInfo.routeData,
          routeResponses: routeInfo.routeResponses,
          routePolylines: [],
          starts: routeInfo.starts,
          colors: routeInfo.colors,
          distributionType: routeInfo.distributionType,
          config: routeInfo.config
        };
        State.setTargetRoutes(targetRoutes);

        // Startpunkte für diesen Zielpunkt anzeigen (nach dem Draggen)
        if (routeInfo.starts && routeInfo.colors) {
          Visualization.drawStartPoints(routeInfo.starts, routeInfo.colors, newTarget);
        }
        
        // lastTarget und Auswahl aktualisieren (immer, nicht nur wenn starts/colors vorhanden)
        State.setLastTarget(newTarget);
        State.setSelectedTargetIndex(currentIndex);
        // Marker visuell hervorheben
        MarkerManager.updateSelectedTargetMarker();
        
        // Alle Routen neu zeichnen
        RouteRenderer.drawAllTargetRoutes();
        
        // Histogramm aktualisieren
        if (routeInfo.starts && routeInfo.starts.length > 0) {
          Visualization.updateDistanceHistogram(routeInfo.starts, newTarget, { routeData: routeInfo.routeData, routeDistances: RouteService.getRouteDistances(routeInfo) });
        }
      }
    }
  },
  
  /**
   * Behandelt das Draggen im normalen Modus
   */
  async _handleTargetDragInNormalMode(marker, newTarget) {
    // Alte Routen entfernen
    MapRenderer.clearRoutes();
    const routePolylines = State.getRoutePolylines();
    MapRenderer.removePolylines(routePolylines);
    State.setRoutePolylines([]);
    
    // lastTarget aktualisieren
    State.setLastTarget(newTarget);
    
    // Neue Routen berechnen
    const routeInfo = await RouteService.calculateRoutes(newTarget);
    if (routeInfo) {
      // Histogramm aktualisieren
      if (routeInfo.starts && routeInfo.starts.length > 0) {
        Visualization.updateDistanceHistogram(routeInfo.starts, newTarget, { routeData: routeInfo.routeData, routeDistances: RouteService.getRouteDistances(routeInfo) });
      }
    }
  },
  
  /**
   * Richtet Tooltip für Zielpunkt-Marker ein
   */
  _setupTargetTooltip(marker) {
      // Tooltip mit ID beim Hover (verwendet stabile ID)
      marker.on('mouseover', () => {
        const currentIndex = this._getTargetIndexForMarker(marker);
        if (currentIndex >= 0) {
          // Verwende stabile ID aus Marker oder aus targetRoutes
          let targetIdStr = null;
          if (marker._targetId) {
            targetIdStr = `z${marker._targetId}`;
          } else {
            // Fallback: ID aus targetRoutes holen
            const targetRoutes = State.getTargetRoutes();
            const routeInfo = targetRoutes.find(tr => 
              TargetService.isEqual(tr.target, marker._targetLatLng)
            );
            if (routeInfo && routeInfo.targetId) {
              targetIdStr = `z${routeInfo.targetId}`;
            } else {
              // Letzter Fallback: Index verwenden
              targetIdStr = `z${currentIndex + 1}`;
            }
          }
          marker.setTooltipContent(targetIdStr);
          // Event für Panel-Highlighting emittieren
          EventBus.emit(Events.TARGET_HOVER, { index: currentIndex, target: marker._targetLatLng });
        }
      });
    
    // Unhover-Event
    marker.on('mouseout', () => {
      EventBus.emit(Events.TARGET_UNHOVER);
    });
    
    marker.bindTooltip('', {
      permanent: false,
      direction: 'top',
      className: 'target-tooltip',
      offset: [0, -10]
    });
  },
  
  /**
   * Zeigt das Kontextmenü für einen Zielpunkt
   * @param {Object} e - Leaflet Event
   * @param {number} index - Index des Zielpunkts
   */
  _showTargetContextMenu(e, index) {
    const contextMenu = Utils.getElement('#target-context-menu');
    if (!contextMenu) return;
    
    // Menü-Position setzen
    const map = State.getMap();
    const point = map.mouseEventToContainerPoint(e.originalEvent);
    contextMenu.style.left = `${point.x}px`;
    contextMenu.style.top = `${point.y}px`;
    contextMenu.style.display = 'block';
    contextMenu._targetIndex = index;
    
    // Lösch-Button Event-Listener
    const deleteBtn = Utils.getElement('#target-context-menu-delete');
    if (deleteBtn) {
      // Alten Listener entfernen (falls vorhanden)
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      
      newDeleteBtn.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        
        // Gleiche Logik wie im Panel
        const target = TargetService.removeTarget(index);
        if (target) {
          // Routen zu diesem Zielpunkt entfernen
          TargetService.removeTargetRoutes(target);
          
          // Wenn es der aktuelle Zielpunkt war, State zurücksetzen
          const lastTarget = State.getLastTarget();
          if (lastTarget && TargetService.isEqual(lastTarget, target)) {
            State.setLastTarget(null);
            State.resetRouteData();
            
            // Startpunkte entfernen
            const startMarkers = State.getStartMarkers();
            const layerGroup = State.getLayerGroup();
            if (layerGroup && startMarkers) {
              startMarkers.forEach(marker => {
                if (marker) layerGroup.removeLayer(marker);
              });
            }
            State.setStartMarkers([]);
          }
          
          // Alle verbleibenden Routen neu zeichnen
          if (isRememberMode()) {
            EventBus.emit(Events.VISUALIZATION_UPDATE);
          }
          
          // Export-Button aktualisieren
          EventBus.emit(Events.EXPORT_REQUESTED);
        }
      });
    }
  },
  
  // Delegiert an HistogramRenderer (options.routeData für echte Routenlänge)
  updateDistanceHistogram(starts, target, options = {}) {
    return HistogramRenderer.updateDistanceHistogram(starts, target, options);
  },
  
  toggleStartPointsVisibility() {
    const startMarkers = State.getStartMarkers();
    const isHidden = CONFIG.HIDE_START_POINTS;
    
    // Startpunkte im normalen State verwalten
    startMarkers.forEach(marker => {
      if (marker) {
        if (isHidden) {
          marker.setOpacity(0);
        } else {
          marker.setOpacity(1);
        }
      }
    });
    
    // Im "Zielpunkte merken" Modus: Startpunkte auch für alle gespeicherten Zielpunkte verwalten
    // (Die Startpunkte werden aktuell nur für den letzten Zielpunkt gezeichnet,
    //  daher reicht es, die Startpunkte im normalen State zu verwalten)
  },
  
  /**
   * Blendet Zielpunkte ein/aus basierend auf CONFIG.HIDE_TARGET_POINTS
   * Robuste Implementierung: Sucht alle Zielpunkt-Marker direkt auf der Karte
   */
  toggleTargetPointsVisibility() {
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) return;
    
    const isHidden = CONFIG.HIDE_TARGET_POINTS;
    
    // Durchsuche alle Layer auf der Karte nach Zielpunkt-Markern
    // Wichtig: Startpunkte haben auch _targetLatLng, daher müssen wir prüfen ob es KEIN Startpunkt ist
    layerGroup.eachLayer(layer => {
      // Prüfe ob es ein Marker ist und ob er ein Zielpunkt-Marker ist (nicht ein Startpunkt)
      if (layer instanceof L.Marker && 
          layer._targetLatLng && 
          layer._startIndex === undefined) { // Startpunkte haben _startIndex, Zielpunkte nicht
        // Prüfe ob Marker noch auf der Karte ist
        if (layer._map) {
          if (isHidden) {
            layer.setOpacity(0);
          } else {
            layer.setOpacity(1);
          }
        }
      }
    });
  },
  
  drawStartPoints(starts, colors, target = null) {
    // Alte Marker entfernen
    this._clearStartMarkers();
    
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      console.warn('[Visualization] LayerGroup nicht verfügbar');
      return;
    }
    
    // Zielpunkt bestimmen: Wenn nicht übergeben, lastTarget verwenden
    const targetForStarts = target || State.getLastTarget();
    
    // Größe basierend auf Modus (kleiner gemacht)
    const size = CONFIG.AGGREGATED ? 4 : 8;
    const borderWidth = CONFIG.AGGREGATED ? 1 : 1.5;
    const shadowWidth = CONFIG.AGGREGATED ? 1 : 1.5;
    
    const newMarkers = [];
    
    starts.forEach((s, index) => {
      const color = colors[index] || '#0066ff'; // Fallback falls keine Farbe vorhanden
      
      // Erstelle ein Circle-Icon für den Marker
      const icon = L.divIcon({
        className: 'start-point-marker',
        html: `<div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background-color: ${color};
          border: ${borderWidth}px solid white;
          box-shadow: 0 0 0 ${shadowWidth}px ${color};
          cursor: move;
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
      
      // Erstelle einen draggable Marker
      // zIndexOffset niedriger als Zielpunkte, damit Startpunkte dahinter sind
      const marker = L.marker(s, {
        icon: icon,
        draggable: true,
        zIndexOffset: 100 // Niedriger als Zielpunkte (die haben default 200)
      }).addTo(layerGroup);
      
      // Zielpunkt im Marker speichern (für Drag-Event)
      if (targetForStarts) {
        marker._targetLatLng = targetForStarts;
      }
      marker._startIndex = index;
      
      // Opacity basierend auf CONFIG.HIDE_START_POINTS setzen
      if (CONFIG.HIDE_START_POINTS) {
        marker.setOpacity(0);
      }
      
      // Event Listener für Drag-Ende
      marker.on('dragend', async (e) => {
        try {
          const newPosition = e.target.getLatLng();
          if (!newPosition) return;
          
          const newStart = [newPosition.lat, newPosition.lng];
          
          // Zielpunkt aus Marker verwenden (falls vorhanden), sonst lastTarget
          const targetForRoute = marker._targetLatLng || State.getLastTarget();
          
          if (!targetForRoute || !Array.isArray(targetForRoute) || targetForRoute.length !== 2) {
            console.warn('Kein gültiger Zielpunkt für Startpunkt gefunden');
            return;
          }
          
            // Im "Zielpunkte merken" Modus: Startpunkt im targetRoutes aktualisieren
          if (isRememberMode()) {
            const targetRoutes = State.getTargetRoutes();
            const targetIndex = targetRoutes.findIndex(tr => 
              TargetService.isEqual(tr.target, targetForRoute)
            );
            
            if (targetIndex >= 0) {
              const routeInfo = targetRoutes[targetIndex];
              // Startpunkt in den Starts des Zielpunkts aktualisieren
              if (routeInfo.starts && routeInfo.starts[index] !== undefined) {
                routeInfo.starts[index] = newStart;
              }
              State.setTargetRoutes(targetRoutes);
            }
          }
          
          // Startpunkt in lastStarts aktualisieren (für Kompatibilität)
          const lastStarts = State.getLastStarts();
          if (lastStarts && lastStarts[index] !== undefined) {
            lastStarts[index] = newStart;
            State.setLastStarts(lastStarts);
          }
          
          // Alte Route entfernen
          const routePolylines = State.getRoutePolylines();
          if (routePolylines[index]) {
            MapRenderer.removePolylines([routePolylines[index]]);
            routePolylines[index] = null;
            State.setRoutePolylines(routePolylines);
          }
          
          // Alle Polylines entfernen (falls aggregierte Darstellung aktiv)
          if (CONFIG.AGGREGATED) {
            MapRenderer.clearRoutes();
          }
          
          // Neue Route berechnen
          try {
            const result = await API.fetchRoute(newStart, targetForRoute);
            if (result.paths?.[0]) {
            // Route-Daten extrahieren und im State aktualisieren
            const coords = API.extractRouteCoordinates(result);
            if (coords) {
              // Im "Zielpunkte merken" Modus: Route in targetRoutes aktualisieren
              if (isRememberMode()) {
                const targetRoutes = State.getTargetRoutes();
                const targetIndex = targetRoutes.findIndex(tr => 
                  TargetService.isEqual(tr.target, targetForRoute)
                );
                
                if (targetIndex >= 0) {
                  const routeInfo = targetRoutes[targetIndex];
                  if (routeInfo.routeData && routeInfo.routeData[index] !== undefined) {
                    routeInfo.routeData[index] = coords;
                  }
                  if (routeInfo.routeResponses && routeInfo.routeResponses[index] !== undefined) {
                    routeInfo.routeResponses[index] = { response: result, color: colors[index], index: index };
                  }
                  State.setTargetRoutes(targetRoutes);
                }
              } else {
                // Normaler Modus: allRouteData aktualisieren
                const allRouteData = State.getAllRouteData();
                const allRouteResponses = State.getAllRouteResponses();
                
                if (allRouteData[index] !== undefined) {
                  allRouteData[index] = coords;
                }
                if (allRouteResponses[index] !== undefined) {
                  allRouteResponses[index] = { response: result, color: colors[index], index: index };
                }
                
                State.setAllRouteData(allRouteData);
                State.setAllRouteResponses(allRouteResponses);
              }
              
              // Visualisierung basierend auf Modus
              if (isRememberMode()) {
                // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten neu zeichnen
                RouteRenderer.drawAllTargetRoutes();
              } else if (CONFIG.AGGREGATED) {
                // Aggregierte Darstellung neu berechnen (nur aktueller Zielpunkt)
                const allRouteData = State.getAllRouteData();
                const aggregatedSegments = AggregationService.aggregateRoutes(allRouteData);
                if (aggregatedSegments.length > 0) {
                  const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
                  RouteRenderer.drawAggregatedRoutes(aggregatedSegments, maxCount);
                }
              } else {
                // Einzelne Route zeichnen
                const newRoute = RouteRenderer.drawRoute(result, colors[index]);
                if (newRoute) {
                  routePolylines[index] = newRoute;
                  State.setRoutePolylines(routePolylines);
                }
              }
            }
          }
          
          // Histogramm aktualisieren
          if (targetForRoute) {
            const updatedStarts = isRememberMode() 
              ? (() => {
                  const targetRoutes = State.getTargetRoutes();
                  const targetIndex = targetRoutes.findIndex(tr => 
                    TargetService.isEqual(tr.target, targetForRoute)
                  );
                  return targetIndex >= 0 ? targetRoutes[targetIndex].starts : State.getLastStarts();
                })()
              : State.getLastStarts();
            
            if (updatedStarts) {
              const routeDataForTarget = (() => {
                const targetRoutes = State.getTargetRoutes();
                const tr = targetRoutes.find(t => TargetService.isEqual(t.target, targetForRoute));
                return tr ? tr.routeData : State.getAllRouteData();
              })();
              const routeDistancesForTarget = (() => {
                const targetRoutes = State.getTargetRoutes();
                const tr = targetRoutes.find(t => TargetService.isEqual(t.target, targetForRoute));
                return tr ? RouteService.getRouteDistances(tr) : [];
              })();
              Visualization.updateDistanceHistogram(updatedStarts, targetForRoute, { routeData: routeDataForTarget, routeDistances: routeDistancesForTarget });
            }
          }
          } catch (routeErr) {
            console.error(`Route-Fehler für Startpunkt ${index}:`, routeErr);
            Utils.showError(`Fehler beim Verschieben des Startpunkts ${index + 1}`, false);
          }
        } catch (err) {
          console.error(`Allgemeiner Fehler beim Draggen des Startpunkts ${index}:`, err);
          Utils.showError(`Fehler beim Verschieben des Startpunkts ${index + 1}`, false);
        }
      });
      
      newMarkers.push(marker);
    });
    
    State.setStartMarkers(newMarkers);
  },
  
  // Aktualisiert die Legende mit der aktuellen Colormap
  updateLegendGradient() {
    const gradientBar = Utils.getElement('#legend-gradient-bar');
    if (!gradientBar) return;
    
    const colormap = CONFIG.COLORMAP || 'viridis_r';
    gradientBar.style.background = ColormapUtils.generateGradientForColormap(colormap);
  },
  
  // Aktualisiert alle Colormap-Vorschau-Bars
  updateColormapPreviews() {
    const colormaps = ['viridis_r', 'plasma_r', 'inferno_r', 'magma_r'];
    colormaps.forEach(colormap => {
      const previewBar = Utils.getElement(`#colormap-preview-${colormap}`);
      if (previewBar) {
        previewBar.style.background = ColormapUtils.generateGradientForColormap(colormap, 20);
      }
    });
  },
  
  // Delegiert an SchoolRenderer
  createSchoolIcon(zoom) {
    return SchoolRenderer.createSchoolIcon(zoom);
  },
  
  updateSchoolIcons() {
    return SchoolRenderer.updateSchoolIcons();
  },
  
  drawSchools(schools) {
    return SchoolRenderer.drawSchools(schools);
  },
  
  clearSchools(schoolLayers) {
    return SchoolRenderer.clearSchools(schoolLayers);
  },
  
  drawSchoolSearchRadius(lat, lng, radiusMeters) {
    return SchoolRenderer.drawSchoolSearchRadius(lat, lng, radiusMeters);
  },
  
  clearSchoolSearchRadius() {
    return SchoolRenderer.clearSchoolSearchRadius();
  },
  
  // Delegiert an PublicTransportRenderer
  createPlatformIcon(zoom) {
    return PublicTransportRenderer.createPlatformIcon(zoom);
  },
  
  updatePlatformIcons() {
    return PublicTransportRenderer.updatePlatformIcons();
  },
  
  drawPlatforms(platforms) {
    return PublicTransportRenderer.drawPlatforms(platforms);
  },
  
  clearPlatforms(platformLayers) {
    return PublicTransportRenderer.clearPlatforms(platformLayers);
  },
  
  drawPlatformSearchRadius(lat, lng, radiusMeters) {
    return PublicTransportRenderer.drawPlatformSearchRadius(lat, lng, radiusMeters);
  },
  
  clearPlatformSearchRadius() {
    return PublicTransportRenderer.clearPlatformSearchRadius();
  },
  
  // Delegiert an MarkerManager
  highlightTargetMarker(index) {
    return MarkerManager.highlightTargetMarker(index);
  },
  
  unhighlightAllTargetMarkers() {
    return MarkerManager.unhighlightAllTargetMarkers();
  },
  
  updateSelectedTargetMarker() {
    return MarkerManager.updateSelectedTargetMarker();
  },
  
  /**
   * Zeigt die Startpunkte für einen bestimmten Zielpunkt an
   * @param {number} targetIndex - Index des Zielpunkts
   */
  _showStartPointsForTarget(targetIndex) {
    if (!isRememberMode()) return;
    
    const allTargets = State.getAllTargets();
    if (targetIndex < 0 || targetIndex >= allTargets.length) return;
    
    const target = allTargets[targetIndex];
    const targetRoutes = State.getTargetRoutes();
    const routeInfo = targetRoutes.find(tr => 
      TargetService.isEqual(tr.target, target)
    );
    
    if (routeInfo && routeInfo.starts && routeInfo.colors) {
      // lastTarget aktualisieren, damit dieser Zielpunkt als "aktiv" gilt
      State.setLastTarget(target);
      
      // Zielpunkt als ausgewählt markieren
      State.setSelectedTargetIndex(targetIndex);
      
      // Marker auf der Karte visuell hervorheben
      MarkerManager.updateSelectedTargetMarker();
      
      // Panel aktualisieren, um Stift-Icon anzuzeigen
      TargetsList.update();
      
      // Config-Werte wiederherstellen
      this._restoreTargetConfig(routeInfo);
      
      // Startpunkte anzeigen
      this.drawStartPoints(routeInfo.starts, routeInfo.colors, target);
      // Histogramm aktualisieren
      if (routeInfo.starts.length > 0) {
        HistogramRenderer.updateDistanceHistogram(routeInfo.starts, target, { routeData: routeInfo.routeData, routeDistances: RouteService.getRouteDistances(routeInfo) });
      }
    }
  },
  
  // Delegiert an MarkerManager
  cleanupOrphanedTargetMarkers() {
    return MarkerManager.cleanupOrphanedTargetMarkers();
  }
};

