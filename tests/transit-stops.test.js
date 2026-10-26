// ÖPNV-Ausstieg: Haltestellentyp, Anteil je Typ nach Weglänge, Ziehung im Einzugsbereich
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tripModel } from '../src/domain/school-trips.js';
import {
  dedupeStops, drawEgressStops, higherStopClass, stopClass, stopClassShares, stopRadii, STOP_RADIUS_M
} from '../src/domain/transit-stops.js';

test('stopClass: Typ aus den Attributen der Haltestellen-Kacheln (Beispiele aus Berlin)', () => {
  assert.equal(stopClass({ name: 'Humannplatz', public_transport: 'platform', railway: 'platform', tram: 'yes' }), 'tram');
  assert.equal(stopClass({ name: 'S+U Schönhauser Allee', railway: 'platform', bus: 'yes', tram: 'yes' }), 'tram');
  assert.equal(stopClass({ name: 'Moritzplatz', public_transport: 'platform', railway: 'platform' }), 'rail'); // U8
  assert.equal(stopClass({ name: 'Berlin Ostbahnhof', railway: 'platform', train: 'yes' }), 'rail');
  // Bushaltestelle am U-Bahnhof: Name hilft nicht
  assert.equal(stopClass({ name: 'U Schönleinstraße', highway: 'bus_stop' }), 'bus');
  assert.equal(stopClass({ name: 'U Hermannplatz/Karl-Marx-Straße', public_transport: 'platform', highway: 'platform' }), 'bus');
  assert.equal(stopClass({}), 'bus');
  assert.equal(higherStopClass('bus', 'rail'), 'rail');
  assert.equal(higherStopClass('rail', 'tram'), 'rail');
});

test('stopClassShares: je länger die ÖPNV-Wege, desto mehr Schiene', () => {
  const share = (type, rs) => stopClassShares(tripModel(type, rs).modes.transit);
  const gs = share('grundschule', 71);
  const wf = share('weiterfuehrend', 71);
  const bs = share('beruflich', 71);
  for (const s of [gs, wf, bs]) assert.ok(Math.abs(s.rail + s.tram + s.bus - 1) < 1e-9);
  assert.ok(gs.rail < wf.rail && wf.rail < bs.rail);
  assert.ok(gs.bus > bs.bus);
  // Kurze Wege: fast nur ÖSPV, Anteile wie MiD Abb. 7 (Bus 4 : U-Bahn 2 : Tram 1)
  assert.ok(gs.bus > 0.5 && gs.rail > 0.28 && gs.rail < 0.36);
  // Berufliche Schulen (Ø ÖPNV-Weg rund 19 km): über die Hälfte Schiene
  assert.ok(bs.rail > 0.5);
  assert.deepEqual(tripModel('grundschule', 71).egress.radii, STOP_RADIUS_M.dicht);
  assert.deepEqual(stopRadii('laendlich'), STOP_RADIUS_M.locker);
});

const at = (lat, lon, cls, name) => ({ lat, lon, stopClass: cls, properties: { name } });
// 0,001° Breite ≈ 111 m
const SCHOOL = [52.5, 13.4];

test('drawEgressStops: U-Bahn in 700 m zählt neben der Bushaltestelle in 110 m', () => {
  const stops = [at(52.501, 13.4, 'bus', 'Bus nah'), at(52.5063, 13.4, 'rail', 'U-Bahn')];
  const shares = { rail: 0.4, tram: 0.1, bus: 0.5 };
  // gleichmäßige Zufallsfolge: Anteile genau ablesbar
  let i = 0;
  const random = () => ((i++ % 100) + 0.5) / 100;
  const res = drawEgressStops(stops, SCHOOL, 100, { shares, radii: STOP_RADIUS_M.dicht, random });
  // Tram fehlt im Einzugsbereich: Schiene 0,4/0,9, Bus 0,5/0,9
  assert.equal(res.classes.rail, 44);
  assert.equal(res.classes.bus, 56);
  // Vorher (die 3 zielnächsten, nur 1/(d + 100 m)) bekam die U-Bahn hier ein Fünftel
  assert.equal(res.used.find(u => u.stopClass === 'rail').distance, 701);
});

test('drawEgressStops: außerhalb des Einzugsbereichs nur, wenn sonst nichts da ist', () => {
  const far = [at(52.5063, 13.4, 'bus', 'Bus 700 m'), at(52.5108, 13.4, 'rail', 'Bahnhof 1,2 km')];
  const res = drawEgressStops(far, SCHOOL, 10, { shares: { rail: 0.5, tram: 0.1, bus: 0.4 }, radii: STOP_RADIUS_M.dicht });
  // Bus über 500 m, Bahn über 800 m: Rückfall auf die nächsten Haltestellen nach Nähe
  assert.equal(res.points.length, 10);
  const mixed = [at(52.501, 13.4, 'bus', 'Bus nah'), at(52.5108, 13.4, 'rail', 'Bahnhof 1,2 km')];
  const only = drawEgressStops(mixed, SCHOOL, 20, { shares: { rail: 0.9, tram: 0, bus: 0.1 }, radii: STOP_RADIUS_M.dicht });
  assert.deepEqual(Object.keys(only.classes), ['bus']); // der Bahnhof liegt außerhalb
  assert.equal(drawEgressStops([], SCHOOL, 5, { shares: {}, radii: STOP_RADIUS_M.dicht }).points.length, 0);
});

test('dedupeStops: Bahnsteig und Bushaltestelle an einem Ort behalten den höheren Typ', () => {
  const stops = [
    { lat: 52.5, lon: 13.4, stopClass: 'bus', properties: { name: 'Bahnhof Beispiel' } },
    { lat: 52.5001, lon: 13.4, stopClass: 'rail', properties: { name: 'Bahnhof Beispiel' } },
    { lat: 52.51, lon: 13.4, stopClass: 'bus', properties: { name: 'Andere' } }
  ];
  const kept = dedupeStops(stops);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].stopClass, 'rail');
});
