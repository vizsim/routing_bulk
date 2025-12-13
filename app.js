// ==== Haupt-Orchestrierung ====
const App = {
  async calculateRoutes(target, reuseStarts = false) {
    // Config-Werte aktualisieren
    updateConfigFromUI();
    
    const layerGroup = State.getLayerGroup();
    layerGroup.clearLayers();

    Visualization.drawTargetPoint(target);

    // Startpunkte erzeugen oder wiederverwenden
    let starts;
    let colors;
    if (reuseStarts && State.getLastStarts() && State.getLastColors()) {
      starts = State.getLastStarts(); // Wiederverwende die gespeicherten Startpunkte
      colors = State.getLastColors(); // Wiederverwende die gespeicherten Farben
    } else {
      starts = Array.from({ length: CONFIG.N }, () => 
        Geo.randomPointInRadius(target[0], target[1], CONFIG.RADIUS_M)
      );
      State.setLastStarts(starts); // Speichere die neuen Startpunkte
      
      // Farben für alle Routen/Startpunkte generieren
      colors = Array.from({ length: CONFIG.N }, () => 
        `hsl(${Math.random() * 360}, 70%, 50%)`
      );
      State.setLastColors(colors); // Speichere die neuen Farben
    }

    // Route-Polylines und Daten zurücksetzen
    State.resetRouteData();
    
    // Startpunkte mit Farben zeichnen
    Visualization.drawStartPoints(starts, colors);

    // N Requests parallel
    try {
      const results = await Promise.all(
        starts.map(s => API.fetchRoute(s, target).catch(err => ({ __err: err })))
      );

      let ok = 0, fail = 0;
      const validRoutes = [];
      const allRouteData = [];
      const allRouteResponses = [];
      const routePolylines = [];
      
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.__err) { 
          fail++; 
          console.error("Route-Fehler:", r.__err);
          routePolylines.push(null);
          allRouteResponses.push(null);
          continue; 
        }
        ok++;
        
        // Route-Daten extrahieren und speichern
        const coords = API.extractRouteCoordinates(r);
        if (coords) {
          allRouteData.push(coords);
          allRouteResponses.push({ response: r, color: colors[i], index: i });
          validRoutes.push({ response: r, color: colors[i], index: i });
        } else {
          allRouteResponses.push(null);
        }
      }
      
      // State aktualisieren
      State.setAllRouteData(allRouteData);
      State.setAllRouteResponses(allRouteResponses);
      
      // Visualisierung basierend auf Modus
      if (CONFIG.AGGREGATED && allRouteData.length > 0) {
        // Aggregierte Darstellung
        const aggregatedSegments = Aggregation.aggregateRoutes(allRouteData);
        const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
        Visualization.drawAggregatedRoutes(aggregatedSegments, maxCount);
      } else {
        // Einzelne Routen zeichnen
        validRoutes.forEach(({ response, color, index }) => {
          const polyline = Visualization.drawRoute(response, color);
          routePolylines[index] = polyline;
        });
        State.setRoutePolylines(routePolylines);
      }
      
      console.log(`Routen ok=${ok}, fail=${fail}`);
      
      // Histogramm aktualisieren
      if (starts && target) {
        Visualization.updateDistanceHistogram(starts, target);
      }
      
      // Export-Button aktivieren
      if (typeof updateExportButtonState === 'function') {
        updateExportButtonState();
      }
      
      // Info anzeigen
      if (ok === 0 && fail > 0) {
        alert(`Alle ${fail} Routen fehlgeschlagen. Bitte Browser-Konsole prüfen.`);
      }
    } catch (err) {
      console.error(err);
      alert(String(err));
    }
  },
  
  async redrawRoutes() {
    const lastTarget = State.getLastTarget();
    const allRouteData = State.getAllRouteData();
    
    if (!lastTarget || allRouteData.length === 0) return;
    
    const layerGroup = State.getLayerGroup();
    const routePolylines = State.getRoutePolylines();
    
    // Alle Routen-Polylines entfernen (Markers sind keine Polylines, bleiben erhalten)
    routePolylines.forEach(polyline => {
      if (polyline) layerGroup.removeLayer(polyline);
    });
    
    // Alle Polylines aus layerGroup entfernen (sind die Routen)
    const polylinesToRemove = [];
    layerGroup.eachLayer(layer => {
      if (layer instanceof L.Polyline) {
        polylinesToRemove.push(layer);
      }
    });
    polylinesToRemove.forEach(layer => layerGroup.removeLayer(layer));
    
    State.setRoutePolylines([]);
    
    // Startpunkte neu zeichnen (mit neuer Größe basierend auf Modus)
    if (State.getLastStarts() && State.getLastColors()) {
      Visualization.drawStartPoints(State.getLastStarts(), State.getLastColors());
    }
    
    // Neu zeichnen basierend auf Modus
    if (CONFIG.AGGREGATED) {
      const aggregatedSegments = Aggregation.aggregateRoutes(allRouteData);
      if (aggregatedSegments.length > 0) {
        const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
        Visualization.drawAggregatedRoutes(aggregatedSegments, maxCount);
      }
    } else {
      // Einzelne Routen aus gespeicherten Responses zeichnen
      const allRouteResponses = State.getAllRouteResponses();
      const newRoutePolylines = [];
      
      allRouteResponses.forEach((routeInfo, index) => {
        if (routeInfo) {
          const polyline = Visualization.drawRoute(routeInfo.response, routeInfo.color);
          newRoutePolylines[index] = polyline;
        }
      });
      
      State.setRoutePolylines(newRoutePolylines);
    }
    
    // Export-Button Status aktualisieren
    if (typeof updateExportButtonState === 'function') {
      updateExportButtonState();
    }
  },
  
  async handleMapClick(e) {
    const target = [e.latlng.lat, e.latlng.lng];
    State.setLastTarget(target); // Zielpunkt speichern
    await App.calculateRoutes(target);
  },
  
  async recalculateRoutes() {
    const lastTarget = State.getLastTarget();
    if (lastTarget) {
      // Beim Profilwechsel: Startpunkte wiederverwenden
      await App.calculateRoutes(lastTarget, true);
    }
  },
  
  exportToGeoJSON() {
    const allRouteData = State.getAllRouteData();
    const allRouteResponses = State.getAllRouteResponses();
    
    if (!allRouteData || allRouteData.length === 0) {
      alert('Keine Routen zum Exportieren vorhanden.');
      return;
    }
    
    const features = [];
    
    if (CONFIG.AGGREGATED) {
      // Aggregierte Darstellung: Exportiere aggregierte Segmente
      const aggregatedSegments = Aggregation.aggregateRoutes(allRouteData);
      
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
            // Konvertiere [lat, lng] zu GeoJSON [lng, lat]
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
    
    // Dateiname mit Aggregierungsmethode
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
  }
};

// ==== Start ====
// Warte bis DOM und Leaflet geladen sind
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', MapInit.init);
} else {
  MapInit.init();
}
