import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignCrossingRoads, crossedRoad, crossingSegments, distanceToLineM, linesIntersect } from '../src/domain/crossing-roads.js';
import { classifyCrossing, classifyFoot, classifySpeed, describeSegment, exportProperties } from '../src/domain/infra.js';
import { formatSpeed, speedOfWay, UNLIMITED_KMH } from '../src/domain/maxspeed.js';

/** Querungsstück wie aus der Aggregation (coords [lat, lon]), nur Fußwege in a→b. */
function crossingSeg(coords, attrs = {}) {
  return {
    key: 'k', coords, lengthM: 7, count: 1, byProfile: { foot: 1 }, bySource: {},
    dir: {
      ab: { count: 1, byProfile: { foot: 1 }, attrs: { footway: 'crossing', road_class: 'footway', ...attrs } },
      ba: { count: 0, byProfile: {}, attrs: {} }
    }
  };
}

test('speedOfWay: Zahl, Richtungswert, Typ, verkehrsberuhigt, unbegrenzt', () => {
  assert.equal(speedOfWay({ maxspeed: '50' }), 50);
  assert.equal(speedOfWay({ maxspeed_forward: '30' }), 30);
  assert.equal(speedOfWay({ maxspeed_type: 'DE:zone30' }), 30);
  assert.equal(speedOfWay({ maxspeed_type: 'DE:urban' }), 50);
  assert.equal(speedOfWay({ highway: 'living_street' }), 7);
  assert.equal(speedOfWay({ maxspeed: 'none' }), UNLIMITED_KMH);
  assert.equal(speedOfWay({ maxspeed: 'walk' }), null);
  assert.equal(speedOfWay({}), null);
});

test('formatSpeed', () => {
  assert.equal(formatSpeed(50), '50 km/h');
  assert.equal(formatSpeed(7), 'Schritttempo');
  assert.equal(formatSpeed(UNLIMITED_KMH), 'unbegrenzt');
  assert.equal(formatSpeed(null), 'Tempo nicht erfasst');
});

test('distanceToLineM, linesIntersect und crossedRoad', () => {
  const a = [[52.0, 13.0], [52.0, 13.01]];
  // 0,00009° Breite ≈ 10 m
  assert.ok(Math.abs(distanceToLineM([52.00009, 13.005], a) - 9.95) < 0.2);
  assert.equal(linesIntersect([[51.9999, 13.005], [52.0001, 13.005]], a), true);
  assert.equal(linesIntersect([[52.0001, 13.0], [52.0001, 13.01]], a), false); // parallel

  const roads = [{ line: a, props: { name: 'A' } }];
  // ein Ende auf der Straße
  assert.equal(crossedRoad([[52.00006, 13.005], [52.0, 13.005]], roads).props.name, 'A');
  // schneidet die Straße, beide Enden ~7 m daneben
  assert.equal(crossedRoad([[52.00006, 13.005], [51.99994, 13.005]], roads).distM, 0);
  // parallel ~8 m daneben (Überweg über Gleise neben der Straße): nicht gequert
  assert.equal(crossedRoad([[52.00007, 13.004], [52.00007, 13.0042]], roads), null);
});

test('assignCrossingRoads: je Überweg die nächste Straße, Querungsart vom Geschwisterstück', () => {
  // Hauptstraße (50) bei Breite 52,0; Nebenstraße (30) ~3 m östlich des Überwegs, nach Norden
  const main = { line: [[52.0, 12.99], [52.0, 13.01]], props: { name: 'Hauptstraße', maxspeed: '50', highway: 'secondary' } };
  const side = { line: [[52.0001, 13.00005], [52.01, 13.00005]], props: { name: 'Nebenstraße', maxspeed: '30', highway: 'residential' } };
  // Überweg 7: Stück am Straßenknoten (unmarkiert) und äußeres Stück bis zum Gehweg —
  // dessen Ende liegt näher an der Nebenstraße als an der Hauptstraße
  const atRoad = crossingSeg([[52.00006, 13.0], [52.0, 13.0]], { osm_way_id: 7, crossing: 'unmarked' });
  const outer = crossingSeg([[52.00012, 13.0], [52.00006, 13.0]], { osm_way_id: 7, crossing: 'missing' });
  const other = crossingSeg([[52.0003, 13.0], [52.0003, 13.00005]], { osm_way_id: 8, crossing: 'traffic_signals' });
  const sidewalk = crossingSeg([[52.0, 13.0], [52.0, 13.001]], { footway: 'sidewalk' });

  const crossings = crossingSegments([atRoad, outer, other, sidewalk]);
  assert.equal(crossings.length, 3);
  assert.equal(assignCrossingRoads(crossings, () => [main, side]), 3);
  assert.equal(atRoad.crossingRoad.name, 'Hauptstraße');
  assert.equal(outer.crossingRoad.name, 'Hauptstraße'); // nicht die näher liegende Nebenstraße
  assert.equal(outer.crossingType, 'unmarked');
  assert.equal(other.crossingRoad.speed, 30);
  assert.equal(other.crossingType, 'traffic_signals');
  assert.equal(sidewalk.crossingRoad, undefined);
});

