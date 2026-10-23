import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CONFIG } from '../src/core/config.js';
import {
  availableModes, classifyBike, classifyBikeAttrs, classifyFoot, classifySlope, classifySpeed,
  classifySurface, describeSegment, exportProperties, INFRA_ATTRS, mainDir, modeCount, resolveView
} from '../src/domain/infra.js';

/** Segment wie aus der Aggregation, mit Attributen je Richtung. */
function seg({ ab = {}, ba = {}, abCount = { foot: 1 }, baCount = {}, coords = [[52, 13], [52, 13.001]] } = {}) {
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  const byProfile = {};
  for (const o of [abCount, baCount]) for (const [k, v] of Object.entries(o)) byProfile[k] = (byProfile[k] || 0) + v;
  return {
    key: 'k', edgeId: 1, coords, lengthM: 68, count: sum(abCount) + sum(baCount), byProfile, bySource: {},
    dir: {
      ab: { count: sum(abCount), byProfile: abCount, attrs: ab },
      ba: { count: sum(baCount), byProfile: baCount, attrs: ba }
    }
  };
}

const original = { COLOR_BY: CONFIG.COLOR_BY, INFRA_MODE: CONFIG.INFRA_MODE, INFRA_ATTR: CONFIG.INFRA_ATTR, PROFILE: CONFIG.PROFILE };
afterEach(() => Object.assign(CONFIG, original));

test('modeCount: Fuß zählt ÖPNV-Zubringer mit, Rad nur Rad', () => {
  assert.equal(modeCount({ foot: 2, transit: 3, bike: 4, car: 5 }, 'foot'), 5);
  assert.equal(modeCount({ foot: 2, transit: 3, bike: 4, car: 5 }, 'bike'), 4);
  assert.equal(modeCount({ car: 5 }, 'foot'), 0);
});

test('Fuß-Klassen', () => {
  const cases = [
    [{ footway: 'crossing', road_class: 'footway' }, {}, 'crossing'],
    [{ footway: 'sidewalk', road_class: 'footway' }, {}, 'sidewalk_separate'],
    [{ road_class: 'path', footway: 'missing' }, {}, 'footpath'],
    [{ road_class: 'living_street', sidewalk: 'missing' }, {}, 'living_street'],
    [{ road_class: 'residential', sidewalk: 'yes' }, { sidewalk: 'yes' }, 'sidewalk_both'],
    [{ road_class: 'residential', sidewalk: 'yes' }, { sidewalk: 'missing' }, 'sidewalk_one'],
    [{ road_class: 'residential', sidewalk: 'yes' }, {}, 'sidewalk_yes'],
    [{ road_class: 'primary', sidewalk: 'separate' }, {}, 'check_separate'],
    [{ road_class: 'secondary', sidewalk: 'no' }, { sidewalk: 'no' }, 'no_sidewalk'],
    [{ road_class: 'secondary', sidewalk: 'no' }, {}, 'no_sidewalk_partial'],
    [{ road_class: 'residential', sidewalk: 'missing' }, { sidewalk: 'missing' }, 'unknown']
  ];
  for (const [ab, ba, expected] of cases) {
    const s = seg({ ab, ba, abCount: { foot: 1 }, baCount: Object.keys(ba).length ? { foot: 1 } : {} });
    assert.equal(classifyFoot(s), expected, JSON.stringify({ ab, ba }));
  }
});

test('Fuß mit backward_sidewalk: beide Seiten aus einer Richtung', () => {
  const s = seg({ ab: { road_class: 'residential', sidewalk: 'no', backward_sidewalk: 'yes' } });
  assert.equal(classifyFoot(s), 'sidewalk_one');
});

test('Rad-Gruppen aus bicycle_infra und Straßenkontext', () => {
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'cycleway_adjoining' }), 'separated');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'bicycleRoad_vehicleDestination' }), 'bicycle_road');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'cyclewayOnHighway_exclusive' }), 'lane');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'cyclewayOnHighway_advisory' }), 'advisory');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'footwayBicycleYes_adjoining' }), 'shared_foot');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'needsClarification' }), 'unclear');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'none', road_class: 'residential' }, null), 'mixed_quiet');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'none', road_class: 'residential' }, 50), 'mixed_main');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'none', road_class: 'secondary' }, 30), 'mixed_quiet');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'none', road_class: 'secondary' }, null), 'mixed_main');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'none', road_class: 'primary', bike_road_access: 'use_sidepath' }), 'check_sidepath');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'none', road_class: 'primary', cycleway: 'separate' }), 'check_sidepath');
  assert.equal(classifyBikeAttrs({ bicycle_infra: 'none', road_class: 'track' }), 'path_no_motor');
  assert.equal(classifyBikeAttrs({ road_class: 'primary' }), 'unknown');
  // jeder bicycle_infra-Wert landet in einer bekannten Klasse
  const keys = new Set(INFRA_ATTRS.guidance.classes('bike').map(c => c.key));
  for (const v of ['none', 'bicycleRoad', 'crossing', 'cyclewayLink', 'cyclewayOnHighwayBetweenLanes', 'sharedBusLaneBusWithBike', 'pedestrianAreaBicycleYes']) {
    assert.ok(keys.has(classifyBikeAttrs({ bicycle_infra: v, road_class: 'residential' })), v);
  }
});

