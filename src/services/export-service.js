// ==== Export-Service: Export-Funktionalität ====
const ExportService = {
  /**
   * Exportiert Routen als GeoJSON
   */
  exportToGeoJSON() {
    const allRouteData = State.getAllRouteData();
    const allRouteResponses = State.getAllRouteResponses();
    
    if (!allRouteData || allRouteData.length === 0) {
      Utils.showError('Keine Routen zum Exportieren vorhanden.', true);
      return;
    }
    
    const features = [];
    
    if (CONFIG.AGGREGATED) {
      // Aggregierte Darstellung: Exportiere aggregierte Segmente
      const aggregatedSegments = AggregationService.aggregateRoutes(allRouteData);
      
      aggregatedSegments.forEach((segment, index) => {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [segment.start[1], segment.start[0]], // GeoJSON: [lng, lat]
              [segment.end[1], segment.end[0]]
            ]
          },
          properties: {
            count: segment.count,
            segmentIndex: index
          }
        });
      });
    } else {
      // Nicht-aggregierte Darstellung: Exportiere alle Routen einzeln
      allRouteResponses.forEach((routeInfo, index) => {
        if (routeInfo && routeInfo.response) {
          const coords = API.extractRouteCoordinates(routeInfo.response);
          if (coords && coords.length > 0) {
            const geoJsonCoords = coords.map(coord => [coord[1], coord[0]]);
            
            features.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: geoJsonCoords
              },
              properties: {
                routeIndex: index,
                color: routeInfo.color || null
              }
            });
          }
        }
      });
    }
    
    const geoJson = {
      type: 'FeatureCollection',
      features: features,
      metadata: {
        exportDate: new Date().toISOString(),
        mode: CONFIG.AGGREGATED ? 'aggregated' : 'individual',
        aggregationMethod: CONFIG.AGGREGATED ? CONFIG.AGGREGATION_METHOD : null,
        routeCount: allRouteData.length,
        profile: CONFIG.PROFILE
      }
    };
    
    // Download als Datei
    const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    let filename = 'routes_';
    if (CONFIG.AGGREGATED) {
      filename += `aggregated_${CONFIG.AGGREGATION_METHOD}_`;
    } else {
      filename += 'individual_';
    }
    filename += `${new Date().toISOString().split('T')[0]}.geojson`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    EventBus.emit(Events.EXPORT_COMPLETED, { format: 'geojson' });
  }
};

