// Schulweg-Modell (MiD 2023): Quellenwerte, Skalierung, Plausibilität, Ziehung
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Distribution } from '../src/domain/distribution.js';
import {
  azubiSplit, DETOUR_FACTOR, drawDistribution, FOOT_LIMITS, forsaSplit, FORSA2022_GS, MID2023_ABB100_KM,
  MID2023_ABB98_SCHOOL, MODE_KEYS, modelSourceIds, modeShareInBand, normalizeSplit, presenceShare, RADIUS_MAX_M,
  SOURCES, splitSuggestion, tripModel
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
  // (Verteilungs-Mittel vor der 2-km-Grenze für Fußwege)
  assert.ok(Math.abs(bike.distMeanKm / foot.distMeanKm - MID2023_ABB100_KM.bis10.bike / MID2023_ABB100_KM.bis10.foot) < 1e-9);
  assert.ok(foot.meanKm < foot.distMeanKm, 'die 2-km-Grenze senkt den tatsächlichen Mittelwert');
  assert.equal(foot.beelineMedianM, (foot.medianKm * 1000) / DETOUR_FACTOR);
  assert.equal(m.radiusM, 3000);
});

test('Land: Fußwege von Grundschulkindern im Mittel höchstens 0,9 km, den Rest tragen ÖPNV und Auto', () => {
  const m = tripModel('grundschule', 77); // Tab. 43: 5 km
  assert.equal(m.modes.foot.distMeanKm, FOOT_LIMITS.bis10.meanMaxKm); // statt 1,2 km aus Abb. 100
  assert.equal(m.modes.foot.maxKm, 2);
  // tatsächlicher Mittelwert nach der 2-km-Grenze (abgeschnittene Lognormalverteilung)
  assert.ok(Math.abs(m.modes.foot.meanKm - 0.805) < 0.001, `Fuß Ø ${m.modes.foot.meanKm}`);
  assert.equal(m.modes.bike.meanKm, MID2023_ABB100_KM.bis10.bike);
  assert.ok(m.scale.motor > 1);
  assert.ok(Math.abs(meanOver(m) - 5) < 1e-9);
  assert.ok(m.radiusM <= 8000);
  // Kita und „Schule“ (Art unbekannt) ebenso; weiterführende Schulen ohne Grenze
  assert.equal(tripModel('schule', 77).modes.foot.maxKm, 2);
  assert.equal(tripModel('kindergarten', 74).modes.foot.maxKm, 2);
  assert.equal(tripModel('weiterfuehrend', 77).modes.foot.maxKm, null);
  assert.equal(tripModel('weiterfuehrend', 77).modes.foot.meanKm, MID2023_ABB100_KM['11-17'].foot);
  // In der Stadt liegt der Mittelwert schon unter 0,9 km
  assert.ok(Math.abs(tripModel('grundschule', 71).modes.foot.distMeanKm - 0.83) < 0.01);
  assert.ok(modelSourceIds(m).includes('kobel2019') && modelSourceIds(m).includes('schuelerbefoerderung'));
});

test('roundToTargets: ganze Punkte je Ring nach dem größten Rest, ohne Schub nach außen', () => {
  assert.deepEqual(Distribution.roundToTargets([0.4, 0.4, 0.4, 1.8], 3), [1, 0, 0, 2]);
  assert.deepEqual(Distribution.roundToTargets([3, 2], 4), [2, 2]); // Erwartung zu groß: kürzen
  assert.deepEqual(Distribution.roundToTargets([0, 2.5, 0, 0.6], 3), [0, 2, 0, 1]); // größter Rest gewinnt
  // Ringe ohne erwartete Masse bekommen nie einen Punkt
  const expected = Distribution.calculateDistribution(drawDistribution(tripModel('grundschule', 77).modes.foot), 32, 8000, 37);
  const targets = Distribution.roundToTargets(expected, 37);
  assert.equal(targets.reduce((a, b) => a + b, 0), 37);
  targets.forEach((t, i) => { if (!(expected[i] > 0)) assert.equal(t, 0); });
  // Summe der Rundung je Ring weicht höchstens um einen Punkt ab
  targets.forEach((t, i) => assert.ok(Math.abs(t - expected[i]) < 1 + 1e-9));
});

