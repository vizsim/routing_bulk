// ==== Infrastruktur: Klassen, Labels und Farben je Modus ====
//
// Reine Funktionen über die aggregierten Segmente aus
// AggregationService.aggregateRoutes (siehe docs/INFRA_ANSICHT.md):
//   seg.dir.ab / seg.dir.ba = { count, byProfile, attrs } je Laufrichtung,
//   'ab' = entlang seg.coords. attrs sind die GraphHopper-Path-Details.
//
// Klassifiziert wird erst beim Zeichnen; Regeländerungen brauchen daher keine
// Neuberechnung der Routen.
import { CONFIG } from '../core/config.js';
import { formatSpeed } from './maxspeed.js';

// ---- Modi ----

export const INFRA_MODES = {
  foot: { label: 'Fuß', longLabel: 'Fußverkehr' },
  bike: { label: 'Rad', longLabel: 'Radverkehr' }
};

// Zählungen je Modus: Die Gebietsanalyse führt ÖPNV-Zubringer als 'transit'
// (zu Fuß geroutet), der Routing-Tab schon als 'foot'. 'oepnv' (Transitous)
// und 'car' haben keine Infrastruktur-Sicht.
const MODE_PROFILES = { foot: ['foot', 'transit'], bike: ['bike'] };

/** Wege eines Modus aus einem byProfile-Objekt. */
export function modeCount(byProfile, mode) {
  const keys = MODE_PROFILES[mode];
  if (!keys || !byProfile) return 0;
  let sum = 0;
  for (const k of keys) sum += byProfile[k] || 0;
  return sum;
}

/** Modi, für die mindestens ein GraphHopper-Segment Wege hat. */
export function availableModes(segments) {
  const found = new Set();
  for (const seg of segments || []) {
    if (!seg.dir) continue;
    for (const mode of Object.keys(MODE_PROFILES)) {
      if (!found.has(mode) && modeCount(seg.byProfile, mode) > 0) found.add(mode);
    }
    if (found.size === 2) break;
  }
  return Object.keys(MODE_PROFILES).filter(m => found.has(m));
}

/** Laufrichtung mit den meisten Wegen des Modus ('ab' bei Gleichstand). */
export function mainDir(seg, mode) {
  if (!seg.dir) return 'ab';
  return modeCount(seg.dir.ba.byProfile, mode) > modeCount(seg.dir.ab.byProfile, mode) ? 'ba' : 'ab';
}

const otherDir = (d) => (d === 'ab' ? 'ba' : 'ab');

/** Richtungsunabhängige Attribute (beide Richtungen zusammengeführt). */
export function edgeAttrs(seg) {
  if (!seg.dir) return {};
  return { ...seg.dir.ba.attrs, ...seg.dir.ab.attrs };
}

/** Attribute einer Laufrichtung, fehlende Werte aus der Gegenrichtung. */
function dirAttrs(seg, d) {
  if (!seg.dir) return {};
  return { ...seg.dir[otherDir(d)].attrs, ...seg.dir[d].attrs };
}

/**
 * Gehweg je Straßenseite, relativ zur gespeicherten Geometrie (a→b).
 * GraphHopper liefert `sidewalk` als "rechts in Laufrichtung": die Richtung
 * 'ab' kennt die rechte, 'ba' die linke Seite. `backward_sidewalk` (Server-
 * Patch) liefert jeweils die andere Seite. undefined = nicht beobachtet.
 * @returns {{right: string|undefined, left: string|undefined}}
 */
export function footSides(seg) {
  const ab = seg.dir?.ab.attrs || {};
  const ba = seg.dir?.ba.attrs || {};
  return {
    right: ab.sidewalk ?? ba.backward_sidewalk,
    left: ba.sidewalk ?? ab.backward_sidewalk
  };
}

// ---- Straßenkontext ----

// Wege ohne Kfz-Verkehr auf der Fahrbahn (für Fuß „Fußweg“, für Rad
// „selbstständiger Weg“, für Tempo „kein Kfz“)
const NO_MOTOR_ROADS = new Set(['footway', 'pedestrian', 'path', 'steps', 'platform', 'cycleway', 'track', 'bridleway', 'corridor']);
// Ruhige Straßen, wenn kein Tempo erfasst ist
const QUIET_ROADS = new Set(['residential', 'living_street', 'service']);

