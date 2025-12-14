// ==== Haupt-Orchestrierung ====
const App = {
  async calculateRoutes(target, reuseStarts = false) {
    // Validierung
    if (!Utils.assertExists(target, 'Target')) return;
    if (!Array.isArray(target) || target.length !== 2) {
      Utils.showError('Ungültiger Zielpunkt', true);
      return;
    }
    
    // Config-Werte aktualisieren
    updateConfigFromUI();
    
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      Utils.logError('calculateRoutes', 'LayerGroup nicht initialisiert');
      return;
    }
    
    // Nur Layer löschen wenn nicht im "Zielpunkte merken" Modus
    // Im "Zielpunkte merken" Modus sollen alle Zielpunkte erhalten bleiben
    if (!CONFIG.REMEMBER_TARGETS) {
      layerGroup.clearLayers();
      Visualization.drawTargetPoint(target);
    } else {
      // Im "Zielpunkte merken" Modus: Nur Startpunkte des aktuellen Klicks löschen
      // Alle Zielpunkt-Marker und Routen behalten
      const startMarkers = State.getStartMarkers();
      startMarkers.forEach(marker => {
        if (marker) layerGroup.removeLayer(marker);
      });
      
      // Alle gespeicherten Zielpunkte zeichnen (falls noch nicht gezeichnet)
      const allTargets = State.getAllTargets();
      const targetMarkers = State.getTargetMarkers();
      
      // Prüfe welche Zielpunkte noch nicht gezeichnet sind
      allTargets.forEach((t, index) => {
        if (!targetMarkers[index]) {
          const marker = Visualization.drawTargetPoint(t);
          targetMarkers[index] = marker;
        }
      });
      State.setTargetMarkers(targetMarkers);
      
      // Aktuellen Zielpunkt zeichnen (falls noch nicht vorhanden)
      const targetExists = allTargets.some(t => 
        Math.abs(t[0] - target[0]) < 0.0001 && 
        Math.abs(t[1] - target[1]) < 0.0001
      );
      if (!targetExists) {
        Visualization.drawTargetPoint(target);
      }
      
      // Alle Routen zu allen Zielpunkten anzeigen (wird nach calculateRoutes aktualisiert)
    }

    // Startpunkte erzeugen oder wiederverwenden
    let starts;
    let colors;
    if (reuseStarts && State.getLastStarts() && State.getLastColors()) {
      starts = State.getLastStarts(); // Wiederverwende die gespeicherten Startpunkte
      colors = State.getLastColors(); // Wiederverwende die gespeicherten Farben
    } else {
      // Setze Standard-Verteilung falls noch keine gesetzt
      const activeDistBtn = document.querySelector('.dist-btn.active');
      const distType = activeDistBtn ? activeDistBtn.dataset.dist : 'lognormal';
      const numBins = Math.min(15, CONFIG.N);
      Distribution.setDistribution(distType, numBins, CONFIG.RADIUS_M, CONFIG.N);
      
      // Verwende angepasste Verteilung falls vorhanden, sonst zufällig
      starts = Geo.generatePointsFromDistribution(
        target[0], 
        target[1], 
        CONFIG.RADIUS_M, 
        CONFIG.N
      );
      State.setLastStarts(starts); // Speichere die neuen Startpunkte
      
      // Farben für alle Routen/Startpunkte generieren
      colors = Array.from({ length: CONFIG.N }, () => 
        `hsl(${Math.random() * 360}, 70%, 50%)`
      );
      State.setLastColors(colors); // Speichere die neuen Farben
    }

    // Route-Polylines und Daten zurücksetzen (nur wenn nicht im "Zielpunkte merken" Modus)
    // Im "Zielpunkte merken" Modus werden die Routen pro Zielpunkt gespeichert
    if (!CONFIG.REMEMBER_TARGETS) {
      State.resetRouteData();
    }
    
    // Startpunkte mit Farben zeichnen (nur für aktuellen Klick)
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
      
      // Wenn "Zielpunkte merken" aktiviert ist, Routen zu diesem Zielpunkt speichern
      if (CONFIG.REMEMBER_TARGETS) {
        const targetRoutes = State.getTargetRoutes();
        const targetIndex = targetRoutes.findIndex(tr => 
          Math.abs(tr.target[0] - target[0]) < 0.0001 && 
          Math.abs(tr.target[1] - target[1]) < 0.0001
        );
        
        const routeInfo = {
          target: target,
          routeData: allRouteData,
          routeResponses: allRouteResponses,
          routePolylines: routePolylines,
          starts: starts,
          colors: colors
        };
        
        if (targetIndex >= 0) {
          // Bestehende Routen zu diesem Zielpunkt ersetzen
          // Alte Polylines entfernen
          const oldRouteInfo = targetRoutes[targetIndex];
          if (oldRouteInfo && oldRouteInfo.routePolylines) {
            oldRouteInfo.routePolylines.forEach(polyline => {
              if (polyline) layerGroup.removeLayer(polyline);
            });
          }
          targetRoutes[targetIndex] = routeInfo;
        } else {
          // Neue Routen hinzufügen
          targetRoutes.push(routeInfo);
        }
        State.setTargetRoutes(targetRoutes);
      }
      
      // Visualisierung basierend auf Modus
      if (CONFIG.REMEMBER_TARGETS) {
        // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten anzeigen
        App.drawAllTargetRoutes();
      } else {
        // Normaler Modus: Nur Routen zum aktuellen Zielpunkt
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
      }
      
      console.log(`Routen ok=${ok}, fail=${fail}`);
      
      // Histogramm aktualisieren
      if (starts && target && starts.length > 0) {
        Visualization.updateDistanceHistogram(starts, target);
      }
      
      // Export-Button aktivieren
      updateExportButtonState();
      
      // Info anzeigen
      if (ok === 0 && fail > 0) {
        Utils.showError(`Alle ${fail} Routen fehlgeschlagen. Bitte Browser-Konsole prüfen.`, true);
      }
    } catch (err) {
      Utils.logError('calculateRoutes', err);
      Utils.showError(`Fehler beim Berechnen der Routen: ${err.message}`, true);
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
      // Sichtbarkeit basierend auf CONFIG setzen
      Visualization.toggleStartPointsVisibility();
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
  
  drawAllTargetRoutes() {
    // Zeichne alle Routen zu allen gespeicherten Zielpunkten
    const targetRoutes = State.getTargetRoutes();
    const layerGroup = State.getLayerGroup();
    
    if (!layerGroup || !targetRoutes || targetRoutes.length === 0) return;
    
    // Alle bestehenden Polylines entfernen (nur Routen, nicht Marker)
    const polylinesToRemove = [];
    layerGroup.eachLayer(layer => {
      if (layer instanceof L.Polyline) {
        polylinesToRemove.push(layer);
      }
    });
    polylinesToRemove.forEach(layer => layerGroup.removeLayer(layer));
    
    if (CONFIG.AGGREGATED) {
      // Aggregierte Darstellung: Alle Routen aller Zielpunkte zusammen aggregieren
      const allRouteData = [];
      targetRoutes.forEach((routeInfo, targetIdx) => {
        if (routeInfo && routeInfo.routeData && routeInfo.routeData.length > 0) {
          // Alle Routen-Daten zu einem großen Array zusammenführen
          routeInfo.routeData.forEach(routeData => {
            allRouteData.push(routeData);
          });
        }
      });
      
      if (allRouteData.length > 0) {
        // Alle Routen zusammen aggregieren (egal von welchem Zielpunkt)
        const aggregatedSegments = Aggregation.aggregateRoutes(allRouteData);
        if (aggregatedSegments.length > 0) {
          const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
          Visualization.drawAggregatedRoutes(aggregatedSegments, maxCount);
        }
      }
    } else {
      // Einzelne Routen: Alle Routen zu allen Zielpunkten zeichnen
      targetRoutes.forEach(routeInfo => {
        if (!routeInfo || !routeInfo.routeResponses) return;
        
        routeInfo.routeResponses.forEach((routeResponse, index) => {
          if (routeResponse) {
            const polyline = Visualization.drawRoute(routeResponse.response, routeResponse.color);
            if (polyline && routeInfo.routePolylines) {
              routeInfo.routePolylines[index] = polyline;
            }
          }
        });
      });
    }
  },
  
  async handleMapClick(e) {
    const target = [e.latlng.lat, e.latlng.lng];
    State.setLastTarget(target); // Zielpunkt speichern
    
    // Wenn "Zielpunkte merken" aktiviert ist, Zielpunkt zur Liste hinzufügen
    if (CONFIG.REMEMBER_TARGETS) {
      const allTargets = State.getAllTargets();
      // Prüfe ob dieser Zielpunkt bereits existiert (mit Toleranz)
      const exists = allTargets.some(t => 
        Math.abs(t[0] - target[0]) < 0.0001 && 
        Math.abs(t[1] - target[1]) < 0.0001
      );
      
      if (!exists) {
        // Neuen Zielpunkt hinzufügen
        allTargets.push(target);
        State.setAllTargets(allTargets);
        
        // Marker für neuen Zielpunkt zeichnen
        const marker = Visualization.drawTargetPoint(target);
        const targetMarkers = State.getTargetMarkers();
        targetMarkers.push(marker);
        State.setTargetMarkers(targetMarkers);
        
        // Liste aktualisieren
        if (typeof updateTargetsList === 'function') {
          updateTargetsList();
        }
      }
    }
    
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
      Utils.showError('Keine Routen zum Exportieren vorhanden.', true);
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
