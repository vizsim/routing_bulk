// ==== Visualisierung ====
const Visualization = {
  drawRoute(ghResponse, color) {
    const latlngs = API.extractRouteCoordinates(ghResponse);
    if (!latlngs) {
      return null;
    }

    const layerGroup = State.getLayerGroup();
    const polyline = L.polyline(latlngs, { 
      weight: 4, 
      opacity: 0.8, 
      color: color
    }).addTo(layerGroup);
    
    return polyline; // Referenz zurückgeben
  },
  
  drawTargetPoint(latlng, index = null) {
    const layerGroup = State.getLayerGroup();
    
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
      draggable: true
    }).addTo(layerGroup);
    
    // Koordinaten im Marker speichern für Vergleich
    marker._targetLatLng = latlng;
    
    // Index speichern für Kontextmenü
    if (index !== null) {
      marker._targetIndex = index;
      
      // Event Listener für Drag-Ende
      marker.on('dragend', async (e) => {
        const newPosition = e.target.getLatLng();
        const newTarget = [newPosition.lat, newPosition.lng];
        
        // Zielpunkt im State aktualisieren (Index verwenden statt Koordinaten-Vergleich)
        const allTargets = State.getAllTargets();
        const currentIndex = marker._targetIndex !== undefined ? marker._targetIndex : 
          allTargets.findIndex(t => TargetService.isEqual(t, marker._targetLatLng));
        
        if (currentIndex >= 0 && currentIndex < allTargets.length) {
          // Alten Zielpunkt durch neuen ersetzen
          const oldTarget = allTargets[currentIndex];
          allTargets[currentIndex] = newTarget;
          State.setAllTargets(allTargets);
          
          // Marker-Koordinaten aktualisieren
          marker._targetLatLng = newTarget;
          
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
              oldRouteInfo.routePolylines.forEach(polyline => {
                if (polyline) layerGroup.removeLayer(polyline);
              });
            }
            
            // RouteInfo im targetRoutes aktualisieren (target bereits auf newTarget setzen)
            // Wichtig: Dies muss VOR calculateRoutes passieren, damit die alten Routen nicht mehr gezeichnet werden
            targetRoutes[targetRouteIndex] = {
              target: newTarget,
              routeData: oldRouteInfo?.routeData || [],
              routeResponses: oldRouteInfo?.routeResponses || [],
              routePolylines: [], // Alte Polylines bereits entfernt
              starts: oldRouteInfo?.starts || [],
              colors: oldRouteInfo?.colors || []
            };
            State.setTargetRoutes(targetRoutes);
            
            // Alle Routen entfernen (auch die, die nicht in routePolylines gespeichert sind)
            if (CONFIG.REMEMBER_TARGETS) {
              MapRenderer.clearRoutes();
            }
            
            // Neue Routen berechnen (silent=true, da wir die Routen direkt zeichnen)
            const routeInfo = await RouteService.calculateRoutes(newTarget, { silent: true });
            if (routeInfo) {
              // RouteInfo im targetRoutes aktualisieren
              targetRoutes[targetRouteIndex] = {
                target: newTarget,
                routeData: routeInfo.routeData,
                routeResponses: routeInfo.routeResponses,
                routePolylines: [],
                starts: routeInfo.starts,
                colors: routeInfo.colors
              };
              State.setTargetRoutes(targetRoutes);
              
              // Startpunkte aktualisieren, wenn es der aktuelle Zielpunkt ist
              const isCurrentTarget = lastTarget && TargetService.isEqual(lastTarget, oldTarget);
              if (isCurrentTarget && routeInfo.starts && routeInfo.colors) {
                Visualization.drawStartPoints(routeInfo.starts, routeInfo.colors, newTarget);
              }
              
              // Alle Routen neu zeichnen
              if (CONFIG.REMEMBER_TARGETS) {
                RouteRenderer.drawAllTargetRoutes();
              } else {
                // Im normalen Modus: Nur Routen zum aktuellen Zielpunkt
                RouteRenderer.drawRoutesForTarget(
                  routeInfo.routeData,
                  routeInfo.routeResponses,
                  routeInfo.colors
                );
              }
              
              // Histogramm aktualisieren
              if (routeInfo.starts && routeInfo.starts.length > 0) {
                Visualization.updateDistanceHistogram(routeInfo.starts, newTarget);
              }
            }
          }
          
          // Verwaiste Marker entfernen
          this.cleanupOrphanedTargetMarkers();
          
          // Panel-Liste aktualisieren
          TargetsList.update();
          
          // Export-Button aktualisieren
          EventBus.emit(Events.EXPORT_REQUESTED);
        }
      });
      
      // Tooltip mit ID beim Hover (dynamisch berechnet)
      marker.on('mouseover', () => {
        // Index aus Marker verwenden (wird beim Draggen aktualisiert)
        const currentIndex = marker._targetIndex !== undefined ? marker._targetIndex :
          State.getAllTargets().findIndex(t => 
            TargetService.isEqual(t, marker._targetLatLng)
          );
        if (currentIndex >= 0) {
          const targetId = `z${currentIndex + 1}`;
          marker.setTooltipContent(targetId);
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
      
      // Rechtsklick-Event für Kontextmenü
      marker.on('contextmenu', (e) => {
        e.originalEvent.preventDefault();
        // Index aus Marker verwenden (wird beim Draggen aktualisiert)
        const currentIndex = marker._targetIndex !== undefined ? marker._targetIndex :
          State.getAllTargets().findIndex(t => 
            TargetService.isEqual(t, marker._targetLatLng)
          );
        if (currentIndex >= 0) {
          this._showTargetContextMenu(e, currentIndex);
        }
      });
    }
    
    return marker; // Marker zurückgeben für State-Verwaltung
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
          if (CONFIG.REMEMBER_TARGETS) {
            EventBus.emit(Events.VISUALIZATION_UPDATE);
          }
          
          // Export-Button aktualisieren
          EventBus.emit(Events.EXPORT_REQUESTED);
        }
      });
    }
  },
  
  updateDistanceHistogram(starts, target) {
    const canvas = document.getElementById('distance-histogram');
    if (!canvas) return;
    
    // Retina-Display Support
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Verwende die ursprüngliche Canvas-Größe aus dem HTML (250x120)
    const baseWidth = 250;
    const baseHeight = 120;
    
    // Setze Canvas-Größe für Retina
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const width = baseWidth;
    const height = baseHeight;
    
    // Berechne Distanzen
    const distances = starts.map(start => 
      Geo.distanceMeters(start[0], start[1], target[0], target[1])
    );
    
    // Finde Min/Max für Skalierung (X-Achse beginnt bei 0, endet beim Radius)
    const minDist = 0; // Immer bei 0 starten
    const maxDist = CONFIG.RADIUS_M; // Radius in Metern (nicht max. Distanz)
    const range = maxDist || 1; // Vermeide Division durch 0
    
    // Anzahl der Bins (Histogramm-Spalten)
    const numBins = Math.min(15, distances.length);
    const binSize = range / numBins;
    
    // Zähle Distanzen in Bins (relativ zu 0)
    const bins = new Array(numBins).fill(0);
    distances.forEach(dist => {
      const binIndex = Math.min(
        Math.floor(dist / binSize),
        numBins - 1
      );
      bins[binIndex]++;
    });
    
    const maxCount = Math.max(...bins);
    
    // Berechne erwartete Verteilung basierend auf ausgewählter Verteilung
    let expectedBins = State.getExpectedDistribution();
    const totalPoints = distances.length;
    
    // Bestimme aktiven Verteilungstyp
    const activeDistBtn = document.querySelector('.dist-btn.active');
    const distType = activeDistBtn ? activeDistBtn.dataset.dist : 'lognormal';
    
    // Wenn keine Verteilung vorhanden oder falsche Größe, berechne neue
    if (!expectedBins || expectedBins.length !== numBins) {
      expectedBins = Distribution.calculateDistribution(
        distType,
        numBins,
        maxDist,
        totalPoints
      );
      State.setExpectedDistribution(expectedBins);
    }
    
    const maxExpected = Math.max(...expectedBins, maxCount);
    
    // Canvas leeren
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, width, height);
    
    // Zeichne Histogramm
    const barWidth = (width - 40) / numBins;
    const padding = 20;
    const chartHeight = height - 40;
    
    bins.forEach((count, i) => {
      const barHeight = maxCount > 0 ? (count / maxCount) * chartHeight : 0;
      // X-Position basierend auf Distanz (0 bis maxDist)
      const binStartDist = i * binSize;
      const binEndDist = (i + 1) * binSize;
      const xRatioStart = maxDist > 0 ? binStartDist / maxDist : 0;
      const xRatioEnd = maxDist > 0 ? binEndDist / maxDist : 0;
      const xStart = padding + xRatioStart * (width - 2 * padding);
      const xEnd = padding + xRatioEnd * (width - 2 * padding);
      const actualBarWidth = xEnd - xStart - 2;
      const y = height - padding - barHeight;
      
      // Balken zeichnen
      ctx.fillStyle = 'rgba(0, 102, 255, 0.5)'; // #0066ff mit 0.7 Opacity
      ctx.fillRect(xStart, y, actualBarWidth, barHeight);
      
      // Rahmen
      ctx.strokeStyle = 'rgba(0, 82, 204, 0.6)'; // #0052cc mit 0.7 Opacity
      ctx.lineWidth = 1;
      ctx.strokeRect(xStart, y, actualBarWidth, barHeight);
    });
    
    // Zeichne erwartete Verteilung als Linienplot
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#666';
    ctx.beginPath();
    
    const expectedPoints = [];
    bins.forEach((_, i) => {
      const binStartDist = i * binSize;
      const binEndDist = (i + 1) * binSize;
      const binCenterDist = (binStartDist + binEndDist) / 2;
      const xRatio = maxDist > 0 ? binCenterDist / maxDist : 0;
      const x = padding + xRatio * (width - 2 * padding);
      
      const expectedHeight = maxExpected > 0 ? (expectedBins[i] / maxExpected) * chartHeight : 0;
      const y = height - padding - expectedHeight;
      
      expectedPoints.push({ x, y });
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Zeichne kleine Punkte bei jedem Bin
    expectedPoints.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    
    // Achsen-Beschriftungen
    ctx.fillStyle = '#666';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // X-Achse: Natürliche Schritte (mind. 0.5km, max. 6 Werte, startet bei 0)
    // Maximalwert ist immer der gewählte Radius
    const minKm = 0; // Immer bei 0 starten
    const maxKm = CONFIG.RADIUS_M / 1000; // Radius in km
    const rangeKm = maxKm - minKm;
    
    // Bestimme Schrittweite: maximal 6 Ticks, mindestens 0.5km Schritte
    const maxTicks = 6;
    let stepKm = Math.max(0.5, rangeKm / maxTicks);
    
    // Runde auf passende natürliche Werte (0.5, 1, 2, 5, 10, etc.)
    if (stepKm <= 0.5) stepKm = 0.5;
    else if (stepKm <= 1) stepKm = 1;
    else if (stepKm <= 2) stepKm = 2;
    else if (stepKm <= 5) stepKm = 5;
    else stepKm = Math.ceil(stepKm / 5) * 5;
    
    // Starte bei 0
    let startKm = 0;
    
    // Sammle alle Ticks (max. 6, beginnend bei 0)
    const ticks = [];
    for (let tickKm = startKm; tickKm <= maxKm && ticks.length < maxTicks; tickKm += stepKm) {
      ticks.push(tickKm);
    }
    
    // Zeichne Ticks
    ticks.forEach(tickKm => {
      // Berechne Position auf X-Achse (0 ist links, maxKm ist rechts)
      const ratio = rangeKm > 0 ? tickKm / rangeKm : 0;
      const x = padding + ratio * (width - 2 * padding);
      
      // Nur zeichnen wenn innerhalb des Canvas
      if (x >= padding && x <= width - padding) {
        const label = tickKm % 1 === 0 ? tickKm.toFixed(0) : tickKm.toFixed(1);
        ctx.fillText(
          label + 'km',
          x,
          height - padding + 5
        );
        
        // Kleine Tick-Markierung
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, height - padding);
        ctx.lineTo(x, height - padding + 3);
        ctx.stroke();
      }
    });
    
    // Y-Achse: Anzahl (ohne Dopplungen)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTickCount = 5;
    const seenValues = new Set();
    for (let i = 0; i <= yTickCount; i++) {
      const count = Math.round((i / yTickCount) * maxCount);
      // Überspringe doppelte Werte
      if (seenValues.has(count)) continue;
      seenValues.add(count);
      
      const y = height - padding - (i / yTickCount) * chartHeight;
      ctx.fillText(count.toString(), padding - 5, y);
    }
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
  
  drawStartPoints(starts, colors, target = null) {
    const layerGroup = State.getLayerGroup();
    const startMarkers = State.getStartMarkers();
    
    // Alte Marker entfernen
    startMarkers.forEach(marker => layerGroup.removeLayer(marker));
    State.setStartMarkers([]);
    
    // Zielpunkt bestimmen: Wenn nicht übergeben, lastTarget verwenden
    const targetForStarts = target || State.getLastTarget();
    
    // Größe basierend auf Modus
    const size = CONFIG.AGGREGATED ? 6 : 12;
    const borderWidth = CONFIG.AGGREGATED ? 1 : 2;
    const shadowWidth = CONFIG.AGGREGATED ? 1 : 2;
    
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
      const marker = L.marker(s, {
        icon: icon,
        draggable: true
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
        const newPosition = e.target.getLatLng();
        const newStart = [newPosition.lat, newPosition.lng];
        
        // Zielpunkt aus Marker verwenden (falls vorhanden), sonst lastTarget
        const targetForRoute = marker._targetLatLng || State.getLastTarget();
        
        if (!targetForRoute) {
          console.warn('Kein Zielpunkt für Startpunkt gefunden');
          return;
        }
        
        // Im "Zielpunkte merken" Modus: Startpunkt im targetRoutes aktualisieren
        if (CONFIG.REMEMBER_TARGETS) {
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
          layerGroup.removeLayer(routePolylines[index]);
          routePolylines[index] = null;
          State.setRoutePolylines(routePolylines);
        }
        
        // Alle Polylines entfernen (falls aggregierte Darstellung aktiv)
        if (CONFIG.AGGREGATED) {
          const polylinesToRemove = [];
          layerGroup.eachLayer(layer => {
            // Nur Polylines entfernen, die keine Schul-Layer sind
            if (layer instanceof L.Polyline && !layer._isSchoolLayer) {
              polylinesToRemove.push(layer);
            }
          });
          polylinesToRemove.forEach(layer => layerGroup.removeLayer(layer));
        }
        
        // Neue Route berechnen
        try {
          const result = await API.fetchRoute(newStart, targetForRoute);
          if (result.paths?.[0]) {
            // Route-Daten extrahieren und im State aktualisieren
            const coords = API.extractRouteCoordinates(result);
            if (coords) {
              // Im "Zielpunkte merken" Modus: Route in targetRoutes aktualisieren
              if (CONFIG.REMEMBER_TARGETS) {
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
              if (CONFIG.REMEMBER_TARGETS) {
                // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten neu zeichnen
                RouteRenderer.drawAllTargetRoutes();
              } else if (CONFIG.AGGREGATED) {
                // Aggregierte Darstellung neu berechnen (nur aktueller Zielpunkt)
                const allRouteData = State.getAllRouteData();
                const aggregatedSegments = AggregationService.aggregateRoutes(allRouteData);
                if (aggregatedSegments.length > 0) {
                  const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
                  Visualization.drawAggregatedRoutes(aggregatedSegments, maxCount);
                }
              } else {
                // Einzelne Route zeichnen
                const newRoute = Visualization.drawRoute(result, colors[index]);
                if (newRoute) {
                  routePolylines[index] = newRoute;
                  State.setRoutePolylines(routePolylines);
                }
              }
            }
          }
          
          // Histogramm aktualisieren
          if (targetForRoute) {
            const updatedStarts = CONFIG.REMEMBER_TARGETS 
              ? (() => {
                  const targetRoutes = State.getTargetRoutes();
                  const targetIndex = targetRoutes.findIndex(tr => 
                    TargetService.isEqual(tr.target, targetForRoute)
                  );
                  return targetIndex >= 0 ? targetRoutes[targetIndex].starts : State.getLastStarts();
                })()
              : State.getLastStarts();
            
            if (updatedStarts) {
              Visualization.updateDistanceHistogram(updatedStarts, targetForRoute);
            }
          }
        } catch (err) {
          console.error(`Route-Fehler für Startpunkt ${index}:`, err);
        }
      });
      
      newMarkers.push(marker);
    });
    
    State.setStartMarkers(newMarkers);
  },
  
  // Gewichtete Verteilung: Mischung aus linearer und quantil-basierter Verteilung
  // weight = 0.0: rein linear, weight = 1.0: rein quantil-basiert
  calculateWeightedLevel(count, minCount, maxCount, counts, weight = 0.3) {
    // Lineare Verteilung
    const linearLevel = (count - minCount) / (maxCount - minCount || 1);
    
    // Quantil-basierte Verteilung (vereinfacht)
    const sortedCounts = [...counts].sort((a, b) => a - b);
    const quantileIndex = sortedCounts.findIndex(c => c >= count);
    const quantileLevel = quantileIndex >= 0 ? quantileIndex / sortedCounts.length : 1.0;
    
    // Gewichtete Kombination
    return linearLevel * (1 - weight) + quantileLevel * weight;
  },
  
  // Colormap-Funktionen
  getColormapColor(t, colormapName) {
    t = Math.max(0, Math.min(1, t));
    
    let colors;
    switch (colormapName) {
      case 'plasma_r':
        colors = [
          [253, 231, 37],   // Gelb (t=0)
          [240, 201, 95],   // Gelb-Orange
          [220, 170, 141],  // Orange
          [188, 128, 189],  // Rosa
          [153, 87, 204],   // Lila
          [123, 50, 148],   // Dunkel-Lila
          [93, 15, 109],    // Sehr dunkel-Lila
          [72, 1, 101]      // Dunkelst (t=1)
        ];
        break;
      case 'inferno_r':
        colors = [
          [252, 255, 164],  // Gelb (t=0)
          [251, 191, 95],   // Orange
          [240, 125, 58],   // Rot-Orange
          [202, 71, 1],     // Rot
          [133, 20, 75],    // Dunkel-Rot
          [66, 9, 59],      // Sehr dunkel
          [25, 7, 26],      // Fast schwarz
          [0, 0, 4]         // Schwarz (t=1)
        ];
        break;
      case 'magma_r':
        colors = [
          [252, 253, 191],  // Gelb-Weiß (t=0)
          [247, 210, 130],  // Gelb
          [231, 138, 195],  // Rosa
          [221, 90, 161],   // Magenta
          [185, 37, 122],   // Lila
          [124, 29, 111],   // Dunkel-Lila
          [68, 1, 84],      // Sehr dunkel
          [0, 0, 4]         // Schwarz (t=1)
        ];
        break;
      case 'viridis_r':
      default:
        colors = [
          [253, 231, 37],   // Gelb (t=0)
          [181, 222, 43],   // Gelb-Grün
          [110, 206, 88],   // Grün
          [53, 183, 121],   // Grün-Türkis
          [31, 158, 137],   // Türkis
          [38, 130, 142],   // Türkis-Blau
          [49, 104, 142],   // Blau
          [62, 73, 137],    // Blau-Lila
          [72, 40, 120],    // Lila
          [68, 1, 84]       // Dunkel-Lila (t=1)
        ];
        break;
    }
    
    // Interpolation zwischen den Farben
    const numColors = colors.length;
    const scaledT = t * (numColors - 1);
    const index = Math.floor(scaledT);
    const fraction = scaledT - index;
    
    const color1 = colors[Math.min(index, numColors - 1)];
    const color2 = colors[Math.min(index + 1, numColors - 1)];
    
    const r = Math.round(color1[0] + (color2[0] - color1[0]) * fraction);
    const g = Math.round(color1[1] + (color2[1] - color1[1]) * fraction);
    const b = Math.round(color1[2] + (color2[2] - color1[2]) * fraction);
    
    return `rgb(${r}, ${g}, ${b})`;
  },
  
  // Generiert einen Gradient-String für eine Colormap
  generateGradientForColormap(colormapName, numSteps = 10) {
    let gradientStops = [];
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const color = this.getColormapColor(t, colormapName);
      const percent = (i / numSteps) * 100;
      gradientStops.push(`${color} ${percent}%`);
    }
    return `linear-gradient(to right, ${gradientStops.join(', ')})`;
  },
  
  // Aktualisiert die Legende mit der aktuellen Colormap
  updateLegendGradient() {
    const gradientBar = Utils.getElement('#legend-gradient-bar');
    if (!gradientBar) return;
    
    const colormap = CONFIG.COLORMAP || 'viridis_r';
    gradientBar.style.background = this.generateGradientForColormap(colormap);
  },
  
  // Aktualisiert alle Colormap-Vorschau-Bars
  updateColormapPreviews() {
    const colormaps = ['viridis_r', 'plasma_r', 'inferno_r', 'magma_r'];
    colormaps.forEach(colormap => {
      const previewBar = Utils.getElement(`#colormap-preview-${colormap}`);
      if (previewBar) {
        previewBar.style.background = this.generateGradientForColormap(colormap, 20);
      }
    });
  },
  
  getColorForCount(count, weightedLevel) {
    // Verwende ausgewählte Colormap
    return this.getColormapColor(weightedLevel, CONFIG.COLORMAP || 'viridis_r');
  },
  
  drawAggregatedRoutes(aggregatedSegments, maxCount) {
    const layerGroup = State.getLayerGroup();
    
    // Berechne Min/Max und alle Counts für gewichtete Verteilung
    const counts = aggregatedSegments.map(seg => seg.count);
    const minCount = Math.min(...counts);
    const maxCountValue = Math.max(...counts);
    
    aggregatedSegments.forEach(seg => {
      // Gewichtete Verteilung: 15% Quantil, 85% linear (Zwischenlösung)
      const weightedLevel = this.calculateWeightedLevel(
        seg.count, 
        minCount, 
        maxCountValue, 
        counts, 
        0.15 // 15% Quantil-Gewichtung
      );
      
      // Gewicht und Opacity basierend auf gewichtetem Level
      const weight = 2 + (weightedLevel * 10); // 2-12px
      const opacity = 0.7 + (weightedLevel * 0.7); // 0.3-1.0
      
      // Farbe basierend auf gewichtetem Level mit viridis_r
      const color = this.getColorForCount(seg.count, weightedLevel);
      
      const polyline = L.polyline([seg.start, seg.end], {
        weight: weight,
        opacity: opacity,
        color: color
      });
      
      // Tooltip mit Anzahl hinzufügen
      polyline.bindTooltip(`${seg.count} Route${seg.count !== 1 ? 'n' : ''}`, {
        permanent: false,
        direction: 'top',
        className: 'aggregated-route-tooltip'
      });
      
      polyline.addTo(layerGroup);
    });
  },
  
  /**
   * Erstellt ein Schul-Icon basierend auf dem aktuellen Zoom-Level
   * @param {number} zoom - Aktueller Zoom-Level
   * @returns {L.DivIcon} - Icon für Schul-Marker
   */
  createSchoolIcon(zoom) {
    // Größe basierend auf Zoom-Level: kleiner bei niedrigem Zoom, größer bei hohem Zoom
    // Zoom 10: 10px, Zoom 15: 28px, Zoom 19: 36px
    const baseSize = Math.max(10, Math.min(36, 10 + (zoom - 10) * 2.8));
    const svgSize = Math.max(6, Math.min(22, 6 + (zoom - 10) * 2.8));
    const borderWidth = zoom < 13 ? 1.5 : 2;
    
      return L.divIcon({
      className: 'school-marker-icon',
      html: `
        <div style="
          width: ${baseSize}px;
          height: ${baseSize}px;
          background-color: white;
          border: ${borderWidth}px solid #3b82f6;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        ">
          <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 512 512" fill="#3b82f6" xmlns="http://www.w3.org/2000/svg">
            <path d="M463.313,346.29c-0.758-2.274-2.224-4.747-4.085-6.608l-83.683-83.682l131.503-131.502c6.603-6.603,6.603-17.307,0-23.909
              L411.411,4.952C408.241,1.782,403.941,0,399.456,0s-8.785,1.782-11.954,4.952
              c-4.677,4.677-123.793,123.793-131.502,131.502l-71.724-71.725c-0.001-0.001-0.002-0.002-0.003-0.005
              c-0.001-0.002-0.002-0.002-0.005-0.003l-47.815-47.815c-19.819-19.821-51.904-19.826-71.727,0L16.908,64.726
              c-19.776,19.775-19.776,51.952,0,71.727l119.547,119.547C134.263,258.19,16.761,375.691,4.952,387.5
              c-6.603,6.603-6.603,17.307,0,23.909l95.637,95.639c3.171,3.17,7.47,4.952,11.954,4.952s8.785-1.782,11.954-4.952
              l131.502-131.502l83.682,83.682c1.853,1.853,4.317,3.322,6.608,4.085l143.456,47.818c6.058,2.02,12.762,0.455,17.301-4.085
              c4.529-4.528,6.11-11.226,4.085-17.301L463.313,346.29z M303.82,136.453l23.909,23.91c3.301,3.301,7.628,4.952,11.954,4.952
              s8.654-1.651,11.954-4.952c6.603-6.601,6.603-17.307,0-23.909l-23.909-23.909l23.909-23.909l23.91,23.909
              c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.65,11.954-4.952c6.603-6.603,6.603-17.307,0-23.909l-23.909-23.909
              l23.909-23.909l71.728,71.728L351.638,232.09l-71.728-71.728L303.82,136.453z M423.366,351.637l-23.91,23.91L148.408,124.499
              l23.909-23.909L423.366,351.637z M76.681,148.408l-35.864-35.864c-6.591-6.592-6.591-17.318,0-23.909l47.819-47.819
              c6.607-6.606,17.301-6.609,23.909,0l35.864,35.864C145.133,79.956,79.944,145.145,76.681,148.408z M112.545,471.183l-71.728-71.728
              l23.91-23.909l23.909,23.91c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.651,11.954-4.952c6.603-6.601,6.603-17.307,0-23.909
              l-23.908-23.91l23.909-23.909l23.91,23.909c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.65,11.954-4.952
              c6.603-6.603,6.603-17.307,0-23.909l-23.91-23.909l23.909-23.909l71.728,71.728L112.545,471.183z M351.637,423.366L100.59,172.317
              l23.909-23.909l251.048,251.048L351.637,423.366z M382.935,439.886l56.952-56.952l28.475,85.427L382.935,439.886z"/>
          </svg>
        </div>
      `,
      iconSize: [baseSize, baseSize],
      iconAnchor: [baseSize / 2, baseSize / 2]
    });
  },
  
  /**
   * Aktualisiert alle Schul-Marker-Icons basierend auf dem aktuellen Zoom-Level
   */
  updateSchoolIcons() {
    const map = State.getMap();
    if (!map) return;
    
    const zoom = map.getZoom();
    const schoolLayers = State.getSchoolMarkers() || [];
    const newIcon = this.createSchoolIcon(zoom);
    
    schoolLayers.forEach(layer => {
      // Nur Marker aktualisieren (nicht Polygone)
      if (layer instanceof L.Marker && layer._isSchoolLayer) {
        layer.setIcon(newIcon);
      }
    });
  },
  
  /**
   * Zeichnet Schulen auf der Karte
   * - Nodes werden als Marker dargestellt
   * - Ways werden als Polygone dargestellt
   * @param {Array} schools - Array von Schul-Objekten mit {type, lat, lng, coordinates, name, tags}
   * @returns {Array} Array von Layer-Referenzen (Marker oder Polygone)
   */
  drawSchools(schools) {
    const layerGroup = State.getLayerGroup();
    const map = State.getMap();
    const layers = [];
    
    // Icon für Schul-Marker basierend auf aktuellem Zoom-Level
    const currentZoom = map ? map.getZoom() : 13;
    const schoolIcon = this.createSchoolIcon(currentZoom);
    
    // Hilfsfunktion zum Erstellen von Popup-Content
    const createPopupContent = (school) => {
      let popupContent = `<strong>${school.name}</strong>`;
      
      // Zusätzliche Informationen aus Tags
      if (school.tags) {
        if (school.tags['addr:street'] && school.tags['addr:housenumber']) {
          popupContent += `<br>${school.tags['addr:street']} ${school.tags['addr:housenumber']}`;
        }
        if (school.tags['addr:postcode'] && school.tags['addr:city']) {
          popupContent += `<br>${school.tags['addr:postcode']} ${school.tags['addr:city']}`;
        }
        if (school.tags.website) {
          popupContent += `<br><a href="${school.tags.website}" target="_blank">Website</a>`;
        }
        if (school.tags.phone) {
          popupContent += `<br>Tel: ${school.tags.phone}`;
        }
      }
      
      return popupContent;
    };
    
    schools.forEach(school => {
      if (school.type === 'way' && school.coordinates) {
        // Way als Polygon zeichnen
        const polygon = L.polygon(school.coordinates, {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.3,
          weight: 2,
          opacity: 0.8
        }).addTo(layerGroup);
        
        // Markiere als Schul-Layer
        polygon._isSchoolLayer = true;
        polygon._schoolId = school.id;
        
        // Popup hinzufügen
        polygon.bindPopup(createPopupContent(school), {
          maxWidth: 250,
          className: 'school-popup'
        });
        
        layers.push(polygon);
        
        // Berechne Mittelpunkt des Polygons für Icon
        let centerLat = 0;
        let centerLng = 0;
        const coords = school.coordinates;
        // Entferne letztes Element falls es das erste wiederholt (geschlossenes Polygon)
        const uniqueCoords = coords.length > 0 && 
          coords[0][0] === coords[coords.length - 1][0] && 
          coords[0][1] === coords[coords.length - 1][1] 
          ? coords.slice(0, -1) 
          : coords;
        
        uniqueCoords.forEach(coord => {
          centerLat += coord[0];
          centerLng += coord[1];
        });
        centerLat /= uniqueCoords.length;
        centerLng /= uniqueCoords.length;
        
        // Marker mit Icon in der Mitte des Polygons
        const centerMarker = L.marker([centerLat, centerLng], { icon: schoolIcon })
          .addTo(layerGroup);
        
        // Markiere als Schul-Layer
        centerMarker._isSchoolLayer = true;
        centerMarker._schoolId = school.id;
        
        // Popup hinzufügen
        centerMarker.bindPopup(createPopupContent(school), {
          maxWidth: 250,
          className: 'school-popup'
        });
        
        layers.push(centerMarker);
      } else if (school.lat && school.lng) {
        // Node oder Relation als Marker zeichnen
        const marker = L.marker([school.lat, school.lng], { icon: schoolIcon })
          .addTo(layerGroup);
        
        // Markiere als Schul-Layer
        marker._isSchoolLayer = true;
        marker._schoolId = school.id;
        
        // Popup hinzufügen
        marker.bindPopup(createPopupContent(school), {
          maxWidth: 250,
          className: 'school-popup'
        });
        
        layers.push(marker);
      }
    });
    
    return layers;
  },
  
  /**
   * Entfernt alle Schul-Layer von der Karte (Marker und Polygone)
   * @param {Array} schoolLayers - Array von Layer-Referenzen (Marker oder Polygone)
   */
  clearSchools(schoolLayers) {
    if (!schoolLayers || schoolLayers.length === 0) return;
    
    const layerGroup = State.getLayerGroup();
    schoolLayers.forEach(layer => {
      if (layer && layerGroup) {
        layerGroup.removeLayer(layer);
      }
    });
  },
  
  /**
   * Zeichnet einen Radius-Kreis für die Schul-Suche
   * @param {number} lat - Breitengrad des Zentrums
   * @param {number} lng - Längengrad des Zentrums
   * @param {number} radiusMeters - Radius in Metern
   * @returns {L.Circle} - Circle-Layer
   */
  drawSchoolSearchRadius(lat, lng, radiusMeters) {
    const layerGroup = State.getLayerGroup();
    
    // Entferne alten Kreis, falls vorhanden
    const oldCircle = State.getSchoolSearchRadiusCircle();
    if (oldCircle && layerGroup) {
      layerGroup.removeLayer(oldCircle);
    }
    
    // Erstelle neuen Kreis
    const circle = L.circle([lat, lng], {
      radius: radiusMeters,
      color: '#666666',
      fillColor: '#999999',
      fillOpacity: 0.2,
      weight: 2,
      opacity: 0.5
    }).addTo(layerGroup);
    
    State.setSchoolSearchRadiusCircle(circle);
    return circle;
  },
  
  /**
   * Entfernt den Radius-Kreis für die Schul-Suche
   */
  clearSchoolSearchRadius() {
    const oldCircle = State.getSchoolSearchRadiusCircle();
    if (oldCircle) {
      const layerGroup = State.getLayerGroup();
      if (layerGroup) {
        layerGroup.removeLayer(oldCircle);
      }
      State.setSchoolSearchRadiusCircle(null);
    }
  },
  
  /**
   * Highlightet einen Target-Marker auf der Karte
   * @param {number} index - Index des Zielpunkts
   */
  highlightTargetMarker(index) {
    const targetMarkers = State.getTargetMarkers();
    if (index >= 0 && index < targetMarkers.length && targetMarkers[index]) {
      const marker = targetMarkers[index];
      const iconElement = marker._icon;
      if (iconElement) {
        iconElement.classList.add('target-marker-highlighted');
      }
    }
  },
  
  /**
   * Entfernt Highlighting von allen Target-Markern
   */
  unhighlightAllTargetMarkers() {
    const targetMarkers = State.getTargetMarkers();
    targetMarkers.forEach(marker => {
      if (marker && marker._icon) {
        marker._icon.classList.remove('target-marker-highlighted');
      }
    });
  },
  
  /**
   * Entfernt verwaiste Target-Marker (Marker ohne zugehörigen Zielpunkt im State)
   */
  cleanupOrphanedTargetMarkers() {
    const layerGroup = State.getLayerGroup();
    const allTargets = State.getAllTargets();
    const targetMarkers = State.getTargetMarkers();
    
    if (!layerGroup) return;
    
    const validMarkers = [];
    const markersToRemove = [];
    
    // Prüfe alle Marker im State
    targetMarkers.forEach((marker, index) => {
      if (!marker) {
        // Marker existiert nicht mehr
        return;
      }
      
      // Prüfe ob Marker noch gültig ist
      const isValid = index < allTargets.length && 
                      allTargets[index] &&
                      marker._targetLatLng &&
                      TargetService.isEqual(marker._targetLatLng, allTargets[index]);
      
      if (isValid) {
        validMarkers[index] = marker;
      } else {
        // Marker ist verwaist - entfernen
        markersToRemove.push(marker);
      }
    });
    
    // Entferne verwaiste Marker von der Karte
    markersToRemove.forEach(marker => {
      try {
        layerGroup.removeLayer(marker);
      } catch (err) {
        console.warn('Fehler beim Entfernen verwaister Marker:', err);
      }
    });
    
    // Aktualisiere State mit nur noch gültigen Markern
    State.setTargetMarkers(validMarkers);
    
    // Prüfe auch alle Marker auf der Karte, die nicht im State sind
    const orphanedMarkers = [];
    layerGroup.eachLayer(layer => {
      if (layer instanceof L.Marker && 
          layer._targetLatLng && 
          layer._targetIndex !== undefined) {
        // Prüfe ob dieser Marker noch im State ist
        const isInState = targetMarkers.some((m, idx) => 
          m === layer && idx < allTargets.length
        );
        
        if (!isInState) {
          // Marker ist auf der Karte, aber nicht im State
          const targetIndex = allTargets.findIndex(t => 
            TargetService.isEqual(t, layer._targetLatLng)
          );
          
          if (targetIndex < 0) {
            // Zielpunkt existiert nicht mehr - Marker entfernen
            orphanedMarkers.push(layer);
          }
        }
      }
    });
    
    // Entferne verwaiste Marker von der Karte
    orphanedMarkers.forEach(marker => {
      try {
        layerGroup.removeLayer(marker);
      } catch (err) {
        console.warn('Fehler beim Entfernen verwaister Marker:', err);
      }
    });
  }
};

