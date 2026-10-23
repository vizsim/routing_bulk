// ==== Querungen: gequerte Straße und Querungsart aus den Unfallkarten-Kacheln ====
//
// Logik in domain/crossing-roads.js; hier nur das Laden: die z14-Kacheln der
// Unfallkarte rund um die Querungen — Tempolimits (Haupt- und Nebenstraßen,
// CONFIG.MAXSPEED_*_PMTILES_URL) und Überwege (CONFIG.CROSSINGS_PMTILES_URL, für
// crossing=* am Weg) —, jede Kachel einmal je Sitzung. Dekodiert mit dem MVT-Leser
// des PopulationService.
import { PMTiles } from 'pmtiles';
import { CONFIG } from '../core/config.js';
import { assignCrossingRoads, crossingSegments } from '../domain/crossing-roads.js';
import { PopulationService } from './population-service.js';

const Z = 14; // höchster Zoom der Kacheln: Nebenstraßen gibt es nur in 13–14
const _pmtiles = new Map(); // URL -> PMTiles
const _tiles = new Map(); // "URL|x|y" -> Promise<Array<{line, props}>>

function tileOf(lat, lon) {
  const n = 2 ** Z;
  const latRad = (lat * Math.PI) / 180;
  return [
    Math.floor(((lon + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  ];
}

/** Kachelpixel → [lat, lon] */
function tileToLatLon(px, py, x, y, extent) {
  const n = 2 ** Z;
  const lon = ((x + px / extent) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) * 180) / Math.PI;
  return [lat, lon];
}

/** Linien (mit Properties) einer Kachel; Fehler → keine Linien. */
function linesInTile(url, sourceLayer, x, y) {
  const key = `${url}|${x}|${y}`;
  if (!_tiles.has(key)) {
    _tiles.set(key, (async () => {
      try {
        if (!_pmtiles.has(url)) _pmtiles.set(url, new PMTiles(url));
        const resp = await _pmtiles.get(url).getZxy(Z, x, y);
        const layer = resp && resp.data ? PopulationService.parseMVT(resp.data)[sourceLayer] : null;
        if (!layer) return [];
        const extent = layer.extent || 4096;
        return layer.features
          .filter(f => f.type === 2) // LineString
          .flatMap(f => f.loadGeometry().map(part => ({
            line: part.map(pt => tileToLatLon(pt.x, pt.y, x, y, extent)),
            props: f.properties
          })));
      } catch (e) {
        console.warn(`[Querungen] Kachel ${Z}/${x}/${y} nicht lesbar:`, e);
        return [];
      }
    })());
  }
  return _tiles.get(key);
}

export const CrossingRoadService = {
  /**
   * Ergänzt die Querungen unter den Segmenten um gequerte Straße und Querungsart
   * (seg.crossingRoad, seg.crossingType).
   * @param {Array} segments - aggregierte Segmente
   * @returns {Promise<boolean>} true, wenn Querungen ergänzt wurden (neu einfärben)
   */
  async annotate(segments) {
    const crossings = crossingSegments(segments);
    const sources = [
      [CONFIG.MAXSPEED_PMTILES_URL, 'highways'],
      [CONFIG.MAXSPEED_MINOR_PMTILES_URL, 'highways_minor']
    ].map(([url, layer]) => [(url || '').trim(), layer]).filter(([url]) => url);
    const crossingsUrl = (CONFIG.CROSSINGS_PMTILES_URL || '').trim();
    if (crossings.length === 0 || (sources.length === 0 && !crossingsUrl)) return false;

    // Kacheln aller Querungs-Enden laden (parallel, je Kachel einmal)
    const wanted = new Map();
    for (const seg of crossings) {
      for (const [lat, lon] of [seg.coords[0], seg.coords[seg.coords.length - 1]]) {
        const [x, y] = tileOf(lat, lon);
        wanted.set(`${x}|${y}`, [x, y]);
      }
    }
    const roadsByTile = new Map();
    const wayTypes = new Map(); // OSM-Weg-ID -> crossing des Überwegs
    await Promise.all([...wanted].map(async ([key, [x, y]]) => {
      const [parts, ways] = await Promise.all([
        Promise.all(sources.map(([url, layer]) => linesInTile(url, layer, x, y))),
        crossingsUrl ? linesInTile(crossingsUrl, 'germany_osm_crossings', x, y) : []
      ]);
      roadsByTile.set(key, parts.flat());
      for (const { props } of ways) {
        if (props.osm_id && props.crossing) wayTypes.set(Number(props.osm_id), props.crossing);
      }
    }));

    const roadsNear = ([lat, lon]) => roadsByTile.get(tileOf(lat, lon).join('|')) || [];
    assignCrossingRoads(crossings, roadsNear, (wayId) => wayTypes.get(wayId));
    return true;
  }
};
