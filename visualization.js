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
  
  drawTargetPoint(latlng) {
    const layerGroup = State.getLayerGroup();
    L.circleMarker(latlng, { 
      radius: 6,
      color: '#ff0000',
      fillColor: '#ff0000',
      fillOpacity: 0.8
    }).addTo(layerGroup);
  },
  
  drawStartPoints(starts, colors) {
    const layerGroup = State.getLayerGroup();
    const startMarkers = State.getStartMarkers();
    
    // Alte Marker entfernen
    startMarkers.forEach(marker => layerGroup.removeLayer(marker));
    State.setStartMarkers([]);
    
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
      
      // Event Listener für Drag-Ende
      marker.on('dragend', async (e) => {
        const newPosition = e.target.getLatLng();
        const newStart = [newPosition.lat, newPosition.lng];
        
        // Startpunkt in lastStarts aktualisieren
        const lastStarts = State.getLastStarts();
        lastStarts[index] = newStart;
        State.setLastStarts(lastStarts);
        
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
            if (layer instanceof L.Polyline) {
              polylinesToRemove.push(layer);
            }
          });
          polylinesToRemove.forEach(layer => layerGroup.removeLayer(layer));
        }
        
        // Neue Route berechnen
        try {
          const result = await API.fetchRoute(newStart, State.getLastTarget());
          if (result.paths?.[0]) {
            // Route-Daten extrahieren und im State aktualisieren
            const coords = API.extractRouteCoordinates(result);
            if (coords) {
              const allRouteData = State.getAllRouteData();
              const allRouteResponses = State.getAllRouteResponses();
              
              // Alte Route-Daten ersetzen
              if (allRouteData[index]) {
                allRouteData[index] = coords;
              }
              if (allRouteResponses[index]) {
                allRouteResponses[index] = { response: result, color: colors[index], index: index };
              }
              
              State.setAllRouteData(allRouteData);
              State.setAllRouteResponses(allRouteResponses);
              
              // Visualisierung basierend auf Modus
              if (CONFIG.AGGREGATED) {
                // Aggregierte Darstellung neu berechnen
                const aggregatedSegments = Aggregation.aggregateRoutes(allRouteData);
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
        } catch (err) {
          console.error(`Route-Fehler für Startpunkt ${index}:`, err);
        }
      });
      
      newMarkers.push(marker);
    });
    
    State.setStartMarkers(newMarkers);
  },
  
  getColorForCount(count, maxCount) {
    // Klassischer Heatmap-Gradient: Blau → Cyan → Grün → Gelb → Rot
    const ratio = count / maxCount;
    let hue;
    
    if (ratio <= 0.2) {
      // Blau zu Cyan (0-20%)
      hue = 240 - (ratio / 0.2) * 40; // 240 -> 200
    } else if (ratio <= 0.4) {
      // Cyan zu Grün (20-40%)
      hue = 200 - ((ratio - 0.2) / 0.2) * 80; // 200 -> 120
    } else if (ratio <= 0.6) {
      // Grün zu Gelb (40-60%)
      hue = 120 - ((ratio - 0.4) / 0.2) * 60; // 120 -> 60
    } else if (ratio <= 0.8) {
      // Gelb zu Orange (60-80%)
      hue = 60 - ((ratio - 0.6) / 0.2) * 30; // 60 -> 30
    } else {
      // Orange zu Rot (80-100%)
      hue = 30 - ((ratio - 0.8) / 0.2) * 30; // 30 -> 0
    }
    
    return `hsl(${hue}, 70%, 50%)`;
  },
  
  drawAggregatedRoutes(aggregatedSegments, maxCount) {
    const layerGroup = State.getLayerGroup();
    
    aggregatedSegments.forEach(seg => {
      const ratio = seg.count / maxCount;
      const weight = 2 + (ratio * 10); // 2-12px
      const opacity = 0.3 + (ratio * 0.7); // 0.3-1.0
      const color = this.getColorForCount(seg.count, maxCount);
      
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
  }
};

