// Schülerzahlen: OSM-Referenzen, Schulart, Zuordnung ohne Doppelzählung
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyOfficialSchool, excludeVocational, isVocationalSchool, landFromAgs, matchFacilities,
  normalizeSchoolName, officialTypeToFacilityType, osmRefFromProperties
} from '../src/domain/school-stats.js';

test('landFromAgs: Ländercode aus dem Gemeindeschlüssel, auch ohne führende Null', () => {
  assert.equal(landFromAgs('11000000'), 'BE');
  assert.equal(landFromAgs(1001000), 'SH');
  assert.equal(landFromAgs('12064512'), 'BB');
  assert.equal(landFromAgs(null), null);
});

test('osmRefFromProperties: Punkt = Knoten, Fläche = Weg bzw. Relation', () => {
  assert.equal(osmRefFromProperties({ osm_id: '123' }, 1), 'node/123');
  assert.equal(osmRefFromProperties({ osm_way_id: 456, osm_id: null }, 3), 'way/456');
  assert.equal(osmRefFromProperties({ osm_id: 789 }, 3), 'relation/789');
  assert.equal(osmRefFromProperties({}, 1), null);
});

test('officialTypeToFacilityType: amtliche Schularten', () => {
  assert.equal(officialTypeToFacilityType('Grundschule'), 'grundschule');
  assert.equal(officialTypeToFacilityType('Integrierte Sekundarschule'), 'weiterfuehrend');
  assert.equal(officialTypeToFacilityType('Gymnasium'), 'weiterfuehrend');
  assert.equal(officialTypeToFacilityType('Grund- und Oberschule'), 'schule');
  assert.equal(officialTypeToFacilityType('Gemeinschaftsschule'), 'schule');
  assert.equal(officialTypeToFacilityType('Berufsschule'), null);
});

test('normalizeSchoolName: Klammerzusätze und Umlaute', () => {
  assert.equal(normalizeSchoolName('Hermann-Boddin-Schule (Grundschule)'), 'hermann boddin schule');
  assert.equal(normalizeSchoolName('Schule am Weißensee'), 'schule am weissensee');
});

const school = (id, name, lat, lon, pupils, osm = []) => ({ id, name, lat, lon, pupils, osm, type: 'Grundschule' });

test('matchFacilities: OSM-ID zuerst, dann räumlich; jede Schule nur einmal', () => {
  const schools = [
    school('BE-01G01', 'Grundschule am Arkonaplatz', 52.5370, 13.4010, 426, ['way/1']),
    school('BE-08G07', 'Hermann-Boddin-Schule (Grundschule)', 52.4700, 13.4400, 270),
    school('BE-08G08', 'Karlsgarten-Schule (Grundschule)', 52.4710, 13.4400, 482)
  ];
  const facilities = [
    { name: 'Grundschule am Arkonaplatz', type: 'grundschule', lat: 52.5372, lon: 13.4012, osmRefs: ['node/9', 'way/1'] },
    // zweites OSM-Objekt derselben Schule: keine Doppelzählung
    { name: 'Grundschule am Arkonaplatz', type: 'grundschule', lat: 52.5371, lon: 13.4011, osmRefs: ['node/10'] },
    // zwei amtliche Schulen im Umkreis: nur über den Namen
    { name: 'Hermann-Boddin-Schule', type: 'schule', lat: 52.4705, lon: 13.4400, osmRefs: [] },
    { name: 'Kita Sonnenschein', type: 'kindergarten', lat: 52.4710, lon: 13.4400, osmRefs: [] }
  ];
  const res = matchFacilities(facilities, schools);
  assert.equal(res[0].school.id, 'BE-01G01');
  assert.equal(res[0].mode, 'osm');
  assert.equal(res[1], null);
  assert.equal(res[2].school.id, 'BE-08G07');
  assert.equal(res[2].mode, 'distance');
  assert.equal(res[3], null, 'Kitas bekommen keine Schülerzahl');
});

test('matchFacilities: einziger Kandidat im Umkreis auch ohne Namensgleichheit, weiter weg nicht', () => {
  const schools = [school('BE-02G01', 'Lemgo-Grundschule', 52.5000, 13.4000, 300)];
  const near = [{ name: 'Schule (unbenannt)', type: 'schule', lat: 52.5009, lon: 13.4000, osmRefs: [] }];
  const far = [{ name: 'Lemgo-Grundschule', type: 'grundschule', lat: 52.5020, lon: 13.4000, osmRefs: [] }];
  assert.equal(matchFacilities(near, schools)[0].school.id, 'BE-02G01');
  assert.equal(matchFacilities(far, schools)[0], null);
});

test('isVocationalSchool: berufliche Schulen an Schulart oder Name', () => {
  for (const t of ['Oberstufenzentrum', 'Kombinierte berufliche Schule', 'Berufsschule', 'Berufsfachschule',
    'Fachoberschule', 'Berufskolleg', 'Berufsbildende Schulen II', 'OSZ Banken, Immobilien und Versicherungen']) {
    assert.equal(isVocationalSchool(t), true, t);
  }
  for (const t of ['Grundschule am Arkonaplatz', 'Gymnasium', 'Integrierte Sekundarschule', 'Gemeinschaftsschule', null]) {
    assert.equal(isVocationalSchool(t), false, String(t));
  }
  assert.equal(isVocationalSchool('Schule', 'OSZ Gesundheit I'), true); // Name reicht
});

test('applyOfficialSchool: Schülerzahl und Schulart übernehmen', () => {
  const f = { name: 'Schule Eduardstraße', type: 'schule', trips: 200, tripsSource: { kind: 'placeholder' } };
  const ok = applyOfficialSchool(f, {
    school: { id: 'HH-1', name: 'Schule Eduardstraße', type: 'Grundschule', pupils: 202, year: '2024', src: 'jedeschule-hh' },
    mode: 'distance', distanceM: 40
  });
  assert.equal(ok, true);
  assert.equal(f.type, 'grundschule');
  assert.equal(f.osmType, 'schule');
  assert.equal(f.trips, 202);
  assert.equal(f.tripsSource.kind, 'official');
  assert.equal(f.tripsSource.year, '2024');
});

test('applyOfficialSchool: berufliche Schule bleibt sichtbar, wird aber nicht gerechnet', () => {
  const f = { name: 'OSZ Gesundheit I', type: 'schule', trips: 200, tripsSource: { kind: 'placeholder' } };
  applyOfficialSchool(f, {
    school: { id: 'BE-01B04', name: 'OSZ Gesundheit I', type: 'Oberstufenzentrum', pupils: 2902, year: '2024/25', src: 'be-svz' },
    mode: 'osm', distanceM: 12
  });
  assert.equal(f.trips, 0);
  assert.equal(f.type, 'weiterfuehrend');
  assert.equal(f.tripsSource.kind, 'excluded');
  assert.equal(f.tripsSource.pupils, 2902); // amtliche Zahl bleibt für den Hinweis erhalten
});

test('excludeVocational: auch ohne amtliche Daten (am OSM-Namen erkannt)', () => {
  const f = { name: 'OSZ Banken', type: 'schule', trips: 200, tripsSource: { kind: 'placeholder' } };
  excludeVocational(f);
  assert.deepEqual([f.trips, f.type, f.tripsSource.kind], [0, 'weiterfuehrend', 'excluded']);
});
