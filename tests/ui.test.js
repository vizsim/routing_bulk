// Reine Helfer der Oberfläche: Fußzeilen-Chips, Geocoder-Format, Zeichenleiste
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { statChips } from '../src/ui/mobile-layout.js';
import { hintText } from '../src/ui/draw-bar.js';
import { formatPhotonFeature } from '../src/utils/geocoder.js';

const text = (chip) => chip.parts.map(p => p.text).join('');

test('statChips: Profil sowie Routen und Radius in deutscher Schreibweise', () => {
  const chips = statChips({ analysis: false, profile: 'bike', n: 1200, radiusM: 1500 });
  assert.equal(chips.length, 2);
  assert.equal(text(chips[0]), 'Rad');
  assert.equal(chips[0].icon, 'profile');
  assert.equal(text(chips[1]), '1.200 Routen · 1,5 km');
  assert.equal(text(statChips({ analysis: false, profile: 'foot', n: 1, radiusM: 2000 })[1]), '1 Route · 2 km');
});

test('statChips: Gebietsanalyse zeigt nur den Modus', () => {
  const chips = statChips({ analysis: true, profile: 'foot', n: 10, radiusM: 2000 });
  assert.deepEqual(chips.map(text), ['Gebietsanalyse']);
});

test('formatPhotonFeature: Straße vor Hausnummer, Ort mit PLZ', () => {
  const f = formatPhotonFeature({
    geometry: { coordinates: [13.81, 52.83] },
    properties: { street: 'Eisenbahnstraße', housenumber: '12', postcode: '16225', city: 'Eberswalde', state: 'Brandenburg', country: 'Deutschland' }
  });
  assert.equal(f.name, 'Eisenbahnstraße 12');
  assert.equal(f.secondary, '16225 Eberswalde, Brandenburg, Deutschland');
  assert.equal(f.address, 'Eisenbahnstraße 12, 16225 Eberswalde, Brandenburg, Deutschland');
  assert.deepEqual(f.coordinates, [52.83, 13.81]);
});

test('formatPhotonFeature: benannter Ort ohne doppelte Angaben', () => {
  const f = formatPhotonFeature({
    geometry: { coordinates: [13.41, 52.52] },
    properties: { name: 'Alexanderplatz', street: 'Alexanderplatz', postcode: '10178', city: 'Berlin', state: 'Berlin', country: 'Deutschland' }
  });
  assert.equal(f.name, 'Alexanderplatz');
  assert.equal(f.secondary, '10178 Berlin, Deutschland'); // Straße = Name, Land Berlin = Stadt
});

test('formatPhotonFeature: ohne Koordinaten und Eigenschaften', () => {
  const f = formatPhotonFeature({});
  assert.equal(f.name, 'Unbekannter Ort');
  assert.equal(f.coordinates, null);
  assert.equal(f.lat, null);
});

test('hintText: führt bis zum dritten Punkt', () => {
  assert.match(hintText(0), /Punkte in die Karte setzen/);
  assert.match(hintText(1), /1 Punkt<\/strong> — mindestens 3/);
  assert.match(hintText(2), /2 Punkte<\/strong> — mindestens 3/);
  assert.match(hintText(3), /„Fertig“/);
});
