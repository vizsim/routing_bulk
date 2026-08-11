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

// Farben je ÖPNV-Modus (MOTIS-Leg-Modes):
// Bus lila, Tram rot, U-Bahn blau, S-Bahn grün, Bahn dunkelgrau.
// Achtung: MOTIS meldet S-Bahnen (GTFS route_type 109) als METRO,
// U-Bahnen als SUBWAY — METRO gehört daher zur S-Bahn-Familie.
const TRANSIT_MODE_COLORS = {
  WALK: '#9ca3af',
  BUS: '#9333ea',
  TRAM: '#dc2626',
  SUBWAY: '#1d4ed8',
  METRO: '#15803d',
  SUBURBAN: '#15803d',
  RAIL: '#475569',
  REGIONAL_RAIL: '#475569',
  REGIONAL_FAST_RAIL: '#475569',
  LONG_DISTANCE: '#475569',
  HIGHSPEED_RAIL: '#475569',
  FERRY: '#0891b2'
};

const TRANSIT_MODE_NAMES = {
  WALK: 'Fußweg', BUS: 'Bus', TRAM: 'Tram', SUBWAY: 'U-Bahn', METRO: 'S-Bahn',
  SUBURBAN: 'S-Bahn', RAIL: 'Bahn', REGIONAL_RAIL: 'Bahn', REGIONAL_FAST_RAIL: 'Bahn',
  LONG_DISTANCE: 'Bahn', HIGHSPEED_RAIL: 'Bahn', FERRY: 'Fähre'
};

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
    // ÖPNV-Routen (Beta): pro Leg ein Feature, eingefärbt nach Verkehrsmittel
    if (ghResponse && ghResponse.__transit) {
      return this._drawTransitRoute(ghResponse.__transit);
    }

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
   * Zeichnet eine ÖPNV-Verbindung als ein Feature pro Leg (Fußwege gestrichelt
   * über den legMode-Filter der Layer; Farben je Verkehrsmittel).
   * @returns {Array<number>} Feature-IDs (Handle-Array statt Einzel-ID)
   */
  _drawTransitRoute(transit) {
    const ids = [];
    for (const leg of transit.legs) {
      if (!leg.coords || leg.coords.length < 2) continue;
      const modeName = TRANSIT_MODE_NAMES[leg.mode] || leg.mode;
      const label = leg.mode === 'WALK'
        ? `${modeName} (${this._formatDistance(leg.distance || 0)})`
        : `${modeName} ${leg.route || ''}${leg.headsign ? ` → ${leg.headsign}` : ''}`.trim();
      ids.push(MapRenderer.addRouteFeature(
        leg.coords.map(([lat, lng]) => [lng, lat]),
        {
          color: TRANSIT_MODE_COLORS[leg.mode] || TRANSIT_MODE_COLORS.RAIL,
          label,
          legMode: leg.mode
        }
      ));
    }
    return ids.length ? ids : null;
  },

  /**
   * Zeichnet aggregierte Routen (ersetzt den Inhalt des Aggregations-Layers).
   * @param {Array} aggregatedSegments - Aggregierte Segmente
   * @param {number} maxCount - Maximale Anzahl für Skalierung
   */
  drawAggregatedRoutes(aggregatedSegments, maxCount, options = {}) {
    const unit = options.unit || null; // z.B. 'Fahrten/Tag' (Gebietsanalyse)
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

      return {
        type: 'Feature',
        properties: {
          count: seg.count,
          weight: 2 + (weightedLevel * 10),   // 2-12px
          opacity: 0.7 + (weightedLevel * 0.7),
          color: ColormapUtils.getColorForCount(seg.count, weightedLevel),
          label: unit
            ? `~${Math.round(seg.count)} ${unit}`
            : `${seg.count} Route${seg.count !== 1 ? 'n' : ''}`
        },
        geometry: {
          type: 'LineString',
          coordinates: seg.coords.map(([lat, lng]) => [lng, lat])
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
      const allResponses = RouteService.getAllRouteResponsesForTargets();

      if (allResponses.length > 0) {
        // Alle Routen zusammen aggregieren (egal von welchem Zielpunkt)
        const aggregatedSegments = AggregationService.aggregateRoutes(allResponses);
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
      // Aggregierte Darstellung (volle Einträge: enthalten Profil/Quelle)
      const aggregatedSegments = AggregationService.aggregateRoutes((routeResponses || []).filter(Boolean));
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
