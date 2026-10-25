// ==== Schülerzahlen je Schule: amtliche Daten den OSM-Schulen zuordnen ====
//
// Datengrundlage: data/schuelerzahlen/<LAND>.json (erzeugt von
// preprocessing/schuelerzahlen/build_schuelerzahlen.py): je amtlicher Schule
// Kennung, Name, Lage, Schulart, Schülerzahl mit Schuljahr und Quelle sowie
// die OSM-Objekte, die osm-schulabgleich ihr zugeordnet hat.
//
// Zuordnung je OSM-Einrichtung (ohne Kitas — für die gibt es keine Daten):
// 1. über die OSM-ID (Abgleich aus osm-schulabgleich)
// 2. sonst räumlich: amtliche Schule im Umkreis von 150 m — eindeutig, oder
//    bei mehreren nur die mit gleichem Namen; nächste zuerst
// Jede amtliche Schule wird höchstens einer Einrichtung zugeordnet, damit
// Schüler:innen nicht doppelt zählen (z. B. Knoten und Gebäude derselben Schule).
import { presenceShare } from './school-trips.js';

/** Ländercode aus den ersten zwei Stellen des Amtlichen Gemeindeschlüssels. */
export const AGS_LAND = {
  '01': 'SH', '02': 'HH', '03': 'NI', '04': 'HB', '05': 'NW', '06': 'HE', '07': 'RP', '08': 'BW',
  '09': 'BY', '10': 'SL', '11': 'BE', '12': 'BB', '13': 'MV', '14': 'SN', '15': 'ST', '16': 'TH'
};

/** Wie osm-schulabgleich: Abstand OSM-Objekt ↔ amtlicher Punkt. */
export const MATCH_RADIUS_M = 150;

export function landFromAgs(ags) {
  if (ags == null || ags === '') return null;
  const s = String(ags).trim().padStart(8, '0');
  return AGS_LAND[s.slice(0, 2)] || null;
}

/**
 * OSM-Referenz ('node/1', 'way/2', 'relation/3') aus den Attributen der
 * Schul-Kacheln (GDAL-OSM-Treiber: Punkte tragen osm_id = Knoten; Flächen
 * osm_way_id = Weg bzw. osm_id = Relation).
 * @param {Object} props - Feature-Attribute
 * @param {number} geomType - MVT-Geometrietyp (1 = Punkt, 3 = Fläche)
 */
export function osmRefFromProperties(props, geomType) {
  const id = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null;
  };
  const way = id(props && props.osm_way_id);
  if (way) return `way/${way}`;
  const osmId = id(props && props.osm_id);
  if (!osmId) return null;
  return geomType === 1 ? `node/${osmId}` : `relation/${osmId}`;
}

