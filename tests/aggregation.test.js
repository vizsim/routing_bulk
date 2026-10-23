import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AggregationService } from '../src/services/aggregation-service.js';
import { footSides, classifyFoot } from '../src/domain/infra.js';
import { A, B, C, entry, route } from './helpers.js';

// Route 1: A → B → C (Kanten 1 und 2), Route 2: C → B (Kante 2 in Gegenrichtung)
const r1 = route([A, B, C], {
  edge_id: [[0, 1, 1], [1, 2, 2]],
  sidewalk: [[0, 1, 'yes'], [1, 2, 'no']],
  road_class: [[0, 2, 'residential']],
  street_name: [[0, 2, 'Teststraße']]
});
const r2 = route([C, B], {
  edge_id: [[0, 1, 2]],
  sidewalk: [[0, 1, 'yes']],
  road_class: [[0, 1, 'residential']],
  street_name: [[0, 1, 'Teststraße']]
});

const byEdge = (segments, id) => segments.find(s => s.edgeId === id);

test('gleiche Kante in beiden Richtungen: ein Eintrag, Zählung je Richtung', () => {
  const segs = AggregationService.aggregateRoutes([entry(r1, 'foot'), entry(r2, 'foot')]);
  assert.equal(segs.length, 2);
  const e2 = byEdge(segs, 2);
  assert.equal(e2.count, 2);
  assert.equal(e2.dir.ab.count, 1);
  assert.equal(e2.dir.ba.count, 1);
  assert.equal(e2.byProfile.foot, 2);
});

test('Geometrie liegt unabhängig von der Reihenfolge in Schlüsselrichtung', () => {
  const s1 = byEdge(AggregationService.aggregateRoutes([entry(r1, 'foot'), entry(r2, 'foot')]), 2);
  const s2 = byEdge(AggregationService.aggregateRoutes([entry(r2, 'foot'), entry(r1, 'foot')]), 2);
  assert.deepEqual(s1.coords, [[B[1], B[0]], [C[1], C[0]]]);
  assert.deepEqual(s2.coords, s1.coords);
  assert.equal(s1.key, s2.key);
});

test('sidewalk je Laufrichtung ergibt rechte und linke Straßenseite', () => {
  const segs = AggregationService.aggregateRoutes([entry(r1, 'foot'), entry(r2, 'foot')]);
  const e2 = byEdge(segs, 2);
  // B→C (entlang coords) meldet rechts 'no', C→B meldet rechts (= links von B→C) 'yes'
  assert.deepEqual(footSides(e2), { right: 'no', left: 'yes' });
  assert.equal(classifyFoot(e2), 'sidewalk_one');
  // Kante 1 nur in einer Richtung befahren: linke Seite unbekannt
  const e1 = byEdge(segs, 1);
  assert.deepEqual(footSides(e1), { right: 'yes', left: undefined });
  assert.equal(classifyFoot(e1), 'sidewalk_yes');
});

test('backward_sidewalk (Server-Patch) liefert beide Seiten auch bei einer Richtung', () => {
  const r = route([A, B], {
    edge_id: [[0, 1, 7]],
    sidewalk: [[0, 1, 'no']],
    backward_sidewalk: [[0, 1, 'no']],
    road_class: [[0, 1, 'secondary']]
  });
  const [seg] = AggregationService.aggregateRoutes([entry(r, 'foot')]);
  assert.deepEqual(footSides(seg), { right: 'no', left: 'no' });
  assert.equal(classifyFoot(seg), 'no_sidewalk');
});

test('Länge, edgeId, Gewichte und Profile werden geführt', () => {
  const segs = AggregationService.aggregateRoutes([
    entry(r1, 'foot', { weight: 2.5 }),
    entry(r2, 'transit', { weight: 1.5 })
  ]);
  const e2 = byEdge(segs, 2);
  assert.ok(e2.lengthM > 60 && e2.lengthM < 75, `Länge ${e2.lengthM}`);
  assert.equal(e2.count, 4);
  assert.equal(e2.dir.ab.byProfile.foot, 2.5);
  assert.equal(e2.dir.ba.byProfile.transit, 1.5);
  assert.equal(e2.dir.ab.attrs.street_name, 'Teststraße');
});

test('Attribute verschiedener Profile werden je Richtung zusammengeführt', () => {
  const bike = route([B, C], {
    edge_id: [[0, 1, 2]],
    bicycle_infra: [[0, 1, 'cyclewayOnHighway_exclusive']],
    road_class: [[0, 1, 'residential']]
  });
  const segs = AggregationService.aggregateRoutes([entry(r1, 'foot'), entry(bike, 'bike')]);
  const e2 = byEdge(segs, 2);
  assert.equal(e2.dir.ab.attrs.sidewalk, 'no');
  assert.equal(e2.dir.ab.attrs.bicycle_infra, 'cyclewayOnHighway_exclusive');
  assert.equal(e2.dir.ab.byProfile.bike, 1);
});

test('Roh-Responses und ÖPNV-Legs funktionieren weiter', () => {
  const transit = { __transit: { legs: [{ mode: 'BUS', route: '100', coords: [[52, 13], [52.01, 13.01]], fromStopId: 's1', toStopId: 's2' }] } };
  const segs = AggregationService.aggregateRoutes([r1, { response: transit, profile: 'oepnv' }]);
  assert.equal(segs.length, 3);
  const leg = segs.find(s => !s.dir);
  assert.equal(leg.byProfile.oepnv, 1);
  assert.ok(segs.filter(s => s.dir).every(s => s.count === 1));
});
