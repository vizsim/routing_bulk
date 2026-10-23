// ==== Querungen: welche Straße wird gequert, wie ist die Querung gesichert? ====
//
// GraphHopper liefert für eine Querung (footway=crossing) nur den Fußweg selbst —
// das Tempo der gequerten Straße steht in keinem Path Detail. Ein Ende des
// Querungsstücks liegt aber auf der Straße (GraphHopper teilt den Überweg am
// gemeinsamen Knoten), die übrigen Stücke desselben Überwegs (Gehweg bis Bordstein)
// daneben. Darum gilt je Überweg (osm_way_id) die Straße, die eines seiner Stücke
// berührt oder schneidet — Nähe allein reicht nicht: ein Überweg über Straßenbahn-
// gleise neben einer Hauptstraße quert die Hauptstraße nicht.
//
// Die Querungsart liest GraphHopper nur aus Knoten-Tags (OSMCrossingParser); steht
// crossing=* nur am Weg, bleibt sie leer. Dann helfen andere Stücke desselben
// Überwegs bzw. das crossing des Wegs aus den Querungs-Kacheln.
// Straßen und Wege kommen aus den Kacheln der Unfallkarte (services/crossing-road-service.js).
import { edgeAttrs } from './infra.js';
import { speedOfWay } from './maxspeed.js';

/** Bis zu diesem Abstand liegt ein Ende des Überwegs auf der Straße. */
export const TOUCH_M = 2.5;

/** [lat, lon] → lokale Meter relativ zu ref (eben genähert, reicht für wenige Meter). */
function toLocal([lat, lon], [refLat, refLon]) {
  return [(lon - refLon) * 111320 * Math.cos((refLat * Math.PI) / 180), (lat - refLat) * 110540];
}

/** Abstand Punkt → Linienzug in Metern. */
export function distanceToLineM(point, line) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = toLocal(line[i], point);
    const [bx, by] = toLocal(line[i + 1], point);
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** [Süd, West, Nord, Ost] eines Linienzugs [lat, lon] */
const bboxOf = (line) => line.reduce(
  (b, [lat, lon]) => [Math.min(b[0], lat), Math.min(b[1], lon), Math.max(b[2], lat), Math.max(b[3], lon)],
  [Infinity, Infinity, -Infinity, -Infinity]);
const BBOX_PAD = 0.0001; // Grad, ~7–11 m

/** Schneiden sich zwei Linienzüge? */
export function linesIntersect(a, b) {
  const ref = a[0];
  const pa = a.map(p => toLocal(p, ref));
  const pb = b.map(p => toLocal(p, ref));
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  for (let i = 0; i + 1 < pa.length; i++) {
    for (let j = 0; j + 1 < pb.length; j++) {
      const d1 = cross(pb[j], pb[j + 1], pa[i]), d2 = cross(pb[j], pb[j + 1], pa[i + 1]);
      const d3 = cross(pa[i], pa[i + 1], pb[j]), d4 = cross(pa[i], pa[i + 1], pb[j + 1]);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

/**
 * Straße, die ein Querungsstück berührt (ein Ende ≤ TOUCH_M) oder schneidet.
 * @param {Array<[number, number]>} piece - Linienzug [lat, lon]
 * @param {Array<{line: Array<[number, number]>, props: Object}>} roads
 * @returns {{props: Object, distM: number}|null} - distM 0 = schneidet
 */
export function crossedRoad(piece, roads) {
  const ends = [piece[0], piece[piece.length - 1]];
  const [s, w, n, e] = bboxOf(piece);
  let best = null;
  for (const road of roads) {
    // Grobfilter: Straßen ohne Überlappung der Boxen (Puffer ~10 m) überspringen
    const [rs, rw, rn, re] = road.bbox ?? (road.bbox = bboxOf(road.line));
    if (rs > n + BBOX_PAD || rn < s - BBOX_PAD || rw > e + BBOX_PAD || re < w - BBOX_PAD) continue;
    let distM = Math.min(...ends.map(p => distanceToLineM(p, road.line)));
    if (distM > TOUCH_M) distM = linesIntersect(piece, road.line) ? 0 : Infinity;
    if (distM <= TOUCH_M && (!best || distM < best.distM)) best = { props: road.props, distM };
  }
  return best;
}

/** Aggregierte Segmente, die eine Querung sind. */
export function crossingSegments(segments) {
  return (segments || []).filter(seg => seg.dir && edgeAttrs(seg).footway === 'crossing');
}

const known = (type) => !!type && type !== 'missing';

/**
 * Ordnet den Querungen die gequerte Straße zu und ergänzt eine fehlende
 * Querungsart (andere Stücke desselben Überwegs, sonst crossing des Wegs).
 * Schreibt je Segment seg.crossingRoad = { name, speed, highway, distM } (oder
 * null = keine Straße gequert/erkannt) und seg.crossingType.
 * @param {Array} segments - Querungs-Segmente (crossingSegments)
 * @param {(point: [number, number]) => Array} roadsNear - Straßen-Kandidaten um einen Punkt
 * @param {(osmWayId: number) => string|undefined} [wayTypeOf] - crossing-Tag eines Wegs
 * @returns {number} Querungen mit gefundener Straße
 */
export function assignCrossingRoads(segments, roadsNear, wayTypeOf = () => undefined) {
  const groups = new Map(); // Überweg -> Segmente
  segments.forEach((seg, i) => {
    const wayId = edgeAttrs(seg).osm_way_id;
    const key = typeof wayId === 'number' && wayId > 0 ? wayId : `s${i}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(seg);
  });
  let found = 0;
  for (const [key, group] of groups) {
    let best = null;
    for (const seg of group) {
      if (seg.coords.length < 2) continue;
      // Straßen um beide Enden (an Kachelgrenzen verschieden)
      const near = roadsNear(seg.coords[0]);
      const nearLast = roadsNear(seg.coords[seg.coords.length - 1]);
      const hit = crossedRoad(seg.coords, nearLast === near ? near : [...near, ...nearLast]);
      if (hit && (!best || hit.distM < best.distM)) best = hit;
    }
    const road = best && {
      name: best.props.name || null,
      speed: speedOfWay(best.props),
      highway: best.props.highway || null,
      distM: Math.round(best.distM * 10) / 10
    };
    const wayType = typeof key === 'number' ? wayTypeOf(key) : undefined;
    const type = group.map(seg => edgeAttrs(seg).crossing).find(known) || (known(wayType) ? wayType : null);
    for (const seg of group) {
      const own = edgeAttrs(seg).crossing;
      seg.crossingRoad = road || null;
      seg.crossingType = known(own) ? own : type;
    }
    if (road) found += group.length;
  }
  return found;
}