/** Tempo in Laufrichtung des Modus, sonst Gegenrichtung; null = nicht erfasst. */
export function speedOf(seg, mode) {
  if (!seg.dir) return null;
  const d = mainDir(seg, mode);
  const v = seg.dir[d].attrs.max_speed ?? seg.dir[otherDir(d)].attrs.max_speed;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function isQuiet(attrs, speed) {
  if (speed != null) return speed <= 30;
  return QUIET_ROADS.has(attrs.road_class);
}

// ---- Klassen je Merkmal (Reihenfolge = Legende) ----

const FOOT_GUIDANCE = [
  { key: 'footpath', label: 'Fußweg, Pfad, Fußgängerzone', color: '#00441b' },
  { key: 'sidewalk_separate', label: 'Gehweg, separat erfasst', color: '#1b7837' },
  { key: 'sidewalk_both', label: 'Gehweg beidseitig', color: '#5aae61' },
  { key: 'sidewalk_yes', label: 'Gehweg, Gegenseite offen', color: '#7fbf7b' },
  { key: 'sidewalk_one', label: 'Gehweg einseitig', color: '#a6dba0' },
  { key: 'living_street', label: 'Verkehrsberuhigter Bereich', color: '#35978f' },
  { key: 'crossing_signals', label: 'Querung mit Ampel', color: '#2166ac' },
  { key: 'crossing_calm', label: 'Querung ohne Ampel, Straße bis 30 km/h', color: '#67a9cf' },
  { key: 'crossing_fast', label: 'Querung ohne Ampel, Straße über 30 km/h', color: '#c51b7d' },
  { key: 'crossing', label: 'Querung, Straße oder Tempo unbekannt', color: '#a6bddb' },
  { key: 'check_separate', label: 'Prüffall: Fahrbahn trotz separatem Gehweg', color: '#8073ac' },
  { key: 'no_sidewalk_partial', label: 'Kein Gehweg, Gegenseite offen', color: '#f46d43' },
  { key: 'no_sidewalk', label: 'Kein Gehweg', color: '#d73027' },
  { key: 'unknown', label: 'Gehweg nicht erfasst', color: '#bdbdbd' }
];

const BIKE_GUIDANCE = [
  { key: 'separated', label: 'Radweg, baulich getrennt', color: '#00441b' },
  { key: 'bicycle_road', label: 'Fahrradstraße', color: '#1b7837' },
  { key: 'lane', label: 'Radfahrstreifen', color: '#5aae61' },
  { key: 'advisory', label: 'Schutzstreifen, Busspur, Mittellage', color: '#f0b429' },
  { key: 'shared_foot', label: 'Gemeinsam mit Fußverkehr', color: '#4393c3' },
  { key: 'path_no_motor', label: 'Selbstständiger Weg (Pfad, Wirtschaftsweg)', color: '#92c5de' },
  { key: 'mixed_quiet', label: 'Mischverkehr, ruhig (≤ 30 km/h, Wohnstraße)', color: '#80cdc1' },
  { key: 'check_sidepath', label: 'Prüffall: Fahrbahn trotz Radweg/Benutzungspflicht', color: '#8073ac' },
  { key: 'mixed_main', label: 'Mischverkehr, Hauptstraße oder > 30 km/h', color: '#d73027' },
  { key: 'link', label: 'Verbindungsstück, Querung', color: '#bdbdbd' },
  { key: 'unclear', label: 'Führungsform unklar', color: '#969696' },
  { key: 'unknown', label: 'Keine Rad-Daten', color: '#e0e0e0' }
];

const SURFACE_CLASSES = [
  { key: 'smooth', label: 'Glatt (Asphalt, Beton)', color: '#1a9850' },
  { key: 'paving', label: 'Pflaster eben, Platten, Holz', color: '#91cf60' },
  { key: 'compacted', label: 'Wassergebunden, Feinschotter', color: '#fee08b' },
  { key: 'rough', label: 'Holprig (Ebenheit schlecht)', color: '#fdae61' },
  { key: 'cobble', label: 'Kopfsteinpflaster', color: '#f46d43' },
  { key: 'unpaved', label: 'Unbefestigt', color: '#d73027' },
  { key: 'unknown', label: 'Belag nicht erfasst', color: '#bdbdbd' }
];

const SPEED_CLASSES = [
  { key: 'no_motor', label: 'Kein Kfz-Verkehr', color: '#00441b' },
  { key: 'le20', label: 'bis 20 km/h', color: '#1a9850' },
  { key: 'le30', label: '30 km/h', color: '#91cf60' },
  { key: 'le50', label: '40–50 km/h', color: '#fdae61' },
  { key: 'gt50', label: 'über 50 km/h', color: '#d73027' },
  { key: 'unknown', label: 'Tempo nicht erfasst', color: '#bdbdbd' }
];

const LIT_CLASSES = [
  { key: 'lit', label: 'Als beleuchtet erfasst', color: '#e6ab02' },
  { key: 'not_lit', label: 'Nicht als beleuchtet erfasst', color: '#9e9e9e' }
];

const SLOPE_CLASSES = [
  { key: 'flat', label: 'Eben oder bergab (< 2 %)', color: '#1a9850' },
  { key: 'moderate', label: 'Leicht bergauf (2–5 %)', color: '#fee08b' },
  { key: 'steep', label: 'Steil bergauf (> 5 %)', color: '#d73027' },
  { key: 'unknown', label: 'Steigung unbekannt', color: '#bdbdbd' }
];

// ---- Klassifikation ----

/**
 * Querung nach Sicherung und Tempo der gequerten Straße. seg.crossingType und
 * seg.crossingRoad ergänzt domain/crossing-roads.js nach dem Zeichnen; bis dahin
 * (oder ohne berührte Straße, z. B. nur Gleise) 'crossing' = Straße oder Tempo unbekannt.
 */
export function classifyCrossing(seg) {
  const type = seg.crossingType ?? edgeAttrs(seg).crossing;
  if (type === 'traffic_signals') return 'crossing_signals';
  const speed = seg.crossingRoad?.speed;
  if (speed == null) return 'crossing';
  return speed <= 30 ? 'crossing_calm' : 'crossing_fast';
}

export function classifyFoot(seg) {
  const a = edgeAttrs(seg);
  if (a.footway === 'crossing') return classifyCrossing(seg);
  if (a.footway === 'sidewalk') return 'sidewalk_separate';
  if (NO_MOTOR_ROADS.has(a.road_class)) return 'footpath';
  if (a.road_class === 'living_street') return 'living_street';
  const { right, left } = footSides(seg);
  const sides = [right, left];
  const yes = sides.filter(s => s === 'yes').length;
  if (yes === 2) return 'sidewalk_both';
  if (yes === 1) return sides.includes(undefined) ? 'sidewalk_yes' : 'sidewalk_one';
  if (sides.includes('separate')) return 'check_separate';
  const no = sides.filter(s => s === 'no').length;
  if (no === 2) return 'no_sidewalk';
  if (no === 1) return 'no_sidewalk_partial';
  return 'unknown';
}

const BIKE_GROUP_BY_INFRA = {
  cycleway_isolated: 'separated',
  cycleway_adjoining: 'separated',
  cycleway_adjoiningOrIsolated: 'separated',
  cyclewayOnHighwayProtected: 'separated',
  footAndCyclewaySegregated_adjoining: 'separated',
  footAndCyclewaySegregated_isolated: 'separated',
  footAndCyclewaySegregated_adjoiningOrIsolated: 'separated',
  bicycleRoad: 'bicycle_road',
  bicycleRoad_vehicleDestination: 'bicycle_road',
  cyclewayOnHighway_exclusive: 'lane',
  sharedBusLaneBikeWithBus: 'lane',
  cyclewayOnHighway_advisory: 'advisory',
  cyclewayOnHighway_advisoryOrExclusive: 'advisory',
  sharedBusLaneBusWithBike: 'advisory',
  cyclewayOnHighwayBetweenLanes: 'advisory',
  sharedMotorVehicleLane: 'advisory',
  footAndCyclewayShared_adjoining: 'shared_foot',
  footAndCyclewayShared_isolated: 'shared_foot',
  footAndCyclewayShared_adjoiningOrIsolated: 'shared_foot',
  footwayBicycleYes_adjoining: 'shared_foot',
  footwayBicycleYes_isolated: 'shared_foot',
  footwayBicycleYes_adjoiningOrIsolated: 'shared_foot',
  pedestrianAreaBicycleYes: 'shared_foot',
  cyclewayLink: 'link',
  crossing: 'link',
  needsClarification: 'unclear'
};

/**
 * Rad-Führung in einer Laufrichtung.
 * @param {Object} a - Attribute dieser Richtung (Gegenrichtung als Fallback für Kontext)
 * @param {number|null} speed - Tempo in dieser Richtung
 */
export function classifyBikeAttrs(a, speed = null) {
  if (a.bicycle_infra === undefined) return 'unknown';
  const group = BIKE_GROUP_BY_INFRA[a.bicycle_infra];
  if (group) return group;
  // 'none': Der Straßenkontext entscheidet
  if (a.bike_road_access === 'use_sidepath' || a.cycleway === 'separate') return 'check_sidepath';
  if (NO_MOTOR_ROADS.has(a.road_class)) return 'path_no_motor';
  return isQuiet(a, speed) ? 'mixed_quiet' : 'mixed_main';
}

/** Rad-Führung einer Laufrichtung des Segments. */
export function classifyBikeDir(seg, d) {
  const a = { ...dirAttrs(seg, d), bicycle_infra: seg.dir?.[d].attrs.bicycle_infra };
  const v = seg.dir?.[d].attrs.max_speed ?? seg.dir?.[otherDir(d)].attrs.max_speed;
  return classifyBikeAttrs(a, typeof v === 'number' ? v : null);
}

export function classifyBike(seg) {
  return classifyBikeDir(seg, mainDir(seg, 'bike'));
}

const SURFACE_GROUP = {
  asphalt: 'smooth', concrete: 'smooth', paved: 'smooth',
  paving_stones: 'paving', wood: 'paving',
  compacted: 'compacted', fine_gravel: 'compacted',
  cobblestone: 'cobble',
  unpaved: 'unpaved', gravel: 'unpaved', ground: 'unpaved', dirt: 'unpaved', grass: 'unpaved', sand: 'unpaved'
};
const ROUGH = new Set(['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable']);

export function classifySurface(a) {
  const group = SURFACE_GROUP[a.surface];
  if (!group) return 'unknown';
  if (ROUGH.has(a.smoothness) && (group === 'smooth' || group === 'paving' || group === 'compacted')) return 'rough';
  return group;
}

export function classifySpeed(seg, mode) {
  const a = edgeAttrs(seg);
  if (NO_MOTOR_ROADS.has(a.road_class) && a.footway !== 'crossing') return 'no_motor';
  // Querung: es zählt das Tempo der gequerten Straße (domain/crossing-roads.js)
  const v = a.footway === 'crossing' ? (seg.crossingRoad?.speed ?? null) : speedOf(seg, mode);
  if (v == null) return 'unknown';
  if (v <= 20) return 'le20';
  if (v <= 30) return 'le30';
  if (v <= 50) return 'le50';
  return 'gt50';
}

export function classifyLit(a) {
  return a.lit === true ? 'lit' : 'not_lit';
}

/** Mittlere Steigung in Laufrichtung des Modus (%, positiv = bergauf) oder null. */
export function slopeOf(seg, mode) {
  if (!seg.dir) return null;
  const d = mainDir(seg, mode);
  const own = seg.dir[d].attrs.average_slope;
  if (typeof own === 'number') return own;
  const other = seg.dir[otherDir(d)].attrs.average_slope;
  return typeof other === 'number' ? -other : null;
}

export function classifySlope(seg, mode) {
  const v = slopeOf(seg, mode);
  if (v == null) return 'unknown';
  if (v < 2) return 'flat';
  if (v <= 5) return 'moderate';
  return 'steep';
}

// ---- Merkmale (Reihenfolge = Bedienleiste) ----

export const INFRA_ATTRS = {
  guidance: {
    label: 'Führung',
    modes: ['foot', 'bike'],
    classes: (mode) => (mode === 'bike' ? BIKE_GUIDANCE : FOOT_GUIDANCE),
    classify: (seg, mode) => (mode === 'bike' ? classifyBike(seg) : classifyFoot(seg))
  },
  surface: {
    label: 'Untergrund',
    modes: ['foot', 'bike'],
    classes: () => SURFACE_CLASSES,
    classify: (seg) => classifySurface(edgeAttrs(seg))
  },
  slope: {
    label: 'Steigung',
    modes: ['bike'],
    classes: () => SLOPE_CLASSES,
    classify: (seg, mode) => classifySlope(seg, mode)
  },
  speed: {
    label: 'Tempo',
    modes: ['foot', 'bike'],
    classes: () => SPEED_CLASSES,
    classify: (seg, mode) => classifySpeed(seg, mode)
  },
  lit: {
    label: 'Licht',
    modes: ['foot', 'bike'],
    classes: () => LIT_CLASSES,
    classify: (seg) => classifyLit(edgeAttrs(seg))
  }
};

/** Klassen-Definition {key, label, color} oder ein neutraler Platzhalter. */
export function classInfo(attr, mode, key) {
  const def = INFRA_ATTRS[attr];
  const found = def && def.classes(mode).find(c => c.key === key);
  return found || { key, label: 'Keine Daten', color: '#e0e0e0' };
}

/**
 * Aktuelle Ansicht aus CONFIG und den vorhandenen Daten.
 * @param {Array} segments - aggregierte Segmente
 * @returns {{colorBy: 'count'|'infra', mode: string|null, attr: string, modes: string[]}}
 */
export function resolveView(segments) {
  const modes = availableModes(segments);
  const colorBy = CONFIG.COLOR_BY === 'infra' ? 'infra' : 'count';
  let mode = null;
  if (modes.includes(CONFIG.INFRA_MODE)) mode = CONFIG.INFRA_MODE;
  else if (modes.includes(CONFIG.PROFILE)) mode = CONFIG.PROFILE;
  else mode = modes[0] || null;
  const wanted = INFRA_ATTRS[CONFIG.INFRA_ATTR];
  const attr = wanted && mode && wanted.modes.includes(mode) ? CONFIG.INFRA_ATTR : 'guidance';
  return { colorBy, mode, attr, modes };
}

// ---- Texte für Panel und Export ----

export const ROAD_CLASS_LABELS = {
  motorway: 'Autobahn', trunk: 'Kraftfahrstraße', primary: 'Hauptstraße (primary)',
  secondary: 'Hauptstraße (secondary)', tertiary: 'Sammelstraße (tertiary)',
  unclassified: 'Nebenstraße (unclassified)', residential: 'Wohnstraße',
  living_street: 'Verkehrsberuhigter Bereich', service: 'Erschließungsweg (service)',
  road: 'Straße', track: 'Wirtschaftsweg', path: 'Pfad', footway: 'Fußweg',
  cycleway: 'Radweg', pedestrian: 'Fußgängerzone', steps: 'Treppe', bridleway: 'Reitweg',
  platform: 'Bahnsteig', corridor: 'Durchgang', construction: 'Baustelle',
  busway: 'Busstraße', other: 'sonstiger Weg'
};

const SIDE_LABELS = {
  yes: 'Gehweg', no: 'kein Gehweg', separate: 'separat erfasst', missing: 'nicht erfasst'
};

const SURFACE_LABELS = {
  asphalt: 'Asphalt', concrete: 'Beton', paved: 'befestigt', paving_stones: 'Pflastersteine',
  cobblestone: 'Kopfsteinpflaster', wood: 'Holz', compacted: 'wassergebunden',
  fine_gravel: 'Feinschotter', gravel: 'Schotter', unpaved: 'unbefestigt', ground: 'Naturboden',
  dirt: 'Erde', grass: 'Gras', sand: 'Sand', other: 'sonstiger Belag', missing: 'nicht erfasst'
};

const SMOOTHNESS_LABELS = {
  excellent: 'sehr gut', good: 'gut', intermediate: 'mittel', bad: 'schlecht',
  very_bad: 'sehr schlecht', horrible: 'katastrophal', very_horrible: 'katastrophal',
  impassable: 'unpassierbar', other: 'sonstige'
};

const CROSSING_LABELS = {
  traffic_signals: 'mit Ampel', marked: 'markiert', uncontrolled: 'markiert, ohne Ampel',
  unmarked: 'unmarkiert', railway_barrier: 'Bahnübergang mit Schranke', railway: 'Bahnübergang',
  zebra: 'Zebrastreifen', informal: 'informell', no: 'Querung nicht möglich', missing: 'Art nicht erfasst'
};

const FOOT_ACCESS_LABELS = {
  use_sidepath: 'auf Seitenweg verwiesen', designated: 'für Fußverkehr ausgewiesen',
  destination: 'nur Anlieger', private: 'privat', military: 'Militärgelände', no: 'kein Fußverkehr'
};

const BIKE_ACCESS_LABELS = {
  use_sidepath: 'Radwegbenutzungspflicht', dismount: 'Absteigen', designated: 'für Radverkehr ausgewiesen',
  destination: 'nur Anlieger', private: 'privat', military: 'Militärgelände', no: 'Radverkehr verboten'
};

// Detail-Labels je bicycle_infra-Wert (Wortlaut wie CUSTOM_EV_BICYCLE_INFRA_README.md im GH-Fork)
export const BICYCLE_INFRA_LABELS = {
  none: 'Keine Radinfrastruktur',
  bicycleRoad: 'Fahrradstraße',
  bicycleRoad_vehicleDestination: 'Fahrradstraße, Anlieger/Kfz frei',
  crossing: 'Straßenquerung',
  cycleway_adjoining: 'Radweg, straßenbegleitend',
  cycleway_isolated: 'Radweg, selbstständig geführt',
  cycleway_adjoiningOrIsolated: 'Radweg',
  cyclewayLink: 'Radweg-Verbindungsstück',
  cyclewayOnHighway_advisory: 'Schutzstreifen',
  cyclewayOnHighway_exclusive: 'Radfahrstreifen',
  cyclewayOnHighway_advisoryOrExclusive: 'Rad- oder Schutzstreifen (nicht spezifiziert)',
  cyclewayOnHighwayBetweenLanes: 'Radfahrstreifen in Mittellage',
  cyclewayOnHighwayProtected: 'Geschützter Radfahrstreifen',
  footAndCyclewaySegregated_adjoining: 'Getrennter Geh- und Radweg, straßenbegleitend',
  footAndCyclewaySegregated_isolated: 'Getrennter Geh- und Radweg, selbstständig',
  footAndCyclewaySegregated_adjoiningOrIsolated: 'Getrennter Geh- und Radweg',
  footAndCyclewayShared_adjoining: 'Gemeinsamer Geh- und Radweg, straßenbegleitend',
  footAndCyclewayShared_isolated: 'Gemeinsamer Geh- und Radweg, selbstständig',
  footAndCyclewayShared_adjoiningOrIsolated: 'Gemeinsamer Geh- und Radweg',
  footwayBicycleYes_adjoining: 'Gehweg, Rad frei, straßenbegleitend',
  footwayBicycleYes_isolated: 'Gehweg, Rad frei, selbstständig',
  footwayBicycleYes_adjoiningOrIsolated: 'Gehweg, Rad frei',
  pedestrianAreaBicycleYes: 'Fußgängerzone, Rad frei',
  sharedBusLaneBikeWithBus: 'Radfahrstreifen, Bus frei',
  sharedBusLaneBusWithBike: 'Busspur, Rad frei',
  sharedMotorVehicleLane: 'Gemeinsamer Fahrstreifen (Piktogramme)',
  needsClarification: 'Führungsform unklar'
};

const fmtInt = (v) => Math.round(v).toLocaleString('de-DE');

/** "42 Routen" bzw. "~42 Wege/Tag" (Gebietsanalyse). */
export function formatCount(value, unit = null) {
  if (unit) return `~${fmtInt(value)} ${unit}`;
  const n = Math.round(value);
  return `${fmtInt(n)} Route${n === 1 ? '' : 'n'}`;
}

export function formatLength(m) {
  if (m >= 1000) return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
  return `${Math.round(m)} m`;
}

const fmtSlope = (v) => `${v > 0 ? '+' : (v < 0 ? '−' : '')}${Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

function sideLabel(v) {
  if (v === undefined) return 'unbekannt (keine Route in Gegenrichtung)';
  return SIDE_LABELS[v] || v;
}

function speedLabel(seg, mode) {
  const v = speedOf(seg, mode);
  return v == null ? 'Tempo nicht erfasst' : `${fmtInt(v)} km/h`;
}

function surfaceLabel(a) {
  const group = classInfo('surface', null, classifySurface(a)).label;
  const parts = [group];
  const detail = a.surface && a.surface !== 'missing' ? SURFACE_LABELS[a.surface] : null;
  if (detail && detail.toLowerCase() !== group.toLowerCase()) parts.push(detail);
  if (a.smoothness && SMOOTHNESS_LABELS[a.smoothness]) parts.push(`Ebenheit ${SMOOTHNESS_LABELS[a.smoothness]}`);
  return parts.join(' · ');
}

function midpoint(coords) {
  if (!coords || coords.length === 0) return null;
  return coords[Math.floor((coords.length - 1) / 2)];
}

/**
 * Inhalt des Infopanels für ein Segment (reine Daten, das Rendering macht
 * src/ui/segment-panel.js).
 * @param {Object} seg - aggregiertes Segment
 * @param {{mode: string, attr: string}} view
 * @param {{unit?: string|null}} [opts]
 * @returns {{title, color, subtitle, rows: Array<{label, value}>, links: Array<{label, href}>}}
 */
export function describeSegment(seg, view, opts = {}) {
  const { mode, attr } = view;
  const unit = opts.unit || null;
  const cls = classInfo(attr, mode, INFRA_ATTRS[attr].classify(seg, mode));
  const a = edgeAttrs(seg);
  const d = mainDir(seg, mode);
  const od = otherDir(d);
  const total = modeCount(seg.byProfile, mode);
  const nMain = seg.dir ? modeCount(seg.dir[d].byProfile, mode) : total;
  const nOther = seg.dir ? modeCount(seg.dir[od].byProfile, mode) : 0;

  const sub = [];
  if (a.street_name) sub.push(a.street_name);
  if (seg.lengthM) sub.push(formatLength(seg.lengthM));
  let countText = formatCount(total, unit);
  if (nOther > 0) countText += ` (Hauptrichtung ${fmtInt(nMain)} · Gegenrichtung ${fmtInt(nOther)})`;
  sub.push(countText);

  const rows = [];
  // Ohne Kfz-Verkehr kein Tempo (wie die Tempo-Legende)
  const noMotor = NO_MOTOR_ROADS.has(a.road_class) && a.footway !== 'crossing';
  const roadText = [ROAD_CLASS_LABELS[a.road_class] || a.road_class || 'Weg', noMotor ? 'kein Kfz-Verkehr' : speedLabel(seg, mode)];

  if (mode === 'foot') {
    const sides = footSides(seg);
    const right = d === 'ab' ? sides.right : sides.left;
    const left = d === 'ab' ? sides.left : sides.right;
    const footway = a.footway && a.footway !== 'missing' ? a.footway : null;
    if (footway === 'sidewalk') {
      rows.push({ label: 'Gehweg', value: 'separat erfasster Gehweg' });
    } else if (footway === 'crossing') {
      rows.push({ label: 'Querung', value: CROSSING_LABELS[seg.crossingType ?? a.crossing] || 'Querung' });
    } else if (NO_MOTOR_ROADS.has(a.road_class)) {
      rows.push({ label: 'Gehweg', value: 'eigener Weg, kein Gehweg nötig' });
    } else {
      rows.push({ label: 'Gehweg', value: `in Hauptlaufrichtung rechts: ${sideLabel(right)} · links: ${sideLabel(left)}` });
    }
    if (footway === 'crossing') {
      // Statt des Fußwegs die gequerte Straße (domain/crossing-roads.js)
      const road = seg.crossingRoad;
      rows.push({
        label: 'Gequert',
        value: road ? [road.name || ROAD_CLASS_LABELS[road.highway] || 'Straße', formatSpeed(road.speed)].join(' · ') : 'keine Straße erkannt'
      });
    } else {
      rows.push({ label: 'Straße', value: roadText.join(' · ') });
    }
    if (a.foot_road_access && FOOT_ACCESS_LABELS[a.foot_road_access]) {
      rows.push({ label: 'Zugang', value: FOOT_ACCESS_LABELS[a.foot_road_access] });
    }
  } else {
    const label = (dir) => {
      const raw = seg.dir?.[dir].attrs.bicycle_infra;
      const group = classInfo('guidance', 'bike', classifyBikeDir(seg, dir)).label;
      const detail = raw && raw !== 'none' ? BICYCLE_INFRA_LABELS[raw] || raw : null;
      return detail && detail !== group ? `${group} · ${detail}` : group;
    };
    rows.push({ label: 'Führung', value: nOther > 0 ? `Hauptrichtung: ${label(d)}` : label(d) });
    if (nOther > 0) rows.push({ label: '', value: `Gegenrichtung: ${label(od)}` });
    const lanes = typeof a.lanes === 'number' && a.lanes > 0 ? `${a.lanes} Fahrstreifen` : null;
    rows.push({ label: 'Straße', value: [...roadText, lanes].filter(Boolean).join(' · ') });
    const slope = slopeOf(seg, mode);
    if (slope != null) {
      rows.push({ label: 'Steigung', value: nOther > 0 ? `Hauptrichtung ${fmtSlope(slope)} · Gegenrichtung ${fmtSlope(-slope)}` : `${fmtSlope(slope)} in Fahrtrichtung` });
    }
    if (a.bike_road_access && BIKE_ACCESS_LABELS[a.bike_road_access]) {
      rows.push({ label: 'Regelung', value: BIKE_ACCESS_LABELS[a.bike_road_access] });
    }
  }
  rows.push({ label: 'Untergrund', value: surfaceLabel(a) });
  rows.push({ label: 'Licht', value: a.lit === true ? 'als beleuchtet erfasst' : 'nicht als beleuchtet erfasst' });

  const links = [];
  if (typeof a.osm_way_id === 'number' && a.osm_way_id > 0) {
    links.push({ label: 'In OSM ansehen', href: `https://www.openstreetmap.org/way/${a.osm_way_id}` });
  }
  const mid = midpoint(seg.coords);
  if (a.mapillary_coverage === true && mid) {
    links.push({ label: 'Fotos (Mapillary)', href: `https://www.mapillary.com/app/?lat=${mid[0]}&lng=${mid[1]}&z=17` });
  }

  return { title: cls.label, color: cls.color, subtitle: sub.join(' · '), rows, links };
}

