// ==== SchoolStats-Service: Schülerzahlen je Schule laden ====
//
// Lädt data/schuelerzahlen/index.json und die Dateien der Länder, in denen
// der gezeichnete Bereich liegt (erzeugt von
// preprocessing/schuelerzahlen/build_schuelerzahlen.py). Fehlt eine Datei,
// bleibt es bei den Platzhaltern — die Analyse funktioniert auch ohne.
import { CONFIG } from '../core/config.js';
import { Utils } from '../core/utils.js';

// index.json führt die Länder, deren Daten veröffentlicht werden dürfen (im
// Repo, auch auf GitHub Pages). index.local.json führt zusätzlich die nur
// lokal erzeugten (<LAND>.local.json, z. B. Bayern) — nur beim Entwickeln.
const INDEX_FILES = import.meta.env?.DEV ? ['index.local.json', 'index.json'] : ['index.json'];

const cache = new Map();

function resolveUrl(file) {
  const base = (CONFIG.SCHOOL_STATS_BASE_URL || '').trim();
  if (!base) return null;
  return new URL(file, new URL(base.endsWith('/') ? base : `${base}/`, window.location.href)).href;
}

async function fetchJson(file) {
  const url = resolveUrl(file);
  if (!url) return null;
  if (!cache.has(url)) {
    cache.set(url, fetch(url)
      // Der Vite-Dev-Server antwortet auf fehlende Dateien mit index.html
      .then(r => (r.ok && !(r.headers.get('content-type') || '').includes('text/html') ? r.json() : null))
      .catch(err => {
        Utils.logError('SchoolStatsService', err);
        return null;
      }));
  }
  return cache.get(url);
}

export const SchoolStatsService = {
  /**
   * Amtliche Schulen (mit Schülerzahl) der angegebenen Länder.
   * @param {string[]} lands - Ländercodes, z. B. ['BE', 'BB']
   * @returns {Promise<{schools: Array, sources: Object, lands: Object}>}
   */
  async loadLands(lands) {
    const empty = { schools: [], sources: {}, lands: {} };
    if (!lands || lands.length === 0) return empty;
    let index = null;
    for (const file of INDEX_FILES) {
      index = await fetchJson(file);
      if (index && index.laender) break;
    }
    if (!index || !index.laender) return empty;
    const available = lands.filter(l => index.laender[l]);
    const files = await Promise.all(available.map(l => fetchJson(index.laender[l].file || `${l}.json`)));
    const out = { schools: [], sources: { ...(index.sources || {}) }, lands: {} };
    files.forEach((data, i) => {
      if (!data || !Array.isArray(data.schools)) return;
      out.schools.push(...data.schools);
      Object.assign(out.sources, data.sources || {});
      out.lands[available[i]] = { generated: data.generated || null, schools: data.schools.length };
    });
    return out;
  }
};
