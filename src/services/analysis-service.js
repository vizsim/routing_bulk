// ==== Analysis-Service: Gebietsanalyse (experimentell) ====
//
// Mini-Verkehrsmodell für einen gezeichneten Bereich:
// 1. Erzeugung: Schulen/Kitas im Polygon, Fahrten je Einrichtung (editierbar)
// 2. Aufteilung: Modal Split je Einrichtungstyp (Fuß/Rad/ÖPNV/Auto)
// 3. Umlegung: gewichtete Stichprobe — pro Einrichtung×Modus werden höchstens
//    CONFIG.ANALYSIS_MAX_SAMPLE Routen gerechnet, jede Route trägt das Gewicht
//    Fahrten ÷ Stichprobengröße; die Kanten-Aggregation summiert Gewichte.
//
// ÖPNV heißt hier: Fußweg ab den zielnächsten Haltestellen (Zubringer-Modell,
// eigener GH-Server) — KEIN Transitous, die Mengen wären mit Fair Use
// unvereinbar. Nachfrage-Basis ist fix "unter 18" (Zensus).
import { CONFIG } from '../core/config.js';
import { Utils } from '../core/utils.js';
import { API } from '../domain/api.js';
import { Geo } from '../domain/geo.js';
import { AggregationService } from './aggregation-service.js';
import { DemandService } from './demand-service.js';
import { PopulationService } from './population-service.js';

// Defaults je Einrichtungstyp: Fahrten/Tag, Einzugsradius, Modal Split (%)
export const FACILITY_TYPES = {
  kindergarten: {
    label: 'Kindergarten',
    trips: 50,
    radiusM: 1000,
    split: { foot: 50, bike: 10, transit: 5, car: 35 }
  },
  grundschule: {
    label: 'Grundschule',
    trips: 200,
    radiusM: 2000,
    split: { foot: 50, bike: 20, transit: 10, car: 20 }
  },
  weiterfuehrend: {
    label: 'Weiterführende Schule',
    trips: 500,
    radiusM: 4000,
    split: { foot: 25, bike: 25, transit: 35, car: 15 }
  },
  schule: {
    label: 'Schule',
    trips: 200,
    radiusM: 2000,
    split: { foot: 50, bike: 20, transit: 10, car: 20 }
  }
};

export const MODES = [
  { key: 'foot', label: 'Fuß', ghProfile: 'foot' },
  { key: 'bike', label: 'Rad', ghProfile: 'bike' },
  { key: 'transit', label: 'ÖPNV', ghProfile: 'foot' }, // Zubringer: zu Fuß ab Haltestelle
  { key: 'car', label: 'Auto', ghProfile: 'car' }
];

