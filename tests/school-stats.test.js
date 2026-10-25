// Schülerzahlen: OSM-Referenzen, Schulart, Zuordnung ohne Doppelzählung
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  landFromAgs, matchFacilities, normalizeSchoolName, officialTypeToFacilityType, osmRefFromProperties
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
