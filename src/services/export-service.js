// ==== Export-Service: Export-Funktionalität ====
const ExportService = {
  /**
   * Exportiert Routen als GeoJSON.
   * Im Modus "Zielpunkte merken" werden Routen aller Zielpunkte exportiert (mit targetId/targetIndex pro Route).
   */
  exportToGeoJSON() {
    const rememberMode = typeof isRememberMode === 'function' && isRememberMode();
    const targetRoutes = State.getTargetRoutes();

    let allRouteData;
    let allRouteResponses;
    let totalRouteCount = 0;
    let targetsCount = null;

    if (rememberMode && targetRoutes && targetRoutes.length > 0) {
      // Modus "Zielpunkte merken": Daten aus allen Zielpunkten sammeln
      allRouteData = targetRoutes.flatMap(tr => tr.routeData || []);
      allRouteResponses = []; // wird beim Erzeugen der Features pro Ziel gefüllt
      totalRouteCount = allRouteData.length;
      targetsCount = targetRoutes.length;
    } else {
      allRouteData = State.getAllRouteData();
      allRouteResponses = State.getAllRouteResponses();
      totalRouteCount = allRouteData?.length || 0;
    }

    if (!allRouteData || totalRouteCount === 0) {
      Utils.showError('Keine Routen zum Exportieren vorhanden.', true);
      return;
    }

    const features = [];

    if (CONFIG.AGGREGATED) {
      const aggregatedSegments = AggregationService.aggregateRoutes(allRouteData);
      aggregatedSegments.forEach((segment, index) => {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [segment.start[1], segment.start[0]],
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
      if (rememberMode && targetRoutes && targetRoutes.length > 0) {
        // Pro Zielpunkt alle Routen als eigene Features mit Ziel-Info
        targetRoutes.forEach((tr, targetIndex) => {
          const responses = tr.routeResponses || [];
          const targetId = State.getTargetId ? State.getTargetId(tr.target) : null;
          responses.forEach((routeInfo, routeIndex) => {
            if (routeInfo && routeInfo.response) {
              const coords = API.extractRouteCoordinates(routeInfo.response);
              if (coords && coords.length > 0) {
                const geoJsonCoords = coords.map(coord => [coord[1], coord[0]]);
                features.push({
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: geoJsonCoords },
                  properties: {
                    targetIndex,
                    targetId: targetId != null ? targetId : undefined,
                    routeIndex: routeIndex,
                    color: routeInfo.color || null
                  }
                });
              }
            }
          });
        });
      } else {
        allRouteResponses.forEach((routeInfo, index) => {
          if (routeInfo && routeInfo.response) {
            const coords = API.extractRouteCoordinates(routeInfo.response);
            if (coords && coords.length > 0) {
              const geoJsonCoords = coords.map(coord => [coord[1], coord[0]]);
              features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: geoJsonCoords },
                properties: {
                  routeIndex: index,
                  color: routeInfo.color || null
                }
              });
            }
          }
        });
      }
    }

    const metadata = {
      exportDate: new Date().toISOString(),
      mode: CONFIG.AGGREGATED ? 'aggregated' : 'individual',
      aggregationMethod: CONFIG.AGGREGATED ? CONFIG.AGGREGATION_METHOD : null,
      routeCount: totalRouteCount,
      profile: CONFIG.PROFILE
    };
    if (targetsCount != null) metadata.targetsCount = targetsCount;

    const geoJson = {
      type: 'FeatureCollection',
      features: features,
      metadata
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

