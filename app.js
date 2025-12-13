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
  }
};

// ==== Start ====
// Warte bis DOM und Leaflet geladen sind
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', MapInit.init);
} else {
  MapInit.init();
}
