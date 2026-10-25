// Schülerzahlen: OSM-Referenzen, Schulart, Zuordnung ohne Doppelzählung
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyOfficialSchool, isVocationalSchool, landFromAgs, matchFacilities, namesSimilar,
  normalizeSchoolName, officialTypeToFacilityType, osmRefFromProperties
} from '../src/domain/school-stats.js';
import { presenceShare } from '../src/domain/school-trips.js';

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
  assert.equal(officialTypeToFacilityType('Förderschwerp. "Lernen"'), null);
});

test('officialTypeToFacilityType: berufliche Schulen, auch mit beruflichem Gymnasium', () => {
  for (const t of ['Berufsschule', 'Oberstufenzentrum', 'Fachoberschule', 'Berufsoberschule',
    'OSZ mit beruflichem Gymnasium', 'Berufsschule mit sonderpäd. Aufgaben',
    'Berufliche Gymnasien|Berufsfachschule|Berufsschule|Berufsvorbereitungsschule']) {
    assert.equal(officialTypeToFacilityType(t), 'beruflich', t);
  }
});

test('officialTypeToFacilityType: berufliche Bildungsgänge an allgemeinbildenden Schulen', () => {
  // Hamburg: Sonderschule mit Grund- und Stadtteilschule und angeschlossener Berufsfachschule
  assert.equal(officialTypeToFacilityType(
    'Berufsfachschule (allg. bild.)|Berufsvorbereitungsschule (allg. bild.)|Grundschule|Sonderschule|Stadtteilschule|Vorschulklasse'
  ), 'schule');
  assert.equal(officialTypeToFacilityType('Förderschwerp. einschl. beruflichem Teil'), null);
  assert.equal(officialTypeToFacilityType('Kombinierte allg./berufl. Schule'), null);
});

test('officialTypeToFacilityType: Bayern (Plural) und NRW', () => {
  assert.equal(officialTypeToFacilityType('Gymnasien'), 'weiterfuehrend');
  assert.equal(officialTypeToFacilityType('Realschulen'), 'weiterfuehrend');
  assert.equal(officialTypeToFacilityType('Mittelschulen'), 'weiterfuehrend');
  assert.equal(officialTypeToFacilityType('Wirtschaftsschulen'), 'weiterfuehrend'); // Klassen 6–10
  assert.equal(officialTypeToFacilityType('Realschulen zur sonderpädog. Förderung'), 'weiterfuehrend');
  assert.equal(officialTypeToFacilityType('Grundschulen'), 'grundschule');
  // Bayerns Sammelkategorie: der Name entscheidet, sonst „Schule“
  const byVolks = 'Grund- u. Mittel-/Hauptschulen';
  assert.equal(officialTypeToFacilityType(byVolks), 'schule');
  assert.equal(officialTypeToFacilityType(byVolks, 'Grundschule Tüßling'), 'grundschule');
  assert.equal(officialTypeToFacilityType(byVolks, 'Mittelschule Ebersberg'), 'weiterfuehrend');
  assert.equal(officialTypeToFacilityType(byVolks, 'Private Montessori-Volksschule Neu-Ulm (Grundschule und Hauptschule)'), 'schule');
  assert.equal(officialTypeToFacilityType(byVolks, 'Sokrates-Schule Priv. Volksschule'), 'schule');
  // echte Kombischulen bleiben kombiniert, auch wenn der Name nur eine Stufe nennt
  assert.equal(officialTypeToFacilityType('Grund- und Oberschule', 'Oberschule Beispielstadt'), 'schule');
  assert.equal(officialTypeToFacilityType('Förderzentren'), null);
  assert.equal(officialTypeToFacilityType('Freie Waldorfschulen'), 'schule');
  assert.equal(officialTypeToFacilityType('Primus (Schulversuch)'), 'schule');
  assert.equal(officialTypeToFacilityType('Volksschule'), 'schule');
  assert.equal(officialTypeToFacilityType('Förderschule im Bereich des Gymnasiums'), 'weiterfuehrend');
});

test('officialTypeToFacilityType: berufliche Schulen in Bayern und NRW', () => {
  for (const t of ['Berufskolleg', 'Förderschule im Bereich des Berufskollegs', 'Berufsschulen',
    'Berufsfachschulen des Gesundheitswesens', 'BFS hausw., gastgew. und soziale Berufe',
    'Berufsfachs. f. Hauswirtschaft u. Sozialberufe', 'Gewerbliche Fachschulen', 'Fachakademien',
    'Berufliche Oberschulen (FOS und BOS)', 'Teilzeit-Klassen an FOS/BOS', 'Fachoberschulen',
    'Berufsoberschulen', 'Berufliches Gymnasium']) {
    assert.equal(officialTypeToFacilityType(t), 'beruflich', t);
  }
});