/**
 * Infrastruktur-Spalten für den GeoJSON-Export (nur für GraphHopper-Kanten).
 * Seitenangaben beziehen sich auf die exportierte Geometrierichtung.
 */
export function exportProperties(seg) {
  if (!seg.dir) return {};
  const a = edgeAttrs(seg);
  const props = {
    length_m: Math.round(seg.lengthM || 0),
    count_ab: seg.dir.ab.count,
    count_ba: seg.dir.ba.count
  };
  const put = (k, v) => { if (v !== undefined && v !== null) props[k] = v; };
  put('street_name', a.street_name || undefined);
  put('osm_way_id', a.osm_way_id);
  put('road_class', a.road_class);
  put('surface', a.surface);
  put('smoothness', a.smoothness);
  put('lit', a.lit);
  put('max_speed_ab', seg.dir.ab.attrs.max_speed);
  put('max_speed_ba', seg.dir.ba.attrs.max_speed);
  if (modeCount(seg.byProfile, 'foot') > 0) {
    const sides = footSides(seg);
    put('foot_class', classifyFoot(seg));
    put('sidewalk_right', sides.right);
    put('sidewalk_left', sides.left);
    put('footway', a.footway);
    if (a.footway === 'crossing') {
      put('crossing_type', seg.crossingType ?? a.crossing);
      put('crossed_road', seg.crossingRoad?.name);
      put('crossed_road_maxspeed', seg.crossingRoad?.speed);
    }
  }
  if (modeCount(seg.byProfile, 'bike') > 0) {
    put('bike_class_ab', modeCount(seg.dir.ab.byProfile, 'bike') > 0 ? classifyBikeDir(seg, 'ab') : undefined);
    put('bike_class_ba', modeCount(seg.dir.ba.byProfile, 'bike') > 0 ? classifyBikeDir(seg, 'ba') : undefined);
    put('bicycle_infra_ab', seg.dir.ab.attrs.bicycle_infra);
    put('bicycle_infra_ba', seg.dir.ba.attrs.bicycle_infra);
  }
  return props;
}
