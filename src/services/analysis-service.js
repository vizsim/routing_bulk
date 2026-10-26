// ==== Analysis-Service: Gebietsanalyse (experimentell) ====
//
// Mini-Verkehrsmodell für einen gezeichneten Bereich:
// 1. Erzeugung: Schulen/Kitas im Polygon. Wege je Einrichtung = Schüler:innen
//    = Hinwege je Schultag (Rückwege gleich viele, Gegenrichtung) — vorbelegt
//    aus amtlichen Schülerzahlen (SchoolStatsService), sonst Platzhalter.
// 2. Aufteilung: Modal Split je Einrichtungstyp (Fuß/Rad/ÖPNV/Auto)
// 3. Verteilung: Weglänge je Verkehrsmittel nach MiD 2023 (domain/school-trips.js,
//    alle Werte mit Quelle) — Fußwege kurz, Radwege mittel, Autowege lang.
// 4. Umlegung: gewichtete Stichprobe — pro Einrichtung×Modus werden höchstens
//    CONFIG.ANALYSIS_MAX_SAMPLE Routen gerechnet, jede Route trägt das Gewicht
//    Wege ÷ Stichprobengröße; die Kanten-Aggregation summiert Gewichte.
//
// ÖPNV heißt hier: Fußweg ab einer Haltestelle nahe der Einrichtung (Zubringer-
// Modell, eigener GH-Server) — welche, folgt aus Haltestellentyp, Einzugsbereich
// und Länge der ÖPNV-Wege (domain/transit-stops.js). KEIN Transitous, die
// Mengen wären mit Fair Use unvereinbar. Nachfrage-Basis: unter 18-Jährige
// (Zensus), bei beruflichen Schulen alle Einwohner.
import { CONFIG } from '../core/config.js';
import { Utils } from '../core/utils.js';
import { API } from '../domain/api.js';
import { Geo } from '../domain/geo.js';
import { exportProperties } from '../domain/infra.js';
import {
  applyOfficialSchool, isVocationalSchool, landFromAgs, matchFacilities, osmRefFromProperties
} from '../domain/school-stats.js';
import {
  drawDistribution, modelSourceIds, presenceShare, REGIOSTAR_LABELS, SOURCES, tripModel
} from '../domain/school-trips.js';
import { drawEgressStops, stopClass, stopRadii } from '../domain/transit-stops.js';
import { AggregationService } from './aggregation-service.js';
import { DemandService } from './demand-service.js';
import { PopulationService } from './population-service.js';
import { SchoolStatsService } from './school-stats-service.js';

/** Einheit der Belastungskarte: Wege je Einrichtung = Hinwege je Schultag. */
export const TRIP_UNIT = 'Hinwege/Schultag';

// Defaults je Einrichtungstyp. pupils = Platzhalter, wenn keine amtliche
// Schülerzahl vorliegt; trips = Hinwege je Schultag daraus (bei beruflichen
// Schulen nur der anwesende Anteil); split/radiusM/model = bundesweiter
// Vorschlag aus domain/school-trips.js (beim Zeichnen durch den Raumtyp ersetzt).
// basis = wer im Zensus als Startpunkt infrage kommt ('under18' | 'population').
//
// boundary = Einzugsgrenze über den Amtlichen Gemeindeschlüssel der
// Zensus-Zellen (2 Stellen Land · 5 Kreis · 8 Gemeinde):
// - 'hard': Startpunkte NUR innerhalb der Ebene (Kita/Grundschule kommen
//   nicht aus der Nachbargemeinde, auch wenn sie im Radius liegt)
// - 'penalty': außerhalb der Ebene stark abgewertet statt ausgeschlossen
//   (×BOUNDARY_PENALTY_OUTSIDE, in einem anderen Bundesland
//   ×BOUNDARY_PENALTY_OUTSIDE_LAND) — weiterführende Schulen haben
//   legitime Einzugsbereiche über die Kreisgrenze, nur eben seltener
const TYPE_BASE = {
  kindergarten: {
    label: 'Kindergarten',
    pupils: 50,
    boundary: { level: 'gemeinde', mode: 'hard' },
    basis: 'under18'
  },
  grundschule: {
    label: 'Grundschule',
    pupils: 200,
    boundary: { level: 'gemeinde', mode: 'hard' },
    basis: 'under18'
  },
  weiterfuehrend: {
    label: 'Weiterführende Schule',
    pupils: 500,
    boundary: { level: 'kreis', mode: 'penalty' },
    basis: 'under18'
  },
  // Berufliche Schulen (OSZ, Berufs-, Fachschulen): Einzugsbereich wie bei
  // weiterführenden Schulen der Kreis (in Berlin die ganze Stadt), Schüler:innen
  // meist volljährig — Startpunkte daher aus der ganzen Bevölkerung
  beruflich: {
    label: 'Berufliche Schule',
    pupils: 800,
    boundary: { level: 'kreis', mode: 'penalty' },
    basis: 'population'
  },
  schule: {
    label: 'Schule',
    pupils: 200,
    // Typ unbekannt (kann auch weiterführend sein) → weich statt hart
    boundary: { level: 'gemeinde', mode: 'penalty' },
    basis: 'under18'
  }
};

