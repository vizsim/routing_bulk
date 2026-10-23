// ==== Kontext-Ebenen aus der Unfallkarte: Unfälle, Querungen, Tempolimits ====
//
// Dieselben PMTiles wie vizsim.de/unfallkarte (Ablage unfallkarte-data-v2), hier
// bewusst zurückhaltend gezeichnet — kleiner, durchscheinender, Details erst beim
// Hineinzoomen: Sie sollen die Routen einordnen, nicht überdecken. Die Farben
// entsprechen der Unfallkarte, damit beide Karten gleich zu lesen sind.
//
// Unfälle und Querungen liegen als kleine Punkte über den Routen, die Tempolimits
// als Unterlage darunter. Ausgeblendete Ebenen laden keine Kacheln.
import { CONFIG } from '../core/config.js';

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL)';
const ACCIDENT_ATTRIBUTION = '<a href="https://unfallatlas.statistikportal.de/" target="_blank" rel="noopener">Unfallatlas</a> der Statistischen Ämter (dl-de/by-2-0)';

// ---- Unfälle: Einzelunfälle des Unfallatlas (MLT-Kacheln, Zoom 11–13) ----

// Unfallkategorie = schwerste Unfallfolge
const SEVERITY = [
  { value: 1, color: '#e41a1c', label: 'mit Getöteten' },
  { value: 2, color: '#377eb8', label: 'mit Schwerverletzten' },
  { value: 3, color: '#4daf4a', label: 'mit Leichtverletzten' }
];
const BIKE_OR_FOOT = ['any', ['==', ['get', 'IstRad'], 1], ['==', ['get', 'IstFuss'], 1]];

// ---- Querungen (OSM: Knoten als Punkte, gemappte Überwege als Linien) ----

const CROSSINGS = [
  { values: ['traffic_signals'], color: '#2ECC40', label: 'Ampel' },
  { values: ['marked', 'uncontrolled', 'zebra'], color: '#FF851B', label: 'Markiert (Zebra, Markierung)' },
  { values: ['unmarked'], color: '#FF4136', label: 'Unmarkiert' }
];
const CROSSING_UNKNOWN = '#9aa0a6';
const crossingColor = ['match', ['get', 'crossing'], ...CROSSINGS.flatMap(c => [c.values, c.color]), CROSSING_UNKNOWN];

// ---- Tempolimits (OSM maxspeed; Hauptstraßen ab Zoom 6, Nebenstraßen ab 13) ----

// Stützstellen wie die Unfallkarte (styleConfig.js, SPEED_COLOR_STOPS). „Keine Angabe“
// hier grau statt pink: als Unterlage soll es nicht leuchten.
const SPEED_STOPS = [[10, '#006400'], [30, '#31a354'], [50, '#fdcc8a'], [100, '#e31a1c'], [140, '#8B0000']];
const SPEED_UNLIMITED = '#000000';
const SPEED_UNKNOWN = '#c4c8cc';
const UNLIMITED = 999;

// Tempo eines Wegs in km/h: maxspeed, sonst ein Richtungswert; ohne Zahl helfen
// maxspeed:type (Zone 30/20, inner-/außerorts) und der verkehrsberuhigte Bereich
// (Schritttempo). 0 = keine Angabe, UNLIMITED = maxspeed=none.
const speedOfWay = ['let', 'raw',
  ['to-string', ['coalesce', ['get', 'maxspeed'], ['get', 'maxspeed_forward'], ['get', 'maxspeed_backward'], '']],
  ['case',
    ['==', ['downcase', ['var', 'raw']], 'none'], UNLIMITED,
    ['>', ['to-number', ['var', 'raw'], 0], 0], ['to-number', ['var', 'raw'], 0],
    ['match', ['get', 'maxspeed_type'],
      'DE:zone30', 30, 'DE:zone20', 20, 'DE:urban', 50, 'DE:rural', 100, 'DE:living_street', 7,
      ['match', ['get', 'highway'], 'living_street', 7, 0]]]];

// Führende Zahl einer zeitweisen Regel wie „30 @ (Mo-Fr 06:00-19:00)“, sonst 0
const conditionalSpeed = ['let', 'c', ['to-string', ['coalesce', ['get', 'maxspeed_conditional'], '']],
  ['to-number', ['slice', ['var', 'c'], 0, ['max', 0, ['index-of', ' @', ['var', 'c']]]], 0]];

const speedColor = (speed) => ['let', 'v', speed,
  ['case',
    ['==', ['var', 'v'], UNLIMITED], SPEED_UNLIMITED,
    ['<=', ['var', 'v'], 0], SPEED_UNKNOWN,
    ['interpolate', ['linear'], ['var', 'v'], ...SPEED_STOPS.flat()]]];

