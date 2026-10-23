#!/usr/bin/env node
// ==== Mock-GraphHopper für lokale Tests der Infrastruktur-Ansicht ====
//
// Ein synthetisches Straßenraster (100 m Maschenweite) um einen Mittelpunkt,
// das POST /route im Format von GraphHopper 12 beantwortet: points_encoded
// false, Path Details als Intervalle [von, bis, wert], Werte je Richtung wie
// GraphHopper sie speichert (sidewalk = Gehweg rechts in Laufrichtung,
// bicycle_infra/max_speed je Richtung, average_slope mit Vorzeichen).
//
//   node tools/mock-graphhopper.mjs [--port 8989] [--center 52.52,13.40] [--backward]
//
// Ohne --backward lehnt der Mock backward_* ab wie ein GraphHopper ohne den
// Patch ("Cannot find the path details: [...]"). Nur für Entwicklung/Tests.
import http from 'node:http';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const PORT = Number(arg('--port', process.env.PORT || 8989));
const [CLAT, CLON] = arg('--center', '52.52,13.40').split(',').map(Number);
const BACKWARD = args.includes('--backward') || process.env.BACKWARD === '1';
const N = 41; // Knoten je Richtung → 4 km × 4 km
const STEP_M = 100;
const DLAT = STEP_M / 111320;
const DLON = STEP_M / (111320 * Math.cos(CLAT * Math.PI / 180));

const nodeId = (r, c) => r * N + c;
const nodeLat = (r) => CLAT + (r - (N - 1) / 2) * DLAT;
const nodeLon = (c) => CLON + (c - (N - 1) / 2) * DLON;

// deterministisches Pseudo-Zufallsmuster je Linie/Abschnitt
const hash = (...xs) => {
  let h = 2166136261;
  for (const x of xs) { h ^= x + 0x9e3779b9; h = Math.imul(h, 16777619) >>> 0; }
  return h;
};

// ---- Kanten mit Attributen je Richtung (fwd = in Kantenrichtung) ----
const edges = []; // { id, a, b, fwd: {...}, bwd: {...}, common: {...} }
const adj = Array.from({ length: N * N }, () => []);

function lineKind(index) {
  if (index % 12 === 0) return 'primary';
  if (index % 6 === 0) return 'secondary';
  return 'residential';
}

