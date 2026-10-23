import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { CONFIG } from '../src/core/config.js';
import { API } from '../src/domain/api.js';

beforeEach(() => {
  API._unsupportedDetails.clear();
  API._verifiedProfiles.clear();
  API._detailGates.clear();
});

test('makeDetailCursor liefert je Kantenstart den passenden Wert (geteilte Grenzpunkte)', () => {
  const details = {
    edge_id: [[0, 3, 10], [3, 5, 11], [5, 9, 12]],
    sidewalk: [[0, 5, 'yes'], [5, 9, 'no']],
    lit: [[0, 9, true]],
    max_speed: [[0, 3, 30], [3, 9, null]]
  };
  const at = API.makeDetailCursor(details);
  assert.deepEqual(at(0), { sidewalk: 'yes', lit: true, max_speed: 30 });
  assert.deepEqual(at(3), { sidewalk: 'yes', lit: true, max_speed: null });
  assert.deepEqual(at(5), { sidewalk: 'no', lit: true, max_speed: null });
});

test('makeDetailCursor überspringt Null-Längen-Intervalle und leere Details', () => {
  const at = API.makeDetailCursor({
    edge_id: [[0, 2, 1], [2, 4, 2]],
    surface: [[0, 0, 'gravel'], [0, 2, 'asphalt'], [2, 4, 'paving_stones']],
    footway: []
  });
  assert.deepEqual(at(0), { surface: 'asphalt' });
  assert.deepEqual(at(2), { surface: 'paving_stones' });
});

test('makeDetailCursor ohne Details liefert leere Objekte', () => {
  const at = API.makeDetailCursor(undefined);
  assert.deepEqual(at(0), {});
});

test('parseUnsupportedDetails liest die GraphHopper-Meldung, edge_id bleibt', () => {
  const msg = JSON.stringify({ message: 'Cannot find the path details: [backward_sidewalk, edge_id, foo]', hints: [] });
  assert.deepEqual(API.parseUnsupportedDetails(msg), ['backward_sidewalk', 'foo']);
  assert.equal(API.parseUnsupportedDetails('{"message":"Cannot find point 0"}'), null);
});

test('detailsForProfile: edge_id zuerst, abgelehnte Details fehlen', () => {
  const foot = API.detailsForProfile('foot');
  assert.equal(foot[0], 'edge_id');
  assert.ok(foot.includes('backward_sidewalk'));
  API._unsupportedDetails.add('backward_sidewalk');
  assert.ok(!API.detailsForProfile('foot').includes('backward_sidewalk'));
  assert.deepEqual(API.detailsForProfile('car'), ['edge_id']);
});

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    return handler(body);
  };
  return calls;
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const bad = (message) => ({ ok: false, status: 400, text: async () => JSON.stringify({ message }) });

test('fetchRoute ohne Server-Patch: eine 400, danach ohne backward_sidewalk', async () => {
  const calls = mockFetch((body) => body.details.includes('backward_sidewalk')
    ? bad('Cannot find the path details: [backward_sidewalk]')
    : ok({ paths: [{ points: { coordinates: [] }, details: {} }] }));

  // fünf parallele Anfragen wie aus dem Concurrency-Pool
  const results = await Promise.all(Array.from({ length: 5 }, () =>
    API.fetchRoute([52.5, 13.4], [52.51, 13.41], undefined, 'foot')));
  assert.equal(results.length, 5);
  const rejected = calls.filter(c => c.details.includes('backward_sidewalk'));
  assert.equal(rejected.length, 1, 'nur die Erstanfrage darf scheitern');
  assert.equal(calls.length, 6);
  assert.ok(API._unsupportedDetails.has('backward_sidewalk'));
  assert.ok(API._verifiedProfiles.has('foot'));
});

test('fetchRoute mit Server-Patch: backward_sidewalk bleibt in jeder Anfrage', async () => {
  const calls = mockFetch(() => ok({ paths: [{ points: { coordinates: [] }, details: {} }] }));
  await Promise.all([1, 2, 3].map(() => API.fetchRoute([52.5, 13.4], [52.51, 13.41], undefined, 'foot')));
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.details.includes('backward_sidewalk')));
});

test('fetchRoute reicht andere Fehler unverändert durch', async () => {
  mockFetch(() => bad('Cannot find point 0: 52.5,13.4'));
  await assert.rejects(() => API.fetchRoute([52.5, 13.4], [52.51, 13.41], undefined, 'bike'), /Route-Fehler 400/);
  assert.ok(!API._verifiedProfiles.has('bike'));
});

test('fetchRoute nutzt CONFIG.INFRA_DETAILS des Profils', async () => {
  const calls = mockFetch(() => ok({ paths: [] }));
  await API.fetchRoute([52.5, 13.4], [52.51, 13.41], undefined, 'bike');
  assert.deepEqual(calls[0].details, ['edge_id', ...CONFIG.INFRA_DETAILS.bike]);
  assert.equal(calls[0].profile, 'bike');
});