/** Vorschlag je Typ für einen Raumtyp (null = bundesweit): Split, Radius, Weglängenmodell. */
export function typeSettingsFor(regioStaR7) {
  return Object.fromEntries(Object.entries(TYPE_BASE).map(([type, base]) => {
    const model = tripModel(type, regioStaR7);
    return [type, {
      ...base,
      trips: Math.round(base.pupils * presenceShare(type)),
      boundary: { ...base.boundary },
      split: { ...model.split },
      radiusM: model.radiusM,
      model
    }];
  }));
}

export const FACILITY_TYPES = typeSettingsFor(null);

// Abwertungsfaktoren für 'penalty'-Grenzen (wirken auf die Personenzahl der
// Zelle, also auf Zieh-Wahrscheinlichkeit UND Kapazität)
const BOUNDARY_PENALTY_OUTSIDE = 0.3;
const BOUNDARY_PENALTY_OUTSIDE_LAND = 0.1;
const AGS_PREFIX = { gemeinde: 8, kreis: 5, land: 2 };

// Ohne Modell (sollte nicht vorkommen): alle Haltestellentypen gleich, weite Einzugsbereiche
const DEFAULT_EGRESS = { shares: { rail: 1 / 3, tram: 1 / 3, bus: 1 / 3 }, radii: stopRadii(null) };