/** Farbe eines Tempos wie MapLibres lineare RGB-Interpolation über SPEED_STOPS (Legende). */
function speedColorOf(v) {
  if (v <= SPEED_STOPS[0][0]) return SPEED_STOPS[0][1];
  if (v >= SPEED_STOPS.at(-1)[0]) return SPEED_STOPS.at(-1)[1];
  const i = SPEED_STOPS.findIndex(([s]) => s >= v);
  const [[s0, c0], [s1, c1]] = [SPEED_STOPS[i - 1], SPEED_STOPS[i]];
  const t = (v - s0) / (s1 - s0);
  const rgb = (c) => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16));
  const [a, b] = [rgb(c0), rgb(c1)];
  return `#${a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

// ---- Schalter, Legenden ----

const LAYERS = {
  accidents: {
    flag: 'ACCIDENTS_LAYER_VISIBLE', urls: ['ACCIDENTS_PMTILES_URL'],
    checkbox: 'config-accidents-visible', legend: 'accidents-legend',
    ids: ['accidents-points']
  },
  crossings: {
    flag: 'CROSSINGS_LAYER_VISIBLE', urls: ['CROSSINGS_PMTILES_URL'],
    checkbox: 'config-crossings-visible', legend: 'crossings-legend',
    ids: ['crossings-lines', 'crossings-points']
  },
  maxspeed: {
    flag: 'MAXSPEED_LAYER_VISIBLE', urls: ['MAXSPEED_PMTILES_URL', 'MAXSPEED_MINOR_PMTILES_URL'],
    checkbox: 'config-maxspeed-visible', legend: 'maxspeed-legend',
    ids: ['maxspeed-major', 'maxspeed-major-conditional', 'maxspeed-minor', 'maxspeed-minor-conditional']
  }
};

const row = (swatch, label) => `<div class="layer-legend-row">${swatch}<span>${label}</span></div>`;
const dot = (color) => `<span class="layer-legend-swatch layer-legend-dot" style="background:${color}"></span>`;
const line = (color) => `<span class="layer-legend-swatch layer-legend-line" style="background:${color}"></span>`;
const hint = (text) => `<p class="config-hint">${text}</p>`;

const LEGENDS = {
  accidents: () => SEVERITY.map(s => row(dot(s.color), `Unfall ${s.label}`)).join('')
    + hint('Unfallatlas der Statistischen Ämter · sichtbar beim Hineinzoomen'),
  crossings: () => [...CROSSINGS.map(c => row(dot(c.color), c.label)), row(dot(CROSSING_UNKNOWN), 'Ohne Angabe')].join('')
    + hint('OpenStreetMap · sichtbar beim Hineinzoomen'),
  maxspeed: () => [
    row(line(speedColorOf(10)), 'Schritttempo bis 20 km/h'),
    ...[30, 50, 70, 100].map(v => row(line(speedColorOf(v)), `${v} km/h`)),
    row(line(SPEED_UNLIMITED), 'unbegrenzt'),
    row(line(SPEED_UNKNOWN), 'keine Angabe'),
    row(`<span class="layer-legend-swatch layer-legend-dashed" style="--c:${speedColorOf(30)}"></span>`,
      'gestrichelt: zeitweise, z. B. Tempo 30 zu Schulzeiten')
  ].join('') + hint('OpenStreetMap · Nebenstraßen erst beim Hineinzoomen')
};

const urlOf = (key) => (CONFIG[key] || '').trim();

export const ContextLayers = {
  _map: null,
  _ready: false,

  /** Schalter und Legenden verdrahten — geht schon vor dem Laden der Karte. */
  initToggles(map) {
    this._map = map;
    for (const [key, def] of Object.entries(LAYERS)) {
      const checkbox = document.getElementById(def.checkbox);
      if (!checkbox) continue;
      if (!def.urls.some(urlOf)) {
        const group = checkbox.closest('.config-group');
        if (group) group.style.display = 'none';
        continue;
      }
      checkbox.checked = !!CONFIG[def.flag];
      this._showLegend(key, checkbox.checked);
      checkbox.addEventListener('change', () => this.setVisible(key, checkbox.checked));
    }
    const bikeFoot = document.getElementById('config-accidents-bike-foot');
    if (bikeFoot) {
      bikeFoot.checked = !!CONFIG.ACCIDENTS_ONLY_BIKE_FOOT;
      bikeFoot.addEventListener('change', () => {
        CONFIG.ACCIDENTS_ONLY_BIKE_FOOT = bikeFoot.checked;
        if (this._ready && this._map.getLayer('accidents-points')) {
          this._map.setFilter('accidents-points', bikeFoot.checked ? BIKE_OR_FOOT : null);
        }
      });
    }
  },

  /**
   * Quellen und Layer anlegen. Erst nach den Routen-Layern aufrufen (MapRenderer,
   * 'load'): die Tempolimits schieben sich darunter, Punkte darüber.
   * @param {string|undefined} labelLayerId - erster Beschriftungs-Layer der Basemap
   */
  addLayers(map, labelLayerId) {
    const vis = (key) => (CONFIG[LAYERS[key].flag] ? 'visible' : 'none');

    // Tempolimits als Unterlage unter allen Routen-Layern. Ohne runde Kappen:
    // halbtransparente Kappen aneinanderstoßender Wege würden doppelt überblendet.
    const below = map.getLayer('agg-lines-glow') ? 'agg-lines-glow' : labelLayerId;
    const nets = [
      { id: 'maxspeed-major', url: urlOf('MAXSPEED_PMTILES_URL'), sourceLayer: 'highways', minzoom: 10,
        width: ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2, 17, 3.5] },
      { id: 'maxspeed-minor', url: urlOf('MAXSPEED_MINOR_PMTILES_URL'), sourceLayer: 'highways_minor', minzoom: 13,
        width: ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 2] }
    ];
    for (const net of nets) {
      if (!net.url) continue;
      map.addSource(net.id, { type: 'vector', url: `pmtiles://${net.url}`, attribution: OSM_ATTRIBUTION });
      const base = { type: 'line', source: net.id, 'source-layer': net.sourceLayer, minzoom: net.minzoom };
      map.addLayer({
        ...base, id: net.id,
        layout: { visibility: vis('maxspeed'), 'line-join': 'round' },
        paint: { 'line-color': speedColor(speedOfWay), 'line-width': net.width, 'line-opacity': 0.6 }
      }, below);
      // Zeitweise Limits (z. B. Tempo 30 zu Schulzeiten) gestrichelt in deren Farbe
      map.addLayer({
        ...base, id: `${net.id}-conditional`,
        filter: ['has', 'maxspeed_conditional'],
        layout: { visibility: vis('maxspeed'), 'line-join': 'round' },
        paint: { 'line-color': speedColor(conditionalSpeed), 'line-width': net.width, 'line-dasharray': [1.5, 1.5] }
      }, below);
    }

    // Querungen und Unfälle über den Routen, unter den Beschriftungen
    const crossingsUrl = urlOf('CROSSINGS_PMTILES_URL');
    if (crossingsUrl) {
      map.addSource('crossings', { type: 'vector', url: `pmtiles://${crossingsUrl}`, attribution: OSM_ATTRIBUTION });
      const base = { source: 'crossings', 'source-layer': 'germany_osm_crossings', minzoom: 13 };
      map.addLayer({
        ...base, id: 'crossings-lines', type: 'line',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { visibility: vis('crossings') },
        paint: { 'line-color': crossingColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 16, 2.5], 'line-opacity': 0.7 }
      }, labelLayerId);
      map.addLayer({
        ...base, id: 'crossings-points', type: 'circle',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { visibility: vis('crossings') },
        paint: {
          'circle-color': crossingColor,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 16, 3, 18, 4.5],
          'circle-opacity': 0.75
        }
      }, labelLayerId);
    }

    const accidentsUrl = urlOf('ACCIDENTS_PMTILES_URL');
    if (accidentsUrl) {
      map.addSource('accidents', {
        type: 'vector', url: `pmtiles://${accidentsUrl}`, encoding: 'mlt', attribution: ACCIDENT_ATTRIBUTION
      });
      // Etwa halb so groß und durchscheinender als in der Unfallkarte, ohne Rand
      map.addLayer({
        id: 'accidents-points', type: 'circle', source: 'accidents', 'source-layer': 'accidents', minzoom: 11,
        ...(CONFIG.ACCIDENTS_ONLY_BIKE_FOOT ? { filter: BIKE_OR_FOOT } : {}),
        layout: { visibility: vis('accidents') },
        paint: {
          'circle-color': ['match', ['get', 'UKATEGORIE'], ...SEVERITY.flatMap(s => [s.value, s.color]), '#aaaaaa'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 13, 2.5, 16, 4, 18, 6],
          'circle-opacity': 0.45
        }
      }, labelLayerId);
    }

    this._map = map;
    this._ready = true;
  },

  setVisible(key, visible) {
    CONFIG[LAYERS[key].flag] = visible;
    this._showLegend(key, visible);
    if (!this._ready) return; // addLayers liest CONFIG beim Anlegen
    for (const id of LAYERS[key].ids) {
      if (this._map.getLayer(id)) this._map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  },

  _showLegend(key, visible) {
    const el = document.getElementById(LAYERS[key].legend);
    if (!el) return;
    if (visible && !el.dataset.filled) {
      (el.querySelector('.layer-legend-items') || el).innerHTML = LEGENDS[key]();
      el.dataset.filled = '1';
    }
    el.style.display = visible ? 'block' : 'none';
  }
};