export const AnalysisService = {
  _abortController: null,
  // Ergebnis der letzten Berechnung (für Export)
  lastResult: null,

  /**
   * Einrichtungstyp aus OSM-Attributen ableiten. isced:level ist lückenhaft
   * gepflegt — Namens-Heuristik als Fallback; die Fahrtenzahl bleibt in der
   * UI ohnehin editierbar.
   */
  classify(props) {
    if (props.amenity === 'kindergarten') return 'kindergarten';
    const isced = String(props['isced:level'] || '');
    const name = (props.name || '').toLowerCase();
    if (/[23]/.test(isced) || /gymnasium|oberschule|gesamtschule|sekundarschule|realschule|hauptschule|oberstufe/.test(name)) {
      return 'weiterfuehrend';
    }
    if (/1/.test(isced) || /grundschule|primarschule/.test(name)) {
      return 'grundschule';
    }
    return 'schule';
  },

  /**
   * Findet Schulen/Kitas im Polygon (aus schools.pmtiles) und initialisiert
   * die editierbaren Fahrtenzahlen aus den Typ-Defaults.
   * @param {Array<[lat,lng]>} polygon
   * @returns {Promise<Array<{lat, lon, name, type, trips}>>}
   */
  async findFacilities(polygon) {
    const url = (CONFIG.SCHOOLS_PMTILES_URL || '').trim();
    if (!url) return [];
    const features = await PopulationService.readFeaturesInPolygon(
      url, CONFIG.SCHOOLS_LAYER_NAME || 'germany_osm_schools', polygon, 15
    );
    const typeOrder = ['weiterfuehrend', 'grundschule', 'schule', 'kindergarten'];
    const mapped = features.map(f => {
      const type = this.classify(f.properties);
      return {
        lat: f.lat,
        lon: f.lon,
        name: f.properties.name || `${FACILITY_TYPES[type].label} (unbenannt)`,
        type,
        trips: FACILITY_TYPES[type].trips
      };
    });
    // OSM-Doppel (Node + Gebäude-Way derselben Einrichtung) zusammenfassen:
    // gleicher Name + Typ im Nahbereich. Filialen einer Kita-Kette liegen
    // typischerweise weiter auseinander und bleiben getrennt.
    const DEDUP_M = 150;
    const deduped = [];
    for (const f of mapped) {
      const dup = deduped.find(d => d.name === f.name && d.type === f.type
        && Geo.distanceMeters(d.lat, d.lon, f.lat, f.lon) < DEDUP_M);
      if (!dup) deduped.push(f);
    }
    return deduped
      .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.name.localeCompare(b.name, 'de'));
  },

  /**
   * Zerlegt Fahrten einer Einrichtung in (Modus, Stichprobe, Gewicht).
   * @returns {Array<{mode, ghProfile, sample, weight, trips}>}
   */
  _modePlan(facility, typeSettings) {
    const settings = typeSettings[facility.type];
    const cap = Math.max(1, CONFIG.ANALYSIS_MAX_SAMPLE || 150);
    const plan = [];
    for (const mode of MODES) {
      const pct = settings.split[mode.key] || 0;
      const trips = Math.round(facility.trips * pct / 100);
      if (trips <= 0) continue;
      const sample = Math.min(trips, cap);
      plan.push({ mode: mode.key, ghProfile: mode.ghProfile, sample, weight: trips / sample, trips });
    }
    return plan;
  },

  /** Anzahl der zu rechnenden Routen (für die Anzeige vor dem Start). */
  estimateRoutes(facilities, typeSettings) {
    return facilities.reduce((sum, f) =>
      sum + this._modePlan(f, typeSettings).reduce((s, p) => s + p.sample, 0), 0);
  },

  /**
   * Führt die Analyse aus: Startpunkte ziehen, Routen rechnen, aggregieren.
   * @param {Array} facilities - aus findFacilities (trips ggf. editiert)
   * @param {Object} typeSettings - FACILITY_TYPES-artig (radiusM/split editiert)
   * @param {Function} [onProgress] - ({phase: 'prepare'|'route', done, total})
   * @returns {Promise<{segments, stats}>}
   */
  async run(facilities, typeSettings, onProgress) {
    if (this._abortController) this._abortController.abort();
    const abortController = new AbortController();
    this._abortController = abortController;
    const signal = abortController.signal;

    const distType = document.querySelector('.dist-btn.active')?.dataset.dist || 'lognormal';
    const platformsUrl = (CONFIG.PLATFORMS_PMTILES_URL || '').trim();

    // Zensus-Zellen und Haltestellen EINMAL für das Gesamtgebiet laden statt
    // je Einrichtung — die Einzugskreise überlappen fast vollständig, und ein
    // PMTiles-Load je Einrichtung kostet mehrere Sekunden (23 Einrichtungen
    // wären ~2 Minuten, bevor die erste Route startet).
    const center = [
      facilities.reduce((s, f) => s + f.lat, 0) / facilities.length,
      facilities.reduce((s, f) => s + f.lon, 0) / facilities.length
    ];
    const coverRadius = Math.max(...facilities.map(f =>
      Geo.distanceMeters(center[0], center[1], f.lat, f.lon) + typeSettings[f.type].radiusM
    ));
    if (onProgress) onProgress({ phase: 'prepare', done: 0, total: facilities.length });
    const allCells = await PopulationService.getPopulationFeaturesInRadius(center[0], center[1], coverRadius);
    const allStops = platformsUrl
      ? DemandService._dedupeStops(await PopulationService.readPointFeaturesInRadius(
          platformsUrl, CONFIG.PLATFORMS_LAYER_NAME || 'germany_osm_platforms',
          center[0], center[1], coverRadius
        ))
      : [];
    if (signal.aborted) return null;

    // 1. Jobs erzeugen: je Einrichtung×Modus Startpunkte ziehen
    const jobs = []; // {start, target, ghProfile, mode, weight}
    let capacityLimited = 0;
    let prepared = 0;
    for (const facility of facilities) {
      if (signal.aborted) return null;
      const settings = typeSettings[facility.type];
      const target = [facility.lat, facility.lon];
      const plan = this._modePlan(facility, typeSettings);
      if (plan.length === 0) continue;

      const inRadius = (lat, lon) =>
        Geo.distanceMeters(lat, lon, target[0], target[1]) <= settings.radiusM;
      const cells = allCells.filter(c => inRadius(c.center[0], c.center[1]));

      for (const p of plan) {
        let points = [];
        if (p.mode === 'transit') {
          if (allStops.length === 0) continue;
          const stops = allStops.filter(s => inRadius(s.lat, s.lon));
          points = DemandService._drawFromStops(stops, target, p.sample, CONFIG.DEMAND_TRANSIT_STOPS || 3).points;
        } else {
          const drawn = DemandService._drawFromCells(cells, target, settings.radiusM, p.sample, distType, 'under18');
          points = drawn.points;
          if (drawn.points.length < p.sample) capacityLimited++;
        }
        // Gewicht ggf. anheben, wenn die Kapazität weniger Startpunkte hergab
        const weight = points.length > 0 ? p.trips / points.length : 0;
        for (const start of points) {
          jobs.push({ start, target, ghProfile: p.ghProfile, mode: p.mode, weight });
        }
      }
      prepared++;
      if (onProgress) onProgress({ phase: 'prepare', done: prepared, total: facilities.length });
    }

    if (jobs.length === 0) {
      return { segments: [], stats: { requested: 0, ok: 0, fail: 0, facilities: facilities.length, capacityLimited } };
    }

    // 2. Routen rechnen (eigener GH-Server, bestehender Concurrency-Ansatz)
    const results = new Array(jobs.length);
    let nextIndex = 0;
    let done = 0;
    let ok = 0, fail = 0;
    const worker = async () => {
      while (true) {
        if (signal.aborted) return;
        const i = nextIndex++;
        if (i >= jobs.length) return;
        const job = jobs[i];
        try {
          const response = await API.fetchRoute(job.start, job.target, signal, job.ghProfile);
          results[i] = { response, profile: job.mode, weight: job.weight };
          ok++;
        } catch (err) {
          if (!signal.aborted) {
            fail++;
            Utils.logError('AnalysisService', err);
          }
        }
        done++;
        if (onProgress && !signal.aborted) onProgress({ phase: 'route', done, total: jobs.length });
      }
    };
    const poolSize = Math.max(1, Math.min(CONFIG.ROUTE_CONCURRENCY || 12, jobs.length));
    await Promise.all(Array.from({ length: poolSize }, worker));
    if (signal.aborted) return null;
    if (this._abortController === abortController) this._abortController = null;

    // 3. Gewichtete Kanten-Aggregation
    const segments = AggregationService.aggregateRoutes(results.filter(Boolean));
    const stats = {
      requested: jobs.length,
      ok,
      fail,
      facilities: facilities.length,
      capacityLimited,
      totalTrips: facilities.reduce((s, f) => s + f.trips, 0)
    };
    this.lastResult = { segments, stats, facilities, typeSettings };
    return { segments, stats };
  },

  /** Bricht eine laufende Analyse ab. */
  abort() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  },

  /**
   * Exportiert das letzte Analyse-Ergebnis als GeoJSON (Fahrten je Kante,
   * aufgeschlüsselt nach Modus; Metadaten machen den Export reproduzierbar).
   */
  exportGeoJSON(polygon) {
    const result = this.lastResult;
    if (!result || !result.segments.length) {
      Utils.showError('Keine Analyse-Ergebnisse zum Exportieren.', true);
      return;
    }
    const rnd1 = (v) => Math.round(v * 10) / 10;
    const features = result.segments.map((seg, index) => {
      const properties = { trips: rnd1(seg.count), segmentIndex: index };
      for (const mode of MODES) {
        if (seg.byProfile[mode.key]) properties[`trips_${mode.key}`] = rnd1(seg.byProfile[mode.key]);
      }
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: seg.coords.map(([lat, lng]) => [lng, lat])
        },
        properties
      };
    });

    const geoJson = {
      type: 'FeatureCollection',
      features,
      metadata: {
        exportDate: new Date().toISOString(),
        mode: 'analysis',
        note: 'Gewichtete Stichproben-Umlegung (trips = Fahrten/Tag, nicht Routen)',
        polygon: polygon ? polygon.map(([lat, lng]) => [lng, lat]) : null,
        facilities: result.facilities.map(f => ({ name: f.name, type: f.type, trips: f.trips })),
        typeSettings: result.typeSettings,
        sampleCap: CONFIG.ANALYSIS_MAX_SAMPLE,
        stats: result.stats
      }
    };

    const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analyse_${new Date().toISOString().split('T')[0]}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
