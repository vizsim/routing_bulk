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

// Lockerer Namensvergleich für mehrere amtliche Schulen in Reichweite: Bayerns
// Schulsuche schreibt „Grundschule München Herrnstraße 21“, OSM „Grundschule an
// der Herrnstraße“. Es zählt ein gemeinsames Wort, das kein anderer Kandidat hat,
// oder eine Schulart, die nur dieser Kandidat hat; widersprechen sich die
// Schularten (Grundschule ↔ Förderschule), nie.
const NAME_STOPWORDS = new Set(['an', 'am', 'auf', 'der', 'die', 'das', 'dem', 'den', 'des', 'im', 'in', 'und',
  'zu', 'zum', 'zur', 'von', 'vom', 'fuer', 'bei', 'mit', 'schule', 'schulen', 'staatliche', 'staatl',
  'staedtische', 'staedt', 'private', 'priv', 'privat', 'ev', 'evang', 'kath']);
const NAME_TYPE_GROUPS = {
  grund: /grundschul/,
  mittel: /mittelschul|hauptschul|werkrealschul/,
  real: /realschul/,
  gymnasium: /gymnasi/,
  foerder: /foerder|sonderpaed|sonderschul/,
  beruf: /beruf|fachober|fachschul|fachakademie|oberstufenzentrum|\bosz\b/,
  gesamt: /gesamtschul|gemeinschaftsschul|sekundarschul|stadtteilschul/
};

function nameTokens(name) {
  return normalizeSchoolName(name).split(' ')
    .filter(t => t.length >= 3 && !NAME_STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function nameTypeGroups(name) {
  const n = normalizeSchoolName(name);
  return new Set(Object.keys(NAME_TYPE_GROUPS).filter(g => NAME_TYPE_GROUPS[g].test(n)));
}

/** Passt name zu candidate, gemessen an den übrigen Kandidaten in Reichweite? */
export function namesSimilar(name, candidate, otherCandidates = []) {
  const ga = nameTypeGroups(name);
  const gb = nameTypeGroups(candidate);
  if (ga.size && gb.size && ![...ga].some(g => gb.has(g))) return false;
  const otherTokens = new Set(otherCandidates.flatMap(nameTokens));
  const tb = new Set(nameTokens(candidate));
  if (nameTokens(name).some(t => tb.has(t) && !otherTokens.has(t))) return true;
  const otherGroups = new Set(otherCandidates.flatMap(n => [...nameTypeGroups(n)]));
  return [...ga].some(g => gb.has(g) && !otherGroups.has(g));
}

function distanceM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Schularten im Singular und Plural (bayerische Schulsuche: „Gymnasien“, „Realschulen“)
const PRIMARY = /grundschul|grund-|primarschul|primarstufe/;
const SECONDARY = /gymnasi|sekundarschul|oberschul|gesamtschul|realschul|hauptschul|mittelschul|stadtteilschul|regionale schul|regelschul|werkrealschul|wirtschaftsschul|sekundarstufe/;
// Klassen 1–10/13 unter einem Dach (NRW: PRIMUS-Schule, Bayern/NRW: Volksschule)
const ALL_GRADES = /gemeinschaftsschul|primus|volksschul|waldorf/;
// Zweiter Bildungsweg (Abendgymnasium, Kolleg, Weiterbildungskolleg): Erwachsene,
// oft abends — passt weder zum Schulweg-Modell noch zur Berufsschule; OSM-Einordnung bleibt
const ADULT = /abend|kolleg|weiterbildung|zweiter bildungsweg|\bzbw\b/;
// Bayern fasst Grund- und Mittelschulen in einer Kategorie zusammen; dort sagt
// der Name, welche es ist („Grundschule Tüßling“, „Mittelschule Ebersberg“)
const BY_PRIMARY_AND_MIDDLE = /grund- u\. mittel-\/hauptschul/;

/**
 * Amtliche Schulart → Einrichtungstyp der Gebietsanalyse (oder null, wenn
 * nicht eindeutig — dann bleibt die Einordnung aus den OSM-Attributen).
 * Mehrere Schularten (Hamburg: „Berufsfachschule|Berufsschule|…“) zählen als
 * berufliche Schule nur, wenn keine allgemeinbildende Schulart dabei ist.
 * @param {string} schoolType - amtliche Schulart
 * @param {string} [name] - amtlicher Name, nur für Bayerns Sammelkategorie
 */
export function officialTypeToFacilityType(schoolType, name = '') {
  const parts = String(schoolType || '').toLowerCase().split(/[|;]/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const vocational = parts.filter(isVocationalPart);
  const general = parts.filter(p => !isVocationalPart(p) && !ADULT.test(p));
  const any = (re) => general.some(p => re.test(p));
  if (any(ALL_GRADES)) return 'schule';
  const primary = any(PRIMARY);
  const secondary = any(SECONDARY);
  if (primary && secondary && parts.length === 1 && BY_PRIMARY_AND_MIDDLE.test(parts[0])) {
    const n = String(name || '').toLowerCase();
    const isPrimary = PRIMARY.test(n);
    const isSecondary = SECONDARY.test(n);
    if (isPrimary !== isSecondary) return isPrimary ? 'grundschule' : 'weiterfuehrend';
  }
  if (primary && secondary) return 'schule';
  if (primary) return 'grundschule';
  if (secondary) return 'weiterfuehrend';
  if (vocational.length) return 'beruflich';
  return null;
}

// Berufliche Schulen (OSZ, Berufsschule, Fachschule, Berufskolleg …): eigener
// Einrichtungstyp — Schüler:innen meist volljährig, in der dualen Ausbildung nur
// an einzelnen Tagen in der Schule (siehe PRESENCE in school-trips.js). Bayern
// kürzt ab („BFS … soziale Berufe“, „Teilzeit-Klassen an FOS/BOS“).
const VOCATIONAL = new RegExp([
  'oberstufenzentrum', '\\bosz\\b', 'berufsschul', 'beruflich', 'berufsfachs', '\\bbfs\\b', 'fachoberschul',
  '\\bfos\\b', '\\bbos\\b', 'fachschul', 'fachakademie', 'berufskolleg', 'berufsbildend', 'berufsoberschul', 'berufe\\b'
].join('|'));
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
    ? officialTypeToFacilityType(s.type, s.name)
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

  // 2. Räumlich: ein Kandidat im Umkreis, sonst gleicher Name, sonst ähnlicher
  //    Name (namesSimilar); sichere Paare zuerst, dann die nächsten
  const pairs = [];
  facilities.forEach((f, i) => {
    if (results[i] || !eligible(f)) return;
    const near = schools
      .filter(s => !claimed.has(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map(s => ({ s, d: distanceM(f.lat, f.lon, s.lat, s.lon) }))
      .filter(c => c.d <= MATCH_RADIUS_M);
    if (near.length === 1) {
      pairs.push({ i, s: near[0].s, d: near[0].d, rank: 0 });
      return;
    }
    for (const c of near) {
      if (namesMatch(f.name, c.s.name)) {
        pairs.push({ i, s: c.s, d: c.d, rank: 0 });
      } else if (namesSimilar(f.name, c.s.name, near.filter(o => o !== c).map(o => o.s.name))) {
        pairs.push({ i, s: c.s, d: c.d, rank: 1 });
      }
    }
  });
  pairs.sort((a, b) => a.rank - b.rank || a.d - b.d);
  for (const p of pairs) {
    if (results[p.i] || claimed.has(p.s.id)) continue;
    claimed.add(p.s.id);
    results[p.i] = { school: p.s, mode: 'distance', distanceM: Math.round(p.d) };
  }
  return results;
}