// Verkehrsmittel der Gebietsanalyse. Die Weglänge je Modus kommt aus dem
// Schulweg-Modell (typeSettings[typ].model.modes); ÖPNV startet an einer
// Haltestelle nahe der Einrichtung (typeSettings[typ].model.egress).
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
  // Raumtyp/Gemeinde des zuletzt gezeichneten Bereichs (für Export)
  areaContext: null,
  // Quellen der zuletzt vorbelegten Schülerzahlen (für Export)
  pupilSources: {},

  /**
   * Ermittelt Raumtyp (RegioStaR7), Gemeinde und Länder des Bereichs — per
   * Mehrheit über die Zensus-Zellen im Polygon (die Felder stehen in jeder Zelle).
   * @param {Array<[lat,lng]>} polygon
   * @returns {Promise<{regioStaR7: string, label: string, gemeinde: string|null, lands: string[]}|null>}
   */
  async getAreaContext(polygon) {
    const url = (CONFIG.POPULATION_PMTILES_URL || '').trim();
    if (!url) return null;
    const cells = await PopulationService.readFeaturesInPolygon(
      url, CONFIG.POPULATION_LAYER_NAME || '', polygon
    );
    if (cells.length === 0) return null;
    const rsCount = {};
    const gemCount = {};
    const lands = new Set();
    for (const c of cells) {
      const p = c.properties || {};
      const rs = String(p.RegioStaR7 || '').trim();
      if (rs) rsCount[rs] = (rsCount[rs] || 0) + 1;
      const gem = String(p.name_23 || '').trim();
      if (gem) gemCount[gem] = (gemCount[gem] || 0) + 1;
      const land = landFromAgs(p.ags != null ? p.ags : p.gem_23_str);
      if (land) lands.add(land);
    }
    const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const rs7 = top(rsCount);
    if (!rs7) return null;
    return {
      regioStaR7: rs7,
      label: REGIOSTAR_LABELS[rs7] || `Raumtyp ${rs7}`,
      gemeinde: top(gemCount),
      lands: [...lands].sort()
    };
  },

  /**
   * Vorschlag je Einrichtungstyp (Split, Kappungsradius, Weglängen) für einen
   * RegioStaR7-Code — oder null, wenn der Code unbekannt ist.
   */
  suggestTypeSettings(regioStaR7) {
    if (!REGIOSTAR_LABELS[String(regioStaR7 || '').trim()]) return null;
    return typeSettingsFor(regioStaR7);
  },

  /** AGS der Zelle, in der die Einrichtung steht (nächstes Zell-Zentrum). */
  _facilityAgs(allCells, target) {
    let best = null;
    let bestDist = Infinity;
    for (const c of allCells) {
      const d = Geo.distanceMeters(c.center[0], c.center[1], target[0], target[1]);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    // 300 m: großzügig gegenüber Zellrastern (Zentren liegen max. ~71 m
    // vom Punkt), aber kein Treffer aus der Nachbarschaft, wenn die
    // Einrichtung in unbewohntem Gebiet ohne Zensus-Zellen steht
    return best && bestDist < 300 ? best.ags : null;
  },

  /**
   * Wendet die Einzugsgrenze eines Typs auf die Zellen an:
   * 'hard' filtert Zellen außerhalb der Ebene weg, 'penalty' skaliert deren
   * Personenzahl herunter (weniger wahrscheinlich UND weniger Kapazität).
   */
  _applyBoundary(cells, facilityAgs, boundary) {
    if (!facilityAgs || !boundary) return cells;
    const n = AGS_PREFIX[boundary.level] || 8;
    const inside = (c) => c.ags && c.ags.slice(0, n) === facilityAgs.slice(0, n);
    if (boundary.mode === 'hard') return cells.filter(inside);
    return cells.map(c => {
      if (!c.ags || inside(c)) return c;
      const factor = c.ags.slice(0, 2) === facilityAgs.slice(0, 2)
        ? BOUNDARY_PENALTY_OUTSIDE
        : BOUNDARY_PENALTY_OUTSIDE_LAND;
      return { ...c, population: c.population * factor, under18: c.under18 * factor };
    });
  },

  /**
   * Einrichtungstyp aus OSM-Attributen ableiten. isced:level ist lückenhaft
   * gepflegt — Namens-Heuristik als Fallback; die Wegezahl bleibt in der
   * UI ohnehin editierbar.
   */
  classify(props) {
    if (props.amenity === 'kindergarten') return 'kindergarten';
    // Vor der Oberstufen-Regel: „Oberstufenzentrum“ enthält „oberstufe“
    if (isVocationalSchool(props.name)) return 'beruflich';
    // Die Schul-Kacheln heißen das Feld isced_level (OSM-Tag isced:level)
    const isced = String(props.isced_level ?? props['isced:level'] ?? '');
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
   * die editierbaren Wegezahlen mit dem Platzhalter des Typs.
   * @param {Array<[lat,lng]>} polygon
   * @returns {Promise<Array<{lat, lon, name, type, trips, tripsSource, osmRefs}>>}
   */
  async findFacilities(polygon) {
    const url = (CONFIG.SCHOOLS_PMTILES_URL || '').trim();
    if (!url) return [];
    const features = await PopulationService.readFeaturesInPolygon(
      url, CONFIG.SCHOOLS_LAYER_NAME || 'germany_osm_schools', polygon, 15
    );
    const mapped = features.map(f => {
      const type = this.classify(f.properties);
      const osmRef = osmRefFromProperties(f.properties, f.geomType);
      return {
        lat: f.lat,
        lon: f.lon,
        name: f.properties.name || `${FACILITY_TYPES[type].label} (unbenannt)`,
        type,
        trips: FACILITY_TYPES[type].trips,
        tripsSource: { kind: 'placeholder' },
        osmRefs: osmRef ? [osmRef] : []
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
      if (dup) dup.osmRefs.push(...f.osmRefs);
      else deduped.push(f);
    }
    return this.sortFacilities(deduped);
  },

  /** Sortierung der Liste: weiterführend, beruflich, Grundschule, Schule, Kita; dann Name. */
  sortFacilities(facilities) {
    const typeOrder = ['weiterfuehrend', 'beruflich', 'grundschule', 'schule', 'kindergarten'];
    return facilities.sort((a, b) =>
      typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.name.localeCompare(b.name, 'de'));
  },

  /**
   * Belegt die Wege je Einrichtung mit amtlichen Schülerzahlen vor (eine
   * Schülerin = ein Hinweg je Schultag, bei beruflichen Schulen anteilig) und
   * übernimmt die amtliche Schulart, wenn sie eindeutig ist. Ohne Daten bleibt
   * der Platzhalter des Typs.
   * @returns {Promise<{matched: number, eligible: number, lands: Object}>}
   */
  async prefillPupils(facilities, areaContext) {
    const data = await SchoolStatsService.loadLands((areaContext && areaContext.lands) || []);
    this.pupilSources = data.sources;
    const matches = matchFacilities(facilities, data.schools);
    let matched = 0;
    facilities.forEach((f, i) => {
      if (matches[i] && applyOfficialSchool(f, matches[i])) matched++;
    });
    this.sortFacilities(facilities);
    return {
      matched,
      eligible: facilities.filter(f => f.type !== 'kindergarten').length,
      lands: data.lands
    };
  },

  /**
   * Zerlegt Wege einer Einrichtung in (Modus, Stichprobe, Gewicht) und hängt
   * je Modus die Längenverteilung aus dem Schulweg-Modell an.
   * @returns {Array<{mode, ghProfile, sample, weight, trips, dist}>}
   */
  _modePlan(facility, typeSettings) {
    const settings = typeSettings[facility.type];
    const cap = Math.max(1, CONFIG.ANALYSIS_MAX_SAMPLE || 150);
    const modeModels = (settings.model && settings.model.modes) || {};
    const plan = [];
    for (const mode of MODES) {
      const pct = settings.split[mode.key] || 0;
      const trips = Math.round(facility.trips * pct / 100);
      if (trips <= 0) continue;
      const sample = Math.min(trips, cap);
      const modeModel = modeModels[mode.key];
      plan.push({
        mode: mode.key, ghProfile: mode.ghProfile, sample, weight: trips / sample, trips,
        dist: mode.key !== 'transit' && modeModel ? drawDistribution(modeModel) : null
      });
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

    const platformsUrl = (CONFIG.PLATFORMS_PMTILES_URL || '').trim();

    // Zensus-Zellen und Haltestellen EINMAL für das Gesamtgebiet laden statt
    // je Einrichtung — die Einzugskreise überlappen fast vollständig, und ein
    // PMTiles-Load je Einrichtung kostet mehrere Sekunden (23 Einrichtungen
    // wären ~2 Minuten, bevor die erste Route startet).
    const center = [
      facilities.reduce((s, f) => s + f.lat, 0) / facilities.length,
      facilities.reduce((s, f) => s + f.lon, 0) / facilities.length
    ];
    // Einzugsbereich je Einrichtung: Radius der Startpunkte, mindestens der
    // weiteste Haltestellen-Einzugsbereich (ÖPNV-Ausstieg)
    const coverRadius = Math.max(...facilities.map(f => {
      const s = typeSettings[f.type];
      const egress = (s.model && s.model.egress) || DEFAULT_EGRESS;
      return Geo.distanceMeters(center[0], center[1], f.lat, f.lon)
        + Math.max(s.radiusM, ...Object.values(egress.radii));
    }));
    if (onProgress) onProgress({ phase: 'prepare', done: 0, total: facilities.length });
    const [allCells, rawStops] = await Promise.all([
      PopulationService.getPopulationFeaturesInRadius(center[0], center[1], coverRadius),
      platformsUrl
        ? PopulationService.readPointFeaturesInRadius(
            platformsUrl, CONFIG.PLATFORMS_LAYER_NAME || 'germany_osm_platforms',
            center[0], center[1], coverRadius, CONFIG.PLATFORMS_READ_ZOOM
          )
        : []
    ]);
    // Typ je Haltestelle vor dem Zusammenfassen (der höhere Typ bleibt erhalten)
    const allStops = DemandService._dedupeStops(rawStops.map(s => ({ ...s, stopClass: stopClass(s.properties) })));
    if (signal.aborted) return null;

    // 1. Jobs erzeugen: je Einrichtung×Modus Startpunkte ziehen
    const jobs = []; // {start, target, ghProfile, mode, weight}
    let capacityLimited = 0;
    let prepared = 0;
    const transitByClass = {}; // ÖPNV-Wege je Haltestellentyp (Hinwege/Schultag)
    for (const facility of facilities) {
      if (signal.aborted) return null;
      const settings = typeSettings[facility.type];
      const target = [facility.lat, facility.lon];
      const plan = this._modePlan(facility, typeSettings);
      if (plan.length === 0) continue;

      const inRadius = (lat, lon, radiusM) =>
        Geo.distanceMeters(lat, lon, target[0], target[1]) <= radiusM;
      // Einzugsgrenze je Typ (Gemeinde hart bzw. Kreis/Land als Abwertung)
      const facilityAgs = this._facilityAgs(allCells, target);
      const cells = this._applyBoundary(
        allCells.filter(c => inRadius(c.center[0], c.center[1], settings.radiusM)),
        facilityAgs, settings.boundary
      );

      for (const p of plan) {
        let points = [];
        let egressClasses = null;
        if (p.mode === 'transit') {
          if (allStops.length === 0) continue;
          // Ausstieg nach Haltestellentyp: Einzugsbereich je Typ, Anteil je Typ
          // aus der Länge der ÖPNV-Wege (domain/transit-stops.js)
          const egress = (settings.model && settings.model.egress) || DEFAULT_EGRESS;
          const drawn = drawEgressStops(allStops, target, p.sample, {
            shares: egress.shares, radii: egress.radii, fallbackStops: CONFIG.DEMAND_TRANSIT_STOPS || 3
          });
          points = drawn.points;
          egressClasses = drawn.classes;
        } else {
          // Weglänge je Verkehrsmittel aus dem Schulweg-Modell (MiD 2023):
          // kurze Wege zu Fuß, mittlere mit dem Rad, lange mit dem Auto. Der
          // Radius kappt nur — Wege von weiter her starten im äußersten Ring.
          const drawn = DemandService._drawFromCells(
            cells, target, settings.radiusM, p.sample, p.dist || 'lognormal', settings.basis || 'under18'
          );
          points = drawn.points;
          if (drawn.points.length < p.sample) capacityLimited++;
        }
        // Gewicht ggf. anheben, wenn die Kapazität weniger Startpunkte hergab
        const weight = points.length > 0 ? p.trips / points.length : 0;
        for (const start of points) {
          jobs.push({ start, target, ghProfile: p.ghProfile, mode: p.mode, weight });
        }
        if (egressClasses) {
          for (const [cls, count] of Object.entries(egressClasses)) {
            transitByClass[cls] = (transitByClass[cls] || 0) + count * weight;
          }
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
      totalTrips: facilities.reduce((s, f) => s + f.trips, 0),
      transitByClass
    };
    // Länge je gerechneter Route (für die Längenverteilung): Routenlänge laut
    // GraphHopper und Luftlinie Start → Einrichtung, mit dem Gewicht der Route
    const trips = [];
    results.forEach((r, i) => {
      if (!r) return;
      const path = r.response && r.response.paths && r.response.paths[0];
      const job = jobs[i];
      trips.push({
        mode: job.mode,
        weight: job.weight,
        routeM: path && Number.isFinite(path.distance) ? path.distance : null,
        beelineM: Geo.distanceMeters(job.start[0], job.start[1], job.target[0], job.target[1])
      });
    });
    this.lastResult = { segments, stats, facilities, typeSettings, trips };
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
   * Exportiert das letzte Analyse-Ergebnis als GeoJSON (Wege je Kante,
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
      // Infrastruktur je Kante; Richtungszählungen heißen hier trips_ab/trips_ba
      const { count_ab, count_ba, ...infra } = exportProperties(seg);
      if (count_ab !== undefined) {
        properties.trips_ab = rnd1(count_ab);
        properties.trips_ba = rnd1(count_ba);
      }
      Object.assign(properties, infra);
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: seg.coords.map(([lat, lng]) => [lng, lat])
        },
        properties
      };
    });

    const usedTypes = [...new Set(result.facilities.map(f => f.type))];
    const sourceIds = new Set();
    for (const type of usedTypes) {
      const model = result.typeSettings[type] && result.typeSettings[type].model;
      if (model) modelSourceIds(model).forEach(id => sourceIds.add(id));
    }
    const pupilSourceIds = new Set(result.facilities
      .filter(f => f.tripsSource && f.tripsSource.kind === 'official' && f.tripsSource.source)
      .map(f => f.tripsSource.source));

    const geoJson = {
      type: 'FeatureCollection',
      features,
      metadata: {
        exportDate: new Date().toISOString(),
        mode: 'analysis',
        note: 'Gewichtete Stichproben-Umlegung. trips = Hinwege je Schultag (eine Schülerin/ein Schüler = '
          + 'ein Hinweg); Rückwege etwa gleich viele auf denselben Kanten in Gegenrichtung.',
        tripUnit: TRIP_UNIT,
        polygon: polygon ? polygon.map(([lat, lng]) => [lng, lat]) : null,
        facilities: result.facilities.map(f => ({
          name: f.name, type: f.type, trips: f.trips, tripsSource: f.tripsSource || { kind: 'placeholder' }, osmRefs: f.osmRefs || []
        })),
        typeSettings: Object.fromEntries(usedTypes.map(t => [t, result.typeSettings[t]])),
        areaContext: this.areaContext,
        boundaryPenalties: { outside: BOUNDARY_PENALTY_OUTSIDE, outsideLand: BOUNDARY_PENALTY_OUTSIDE_LAND },
        transitModel: 'ausstieg-nach-haltestellentyp',
        sources: Object.fromEntries([...sourceIds].map(id => [id, SOURCES[id]])),
        pupilSources: Object.fromEntries([...pupilSourceIds].map(id => [id, this.pupilSources[id] || null])),
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
