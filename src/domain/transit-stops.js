// ==== ÖPNV-Ausstieg der Gebietsanalyse: an welcher Haltestelle enden ÖPNV-Wege? ====
//
// ÖPNV-Wege enden an einer Haltestelle nahe der Schule; von dort wird der
// Fußweg geroutet. Welche Haltestelle das ist, hängt ab von
// 1. ihrem Typ — Schiene (S-, U-, Eisenbahn), Straßenbahn oder Bus — aus den
//    OSM-Attributen der Haltestellen-Kacheln,
// 2. dem Einzugsbereich je Typ (Leitlinie zur Nahverkehrsplanung in Bayern,
//    Grenzwerte: Schiene reicht 1,5- bis 1,6-mal so weit wie Bus/Straßenbahn),
// 3. der Länge der ÖPNV-Wege: S-Bahn- und Regionalzugwege sind im Mittel
//    26 km lang, Bus-, Straßenbahn- und U-Bahn-Wege 9 km (MiD 2023, Tab. 24).
//    Je länger die ÖPNV-Wege eines Einrichtungstyps, desto öfter enden sie an
//    der Schiene.
// Der Anteil je Typ wird auf die Typen verteilt, die im Einzugsbereich der
// Einrichtung vorkommen; innerhalb eines Typs zählt die Nähe (1/(d + 100 m)).
// Quellen: SOURCES in school-trips.js, Herleitung in docs/SCHULWEG_PARAMETER.md.
import { Geo } from './geo.js';

export const STOP_CLASSES = ['rail', 'tram', 'bus'];
export const STOP_CLASS_LABELS = { rail: 'Schiene', tram: 'Straßenbahn', bus: 'Bus' };
const CLASS_RANK = { bus: 0, tram: 1, rail: 2 };

/**
 * Haltestellentyp aus den Attributen der Haltestellen-Kacheln. Straßenbahnsteige
 * tragen tram=yes (oft zusätzlich railway=platform); S-, U- und Fernbahnsteige
 * railway=platform ohne tram, teils train=yes. Der Name hilft nicht: In Berlin
 * heißen gerade die Bushaltestellen am U-Bahnhof „U Schönleinstraße“.
 */
export function stopClass(props = {}) {
  if (props.tram === 'yes') return 'tram';
  if (props.train === 'yes' || props.subway === 'yes' || props.light_rail === 'yes'
    || props.railway === 'platform' || props.railway === 'station' || props.railway === 'halt') return 'rail';
  return 'bus';
}

/** Der „höhere“ von zwei Typen (für zusammengefasste Haltestellen). */
export function higherStopClass(a, b) {
  return (CLASS_RANK[b] ?? -1) > (CLASS_RANK[a] ?? -1) ? b : a;
}

/** Haltestellen dichter als das gelten als eine (Node + Bahnsteig doppelt gemappt). */
const STOP_DEDUP_M = 30;
/** Gleichnamige Haltestellen in diesem Umkreis sind Steige derselben Haltestelle
 *  (Richtungspaare, Bussteige) — für die Nachfrage ein einziger Ausstiegsort. */
const STOP_SAME_NAME_M = 250;

/**
 * Fasst Haltestellen zusammen, die faktisch eine sind:
 * - Punkte dichter als STOP_DEDUP_M (Node + Bahnsteig doppelt gemappt)
 * - gleichnamige Steige im Umkreis STOP_SAME_NAME_M (Richtungspaare, Bussteige) —
 *   sonst wären „die 3 nächsten Haltestellen“ oft dreimal dieselbe.
 * Liegen Bahnsteig und Bushaltestelle an einem Ort, behält die verbleibende
 * Haltestelle den höheren Typ (stopClass).
 */
