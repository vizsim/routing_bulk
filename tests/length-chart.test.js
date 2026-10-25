// Längenverteilung der Gebietsanalyse: Klassen, Gewichte, Überlauf-Klasse
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { binLengths } from '../src/visualization/length-chart.js';

const MODES = ['foot', 'bike', 'transit', 'car'];
const trip = (mode, routeM, weight, beelineM = routeM / 1.3) => ({ mode, routeM, weight, beelineM });

test('binLengths: Klassen nach Routenlänge, gewichtet und nach Verkehrsmittel getrennt', () => {
  const data = binLengths([
    trip('foot', 300, 10), trip('transit', 400, 6), trip('foot', 800, 5), trip('bike', 1600, 4), trip('car', 4200, 2)
  ], 'route', MODES);
  // 98 % der Wege bis 4,2 km → 200-m-Klassen (100 m gäbe 43 Klassen, höchstens 24);
  // der Weg am Quantil liegt noch in der letzten regulären Klasse
  assert.equal(data.binM, 200);
  assert.equal(data.bins.length, 22);
  assert.equal(data.rangeM, 4400);
  assert.equal(data.overflow, false);
  assert.deepEqual(data.bins[1].values, { foot: 10, bike: 0, transit: 0, car: 0 });
  assert.equal(data.bins[2].values.transit, 6);
  assert.equal(data.bins[4].values.foot, 5);
  assert.equal(data.bins[8].values.bike, 4);
  assert.equal(data.bins[21].values.car, 2);
  assert.equal(data.bins[0].total, 0);
  assert.equal(data.total, 27);
  assert.ok(Math.abs(data.perMode.foot.meanM - (300 * 10 + 800 * 5) / 15) < 1e-9);
  assert.equal(data.perMode.car.trips, 2);
});

test('binLengths: einzelne lange Wege landen in der Klasse „≥ x km“', () => {
  const data = binLengths([
    trip('foot', 300, 10), trip('transit', 400, 6), trip('foot', 800, 5), trip('bike', 1600, 4), trip('car', 4200, 2),
    trip('car', 12000, 0.1) // 0,4 % der Wege
  ], 'route', MODES);
  assert.equal(data.overflow, true);
  assert.equal(data.rangeM, 4400);
  assert.equal(data.bins.length, 23);
  const last = data.bins[data.bins.length - 1];
  assert.equal(last.toM, null);
  assert.equal(last.values.car, 0.1);
});

test('binLengths: Luftlinie statt Routenlänge; Wege ohne Länge, Gewicht oder bekannten Modus fallen weg', () => {
  const data = binLengths([
    trip('foot', 1300, 1, 1000), trip('foot', null, 1, 500), trip('bike', 900, 0, 600), trip('tram', 500, 3, 400)
  ], 'beeline', MODES);
  assert.equal(data.total, 2); // Luftlinie gibt es auch ohne Routenlänge
  assert.equal(data.perMode.foot.meanM, 750);
  assert.equal(binLengths([trip('foot', null, 1, NaN)], 'route', MODES), null);
});
