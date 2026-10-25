// Schulweg-Modell (MiD 2023): Quellenwerte, Skalierung, Plausibilität, Ziehung
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Distribution } from '../src/domain/distribution.js';
import {
  DETOUR_FACTOR, drawDistribution, forsaSplit, FORSA2022_GS, MID2023_ABB100_KM, MID2023_ABB98_SCHOOL,
  MODE_KEYS, modelSourceIds, modeShareInBand, normalizeSplit, SOURCES, splitSuggestion, tripModel
} from '../src/domain/school-trips.js';
import { lognormalCdf, normCdf } from '../src/domain/stats.js';

const sum = (o) => MODE_KEYS.reduce((s, k) => s + o[k], 0);
const meanOver = (model) => MODE_KEYS.reduce((s, m) => s + (model.split[m] / 100) * model.modes[m].meanKm, 0);

test('normCdf: Referenzwerte', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normCdf(-1) - 0.1587) < 1e-4);
  assert.ok(Math.abs(lognormalCdf(500, 500, 0.6) - 0.5) < 1e-7);
});

test('forsa 2022: Splits je Ortsgröße auf 100 % normiert', () => {
  assert.deepEqual(forsaSplit(FORSA2022_GS.ab100k), { foot: 54, bike: 16, transit: 16, car: 14 });
  assert.deepEqual(forsaSplit(FORSA2022_GS.von20bis100k), { foot: 55, bike: 15, transit: 16, car: 14 });
  assert.deepEqual(forsaSplit(FORSA2022_GS.unter20k), { foot: 39, bike: 13, transit: 29, car: 19 });
  assert.deepEqual(forsaSplit(FORSA2022_GS.gesamt), { foot: 48, bike: 14, transit: 21, car: 17 });
  assert.deepEqual(normalizeSplit(MID2023_ABB98_SCHOOL['11-17']), { foot: 19, bike: 21, transit: 48, car: 12 });
  for (const row of Object.values(FORSA2022_GS)) assert.equal(sum(forsaSplit(row)), 100);
});

test('Split-Vorschlag: Quelle je Typ und Raumtyp', () => {
  assert.equal(splitSuggestion('grundschule', 'metro').source, 'forsa2022');
  assert.equal(splitSuggestion('grundschule', null).note, 'Eltern 6- bis 10-Jähriger, bundesweit');
  assert.equal(splitSuggestion('weiterfuehrend', 'metro').source, 'mid2023-abb98');
  assert.equal(splitSuggestion('weiterfuehrend', 'laendlich').source, 'setzung');
  assert.equal(splitSuggestion('kindergarten', null).source, 'mid2023-abb98');
  assert.equal(splitSuggestion('schule', 'gross').source, 'setzung');
});

test('Grundschule in der Metropole: Mittelwert = MiD 2023 Tab. 43, Längen nach Verkehrsmittel gestaffelt', () => {
  const m = tripModel('grundschule', '71');
  assert.equal(m.meanKm, 2);
  assert.equal(m.meanSource, 'mid2023-tab43');
  assert.deepEqual(m.split, { foot: 54, bike: 16, transit: 16, car: 14 });
  assert.ok(Math.abs(meanOver(m) - 2) < 1e-9, 'Mittel über alle Verkehrsmittel trifft Tab. 43');
  const { foot, bike, transit, car } = m.modes;
  assert.ok(foot.meanKm < bike.meanKm && bike.meanKm < transit.meanKm && transit.meanKm < car.meanKm);
  // Verhältnis der Verkehrsmittel wie in Abb. 100
  assert.ok(Math.abs(bike.meanKm / foot.meanKm - MID2023_ABB100_KM.bis10.bike / MID2023_ABB100_KM.bis10.foot) < 1e-9);
  assert.equal(foot.beelineMedianM, (foot.medianKm * 1000) / DETOUR_FACTOR);
  assert.equal(m.radiusM, 3000);
});

test('Land: Fuß und Rad höchstens so lang wie bundesweit, den Rest tragen ÖPNV und Auto', () => {
  const m = tripModel('grundschule', 77); // Tab. 43: 5 km
  assert.equal(m.modes.foot.meanKm, MID2023_ABB100_KM.bis10.foot);
  assert.equal(m.modes.bike.meanKm, MID2023_ABB100_KM.bis10.bike);
  assert.ok(m.scale.motor > 1);
  assert.ok(Math.abs(meanOver(m) - 5) < 1e-9);
  assert.ok(m.radiusM <= 8000);
});

