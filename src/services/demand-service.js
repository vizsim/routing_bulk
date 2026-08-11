// ==== Demand-Service: Nachfragemodell für Startpunkte ====
//
// Erzeugt die Startpunkte einer Berechnung aus drei Bausteinen:
//
// 1. Längenverteilung (Beeline): legt fest, wie viele Startpunkte in welchem
//    Entfernungsring um das Ziel liegen — wie bisher.
// 2. Wohnorte: innerhalb eines Rings werden Zensus-Zellen nach Personenzahl
//    gewichtet gezogen, aber MIT KAPAZITÄT: aus einer Zelle mit 10 Personen
//    können höchstens 10 Startpunkte kommen (jede Person genau einmal).
//    Basis wahlweise alle Einwohner oder nur die unter 18-Jährigen.
// 3. ÖPNV: optional kommt ein Teil der Startpunkte stattdessen von
//    Haltestellen (Zubringer mit Bus/Bahn). Anteil frei einstellbar.
import { CONFIG } from '../core/config.js';
import { Distribution } from '../domain/distribution.js';
import { Geo } from '../domain/geo.js';
import { PopulationService } from './population-service.js';

/** Haltestellen dichter als das gelten als eine (Node + Bahnsteig doppelt gemappt). */
const STOP_DEDUP_M = 30;
/** Gleichnamige Haltestellen in diesem Umkreis sind Steige derselben Haltestelle
 *  (Richtungspaare, Bussteige) — für die Nachfrage ein einziger Ausstiegsort. */
const STOP_SAME_NAME_M = 250;