test('assignCrossingRoads: Gleisüberweg neben der Straße, Ampel nur am Weg getaggt', () => {
  // Wie OSM-Weg 1211365342 (Adlershof): footway=crossing + crossing=traffic_signals am Weg,
  // quert nur Straßenbahngleise, ~8 m neben der Rudower Chaussee (50)
  const road = { line: [[52.0, 12.99], [52.0, 13.01]], props: { name: 'Rudower Chaussee', maxspeed: '50' } };
  const tram = crossingSeg([[52.00007, 13.004], [52.00007, 13.0042]], { osm_way_id: 1211365342, crossing: 'missing' });
  assignCrossingRoads([tram], () => [road], (wayId) => (wayId === 1211365342 ? 'traffic_signals' : undefined));
  assert.equal(tram.crossingRoad, null);
  assert.equal(tram.crossingType, 'traffic_signals');
  assert.equal(classifyCrossing(tram), 'crossing_signals');
});

test('Querungs-Klassen: Ampel, ohne Ampel bis/über 30 km/h, unbekannt', () => {
  const s = (attrs, road) => Object.assign(crossingSeg([[52, 13], [52.0001, 13]], attrs), road === undefined ? {} : { crossingRoad: road });
  assert.equal(classifyCrossing(s({ crossing: 'traffic_signals' }, { speed: 50 })), 'crossing_signals');
  assert.equal(classifyCrossing(s({ crossing: 'unmarked' }, { speed: 50 })), 'crossing_fast');
  assert.equal(classifyCrossing(s({ crossing: 'marked' }, { speed: 30 })), 'crossing_calm');
  assert.equal(classifyCrossing(s({ crossing: 'missing' }, { speed: 7 })), 'crossing_calm');
  assert.equal(classifyCrossing(s({ crossing: 'unmarked' })), 'crossing'); // noch nicht nachgeschlagen
  assert.equal(classifyCrossing(s({ crossing: 'unmarked' }, null)), 'crossing'); // keine Straße in der Nähe
  assert.equal(classifyFoot(s({ crossing: 'unmarked' }, { speed: 50 })), 'crossing_fast');
});

test('Querung: Tempo-Merkmal, Infokarte und Export nehmen die gequerte Straße', () => {
  const seg = Object.assign(crossingSeg([[52, 13], [52.0001, 13]], { crossing: 'missing' }), {
    crossingType: 'unmarked',
    crossingRoad: { name: 'Kottbusser Straße', speed: 50, highway: 'secondary', distM: 0.1 }
  });
  assert.equal(classifySpeed(seg, 'foot'), 'le50');
  const d = describeSegment(seg, { mode: 'foot', attr: 'guidance' });
  assert.equal(d.title, 'Querung ohne Ampel, Straße über 30 km/h');
  assert.deepEqual(d.rows.slice(0, 2), [
    { label: 'Querung', value: 'unmarkiert' },
    { label: 'Gequert', value: 'Kottbusser Straße · 50 km/h' }
  ]);
  const p = exportProperties(seg);
  assert.equal(p.foot_class, 'crossing_fast');
  assert.equal(p.crossing_type, 'unmarked');
  assert.equal(p.crossed_road, 'Kottbusser Straße');
  assert.equal(p.crossed_road_maxspeed, 50);
});