function makeAttrs(horizontal, line, seg) {
  const kind = lineKind(line);
  const h = hash(horizontal ? 1 : 2, line, Math.floor(seg / 3));
  const common = {
    road_class: kind,
    street_name: `${horizontal ? 'Querstraße' : 'Längsstraße'} ${line}`,
    osm_way_id: 1000000 + (horizontal ? 0 : 50000) + line * 100 + Math.floor(seg / 3),
    lanes: kind === 'primary' ? 4 : 2,
    surface: kind === 'residential' && h % 7 === 0 ? 'cobblestone' : (kind === 'residential' && h % 5 === 0 ? 'paving_stones' : 'asphalt'),
    smoothness: h % 11 === 0 ? 'bad' : 'good',
    lit: kind !== 'residential' || h % 3 !== 0,
    footway: 'missing',
    crossing: 'missing',
    foot_road_access: 'yes',
    bike_road_access: 'yes',
    cycleway: 'missing',
    mapillary_coverage: h % 2 === 0
  };
  // Parkweg: ein Fußweg-Abschnitt mitten im Raster
  if (!horizontal && line === 9 && seg >= 4 && seg < 16) {
    Object.assign(common, { road_class: 'footway', street_name: '', lanes: 0, surface: 'compacted', lit: false });
  }
  let sideF, sideB, infraF, infraB, speedF, speedB;
  if (common.road_class === 'footway') {
    sideF = sideB = 'missing';
    infraF = infraB = 'footwayBicycleYes_isolated';
    speedF = speedB = null;
  } else if (kind === 'primary') {
    const v = h % 3;
    sideF = sideB = v === 0 ? 'yes' : (v === 1 ? 'no' : 'separate');
    infraF = v === 2 ? 'none' : 'cycleway_adjoining';
    infraB = v === 2 ? 'none' : 'cycleway_adjoining';
    if (v === 2) common.cycleway = 'separate';
    speedF = speedB = 70;
  } else if (kind === 'secondary') {
    const v = h % 4;
    // eine Seite Gehweg (rechts in Kantenrichtung), andere Seite keiner
    sideF = v === 0 ? 'yes' : (v === 1 ? 'no' : 'yes');
    sideB = v === 0 ? 'no' : (v === 1 ? 'no' : 'yes');
    infraF = v === 3 ? 'cyclewayOnHighway_advisory' : 'cyclewayOnHighway_exclusive';
    infraB = v === 1 ? 'none' : 'cyclewayOnHighway_exclusive';
    speedF = speedB = 50;
  } else {
    const v = h % 5;
    sideF = ['yes', 'yes', 'missing', 'no', 'yes'][v];
    sideB = ['yes', 'missing', 'missing', 'no', 'yes'][v];
    infraF = infraB = h % 13 === 0 ? 'bicycleRoad' : 'none';
    speedF = speedB = h % 2 === 0 ? 30 : null;
  }
  // Steigung entlang der Längsstraßen nach Norden
  const slope = !horizontal && line % 4 === 1 ? 3.5 : (!horizontal && line % 8 === 3 ? 6.5 : 0.5);
  const fwd = { sidewalk: sideF, bicycle_infra: infraF, max_speed: speedF, average_slope: slope };
  const bwd = { sidewalk: sideB, bicycle_infra: infraB, max_speed: speedB, average_slope: -slope };
  return { common, fwd, bwd };
}

function addEdge(a, b, horizontal, line, seg) {
  const id = edges.length;
  const { common, fwd, bwd } = makeAttrs(horizontal, line, seg);
  const e = { id, a, b, common, fwd, bwd, length: STEP_M };
  edges.push(e);
  adj[a].push({ e, to: b, forward: true });
  adj[b].push({ e, to: a, forward: false });
}

for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    if (c + 1 < N) addEdge(nodeId(r, c), nodeId(r, c + 1), true, r, c);
    if (r + 1 < N) addEdge(nodeId(r, c), nodeId(r + 1, c), false, c, r);
  }
}

// ---- Routing (Dijkstra, Gewichte je Profil) ----

function cost(step, profile) {
  const { e, forward } = step;
  const d = forward ? e.fwd : e.bwd;
  const rc = e.common.road_class;
  let f = 1;
  if (profile === 'foot') {
    if (rc === 'footway') f = 0.7;
    else if (rc === 'primary' && d.sidewalk === 'no') f = 2.5;
    else if (rc === 'residential') f = 0.95;
  } else if (profile === 'bike') {
    if (d.bicycle_infra.startsWith('cycleway')) f = 0.7;
    else if (rc === 'primary') f = 2;
    else if (d.bicycle_infra === 'bicycleRoad') f = 0.75;
  } else if (profile === 'car') {
    if (rc === 'footway') return Infinity;
    f = rc === 'primary' ? 0.5 : (rc === 'secondary' ? 0.7 : 1);
  }
  return e.length * f;
}

function nearestNode(lon, lat) {
  const r = Math.round((lat - CLAT) / DLAT + (N - 1) / 2);
  const c = Math.round((lon - CLON) / DLON + (N - 1) / 2);
  if (r < 0 || c < 0 || r >= N || c >= N) return null;
  return nodeId(r, c);
}

