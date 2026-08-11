// ==== Transit-Service: echtes ÖPNV-Routing via Transitous/MOTIS (Beta) ====
//
// api.transitous.org ist ein Community-Dienst — SPARSAM anfragen ist hier
// Designprinzip, nicht Option:
//   - Session-Cache (gleiche Start/Ziel/Zeit-Anfrage wird nie doppelt gestellt;
//     Koordinaten dafür auf ~10 m gerundet, In-Flight-Anfragen werden geteilt)
//   - Semaphore: max. CONFIG.TRANSIT_CONCURRENCY parallele Anfragen
//   - numItineraries=1 (wir brauchen genau eine Verbindung pro Start)
//   - Das Routen-Cap (CONFIG.TRANSIT_MAX_ROUTES) setzt der RouteService.
//
// Die Antwort wird in die GraphHopper-Response-Form normalisiert
// (paths[0].points.coordinates usw.), damit Rendering, Histogramm und Export
// unverändert funktionieren; die Leg-Details hängen unter __transit.
import { CONFIG } from '../core/config.js';

const CACHE_MAX = 500;
const _cache = new Map(); // key -> Promise<normalisierte Response>

// Kleine Semaphore für die Parallelität
let _active = 0;
const _waiting = [];
function _acquire() {
  const limit = Math.max(1, CONFIG.TRANSIT_CONCURRENCY || 2);
  if (_active < limit) {
    _active++;
    return Promise.resolve();
  }
  return new Promise(resolve => _waiting.push(resolve));
}
function _release() {
  const next = _waiting.shift();
  if (next) next();
  else _active--;
}

/**
 * Google-Encoded-Polyline dekodieren (MOTIS: precision 7).
 * @returns {Array<[lat, lng]>}
 */
export function decodePolyline(str, precision = 7) {
  const factor = Math.pow(10, precision);
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, byte;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

/** Luftlinien-Länge einer [lat,lng]-Koordinatenfolge in Metern (für fehlende Leg-Distanzen). */
function coordsLengthMeters(coords) {
  const R = 6371000;
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    sum += 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return sum;
}

export const TransitService = {
  /**
   * Ankunftszeit für die Planung: nächster Werktag, CONFIG.TRANSIT_ARRIVE_HOUR Uhr
   * (lokale Zeit) — passend zum Schulwege-Use-Case. Innerhalb einer Session
   * stabil (einmal berechnet), damit der Cache greift.
   */
  _arrivalIso: null,
  arrivalTime() {
    if (this._arrivalIso) return this._arrivalIso;
    const d = new Date();
    d.setHours(CONFIG.TRANSIT_ARRIVE_HOUR || 8, 0, 0, 0);
    // vorbei oder Wochenende -> nächster Werktag
    while (d <= new Date() || d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
      d.setHours(CONFIG.TRANSIT_ARRIVE_HOUR || 8, 0, 0, 0);
    }
    this._arrivalIso = d.toISOString();
    return this._arrivalIso;
  },

  /**
   * Plant eine ÖPNV-Verbindung Start -> Ziel (Ankunft nächster Werktag früh).
   * @param {Array} startLatLng - [lat, lng]
   * @param {Array} endLatLng - [lat, lng]
   * @param {AbortSignal} [signal]
   * @returns {Promise<Object>} - GH-förmige Response mit __transit.legs
   */
  async fetchPlan(startLatLng, endLatLng, signal) {
    const rnd = (v) => v.toFixed(4); // ~10 m — identische Anfragen teilen sich einen Request
    const time = this.arrivalTime();
    const key = `${rnd(startLatLng[0])},${rnd(startLatLng[1])}|${rnd(endLatLng[0])},${rnd(endLatLng[1])}|${time}`;

    if (_cache.has(key)) return _cache.get(key);

    const promise = this._fetch(startLatLng, endLatLng, time, signal);
    _cache.set(key, promise);
    promise.catch(() => _cache.delete(key)); // Fehler/Abbruch nicht cachen
    if (_cache.size > CACHE_MAX) {
      _cache.delete(_cache.keys().next().value);
    }
    return promise;
  },

  async _fetch(startLatLng, endLatLng, timeIso, signal) {
    await _acquire();
    try {
      const params = new URLSearchParams({
        fromPlace: `${startLatLng[0]},${startLatLng[1]}`,
        toPlace: `${endLatLng[0]},${endLatLng[1]}`,
        time: timeIso,
        arriveBy: 'true',
        numItineraries: '1'
      });
      const res = await fetch(`${CONFIG.TRANSIT_PLAN_URL}?${params}`, { signal });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`ÖPNV-Plan-Fehler ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      // Bei kurzen Wegen ist Laufen schneller als jede Verbindung: MOTIS liefert
      // dann leere itineraries und die Fußverbindung unter `direct`.
      const itinerary = (data.itineraries && data.itineraries[0]) || (data.direct && data.direct[0]);
      if (!itinerary || !itinerary.legs || itinerary.legs.length === 0) {
        throw new Error('Keine ÖPNV-Verbindung gefunden');
      }
      return this._normalize(itinerary);
    } finally {
      _release();
    }
  },

  /** MOTIS-Itinerary -> GH-förmige Response (+ __transit mit Leg-Details). */
  _normalize(itinerary) {
    const legs = itinerary.legs.map(leg => {
      const geometry = leg.legGeometry && leg.legGeometry.points
        ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 7)
        : [];
      return {
        mode: leg.mode,
        route: leg.routeShortName || null,
        routeId: leg.routeId || null,
        headsign: leg.headsign || null,
        fromName: leg.from && leg.from.name,
        toName: leg.to && leg.to.name,
        fromStopId: (leg.from && leg.from.stopId) || null,
        toStopId: (leg.to && leg.to.stopId) || null,
        coords: geometry, // [lat, lng]
        distance: leg.distance != null ? leg.distance : coordsLengthMeters(geometry)
      };
    }).filter(l => l.coords.length >= 2);

    const allCoords = legs.flatMap(l => l.coords);
    const distance = legs.reduce((s, l) => s + (l.distance || 0), 0);

    return {
      paths: [{
        distance,
        time: (itinerary.duration || 0) * 1000,
        points: { coordinates: allCoords.map(([lat, lng]) => [lng, lat]) } // GH: [lon, lat]
      }],
      __transit: {
        duration: itinerary.duration,
        transfers: itinerary.transfers,
        startTime: itinerary.startTime,
        endTime: itinerary.endTime,
        legs
      }
    };
  }
};