test('Weiterführende Schule: Mittel aus 11–13 und 14–17; ohne Raumtyp bundesweit (Abb. 100)', () => {
  assert.equal(tripModel('weiterfuehrend', 73).meanKm, 6.5);
  const national = tripModel('weiterfuehrend', null);
  assert.equal(national.meanKm, 6.0);
  assert.equal(national.meanSource, 'mid2023-abb100');
  assert.equal(national.group, null);
});

test('Jeder verwendete Wert hat eine Quelle', () => {
  for (const type of ['kindergarten', 'grundschule', 'weiterfuehrend', 'schule']) {
    for (const rs of [null, 71, 72, 73, 74, 75, 76, 77]) {
      const m = tripModel(type, rs);
      for (const id of modelSourceIds(m)) {
        assert.ok(SOURCES[id], `${type}/${rs}: Quelle ${id}`);
        assert.ok(SOURCES[id].label && SOURCES[id].title && SOURCES[id].citation, id);
      }
      assert.equal(sum(m.split), 100, `${type}/${rs}: Split-Summe`);
      for (const mode of MODE_KEYS) assert.ok(m.modes[mode].meanKm > 0, `${type}/${rs}/${mode}`);
    }
  }
});

test('Plausibilität Metropole/Grundschule gegen unabhängige Werte (docs/SCHULWEG_PARAMETER.md)', () => {
  const m = tripModel('grundschule', 71);
  // Scheiner et al. 2019 (MiD, bundesweit): zu Fuß 85 % unter 0,6 km, 60 % bis 1,2 km, 34 % bis 2 km.
  // Großstädte gehen mehr zu Fuß — erwartet: gleicher Verlauf, etwas höher.
  const near = modeShareInBand(m, 'foot', 0, 0.6);
  const mid = modeShareInBand(m, 'foot', 0.6, 1.2);
  const far = modeShareInBand(m, 'foot', 1.2, 2.0);
  assert.ok(near > 0.85 && near < 0.97, `unter 0,6 km: ${near}`);
  assert.ok(mid > 0.6 && mid < 0.8, `0,6–1,2 km: ${mid}`);
  assert.ok(far > 0.3 && far < 0.5, `1,2–2 km: ${far}`);
  // Radanteil am höchsten im mittleren Band (Scheiner: 1,2–2 km)
  assert.ok(modeShareInBand(m, 'bike', 1.2, 2.0) > modeShareInBand(m, 'bike', 0, 0.6));
  // BBSR 2021: nächste Grundschule in Berlin im Mittel 477 m Luftlinie — Fußwege etwas länger
  const footBeelineMeanM = (m.modes.foot.meanKm * 1000) / DETOUR_FACTOR;
  assert.ok(footBeelineMeanM > 477 && footBeelineMeanM < 800, `Fuß Luftlinie: ${footBeelineMeanM}`);
});

test('Ziehung: Ringe folgen der Verteilung, Rest jenseits des Radius im äußersten Ring', () => {
  const dist = drawDistribution(tripModel('grundschule', 71).modes.car);
  const bins = Distribution.calculateDistribution(dist, 15, 3000, 100);
  assert.ok(Math.abs(bins.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  const binSize = 200;
  assert.ok(Math.abs(bins[0] - 100 * lognormalCdf(binSize, dist.medianM, dist.sigma)) < 1e-9);
  const tail = 100 * (1 - lognormalCdf(14 * binSize, dist.medianM, dist.sigma));
  assert.ok(Math.abs(bins[14] - tail) < 1e-9);
  assert.ok(bins[14] > bins[13], 'Autowege von weiter her sammeln sich am Rand');
  // Fußwege bleiben innen: kaum Masse im äußersten Ring
  const foot = Distribution.calculateDistribution(drawDistribution(tripModel('grundschule', 71).modes.foot), 15, 3000, 100);
  assert.ok(foot[14] < 1);
  // Alte Verteilungen unverändert
  assert.equal(Distribution.calculateDistribution('uniform', 4, 1000, 8).join(','), '2,2,2,2');
});
