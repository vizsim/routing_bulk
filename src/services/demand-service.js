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

/** Haltestellen, die dichter als das beieinander liegen, gelten als eine (Node + Bahnsteig doppelt gemappt). */
const STOP_DEDUP_M = 30;

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
   * Zieht Startpunkte an ÖPNV-Haltestellen (mehrere Fahrgäste pro Haltestelle
   * sind plausibel, daher keine Kapazitätsgrenze).
   */
  _drawFromStops(stops, target, radiusM, numPoints, distType) {
    if (stops.length === 0 || numPoints <= 0) return [];
    const numBins = Math.min(15, Math.max(1, numPoints));
    const bins = this._byDistanceBin(stops, s => s.lat, s => s.lon, target, radiusM, numBins);
    const targets = this._binTargets(numPoints, numBins, distType, radiusM);

    let orphaned = 0;
    for (let b = 0; b < numBins; b++) {
      if (targets[b] > 0 && bins[b].length === 0) { orphaned += targets[b]; targets[b] = 0; }
    }
    while (orphaned > 0) {
      let moved = false;
      for (let b = 0; b < numBins && orphaned > 0; b++) {
        if (bins[b].length > 0) { targets[b]++; orphaned--; moved = true; }
      }
      if (!moved) break;
    }

    const points = [];
    for (let b = 0; b < numBins; b++) {
      const list = bins[b];
      if (!list.length) continue;
      for (let i = 0; i < (targets[b] || 0); i++) {
        const s = list[Math.floor(Math.random() * list.length)];
        points.push([s.lat, s.lon]);
      }
    }
    while (points.length < numPoints && stops.length) {
      const s = stops[Math.floor(Math.random() * stops.length)];
      points.push([s.lat, s.lon]);
    }
    return points;
  },

  /** Haltestellen zusammenfassen, die faktisch dieselbe sind (Node + Bahnsteig). */
  _dedupeStops(stops) {
    const kept = [];
    // Grid-Bucket in ~STOP_DEDUP_M, damit der Vergleich nicht quadratisch wird
    const cell = STOP_DEDUP_M / 111320;
    const seen = new Map();
    for (const s of stops) {
      const key = `${Math.round(s.lat / cell)}:${Math.round(s.lon / cell)}`;
      const neighbours = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = seen.get(`${Math.round(s.lat / cell) + dx}:${Math.round(s.lon / cell) + dy}`);
          if (bucket) neighbours.push(...bucket);
        }
      }
      const dup = neighbours.some(o => Geo.distanceMeters(s.lat, s.lon, o.lat, o.lon) < STOP_DEDUP_M);
      if (dup) continue;
      kept.push(s);
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(s);
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
    const transitPoints = this._drawFromStops(stops, target, radiusM, nTransit, distType);

    const points = [...residential.points, ...transitPoints];
    // Reihenfolge mischen, damit Farben/Indizes nicht nach Quelle sortiert sind
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }

    return {
      points,
      info: {
        basis,
        requested: numPoints,
        residentialRequested: nResidential,
        residential: residential.used,
        transit: transitPoints.length,
        capacity: residential.capacity,
        stops: stops.length,
        // true, wenn die Personen im Radius für die gewünschte Anzahl nicht reichen
        capacityLimited: residential.used < nResidential
      }
    };
  }
};
