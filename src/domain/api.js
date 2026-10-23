// ==== API-Funktionen ====
import { CONFIG } from '../core/config.js';
import { Geo } from './geo.js';

export const API = {
  // Path Details, die der Server abgelehnt hat (HTTP 400 "Cannot find the path
  // details") — sie werden für den Rest der Sitzung nicht mehr angefragt.
  _unsupportedDetails: new Set(),
  // Profile, deren Detail-Liste der Server schon einmal akzeptiert hat
  _verifiedProfiles: new Set(),
  // Laufende Erstanfrage je Profil: parallele Anfragen warten darauf, statt
  // alle mit derselben 400 zu scheitern (z. B. backward_sidewalk ohne Patch)
  _detailGates: new Map(),

  /**
   * Path Details für ein Profil: immer edge_id (Grundlage der Aggregation),
   * dazu die Infrastruktur-Details aus CONFIG.INFRA_DETAILS ohne die, die der
   * Server nicht kennt.
   * @param {string} profile - GraphHopper-Profil
   * @returns {string[]}
   */
  detailsForProfile(profile) {
    const extra = (CONFIG.INFRA_DETAILS && CONFIG.INFRA_DETAILS[profile]) || [];
    return ['edge_id', ...extra.filter(d => d !== 'edge_id' && !this._unsupportedDetails.has(d))];
  },

  /**
   * Holt eine Route von GraphHopper.
   * @param {Array} startLatLng - [lat, lng]
   * @param {Array} endLatLng - [lat, lng]
   * @param {AbortSignal} [signal] - bricht den Request ab (neuer Klick ersetzt alte Berechnung)
   * @param {string} [profile] - überschreibt CONFIG.PROFILE (z.B. 'foot' ab Haltestelle)
   */
  async fetchRoute(startLatLng, endLatLng, signal = undefined, profile = undefined) {
    const p = profile || CONFIG.PROFILE;
    if (!this._verifiedProfiles.has(p)) {
      const gate = this._detailGates.get(p);
      if (gate) {
        // Erstanfrage läuft: abwarten, danach mit der bereinigten Liste fragen
        await gate.catch(() => {});
      } else {
        const first = this._requestWithFallback(startLatLng, endLatLng, signal, p);
        this._detailGates.set(p, first);
        try {
          const data = await first;
          this._verifiedProfiles.add(p);
          return data;
        } finally {
          this._detailGates.delete(p);
        }
      }
    }
    return this._requestWithFallback(startLatLng, endLatLng, signal, p);
  },

  /**
   * POST /route; lehnt der Server Path Details ab, werden sie gemerkt und die
   * Anfrage ohne sie wiederholt (höchstens dreimal).
   */
  async _requestWithFallback(startLatLng, endLatLng, signal, profile) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const details = this.detailsForProfile(profile);
      const body = {
        profile,
        points: [
          Geo.llToGhPoint(startLatLng[0], startLatLng[1]),
          Geo.llToGhPoint(endLatLng[0], endLatLng[1]),
        ],
        points_encoded: false, // Wichtig: unencoded coordinates zurückgeben
        instructions: false, // Nicht benötigt
        elevation: false,
        // Path Details: Intervalle [fromIdx, toIdx, wert] über das
        // Koordinaten-Array. edge_id ist die Grundlage der exakten Aggregation
        // (AggregationService.aggregateRoutes), der Rest die Infrastruktur.
        details
      };

      const res = await fetch(CONFIG.GH_ROUTE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (res.ok) {
        return res.json();
      }

      const txt = await res.text().catch(() => "");
      const unknown = res.status === 400 ? this.parseUnsupportedDetails(txt) : null;
      if (unknown && unknown.length > 0) {
        unknown.forEach(d => this._unsupportedDetails.add(d));
        console.info(`[API] Routing-Server kennt diese Path Details nicht, sie werden weggelassen: ${unknown.join(', ')}`);
        continue;
      }
      throw new Error(`Route-Fehler ${res.status}: ${txt.slice(0,200)}`);
    }
    throw new Error('Route-Fehler: Path Details wurden wiederholt abgelehnt');
  },

  /**
   * Liest aus einer GraphHopper-Fehlermeldung die unbekannten Path Details.
   * GraphHopper: {"message":"Cannot find the path details: [backward_sidewalk, foo]"}.
   * edge_id wird nie weggelassen (ohne sie keine Aggregation).
   * @param {string} text - Response-Body
   * @returns {string[]|null} - Namen oder null, wenn die Meldung nicht passt
   */
  parseUnsupportedDetails(text) {
    const m = /Cannot find the path details: \[([^\]]*)\]/.exec(text || '');
    if (!m) return null;
    return m[1].split(',').map(s => s.trim()).filter(d => d && d !== 'edge_id');
  },

  extractRouteCoordinates(ghResponse) {
    const path = ghResponse.paths?.[0];
    if (!path) {
      return null;
    }

    let coords = null;

    // Versuche verschiedene Formate
    if (path.points?.coordinates) {
      coords = path.points.coordinates;
    } else if (path.geometry?.coordinates) {
      coords = path.geometry.coordinates;
    } else if (path.points && typeof path.points === 'string') {
      return null;
    }

    if (!coords || !coords.length) {
      return null;
    }

    // GraphHopper gibt [lon, lat] zurück, konvertiere zu [lat, lon]
    return coords.map(([lon, lat]) => [lat, lon]);
  },

  /**
   * Liest die edge_id-Intervalle aus der Response: [[fromIdx, toIdx, edgeId], ...]
   * über paths[0].points.coordinates. null wenn der Server keine Details liefert.
   * @param {Object} ghResponse - Response von POST /route
   * @returns {Array|null}
   */
  extractEdgeIntervals(ghResponse) {
    const intervals = ghResponse.paths?.[0]?.details?.edge_id;
    return Array.isArray(intervals) && intervals.length > 0 ? intervals : null;
  },

  /**
   * Liefert eine Funktion, die für einen Punktindex die Werte aller Path
   * Details (außer edge_id) zurückgibt. Die Intervalle sind aufsteigend
   * sortiert und teilen ihre Grenzpunkte ([[0,3,'a'],[3,7,'b']]): ein Wert gilt
   * für die Kanten ab seinem Start bis vor sein Ende. Aufrufe müssen mit
   * nicht fallendem Index erfolgen (ein Zeiger je Detail, O(Intervalle)).
   * @param {Object} details - paths[0].details
   * @returns {(from: number) => Object} - { sidewalk: 'yes', max_speed: 50, ... }
   */
  makeDetailCursor(details) {
    const keys = Object.keys(details || {}).filter(k => k !== 'edge_id' && Array.isArray(details[k]) && details[k].length > 0);
    const pos = Object.fromEntries(keys.map(k => [k, 0]));
    return (from) => {
      const out = {};
      for (const k of keys) {
        const arr = details[k];
        while (pos[k] < arr.length - 1 && arr[pos[k]][1] <= from) pos[k]++;
        out[k] = arr[pos[k]][2];
      }
      return out;
    };
  },

  /**
   * Liest die Routenlänge in Metern aus der GraphHopper-Response (paths[0].distance).
   * @param {Object} ghResponse - Response von POST /route
   * @returns {number|null} - Distanz in Metern oder null
   * @see https://docs.graphhopper.com/openapi/routing/postroute
   */
  extractRouteDistance(ghResponse) {
    const path = ghResponse.paths?.[0];
    if (path == null || typeof path.distance !== 'number') return null;
    return path.distance;
  }
};
