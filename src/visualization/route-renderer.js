// ==== Route-Renderer: Route-Visualisierung (MapLibre, Single-Source) ====
// Routen werden als Features in eine GeoJSON-Source geschrieben (MapRenderer),
// nicht mehr als einzelne Layer. drawRoute liefert eine Feature-ID als Handle;
// die bestehenden "routePolylines"-Arrays im State speichern diese IDs.
import { CONFIG } from '../core/config.js';
import { State } from '../core/state.js';
import { API } from '../domain/api.js';
import { AggregationService } from '../services/aggregation-service.js';
import { RouteService } from '../services/route-service.js';
import { RouteWarning } from '../ui/route-warning.js';
import { ColormapUtils } from './colormap-utils.js';
import { MapRenderer } from './map-renderer.js';

export const RouteRenderer = {
  /**
   * Formatiert Distanz in Metern für Anzeige (z. B. "1,8 km" oder "450 m").
   * @param {number} meters
   * @returns {string}
   */
  _formatDistance(meters) {
    if (meters >= 1000) {
      const km = meters / 1000;
      return km % 1 === 0 ? `${km.toFixed(0)} km` : `${km.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
    }
    return `${Math.round(meters)} m`;
  },

  /**
   * Zeichnet eine einzelne Route (mit Hover-Tooltip für Routenlänge).
   * Nutzt distanceM wenn übergeben (bereits aus GraphHopper), sonst einmalig aus Response.
   * @param {Object} ghResponse - GraphHopper Response
   * @param {string} color - Farbe
   * @param {number} [distanceM] - Routenlänge in m (aus paths[].distance), optional
   * @returns {number|null} - Feature-ID (Handle) oder null
   */
  drawRoute(ghResponse, color, distanceM) {
    const latlngs = API.extractRouteCoordinates(ghResponse);
    if (!latlngs) {
      return null;
    }

    const distance = distanceM ?? API.extractRouteDistance(ghResponse);
    const props = { color };
    if (distance != null && distance > 0) {
      props.label = this._formatDistance(distance);
    }

    return MapRenderer.addRouteFeature(latlngs.map(([lat, lng]) => [lng, lat]), props);
  },

  /**
   * Zeichnet aggregierte Routen (ersetzt den Inhalt des Aggregations-Layers).
   * @param {Array} aggregatedSegments - Aggregierte Segmente
   * @param {number} maxCount - Maximale Anzahl für Skalierung
   */
  drawAggregatedRoutes(aggregatedSegments, maxCount) {
    // Berechne Min/Max und alle Counts für gewichtete Verteilung
    const counts = aggregatedSegments.map(seg => seg.count);
    const minCount = Math.min(...counts);
    const maxCountValue = Math.max(...counts);

    const features = aggregatedSegments.map(seg => {
      // Gewichtete Verteilung: 15% Quantil, 85% linear
      const weightedLevel = ColormapUtils.calculateWeightedLevel(
        seg.count,
        minCount,
        maxCountValue,
        counts,
        0.15
      );

      // Kanten-Aggregation liefert vollständige Polylines (coords),
      // die geometrischen Methoden nur 2-Punkt-Segmente (start/end)
      const lineCoords = seg.coords
        ? seg.coords.map(([lat, lng]) => [lng, lat])
        : [[seg.start[1], seg.start[0]], [seg.end[1], seg.end[0]]];

      return {
        type: 'Feature',
        properties: {
          count: seg.count,
          weight: 2 + (weightedLevel * 10),   // 2-12px
          opacity: 0.7 + (weightedLevel * 0.7),
          color: ColormapUtils.getColorForCount(seg.count, weightedLevel),
          label: `${seg.count} Route${seg.count !== 1 ? 'n' : ''}`
        },
        geometry: {
          type: 'LineString',
          coordinates: lineCoords
        }
      };
    });

    MapRenderer.setAggregatedFeatures(features);
  },

  /**
   * Zeichnet alle Routen zu allen gespeicherten Zielpunkten
   */
  drawAllTargetRoutes() {
    const targetRoutes = State.getTargetRoutes();
    if (!targetRoutes || targetRoutes.length === 0) return;

    // Alle bestehenden Routen entfernen (nur Routen, nicht Marker)
    MapRenderer.clearRoutes();

    if (CONFIG.AGGREGATED) {
      // Aggregierte Darstellung: Alle Routen aller Zielpunkte zusammen aggregieren
      const allRouteData = RouteService.getAllRoutesForTargets();
      const allResponses = RouteService.getAllRouteResponsesForTargets();

      if (allRouteData.length > 0) {
        // Alle Routen zusammen aggregieren (egal von welchem Zielpunkt)
        const aggregatedSegments = AggregationService.aggregateRoutes(allRouteData, allResponses);
        if (aggregatedSegments.length > 0) {
          const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
          this.drawAggregatedRoutes(aggregatedSegments, maxCount);
        }
      }
    } else {
      // Einzelne Routen: Alle Routen zu allen Zielpunkten zeichnen
      targetRoutes.forEach(routeInfo => {
        if (!routeInfo || !routeInfo.routeResponses) return;

        // routePolylines Array initialisieren falls nicht vorhanden
        if (!routeInfo.routePolylines) {
          routeInfo.routePolylines = [];
        }

        routeInfo.routeResponses.forEach((routeResponse, index) => {
          if (routeResponse && routeResponse.response) {
            const featureId = this.drawRoute(routeResponse.response, routeResponse.color, routeResponse.distance ?? undefined);
            if (featureId) {
              routeInfo.routePolylines[index] = featureId;
            }
          }
        });
      });

      // State aktualisieren
      State.setTargetRoutes(targetRoutes);
    }

    // Warnung bei vielen Routen anzeigen
    RouteWarning.checkAndShow();
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
      const rawResponses = (routeResponses || []).map(r => r?.response);
      const aggregatedSegments = AggregationService.aggregateRoutes(routeData, rawResponses);
      if (aggregatedSegments.length > 0) {
        const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
        this.drawAggregatedRoutes(aggregatedSegments, maxCount);
      }
    } else {
      // Einzelne Routen zeichnen
      const routePolylines = [];
      routeResponses.forEach((routeInfo, index) => {
        if (routeInfo && routeInfo.response) {
          const featureId = this.drawRoute(routeInfo.response, routeInfo.color || colors[index], routeInfo.distance ?? undefined);
          routePolylines[index] = featureId;
        }
      });
      State.setRoutePolylines(routePolylines);
    }
  }
};
