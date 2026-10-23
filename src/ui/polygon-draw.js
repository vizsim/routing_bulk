// ==== Polygon-Draw: Bereich auf der Karte zeichnen (Gebietsanalyse) ====
//
// Bewusst ohne Zusatzbibliothek: Klick setzt einen Punkt, Doppelklick oder
// Enter schließt das Polygon (ab 3 Punkten), Esc bricht ab, Rücktaste nimmt den
// letzten Punkt zurück. Dieselben Schritte bietet die Zeichenleiste
// (src/ui/draw-bar.js) als Knöpfe an — am Handy gibt es weder Doppelklick noch
// Tastatur. Vorschau über eine eigene GeoJSON-Source.
import { State } from '../core/state.js';

const SOURCE = 'analysis-polygon';

export const PolygonDraw = {
  _active: false,
  _points: [], // [[lat, lng], ...]
  _handlers: null,
  _polygon: null, // fertiges Polygon (bleibt nach dem Zeichnen sichtbar)

  _ensureLayers(map) {
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'analysis-polygon-fill',
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.08 }
    });
    map.addLayer({
      id: 'analysis-polygon-line',
      type: 'line',
      source: SOURCE,
      paint: { 'line-color': '#d97706', 'line-width': 2, 'line-dasharray': [2, 1.5] }
    });
    map.addLayer({
      id: 'analysis-polygon-points',
      type: 'circle',
      source: SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 4,
        'circle-color': '#fff',
        'circle-stroke-color': '#d97706',
        'circle-stroke-width': 2
      }
    });
  },

  _refresh(map) {
    const src = map.getSource(SOURCE);
    if (!src) return;
    const features = [];
    const pts = this._polygon || this._points;
    if (pts.length >= 2) {
      const ring = pts.map(p => [p[1], p[0]]);
      if (this._polygon) {
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } });
      } else {
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } });
      }
    }
    if (!this._polygon) {
      for (const p of this._points) {
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p[1], p[0]] } });
      }
    }
    src.setData({ type: 'FeatureCollection', features });
  },

  /**
   * Startet den Zeichenmodus.
   * @param {Object} callbacks - { onFinish(polygon), onCancel(), onChange(nPoints) }
   */
  start(callbacks = {}) {
    const map = State.getMap();
    if (!map || this._active) return;
    this._ensureLayers(map);
    this._active = true;
    this._points = [];
    this._polygon = null;
    this._refresh(map);

    map.getCanvas().style.cursor = 'crosshair';
    map.doubleClickZoom.disable();

    const finish = () => {
      if (this._points.length < 3) return;
      this._polygon = [...this._points];
      this._points = [];
      cleanup();
      this._refresh(map);
      if (callbacks.onFinish) callbacks.onFinish(this._polygon);
    };
    const cancel = () => {
      cleanup();
      this._polygon = null;
      this._points = [];
      this._refresh(map);
      if (callbacks.onCancel) callbacks.onCancel();
    };
    const changed = () => {
      this._refresh(map);
      if (callbacks.onChange) callbacks.onChange(this._points.length);
    };
    const onClick = (e) => {
      this._points.push([e.lngLat.lat, e.lngLat.lng]);
      changed();
    };
    const undo = () => {
      if (this._points.length === 0) return;
      this._points.pop();
      changed();
    };
    const onDblClick = (e) => {
      e.preventDefault();
      finish();
    };
    const onKey = (e) => {
      // Tippen im Suchfeld o. Ä. ist kein Zeichenbefehl
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Enter') finish();
      else if (e.key === 'Escape') cancel();
      else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    };
    const cleanup = () => {
      this._active = false;
      map.getCanvas().style.cursor = '';
      map.doubleClickZoom.enable();
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      document.removeEventListener('keydown', onKey);
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    document.addEventListener('keydown', onKey);
    this._handlers = { cancel, finish, undo };
    if (callbacks.onChange) callbacks.onChange(0);
  },

  /** Letzten Punkt zurücknehmen (Zeichenleiste). */
  undo() {
    if (this._active) this._handlers?.undo();
  },

  /** Polygon schließen, sofern ≥ 3 Punkte (Zeichenleiste). */
  finish() {
    if (this._active) this._handlers?.finish();
  },

  /** Zeichnen abbrechen (Zeichenleiste). */
  cancel() {
    if (this._active) this._handlers?.cancel();
  },

  pointCount() {
    return this._points.length;
  },

  isActive() {
    return this._active;
  },

  getPolygon() {
    return this._polygon;
  },

  /** Entfernt Zeichnung und Polygon von der Karte. */
  clear() {
    if (this._active && this._handlers) this._handlers.cancel();
    this._polygon = null;
    this._points = [];
    const map = State.getMap();
    if (map) this._refresh(map);
  }
};
