// ==== Route-Service: Route-Berechnung & -Verwaltung ====
import { CONFIG, isRememberMode } from '../core/config.js';
import { EventBus, Events } from '../core/events.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';
import { API } from '../domain/api.js';
import { Distribution } from '../domain/distribution.js';
import { Geo } from '../domain/geo.js';
import { DemandService } from './demand-service.js';
import { TargetService } from './target-service.js';

export const RouteService = {
  // Laufende Berechnung (nur normaler Modus): neuer Klick bricht alte Requests ab,
  // sonst können späte Responses den State der neuen Berechnung überschreiben.
  _abortController: null,

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
    
    if (!State.getMap()) {
      Utils.logError('RouteService', 'Karte nicht initialisiert');
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
          const demand = await DemandService.generateStartPoints(target, CONFIG.N, distType);
          starts = demand.points;
          State.setDemandInfo(demand.info);
          EventBus.emit(Events.DEMAND_UPDATED, demand.info);
          if (!starts || starts.length === 0) {
            const hint = demand.info.basis === 'under18'
              ? 'Keine Flächen mit unter 18-Jährigen im Radius. Bitte anderen Kartenbereich, größeren Radius oder Basis „Alle Einwohner“ wählen.'
              : 'Keine Flächen mit Einwohnern im Radius. Bitte anderen Kartenbereich oder größeren Radius wählen.';
            Utils.showError(hint, true);
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
      colors = Array.from({ length: starts.length }, () =>
        `hsl(${Math.random() * 360}, 70%, 50%)`
      );
      State.setLastColors(colors);
    }
    
    // Route-Daten zurücksetzen (nur wenn nicht im "Zielpunkte merken" Modus)
    if (!isRememberMode()) {
      State.resetRouteData();
    }

    // Alte Berechnung abbrechen (nur normaler Modus: ein neuer Klick ersetzt alles;
    // im "Zielpunkte merken"-Modus laufen Berechnungen mehrerer Ziele legitim parallel)
    if (!isRememberMode() && this._abortController) {
      this._abortController.abort();
    }
    const abortController = new AbortController();
    if (!isRememberMode()) this._abortController = abortController;
    const signal = abortController.signal;

    // Requests über einen Concurrency-Pool statt alle gleichzeitig; jede fertige
    // Route wird sofort gemeldet (progressives Zeichnen + Fortschrittsanzeige).
    try {
      const results = new Array(starts.length);
      const total = starts.length;
      let nextIndex = 0;
      let done = 0;

      const worker = async () => {
        while (true) {
          if (signal.aborted) return;
          const i = nextIndex++;
          if (i >= total) return;
          try {
            results[i] = await API.fetchRoute(starts[i], target, signal);
          } catch (err) {
            results[i] = { __err: err };
          }
          if (signal.aborted) return;
          done++;
          if (!silent) {
            EventBus.emit(Events.ROUTES_PROGRESS, {
              index: i,
              response: results[i]?.__err ? null : results[i],
              color: colors[i],
              done,
              total,
              responses: results
            });
          }
        }
      };
      const poolSize = Math.max(1, Math.min(CONFIG.ROUTE_CONCURRENCY || 12, total));
      await Promise.all(Array.from({ length: poolSize }, worker));

      // Abgebrochen (neuer Klick): nichts anfassen, keine Events
      if (signal.aborted) return null;
      if (this._abortController === abortController) this._abortController = null;

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
   * Sammelt die rohen GraphHopper-Responses aller gespeicherten Zielpunkte
   * (für die exakte edge_id-Aggregation).
   * @returns {Array} - Array von GH-Responses
   */
  getAllRouteResponsesForTargets() {
    const targetRoutes = State.getTargetRoutes();
    const allResponses = [];

    targetRoutes.forEach(routeInfo => {
      if (routeInfo && routeInfo.routeResponses && routeInfo.routeResponses.length > 0) {
        routeInfo.routeResponses.forEach(rr => {
          if (rr && rr.response) allResponses.push(rr.response);
        });
      }
    });

    return allResponses;
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