/** Namen vergleichbar machen: klein, Umlaute aufgelöst, ohne Klammerzusätze und Satzzeichen. */
export function normalizeSchoolName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function namesMatch(a, b) {
  const x = normalizeSchoolName(a);
  const y = normalizeSchoolName(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

function distanceM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PRIMARY = /grundschule|grund-|primarschule|primarstufe/;
const SECONDARY = /gymnasium|sekundarschule|oberschule|gesamtschule|realschule|hauptschule|mittelschule|stadtteilschule|regionale schule|regelschule|werkrealschule|sekundarstufe/;

/**
 * Amtliche Schulart → Einrichtungstyp der Gebietsanalyse (oder null, wenn
 * nicht eindeutig — dann bleibt die Einordnung aus den OSM-Attributen).
 * Mehrere Schularten (Hamburg: „Berufsfachschule|Berufsschule|…“) zählen als
 * berufliche Schule nur, wenn keine allgemeinbildende Schulart dabei ist.
 */
export function officialTypeToFacilityType(schoolType) {
  const parts = String(schoolType || '').toLowerCase().split(/[|;]/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const general = parts.filter(p => !isVocationalPart(p));
  const any = (re) => general.some(p => re.test(p));
  if (any(/gemeinschaftsschule/)) return 'schule'; // Klassen 1–10/13
  const primary = any(PRIMARY);
  const secondary = any(SECONDARY);
  if (primary && secondary) return 'schule';
  if (primary) return 'grundschule';
  if (secondary) return 'weiterfuehrend';
  if (general.length < parts.length) return 'beruflich';
  return null;
}

// Berufliche Schulen (OSZ, Berufsschule, Fachschule, Berufskolleg …): eigener
// Einrichtungstyp — Schüler:innen meist volljährig, in der dualen Ausbildung nur
// an einzelnen Tagen in der Schule (siehe PRESENCE in school-trips.js).
const VOCATIONAL = /oberstufenzentrum|\bosz\b|berufsschul|beruflich|berufsfachschul|fachoberschul|fachschul|berufskolleg|berufsbildend|berufsoberschul/;
// Berufliche Bildungsgänge an allgemeinbildenden Schulen (Hamburg „Berufsfachschule
// (allg. bild.)“, Berlin „Förderschwerp. einschl. beruflichem Teil“)
const AT_GENERAL_SCHOOL = /allg\.\s*bild|allgemein\s*bild|einschl\.\s*beruflichem teil/;

function isVocationalPart(text) {
  return VOCATIONAL.test(text) && !AT_GENERAL_SCHOOL.test(text);
}

/** Berufliche Schule laut amtlicher Schulart oder Name? */
export function isVocationalSchool(...texts) {
  return texts.some(t => VOCATIONAL.test(String(t || '').toLowerCase()));
}

/**
 * Übernimmt die zugeordnete amtliche Schule: Schulart, wenn sie eindeutig ist
 * (ohne Schulart: berufliche Schule am Namen erkannt), und die Schülerzahl als
 * Wege — eine Schülerin = ein Hinweg je Schultag, bei beruflichen Schulen
 * anteilig nach Anwesenheit.
 * @param {Object} facility - Einrichtung (wird geändert)
 * @param {{school: Object, mode: string, distanceM: number}} match - aus matchFacilities
 * @returns {boolean} true, wenn eine amtliche Schülerzahl vorlag
 */
export function applyOfficialSchool(facility, match) {
  const s = match && match.school;
  if (!s || !Number.isFinite(s.pupils)) return false;
  const officialType = s.type
    ? officialTypeToFacilityType(s.type)
    : (isVocationalSchool(s.name) ? 'beruflich' : null);
  if (officialType && officialType !== facility.type) {
    facility.osmType = facility.type;
    facility.type = officialType;
  }
  const pupils = Math.max(0, Math.round(s.pupils));
  const presence = presenceShare(facility.type);
  facility.trips = Math.round(pupils * presence);
  facility.tripsSource = {
    kind: 'official',
    source: s.src || null,
    year: s.year || null,
    officialId: s.id,
    officialName: s.name,
    officialType: s.type || null,
    pupils,
    presence,
    match: match.mode,
    distanceM: match.distanceM
  };
  return true;
}

/**
 * Ordnet Einrichtungen amtliche Schulen zu.
 * @param {Array<{lat, lon, name, type, osmRefs?: string[]}>} facilities
 * @param {Array<{id, name, lat, lon, pupils, osm?: string[]}>} schools
 * @returns {Array<null|{school: Object, mode: 'osm'|'distance', distanceM: number}>} je Einrichtung
 */
export function matchFacilities(facilities, schools) {
  const results = facilities.map(() => null);
  if (!schools || schools.length === 0) return results;
  const eligible = (f) => f.type !== 'kindergarten';
  const claimed = new Set();

  // 1. OSM-ID aus osm-schulabgleich
  const byOsm = new Map();
  for (const s of schools) for (const ref of s.osm || []) byOsm.set(ref, s);
  facilities.forEach((f, i) => {
    if (!eligible(f)) return;
    for (const ref of f.osmRefs || []) {
      const s = byOsm.get(ref);
      if (s && !claimed.has(s.id)) {
        claimed.add(s.id);
        results[i] = { school: s, mode: 'osm', distanceM: Math.round(distanceM(f.lat, f.lon, s.lat, s.lon)) };
        return;
      }
    }
  });

  // 2. Räumlich, nächste Paare zuerst
  const pairs = [];
  facilities.forEach((f, i) => {
    if (results[i] || !eligible(f)) return;
    const near = schools
      .filter(s => !claimed.has(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map(s => ({ s, d: distanceM(f.lat, f.lon, s.lat, s.lon) }))
      .filter(c => c.d <= MATCH_RADIUS_M);
    const candidates = near.length === 1 ? near : near.filter(c => namesMatch(f.name, c.s.name));
    for (const c of candidates) pairs.push({ i, s: c.s, d: c.d });
  });
  pairs.sort((a, b) => a.d - b.d);
  for (const p of pairs) {
    if (results[p.i] || claimed.has(p.s.id)) continue;
    claimed.add(p.s.id);
    results[p.i] = { school: p.s, mode: 'distance', distanceM: Math.round(p.d) };
  }
  return results;
}