function route(from, to, profile) {
  const dist = new Float64Array(N * N).fill(Infinity);
  const prev = new Array(N * N).fill(null);
  dist[from] = 0;
  const open = new Set([from]);
  while (open.size) {
    let u = null, best = Infinity;
    for (const v of open) if (dist[v] < best) { best = dist[v]; u = v; }
    open.delete(u);
    if (u === to) break;
    for (const step of adj[u]) {
      const w = cost(step, profile);
      if (!Number.isFinite(w)) continue;
      const nd = dist[u] + w;
      if (nd < dist[step.to]) { dist[step.to] = nd; prev[step.to] = { from: u, step }; open.add(step.to); }
    }
  }
  if (from !== to && !prev[to]) return null;
  const steps = [];
  for (let v = to; v !== from; v = prev[v].from) steps.unshift(prev[v].step);
  return steps;
}

// ---- Path Details ----

const DETAIL_KEYS = new Set(['edge_id', 'sidewalk', 'footway', 'road_class', 'max_speed', 'lit', 'crossing', 'surface',
  'smoothness', 'foot_road_access', 'street_name', 'osm_way_id', 'mapillary_coverage', 'bicycle_infra', 'cycleway',
  'bike_road_access', 'lanes', 'average_slope']);
const DIRECTIONAL = new Set(['sidewalk', 'bicycle_infra', 'max_speed', 'average_slope']);

function detailValue(step, key) {
  const { e, forward } = step;
  if (key === 'edge_id') return e.id;
  let k = key;
  let reverse = false;
  if (key.startsWith('backward_')) { k = key.slice('backward_'.length); reverse = true; }
  if (DIRECTIONAL.has(k)) {
    const useFwd = forward !== reverse;
    return (useFwd ? e.fwd : e.bwd)[k];
  }
  return e.common[k];
}

function buildDetails(steps, keys) {
  const out = {};
  for (const key of keys) {
    const list = [];
    steps.forEach((step, i) => {
      const v = detailValue(step, key);
      const last = list[list.length - 1];
      if (key !== 'edge_id' && last && last[2] === v) last[1] = i + 1;
      else list.push([i, i + 1, v]);
    });
    out[key] = list;
  }
  return out;
}

function unsupported(keys) {
  return keys.filter(k => {
    if (k.startsWith('backward_')) return !BACKWARD || !DETAIL_KEYS.has(k.slice('backward_'.length));
    return !DETAIL_KEYS.has(k);
  });
}

let requests = 0;
let rejected = 0;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url.startsWith('/stats')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ requests, rejected, backward: BACKWARD }));
    return;
  }
  if (req.method !== 'POST' || !req.url.startsWith('/route')) { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    requests++;
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    let q;
    try { q = JSON.parse(body); } catch { send(400, { message: 'invalid json' }); return; }
    const keys = q.details || [];
    const bad = unsupported(keys);
    if (bad.length) { rejected++; send(400, { message: `Cannot find the path details: [${bad.join(', ')}]`, hints: [] }); return; }
    const [[lon1, lat1], [lon2, lat2]] = q.points;
    const from = nearestNode(lon1, lat1);
    const to = nearestNode(lon2, lat2);
    if (from == null || to == null) { send(400, { message: 'Cannot find point 0: outside of the mock grid' }); return; }
    const steps = route(from, to, q.profile || 'foot');
    if (!steps) { send(400, { message: 'Connection between locations not found' }); return; }
    const coordinates = [];
    const pushNode = (n) => coordinates.push([nodeLon(n % N), nodeLat(Math.floor(n / N))]);
    pushNode(from);
    steps.forEach(s => pushNode(s.to));
    const distance = steps.length * STEP_M;
    send(200, {
      hints: {}, info: { copyrights: ['mock'] },
      paths: [{ distance, time: distance * 720, points_encoded: false, points: { type: 'LineString', coordinates }, details: buildDetails(steps, keys) }]
    });
  });
});

server.listen(PORT, () => {
  console.log(`Mock-GraphHopper auf http://localhost:${PORT}/route · Mitte ${CLAT},${CLON} · backward_* ${BACKWARD ? 'an' : 'aus'}`);
});