test('officialTypeToFacilityType: Zweiter Bildungsweg behält die OSM-Einordnung', () => {
  for (const t of ['Abendgymnasium', 'Abendgymnasien', 'Abendrealschulen', 'Kollegs', 'Studienkollegs',
    'Weiterbildungskolleg', 'ZBW an VHS und anderen Schulformen']) {
    assert.equal(officialTypeToFacilityType(t), null, t);
  }
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

test('matchFacilities: abweichende Namen bei mehreren Schulen am selben Punkt (Bayern)', () => {
  // München, Herrnstraße 21: Schulsuche und OSM benennen die Schulen verschieden
  const at = (id, name, type) => ({ id, name, type, lat: 48.13671, lon: 11.58147, pupils: 100, osm: [] });
  const schools = [
    at('BY-2192', 'Grundschule München Herrnstraße 21', 'Grund- u. Mittel-/Hauptschulen'),
    at('BY-1995', 'Sonderpädagogisches Förderzentrum München Mitte 2 An der Isar', 'Förderzentren')
  ];
  const facilities = [
    { name: 'Förderschule an der Herrnstraße', type: 'schule', lat: 48.13675, lon: 11.5815, osmRefs: [] },
    { name: 'Grundschule an der Herrnstraße', type: 'grundschule', lat: 48.13668, lon: 11.5814, osmRefs: [] },
    { name: 'Schulverbund München', type: 'schule', lat: 48.1367, lon: 11.5815, osmRefs: [] }
  ];
  const res = matchFacilities(facilities, schools);
  assert.equal(res[0].school.id, 'BY-1995'); // einzige Förderschule in Reichweite
  assert.equal(res[1].school.id, 'BY-2192'); // „Herrnstraße“ hat nur sie
  assert.equal(res[2], null); // „München“ haben alle — kein Unterscheidungsmerkmal
});

test('namesSimilar: Schularten dürfen sich nicht widersprechen', () => {
  assert.equal(namesSimilar('Förderschule an der Herrnstraße', 'Grundschule München Herrnstraße 21', []), false);
  assert.equal(namesSimilar('Goethe-Gymnasium', 'Goethe-Grundschule', []), false);
  assert.equal(namesSimilar('Goethe-Schule', 'Goethe-Gymnasium Musterstadt', ['Schiller-Grundschule']), true);
  assert.equal(namesSimilar('Gymnasium Nord', 'Gymnasium Süd', ['Gymnasium Mitte']), false);
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

test('applyOfficialSchool: berufliche Schule mit dem anwesenden Anteil der Schüler:innen', () => {
  const f = { name: 'OSZ Gesundheit I', type: 'weiterfuehrend', trips: 500, tripsSource: { kind: 'placeholder' } };
  applyOfficialSchool(f, {
    school: { id: 'BE-01B04', name: 'OSZ Gesundheit I', type: 'Oberstufenzentrum', pupils: 2902, year: '2024/25', src: 'be-svz' },
    mode: 'osm', distanceM: 12
  });
  const presence = presenceShare('beruflich');
  assert.ok(presence > 0 && presence < 1, 'Teilzeit-Berufsschüler:innen sind nicht jeden Tag da');
  assert.equal(f.type, 'beruflich');
  assert.equal(f.osmType, 'weiterfuehrend');
  assert.equal(f.trips, Math.round(2902 * presence));
  assert.equal(f.tripsSource.kind, 'official');
  assert.equal(f.tripsSource.pupils, 2902); // amtliche Zahl bleibt für den Hinweis erhalten
  assert.equal(f.tripsSource.presence, presence);
});

test('applyOfficialSchool: ohne amtliche Schulart zählt der Name', () => {
  const f = { name: 'Schule', type: 'schule', trips: 200, tripsSource: { kind: 'placeholder' } };
  applyOfficialSchool(f, { school: { id: 'X-1', name: 'Oberstufenzentrum Havelland', pupils: 2069 }, mode: 'distance', distanceM: 30 });
  assert.equal(f.type, 'beruflich');
  // Schulart vorhanden, aber nicht beruflich: der Name entscheidet nicht
  const g = { name: 'Schule', type: 'schule', trips: 200, tripsSource: { kind: 'placeholder' } };
  applyOfficialSchool(g, {
    school: { id: 'X-2', name: 'J.-A.-Zeune-Schule für Blinde und Berufsfachschule Dr. Silex', type: 'Förderschwerp. einschl. beruflichem Teil', pupils: 114 },
    mode: 'distance', distanceM: 30
  });
  assert.equal(g.type, 'schule');
  assert.equal(g.trips, 114);
});