export function dedupeStops(stops) {
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
    const duplicate = neighbours.find(o => {
      const d = Geo.distanceMeters(s.lat, s.lon, o.lat, o.lon);
      if (d < STOP_DEDUP_M) return true;
      return name && name === nameOf(o) && d < STOP_SAME_NAME_M;
    });
    if (duplicate) {
      if (s.stopClass && duplicate.stopClass) duplicate.stopClass = higherStopClass(duplicate.stopClass, s.stopClass);
      continue;
    }
    kept.push(s);
    const key = `${bx}:${by}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(s);
  }
  return kept;
}

/**
 * Leitlinie zur Nahverkehrsplanung in Bayern, Anhang C, Tab. 1: Einzugsbereiche
 * von Haltestellen in m Luftlinie, Grenzwerte für Ober-/Mittelzentren.
 * Metropolen und Großstädte = hohe Nutzungsdichte, sonst niedrige.
 */
export const STOP_RADIUS_M = {
  dicht: { bus: 500, tram: 500, rail: 800 },
  locker: { bus: 800, tram: 800, rail: 1200 }
};

/** Einzugsbereiche für eine Raumtyp-Gruppe (school-trips.js: regionGroup). */
export function stopRadii(group) {
  return group === 'metro' || group === 'gross' ? STOP_RADIUS_M.dicht : STOP_RADIUS_M.locker;
}

/**
 * MiD 2023: Anteil an allen Wegen in % (Abb. 7, hochaufgelöster Modal Split)
 * und mittlere Weglänge in km (Tab. 24). U-Bahn und Stadtbahn zählen zum
 * Straßenpersonenverkehr (ÖSPV) mit Bus und Straßenbahn; S-Bahn und
 * Nahverkehrszüge zum Schienenpersonennahverkehr (SPNV).
 */
export const MID2023_OEV = {
  sharePct: { bus: 4, ubahn: 2, tram: 1, spnv: 2 },
  meanKm: { oespv: 9, spnv: 26 }
};

/**
 * Anteil Schiene/Straßenbahn/Bus an den ÖPNV-Wegen eines Einrichtungstyps.
 * P(SPNV | Länge L) folgt aus den Anteilen und Weglängen von ÖSPV und SPNV
 * (beide lognormal mit der Streuung der ÖPNV-Wege) und wird über die
 * Längenverteilung der ÖPNV-Wege gemittelt. Schiene = U-Bahn + SPNV (in OSM
 * nicht zu trennen); im ÖSPV bleiben die Anteile fest (Bus 4 : U-Bahn 2 : Tram 1).
 * @param {{medianKm: number, sigma: number}} transitModel - tripModel(...).modes.transit
 * @returns {{rail: number, tram: number, bus: number}} Summe 1
 */
export function stopClassShares(transitModel) {
  const { sharePct: s, meanKm } = MID2023_OEV;
  const oespv = s.bus + s.ubahn + s.tram;
  const sigma = transitModel.sigma;
  const mu = (mean) => Math.log(mean) - (sigma * sigma) / 2;
  const muO = mu(meanKm.oespv);
  const muS = mu(meanKm.spnv);
  // Dichte in ln(L) ohne den gemeinsamen Faktor 1/(σ√2π)
  const density = (x, m) => Math.exp(-((x - m) ** 2) / (2 * sigma * sigma));
  const muT = Math.log(transitModel.medianKm);
  let weightSum = 0;
  let pSum = 0;
  for (let i = -40; i <= 40; i++) { // ±4 σ in Schritten von 0,1 σ
    const z = i / 10;
    const w = Math.exp(-(z * z) / 2);
    const x = muT + z * transitModel.sigma;
    const a = s.spnv * density(x, muS);
    const b = oespv * density(x, muO);
    pSum += w * (a / (a + b));
    weightSum += w;
  }
  const pSpnv = pSum / weightSum;
  return {
    rail: pSpnv + ((1 - pSpnv) * s.ubahn) / oespv,
    tram: ((1 - pSpnv) * s.tram) / oespv,
    bus: ((1 - pSpnv) * s.bus) / oespv
  };
}

/**
 * Ausstiegshaltestelle je Weg ziehen.
 * @param {Array<{lat, lon, stopClass?, properties?}>} stops - zusammengefasste Haltestellen
 * @param {[number, number]} target - [lat, lon] der Einrichtung
 * @param {number} n - Anzahl Wege
 * @param {{shares: Object, radii: Object, fallbackStops?: number, random?: Function}} options
 * @returns {{points: Array<[number, number]>, used: Array<{name, stopClass, distance, count}>, classes: Object}}
 */
export function drawEgressStops(stops, target, n, { shares, radii, fallbackStops = 3, random = Math.random }) {
  const empty = { points: [], used: [], classes: {} };
  if (!stops || stops.length === 0 || n <= 0) return empty;
  const withDistance = stops.map(s => ({
    s, cls: s.stopClass || 'bus', d: Geo.distanceMeters(s.lat, s.lon, target[0], target[1])
  }));
  let candidates = withDistance.filter(c => c.d <= (radii[c.cls] ?? radii.bus));
  let weights;
  if (candidates.length > 0) {
    // Anteil je Typ auf die vorhandenen Typen verteilen, im Typ nach Nähe
    const present = [...new Set(candidates.map(c => c.cls))];
    const classTotal = present.reduce((sum, cls) => sum + (shares[cls] || 0), 0) || 1;
    const nearSum = {};
    for (const c of candidates) nearSum[c.cls] = (nearSum[c.cls] || 0) + 1 / (c.d + 100);
    weights = candidates.map(c => ((shares[c.cls] || 0) / classTotal) * (1 / (c.d + 100)) / nearSum[c.cls]);
  } else {
    // Keine Haltestelle im Einzugsbereich: die nächsten, nach Nähe
    candidates = [...withDistance].sort((a, b) => a.d - b.d).slice(0, Math.max(1, fallbackStops));
    weights = candidates.map(c => 1 / (c.d + 100));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  const counts = new Array(candidates.length).fill(0);
  const points = [];
  for (let i = 0; i < n; i++) {
    let r = random() * total;
    let idx = candidates.length - 1;
    for (let k = 0; k < candidates.length; k++) {
      r -= weights[k];
      if (r <= 0) { idx = k; break; }
    }
    counts[idx]++;
    points.push([candidates[idx].s.lat, candidates[idx].s.lon]);
  }
  const classes = {};
  const used = [];
  candidates.forEach((c, i) => {
    if (!counts[i]) return;
    classes[c.cls] = (classes[c.cls] || 0) + counts[i];
    used.push({ name: c.s.properties && c.s.properties.name, stopClass: c.cls, distance: Math.round(c.d), count: counts[i] });
  });
  return { points, used, classes };
}
