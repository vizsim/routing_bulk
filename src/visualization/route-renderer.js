// ==== Route-Renderer: Route-Visualisierung ====
const RouteRenderer = {
  /**
   * Zeichnet eine einzelne Route
   * @param {Object} ghResponse - GraphHopper Response
   * @param {string} color - Farbe
   * @returns {L.Polyline|null} - Polyline oder null
   */
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
    
    return polyline;
  },
  
  /**
   * Zeichnet aggregierte Routen
   * @param {Array} aggregatedSegments - Aggregierte Segmente
   * @param {number} maxCount - Maximale Anzahl für Skalierung
   */
  drawAggregatedRoutes(aggregatedSegments, maxCount) {
    const layerGroup = State.getLayerGroup();
    
    // Berechne Min/Max und alle Counts für gewichtete Verteilung
    const counts = aggregatedSegments.map(seg => seg.count);
    const minCount = Math.min(...counts);
    const maxCountValue = Math.max(...counts);
    
    aggregatedSegments.forEach(seg => {
      // Gewichtete Verteilung: 15% Quantil, 85% linear
      const weightedLevel = Visualization.calculateWeightedLevel(
        seg.count, 
        minCount, 
        maxCountValue, 
        counts, 
        0.15
      );
      
      // Gewicht und Opacity basierend auf gewichtetem Level
      const weight = 2 + (weightedLevel * 10); // 2-12px
      const opacity = 0.7 + (weightedLevel * 0.7); // 0.3-1.0
      
      // Farbe basierend auf gewichtetem Level
      const color = Visualization.getColorForCount(seg.count, weightedLevel);
      
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
   * Zeichnet alle Routen zu allen gespeicherten Zielpunkten
   */
  drawAllTargetRoutes() {
    const targetRoutes = State.getTargetRoutes();
    const layerGroup = State.getLayerGroup();
    
    if (!layerGroup || !targetRoutes || targetRoutes.length === 0) return;
    
    // Alle bestehenden Polylines entfernen (nur Routen, nicht Marker)
    MapRenderer.clearRoutes();
    
    if (CONFIG.AGGREGATED) {
      // Aggregierte Darstellung: Alle Routen aller Zielpunkte zusammen aggregieren
      const allRouteData = RouteService.getAllRoutesForTargets();
      
      if (allRouteData.length > 0) {
        // Alle Routen zusammen aggregieren (egal von welchem Zielpunkt)
        const aggregatedSegments = AggregationService.aggregateRoutes(allRouteData);
        if (aggregatedSegments.length > 0) {
          const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
          this.drawAggregatedRoutes(aggregatedSegments, maxCount);
        }
      }
    } else {
      // Einzelne Routen: Alle Routen zu allen Zielpunkten zeichnen
      targetRoutes.forEach(routeInfo => {
        if (!routeInfo || !routeInfo.routeResponses) return;
        
        routeInfo.routeResponses.forEach((routeResponse, index) => {
          if (routeResponse) {
            const polyline = this.drawRoute(routeResponse.response, routeResponse.color);
            if (polyline && routeInfo.routePolylines) {
              routeInfo.routePolylines[index] = polyline;
            }
          }
        });
      });
    }
  },
  
  /**
   * Zeichnet Routen für einen einzelnen Zielpunkt
   * @param {Array} routeData - Route-Daten
   * @param {Array} routeResponses - Route-Responses
   * @param {Array} colors - Farben
   */
  drawRoutesForTarget(routeData, routeResponses, colors) {
    if (CONFIG.AGGREGATED && routeData.length > 0) {
      // Aggregierte Darstellung
      const aggregatedSegments = AggregationService.aggregateRoutes(routeData);
      if (aggregatedSegments.length > 0) {
        const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
        this.drawAggregatedRoutes(aggregatedSegments, maxCount);
      }
    } else {
      // Einzelne Routen zeichnen
      const routePolylines = [];
      routeResponses.forEach((routeInfo, index) => {
        if (routeInfo) {
          const polyline = this.drawRoute(routeInfo.response, routeInfo.color || colors[index]);
          routePolylines[index] = polyline;
        }
      });
      State.setRoutePolylines(routePolylines);
    }
  }
};