test('Rad: Klasse folgt der Richtung mit den meisten Radwegen', () => {
  const s = seg({
    ab: { bicycle_infra: 'cyclewayOnHighway_exclusive', road_class: 'secondary' },
    ba: { bicycle_infra: 'none', road_class: 'secondary', max_speed: 50 },
    abCount: { bike: 1 }, baCount: { bike: 3 }
  });
  assert.equal(mainDir(s, 'bike'), 'ba');
  assert.equal(classifyBike(s), 'mixed_main');
});

test('Untergrund, Tempo, Steigung', () => {
  assert.equal(classifySurface({ surface: 'asphalt' }), 'smooth');
  assert.equal(classifySurface({ surface: 'asphalt', smoothness: 'bad' }), 'rough');
  assert.equal(classifySurface({ surface: 'cobblestone', smoothness: 'bad' }), 'cobble');
  assert.equal(classifySurface({ surface: 'missing' }), 'unknown');

  assert.equal(classifySpeed(seg({ ab: { road_class: 'footway' } }), 'foot'), 'no_motor');
  assert.equal(classifySpeed(seg({ ab: { road_class: 'residential', max_speed: 30 } }), 'foot'), 'le30');
  assert.equal(classifySpeed(seg({ ab: { road_class: 'primary', max_speed: 70 } }), 'foot'), 'gt50');
  assert.equal(classifySpeed(seg({ ab: { road_class: 'residential', max_speed: null } }), 'foot'), 'unknown');

  const up = seg({ ab: { average_slope: 3.5 }, abCount: { bike: 2 } });
  assert.equal(classifySlope(up, 'bike'), 'moderate');
  // Hauptrichtung entgegen der einzigen bekannten Richtung: Vorzeichen dreht
  const down = seg({ ab: { average_slope: 3.5 }, abCount: { bike: 1 }, ba: {}, baCount: { bike: 2 } });
  assert.equal(classifySlope(down, 'bike'), 'flat');
});

test('availableModes und resolveView', () => {
  const segs = [seg({ abCount: { foot: 1 } }), seg({ abCount: { bike: 1 } }), { key: 'pt', count: 1, byProfile: { oepnv: 1 } }];
  assert.deepEqual(availableModes(segs), ['foot', 'bike']);
  CONFIG.COLOR_BY = 'infra';
  CONFIG.PROFILE = 'bike';
  CONFIG.INFRA_MODE = null;
  CONFIG.INFRA_ATTR = 'slope';
  assert.deepEqual(resolveView(segs), { colorBy: 'infra', mode: 'bike', attr: 'slope', modes: ['foot', 'bike'] });
  CONFIG.INFRA_MODE = 'foot'; // Steigung gibt es für Fuß nicht → Führung
  assert.equal(resolveView(segs).attr, 'guidance');
  assert.equal(resolveView([seg({ abCount: { car: 1 } })]).mode, null);
});

test('describeSegment: Fuß-Panel mit Seiten in Hauptlaufrichtung', () => {
  const s = seg({
    ab: { road_class: 'tertiary', sidewalk: 'no', max_speed: 50, street_name: 'Bernauer Straße', surface: 'asphalt', lit: false, osm_way_id: 123 },
    abCount: { foot: 30 }, baCount: { foot: 12 },
    ba: { sidewalk: 'yes', road_class: 'tertiary', max_speed: 50 }
  });
  const d = describeSegment(s, { mode: 'foot', attr: 'guidance' });
  assert.equal(d.title, 'Gehweg einseitig');
  assert.match(d.subtitle, /Bernauer Straße · 68 m · 42 Routen \(Hauptrichtung 30 · Gegenrichtung 12\)/);
  assert.equal(d.rows[0].value, 'in Hauptlaufrichtung rechts: kein Gehweg · links: Gehweg');
  assert.ok(d.rows.some(r => r.label === 'Straße' && r.value === 'Sammelstraße (tertiary) · 50 km/h'));
  assert.deepEqual(d.links, [{ label: 'In OSM ansehen', href: 'https://www.openstreetmap.org/way/123' }]);
});

test('describeSegment: Rad-Panel mit beiden Richtungen und Einheit der Gebietsanalyse', () => {
  const s = seg({
    ab: { bicycle_infra: 'cycleway_adjoining', road_class: 'secondary', average_slope: 1 },
    ba: { bicycle_infra: 'none', road_class: 'secondary', max_speed: 50 },
    abCount: { bike: 18.4 }, baCount: { bike: 4.2 }
  });
  const d = describeSegment(s, { mode: 'bike', attr: 'guidance' }, { unit: 'Wege/Tag' });
  assert.equal(d.title, 'Radweg, baulich getrennt');
  assert.match(d.subtitle, /~23 Wege\/Tag/);
  assert.equal(d.rows[0].value, 'Hauptrichtung: Radweg, baulich getrennt · Radweg, straßenbegleitend');
  assert.equal(d.rows[1].value, 'Gegenrichtung: Mischverkehr, Hauptstraße oder > 30 km/h');
});

test('exportProperties nur mit Feldern, die es gibt', () => {
  const s = seg({ ab: { road_class: 'residential', sidewalk: 'yes', lit: true }, abCount: { foot: 2 } });
  const p = exportProperties(s);
  assert.equal(p.foot_class, 'sidewalk_yes');
  assert.equal(p.sidewalk_right, 'yes');
  assert.ok(!('sidewalk_left' in p));
  assert.ok(!('bike_class_ab' in p));
  assert.equal(p.count_ab, 2);
  assert.deepEqual(exportProperties({ key: 'pt', count: 1, byProfile: {} }), {});
});