test('Fußwege über 2 km gibt es nicht: Ziehung und Anteile schneiden ab', () => {
  const foot = tripModel('grundschule', 77).modes.foot;
  const dist = drawDistribution(foot);
  assert.ok(Math.abs(dist.maxM - 2000 / DETOUR_FACTOR) < 1e-9); // 1.538 m Luftlinie
  const bins = Distribution.calculateDistribution(dist, 32, 8000, 100); // 250-m-Ringe
  assert.ok(Math.abs(bins.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  const lastWithMass = bins.reduce((last, v, i) => (v > 0 ? i : last), -1);
  assert.equal(lastWithMass, Math.floor(dist.maxM / 250));
  assert.equal(Distribution.getDistanceWeight(dist, 1600, 8000), 0);
  // Weiterführende Schulen: keine Obergrenze, Autowege weiter bis an den Rand
  assert.equal(drawDistribution(tripModel('weiterfuehrend', 77).modes.foot).maxM, undefined);
  // Anteil der Fußwege über 1,5 km Netz: vorher 25 %, jetzt rund 8 %
  const truncatedShare = (fromKm) => {
    const cdf = (x) => lognormalCdf(Math.min(x, foot.maxKm), foot.medianKm, foot.sigma);
    return (cdf(foot.maxKm) - cdf(fromKm)) / cdf(foot.maxKm);
  };
  assert.ok(truncatedShare(1.5) > 0.06 && truncatedShare(1.5) < 0.1, `> 1,5 km: ${truncatedShare(1.5)}`);
  assert.equal(truncatedShare(2), 0);
  // Im Band über 2 km gehen Grundschulkinder nie zu Fuß
  assert.equal(modeShareInBand(tripModel('grundschule', 77), 'foot', 2, 3), 0);
});

test('Weiterführende Schule: Mittel aus 11–13 und 14–17; ohne Raumtyp bundesweit (Abb. 100)', () => {
  assert.equal(tripModel('weiterfuehrend', 73).meanKm, 6.5);
  const national = tripModel('weiterfuehrend', null);
  assert.equal(national.meanKm, 6.0);
  assert.equal(national.meanSource, 'mid2023-abb100');
  assert.equal(national.group, null);
});

test('Berufliche Schule: Split der Auszubildenden, je Raumtyp mit dem Faktor aller Wege', () => {
  // Abb. 78, Männer und Frauen gemittelt: Fuß 18,5 · Rad 6,5 · ÖPNV 28 · Auto (Fahrt + Mitfahrt) 47
  assert.deepEqual(azubiSplit(null), { foot: 19, bike: 6, transit: 28, car: 47 });
  // Metropole (Tab. 8: 31/15/21/33 statt 26/11/11/53): 18,5·31/26 … neu normiert
  assert.deepEqual(azubiSplit(71), { foot: 19, bike: 8, transit: 47, car: 26 });
  // Dörflicher Raum, ländliche Region (22/6/7/65)
  assert.deepEqual(azubiSplit(77), { foot: 16, bike: 4, transit: 19, car: 61 });
  for (const rs of [71, 72, 73, 74, 75, 76, 77]) assert.equal(sum(azubiSplit(rs)), 100);
  // Je weniger Auto im Raumtyp, desto weniger Auto bei den Auszubildenden
  const car = [71, 72, 73, 74].map(rs => azubiSplit(rs).car);
  assert.deepEqual([...car].sort((a, b) => a - b), car);
  assert.equal(splitSuggestion('beruflich', 'metro', 71).factorSource, 'mid2023-tab8');
  assert.equal(splitSuggestion('beruflich', null, null).factorSource, undefined);
  assert.ok(modelSourceIds(tripModel('beruflich', 71)).includes('mid2023-tab8'));
});

test('Berufliche Schule: Auszubildende (MiD 2023 Tab. 38/Abb. 78), anteilige Anwesenheit', () => {
  const m = tripModel('beruflich', 71);
  assert.deepEqual(m.split, azubiSplit(71));
  assert.equal(m.splitSource, 'mid2023-abb78');
  // Tab. 38: Männer 18,1 km, Frauen 12,2 km
  assert.ok(Math.abs(m.meanKm - 15.15) < 1e-9);
  assert.equal(m.meanSource, 'mid2023-tab38');
  assert.ok(Math.abs(meanOver(m) - 15.15) < 1e-9);
  // Fuß und Rad nicht länger als bei 11- bis 17-Jährigen; lange Wege tragen ÖPNV und Auto
  assert.equal(m.modes.foot.meanKm, MID2023_ABB100_KM['11-17'].foot);
  assert.ok(m.modes.car.meanKm > 15);
  // Der Radius kappt: das 90-%-Quantil liegt weit über der Obergrenze
  assert.equal(m.radiusM, RADIUS_MAX_M);
  assert.ok(m.radiusCapped && m.radiusQuantileM > RADIUS_MAX_M);
  // Weglänge bundesweit, unabhängig vom Raumtyp
  assert.equal(tripModel('beruflich', 77).meanKm, m.meanKm);
  // Destatis 2024/25: 62,5 % in Teilzeit an 2 von 5 Tagen, Vollzeit täglich → 62 %
  assert.equal(Math.round(m.presence * 100), 62);
  assert.equal(m.presence, presenceShare('beruflich'));
  assert.ok(SOURCES[m.presenceSource], 'Quelle der Anwesenheit');
  assert.equal(presenceShare('grundschule'), 1);
  assert.equal(tripModel('grundschule', 71).radiusCapped, false);
});

test('Jeder verwendete Wert hat eine Quelle', () => {
  for (const type of ['kindergarten', 'grundschule', 'weiterfuehrend', 'beruflich', 'schule']) {
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