export const DemandService = {
  /**
   * Wie viele Startpunkte fallen in welchen Entfernungsring?
   * @returns {number[]} Soll-Anzahl je Bin
   */
  _binTargets(numPoints, numBins, distType, radiusM) {
    const targets = new Array(numBins).fill(0);
    if (Distribution && Distribution.calculateDistribution) {
      const expected = Distribution.calculateDistribution(distType, numBins, radiusM, numPoints);
      let sum = 0;
      for (let b = 0; b < numBins; b++) {
        targets[b] = Math.max(0, Math.round(expected[b] || 0));
        sum += targets[b];
      }
      // Rundungsdifferenz auf Bins mit erwarteter Masse verteilen
      let diff = numPoints - sum;
      let idx = 0;
      while (diff !== 0 && idx < numBins * 4) {
        const b = idx % numBins;
        if (diff > 0 && (expected[b] || 0) > 0) { targets[b]++; diff--; }
        else if (diff < 0 && targets[b] > 0) { targets[b]--; diff++; }
        idx++;
      }
    } else {
      for (let b = 0; b < numBins; b++) targets[b] = Math.floor(numPoints / numBins);
      targets[0] += numPoints - targets.reduce((s, c) => s + c, 0);
    }
    return targets;
  },

  /** Elemente nach Entfernung zum Ziel in Ringe einsortieren. */
  _byDistanceBin(items, latOf, lonOf, target, radiusM, numBins) {
    const binSize = radiusM / numBins;
    const bins = Array.from({ length: numBins }, () => []);
    for (const item of items) {
      const d = Geo.distanceMeters(latOf(item), lonOf(item), target[0], target[1]);
      const b = Math.min(Math.floor(d / binSize), numBins - 1);
      if (b >= 0) bins[b].push(item);
    }
    return bins;
  },

  /**
   * Zieht Startpunkte aus Zensus-Zellen — gewichtet nach Personenzahl, aber
   * mit Kapazität: jede Person kann nur einmal starten.
   * @returns {{ points: Array, capacity: number, used: number }}
   */
  _drawFromCells(cells, target, radiusM, numPoints, distType, basis) {
    const capacityOf = (c) => Math.max(0, Math.round(basis === 'under18' ? c.under18 : c.population));

    const pool = cells
      .map(c => ({ cell: c, remaining: capacityOf(c) }))
      .filter(e => e.remaining > 0);
    const capacity = pool.reduce((s, e) => s + e.remaining, 0);
    if (pool.length === 0 || numPoints <= 0) return { points: [], capacity, used: 0 };

    const numBins = Math.min(15, Math.max(1, numPoints));
    const bins = this._byDistanceBin(pool, e => e.cell.center[0], e => e.cell.center[1], target, radiusM, numBins);
    const targets = this._binTargets(numPoints, numBins, distType, radiusM);

    // Soll aus Ringen ohne Zellen auf Ringe mit Zellen umverteilen
    let orphaned = 0;
    for (let b = 0; b < numBins; b++) {
      if (targets[b] > 0 && bins[b].length === 0) { orphaned += targets[b]; targets[b] = 0; }
    }
    while (orphaned > 0) {
      let moved = false;
      for (let b = 0; b < numBins && orphaned > 0; b++) {
        if (bins[b].some(e => e.remaining > 0)) { targets[b]++; orphaned--; moved = true; }
      }
      if (!moved) break;
    }

    const points = [];
    const drawFrom = (entries, count) => {
      let drawn = 0;
      let available = entries.reduce((s, e) => s + e.remaining, 0);
      while (drawn < count && available > 0) {
        let r = Math.random() * available;
        let chosen = null;
        for (const e of entries) {
          if (e.remaining <= 0) continue;
          r -= e.remaining;
          if (r <= 0) { chosen = e; break; }
        }
        if (!chosen) chosen = entries.find(e => e.remaining > 0);
        if (!chosen) break;
        points.push(PopulationService.randomPointInFeature(chosen.cell));
        chosen.remaining--;
        available--;
        drawn++;
      }
      return drawn;
    };

    for (let b = 0; b < numBins; b++) {
      drawFrom(bins[b], targets[b] || 0);
    }
    // Nicht erfüllte Ringe (Kapazität im Ring erschöpft): Rest global nachziehen
    if (points.length < numPoints) {
      drawFrom(pool, numPoints - points.length);
    }
    return { points, capacity, used: points.length };
  },

  /**
   * Zieht Startpunkte an ÖPNV-Haltestellen.
   *
   * Bewusst OHNE Längenverteilung: Wer mit Bus/Bahn kommt, steigt an der
   * Haltestelle aus, die dem Ziel am nächsten liegt, und läuft die letzte
   * Strecke — die Fußweglänge ergibt sich also aus der Lage der Haltestellen,
   * nicht aus einer Verteilungsannahme. Genutzt werden die N zielnächsten
   * Haltestellen (CONFIG.DEMAND_TRANSIT_STOPS), gewichtet nach Nähe: die
   * nächste trägt am meisten, ein Bahnhof etwas weiter weg entsprechend weniger.
   *
   * Keine Kapazitätsgrenze — von einer Haltestelle können viele Fahrgäste kommen.
   * @returns {{ points: Array, used: Array }} used = tatsächlich genutzte Haltestellen (mit Distanz)
   */
  _drawFromStops(stops, target, numPoints, maxStops) {
    if (stops.length === 0 || numPoints <= 0) return { points: [], used: [] };

    const withDistance = stops
      .map(s => ({ ...s, distance: Geo.distanceMeters(s.lat, s.lon, target[0], target[1]) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.max(1, maxStops));

    // Nähe-Gewicht: 1/(d + 100 m) — dämpft, dass eine Haltestelle direkt am Ziel
    // alles an sich zieht, lässt die nächste aber klar dominieren.
    const weights = withDistance.map(s => 1 / Math.max(50, s.distance + 100));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const points = [];
    const counts = new Array(withDistance.length).fill(0);
    for (let i = 0; i < numPoints; i++) {
      let r = Math.random() * totalWeight;
      let idx = withDistance.length - 1;
      for (let k = 0; k < withDistance.length; k++) {
        r -= weights[k];
        if (r <= 0) { idx = k; break; }
      }
      const s = withDistance[idx];
      counts[idx]++;
      points.push([s.lat, s.lon]);
    }

    const used = withDistance
      .map((s, i) => ({ name: s.properties && s.properties.name, distance: Math.round(s.distance), count: counts[i] }))
      .filter(s => s.count > 0);
    return { points, used };
  },

  /**
   * Fasst Haltestellen zusammen, die faktisch eine sind:
   * - Punkte dichter als STOP_DEDUP_M (Node + Bahnsteig doppelt gemappt)
   * - gleichnamige Steige im Umkreis STOP_SAME_NAME_M (Richtungspaare, Bussteige) —
   *   sonst wären „die 3 nächsten Haltestellen“ oft dreimal dieselbe.
   */
  _dedupeStops(stops) {
    const kept = [];
    // Grid-Bucket, damit der Vergleich nicht quadratisch wird
    const cell = STOP_SAME_NAME_M / 111320;
    const buckets = new Map();
    const nameOf = (s) => ((s.properties && s.properties.name) || '').trim().toLowerCase();

    for (const s of stops) {
      const bx = Math.round(s.lat / cell);
      const by = Math.round(s.lon / cell);
      const neighbours = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = buckets.get(`${bx + dx}:${by + dy}`);
          if (bucket) neighbours.push(...bucket);
        }
      }
      const name = nameOf(s);
      const duplicate = neighbours.some(o => {
        const d = Geo.distanceMeters(s.lat, s.lon, o.lat, o.lon);
        if (d < STOP_DEDUP_M) return true;
        return name && name === nameOf(o) && d < STOP_SAME_NAME_M;
      });
      if (duplicate) continue;

      kept.push(s);
      const key = `${bx}:${by}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(s);
    }
    return kept;
  },

  /**
   * Erzeugt die Startpunkte für eine Berechnung.
   * @param {Array} target - [lat, lng]
   * @param {number} numPoints - gewünschte Anzahl
   * @param {string} distType - Längenverteilung
   * @returns {Promise<{ points: Array, info: Object }>}
   */
  async generateStartPoints(target, numPoints, distType) {
    const radiusM = CONFIG.RADIUS_M;
    const basis = CONFIG.DEMAND_BASIS === 'under18' ? 'under18' : 'population';
    const share = Math.max(0, Math.min(100, CONFIG.DEMAND_TRANSIT_SHARE || 0));

    const wantTransit = share > 0 && !!(CONFIG.PLATFORMS_PMTILES_URL || '').trim();
    const nTransit = wantTransit ? Math.round((numPoints * share) / 100) : 0;
    const nResidential = numPoints - nTransit;

    const [cells, rawStops] = await Promise.all([
      nResidential > 0
        ? PopulationService.getPopulationFeaturesInRadius(target[0], target[1], radiusM)
        : Promise.resolve([]),
      wantTransit
        ? PopulationService.readPointFeaturesInRadius(
            CONFIG.PLATFORMS_PMTILES_URL.trim(),
            CONFIG.PLATFORMS_LAYER_NAME || 'germany_osm_platforms',
            target[0], target[1], radiusM
          )
        : Promise.resolve([])
    ]);

    const stops = this._dedupeStops(rawStops);
    const residential = this._drawFromCells(cells, target, radiusM, nResidential, distType, basis);
    const transit = this._drawFromStops(stops, target, nTransit, CONFIG.DEMAND_TRANSIT_STOPS || 3);
    const transitPoints = transit.points;

    const points = [...residential.points, ...transitPoints];
    // Quelle je Startpunkt: bestimmt später das Routing-Profil
    // ('transit' fährt immer zu Fuß weiter, siehe RouteService)
    const sources = [
      ...new Array(residential.points.length).fill('residential'),
      ...new Array(transitPoints.length).fill('transit')
    ];
    // Reihenfolge mischen, damit Farben/Indizes nicht nach Quelle sortiert sind
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
      [sources[i], sources[j]] = [sources[j], sources[i]];
    }

    return {
      points,
      sources,
      info: {
        basis,
        requested: numPoints,
        residentialRequested: nResidential,
        residential: residential.used,
        transit: transitPoints.length,
        capacity: residential.capacity,
        stops: stops.length,
        // genutzte Haltestellen mit Entfernung zum Ziel (für die Panel-Anzeige)
        transitStops: transit.used,
        // true, wenn die Personen im Radius für die gewünschte Anzahl nicht reichen
        capacityLimited: residential.used < nResidential
      }
    };
  }
};
