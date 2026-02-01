// ==== Route-Service: Route-Berechnung & -Verwaltung ====
const RouteService = {
  /**
   * Berechnet Routen zu einem Zielpunkt
   * @param {Array} target - [lat, lng]
   * @param {Object} options - Optionen (reuseStarts, etc.)
   * @returns {Promise<Object>} - Route-Informationen
   */
  async calculateRoutes(target, options = {}) {
    const { reuseStarts = false, silent = false, distributionType = null } = options;
    
    // Validierung
    if (!Utils.assertExists(target, 'Target')) return null;
    if (!Array.isArray(target) || target.length !== 2) {
      Utils.showError('Ungültiger Zielpunkt', true);
      return null;
    }
    
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      Utils.logError('RouteService', 'LayerGroup nicht initialisiert');
      return null;
    }
    
    // Startpunkte erzeugen oder wiederverwenden
    let starts, colors;
    if (reuseStarts && State.getLastStarts() && State.getLastColors()) {
      starts = State.getLastStarts();
      colors = State.getLastColors();
    } else {
      // Einwohner-Gewichtung: eigene Checkbox (unabhängig von Längenverteilung)
      const usePopulationWeight = !!(document.getElementById('config-population-weight-starts') && document.getElementById('config-population-weight-starts').checked);
      const distType = distributionType ||
        (document.querySelector('.dist-btn.active')?.dataset.dist) ||
        'lognormal';

      if (usePopulationWeight && CONFIG.POPULATION_PMTILES_URL) {
        try {
          starts = await (typeof PopulationService !== 'undefined' && PopulationService.getWeightedStartPoints
            ? PopulationService.getWeightedStartPoints(target[0], target[1], CONFIG.RADIUS_M, CONFIG.N, distType)
            : Promise.resolve([]));
          if (!starts || starts.length === 0) {
            Utils.showError('Keine Flächen mit Einwohnern im Radius. Bitte anderen Kartenbereich oder größeren Radius wählen.', true);
            return null;
          }
        } catch (e) {
          Utils.logError('RouteService', e);
          Utils.showError('Einwohner-Layer fehlgeschlagen.', true);
          return null;
        }
      } else {
        const numBins = Math.min(15, CONFIG.N);
        Distribution.setDistribution(distType, numBins, CONFIG.RADIUS_M, CONFIG.N);
        starts = Geo.generatePointsFromDistribution(
          target[0], target[1], CONFIG.RADIUS_M, CONFIG.N
        );
      }

      State.setLastStarts(starts);
      colors = Array.from({ length: CONFIG.N }, () =>
        `hsl(${Math.random() * 360}, 70%, 50%)`
      );
      State.setLastColors(colors);
    }
    
    // Route-Daten zurücksetzen (nur wenn nicht im "Zielpunkte merken" Modus)
    if (!isRememberMode()) {
      State.resetRouteData();
    }
    
    // N Requests parallel
    try {
      const results = await Promise.all(
        starts.map(s => API.fetchRoute(s, target).catch(err => ({ __err: err })))
      );
      
      let ok = 0, fail = 0;
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
        
        const coords = API.extractRouteCoordinates(r);
        const distance = API.extractRouteDistance(r);
        if (coords) {
          allRouteData.push(coords);
          allRouteResponses.push({ response: r, color: colors[i], index: i, distance: distance ?? null });
        } else {
          allRouteResponses.push(null);
        }
      }

      // State aktualisieren
      State.setAllRouteData(allRouteData);
      State.setAllRouteResponses(allRouteResponses);

      // Verteilungstyp ermitteln (für spätere Wiederherstellung)
      const activeDistBtn = document.querySelector('.dist-btn.active');
      const distType = activeDistBtn ? activeDistBtn.dataset.dist : 'lognormal';

      const routeInfo = {
        routeData: allRouteData,
        routeResponses: allRouteResponses,
        routePolylines: routePolylines,
        starts: starts,
        colors: colors,
        distributionType: distType, // Verteilung speichern
        config: { // Config-Informationen speichern
          profile: CONFIG.PROFILE,
          n: CONFIG.N,
          radiusKm: CONFIG.RADIUS_M / 1000
        },
        stats: { ok, fail }
      };
      
      // Wenn "Zielpunkte merken" aktiviert ist, Routen speichern
      if (isRememberMode()) {
        // ID aus State-Map holen (schnellster Zugriff)
        const targetId = State.getTargetId(target);
        if (targetId) {
          routeInfo.targetId = targetId;
        }
        TargetService.updateTargetRoutes(target, routeInfo);
      }
      
      // Event nur emittieren, wenn nicht silent
      if (!silent) {
        EventBus.emit(Events.ROUTES_CALCULATED, { target, routeInfo });
      }
      return routeInfo;
      
    } catch (err) {
      Utils.logError('RouteService.calculateRoutes', err);
      Utils.showError(`Fehler beim Berechnen der Routen: ${err.message}`, true);
      return null;
    }
  },
  
  /**
   * Liefert die Routenlängen in Metern aus routeInfo (aus GraphHopper paths[].distance).
   * Einzige Quelle: routeResponse.distance, kein doppeltes Berechnen.
   * @param {{ routeResponses?: Array<{ distance?: number|null }> }} routeInfo
   * @returns {number[]}
   */
  getRouteDistances(routeInfo) {
    return (routeInfo?.routeResponses || []).map(r => r?.distance ?? 0);
  },

  /**
   * Gibt alle Routen-Daten für alle Zielpunkte zurück
   * @returns {Array} - Array von routeData-Arrays
   */
  getAllRoutesForTargets() {
    const targetRoutes = State.getTargetRoutes();
    const allRouteData = [];
    
    targetRoutes.forEach(routeInfo => {
      if (routeInfo && routeInfo.routeData && routeInfo.routeData.length > 0) {
        routeInfo.routeData.forEach(routeData => {
          allRouteData.push(routeData);
        });
      }
    });
    
    return allRouteData;
  },
  
  /**
   * Aktualisiert eine einzelne Route (z.B. nach Drag)
   * @param {number} index - Index der Route
   * @param {Array} newStart - [lat, lng]
   * @param {Array} target - [lat, lng]
   * @returns {Promise<Object|null>} - Aktualisierte Route oder null
   */
  async updateRoute(index, newStart, target) {
    try {
      const result = await API.fetchRoute(newStart, target);
      if (result.paths?.[0]) {
        const coords = API.extractRouteCoordinates(result);
        if (coords) {
          const allRouteData = State.getAllRouteData();
          const allRouteResponses = State.getAllRouteResponses();
          const colors = State.getLastColors();
          
          if (allRouteData[index] !== undefined) {
            allRouteData[index] = coords;
          }
          if (allRouteResponses[index] !== undefined) {
            const distance = API.extractRouteDistance(result);
            allRouteResponses[index] = { response: result, color: colors[index], index: index, distance: distance ?? null };
          }
          
          State.setAllRouteData(allRouteData);
          State.setAllRouteResponses(allRouteResponses);
          
          // Im "Zielpunkte merken" Modus: Route auch in targetRoutes aktualisieren
          if (isRememberMode()) {
            const targetRoutes = State.getTargetRoutes();
            const targetIndex = targetRoutes.findIndex(tr => 
              target && TargetService.isEqual(tr.target, target)
            );
            
            if (targetIndex >= 0) {
              const routeInfo = targetRoutes[targetIndex];
              if (routeInfo.routeData && routeInfo.routeData[index] !== undefined) {
                routeInfo.routeData[index] = coords;
              }
              if (routeInfo.routeResponses && routeInfo.routeResponses[index] !== undefined) {
                const distance = API.extractRouteDistance(result);
                routeInfo.routeResponses[index] = { response: result, color: colors[index], index: index, distance: distance ?? null };
              }
              State.setTargetRoutes(targetRoutes);
            }
          }
          
          EventBus.emit(Events.ROUTE_UPDATED, { index, route: { coords, response: result } });
          return { coords, response: result };
        }
      }
      return null;
    } catch (err) {
      Utils.logError('RouteService.updateRoute', err);
      return null;
    }
  }
};

