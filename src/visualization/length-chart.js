// ==== Längenverteilung der Gebietsanalyse: gestapelte Säulen je Verkehrsmittel ====
//
// Je Längenklasse die Hinwege je Schultag (Summe der Routengewichte), gestapelt
// nach Verkehrsmittel in fester Reihenfolge und Farbe (Fuß, Rad, ÖPNV, Auto).
// Wege über dem 98-%-Quantil landen in einer letzten Klasse „≥ x km“, damit ein
// einzelner langer Weg die vielen kurzen nicht zusammendrückt.
//
// SVG statt Canvas: Jede Säule ist Hover- und Fokus-Ziel mit Tooltip. Türkis und
// Gelb haben auf der hellen Fläche weniger als 3:1 Kontrast — deshalb stehen alle
// Werte auch in Legende (Ø je Verkehrsmittel) und Tabelle, nie nur in der Farbe.
// Farben: style.css (.length-chart, --lc-<modus>).

const SVG_NS = 'http://www.w3.org/2000/svg';
const BIN_WIDTHS_M = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
// fein genug für Fußwege (bei 11 km Spannweite noch 500-m-Klassen)
const MAX_BINS = 24;
const LABEL_MIN_PX = 30;
const OVERFLOW_QUANTILE = 0.98;
const PLOT_HEIGHT = 110;
const PAD = { top: 24, right: 8, bottom: 20, left: 34 };
const GAP = 2; // Flächenfarbe zwischen Segmenten und Säulen
const MAX_BAR = 24;
const RADIUS = 4; // gerundetes Datenende, eckig an der Grundlinie

const de = (v, digits = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const km = (m) => (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const kmMean = (m) => `${de(m / 1000, 1)} km`;
const trips = (v) => (v > 0 && v < 1 ? '< 1' : de(v));

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function html(tag, className = '', text = null, parent = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

/** Schöne Schrittweite (1, 2, 2,5, 5 × 10^k) für etwa `count` Teilstriche bis `max`. */
function niceStep(max, count = 3) {
  const raw = max / count;
  if (!(raw > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/**
 * Wege in Längenklassen einteilen.
 * @param {Array<{mode, weight, routeM, beelineM}>} items - je gerechnete Route
 * @param {'route'|'beeline'} metric
 * @param {string[]} modeKeys - Reihenfolge der Verkehrsmittel
 * @returns {null|{bins, binM, rangeM, overflow, total, meanM, perMode}}
 */
export function binLengths(items, metric, modeKeys) {
  const list = items
    .map(t => ({ mode: t.mode, w: t.weight, v: metric === 'beeline' ? t.beelineM : t.routeM }))
    .filter(t => modeKeys.includes(t.mode) && Number.isFinite(t.v) && t.v >= 0 && t.w > 0);
  if (list.length === 0) return null;
  const total = list.reduce((s, t) => s + t.w, 0);
  const sorted = [...list].sort((a, b) => a.v - b.v);
  let acc = 0;
  let q = sorted[sorted.length - 1].v;
  for (const t of sorted) {
    acc += t.w;
    if (acc >= OVERFLOW_QUANTILE * total) { q = t.v; break; }
  }
  // Das Quantil selbst liegt immer in einer regulären Klasse (floor + 1)
  const qm = Math.max(q, 1);
  const binM = BIN_WIDTHS_M.find(w => Math.floor(qm / w) + 1 <= MAX_BINS) || BIN_WIDTHS_M[BIN_WIDTHS_M.length - 1];
  const regular = Math.floor(qm / binM) + 1;
  const rangeM = regular * binM;
  const overflow = sorted[sorted.length - 1].v >= rangeM;
  const count = regular + (overflow ? 1 : 0);
  const bins = Array.from({ length: count }, (_, i) => ({
    fromM: i * binM,
    toM: i < regular ? (i + 1) * binM : null, // null = „≥ fromM“
    values: Object.fromEntries(modeKeys.map(k => [k, 0]))
  }));
  for (const t of list) {
    bins[Math.min(Math.floor(t.v / binM), count - 1)].values[t.mode] += t.w;
  }
  for (const b of bins) b.total = modeKeys.reduce((s, k) => s + b.values[k], 0);
  const perMode = Object.fromEntries(modeKeys.map(k => {
    const own = list.filter(t => t.mode === k);
    const w = own.reduce((s, t) => s + t.w, 0);
    return [k, { trips: w, meanM: w > 0 ? own.reduce((s, t) => s + t.v * t.w, 0) / w : null }];
  }));
  const meanM = list.reduce((s, t) => s + t.v * t.w, 0) / total;
  return { bins, binM, rangeM, overflow, total, meanM, perMode };
}

function binLabel(bin) {
  return bin.toM == null ? `≥ ${km(bin.fromM)} km` : `${km(bin.fromM)}–${km(bin.toM)} km`;
}

/** Pfad eines Segments: oben gerundet (Datenende), unten eckig. */
function segmentPath(x, y, w, h, rounded) {
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}`
    + (r ? `Q${x},${y} ${x + r},${y}` : '')
    + `H${x + w - r}`
    + (r ? `Q${x + w},${y} ${x + w},${y + r}` : '')
    + `V${y + h}Z`;
}

export const LengthChart = {
  _tooltip: null,
  _observer: null,
  _last: null,

  /**
   * Zeichnet die Längenverteilung in `container` (leert ihn vorher).
   * @param {HTMLElement} container
   * @param {Array<{mode, weight, routeM, beelineM}>} items - je gerechnete Route
   * @param {{metric?: 'route'|'beeline', modes: Array<{key, label}>, note?: string}} options
   */
  render(container, items, options) {
    if (!container) return;
    this._last = { container, items, options };
    this._observe(container);
    const { metric = 'route', modes, note } = options;
    const modeKeys = modes.map(m => m.key);
    container.textContent = '';
    this._hideTooltip();

    const data = binLengths(items || [], metric, modeKeys);
    if (!data) {
      html('p', 'config-hint', 'Keine Routen mit Längenangabe.', container);
      return;
    }

    // Legende: Farbe + Name + Ø-Länge (die Farbe trägt nie allein die Bedeutung)
    const legend = html('div', 'lc-legend', null, container);
    for (const m of modes) {
      const stats = data.perMode[m.key];
      const item = html('span', 'lc-legend-item', null, legend);
      html('span', `lc-swatch lc-swatch--${m.key}`, null, item);
      html('span', 'lc-legend-label', m.label, item);
      html('span', 'lc-legend-value', stats.meanM != null ? `Ø ${kmMean(stats.meanM)}` : '–', item);
    }

    const plot = html('div', 'lc-plot', null, container);
    this._drawSvg(plot, data, modes, metric);

    if (note) html('p', 'lc-note', note, container);
    this._table(container, data, modes);
  },

  /** Neu zeichnen, wenn sich die Panelbreite ändert. */
  _observe(container) {
    if (this._observer || !window.ResizeObserver) return;
    let lastWidth = container.clientWidth;
    this._observer = new ResizeObserver(() => {
      const w = this._last && this._last.container.clientWidth;
      if (!w || w === lastWidth) return;
      lastWidth = w;
      const { container: c, items, options } = this._last;
      if (c.isConnected && c.offsetParent !== null) this.render(c, items, options);
    });
    this._observer.observe(container);
  },

  _drawSvg(plot, data, modes, metric) {
    const cs = getComputedStyle(plot);
    const inner = plot.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const width = Math.max(200, Math.floor(inner || 300));
    const height = PAD.top + PLOT_HEIGHT + PAD.bottom;
    const svg = el('svg', {
      width, height, viewBox: `0 0 ${width} ${height}`, class: 'lc-svg',
      role: 'group', 'aria-label': `Längenverteilung (${metric === 'beeline' ? 'Luftlinie' : 'Routenlänge'}), Hinwege je Schultag nach Länge und Verkehrsmittel`
    }, plot);

    const maxTotal = Math.max(...data.bins.map(b => b.total), 1);
    const step = niceStep(maxTotal);
    const yMax = Math.ceil(maxTotal / step) * step;
    const plotW = width - PAD.left - PAD.right;
    const base = PAD.top + PLOT_HEIGHT;
    const y = (v) => base - (v / yMax) * PLOT_HEIGHT;

    // Gitter und y-Achse (Haarlinien, zurückhaltend)
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v), class: v === 0 ? 'lc-baseline' : 'lc-grid' }, svg);
      const t = el('text', { x: PAD.left - 5, y: y(v), class: 'lc-tick lc-tick-y' }, svg);
      t.textContent = de(v, step < 1 ? 1 : 0);
    }
    const unit = el('text', { x: 0, y: 9, class: 'lc-caption' }, svg);
    unit.textContent = 'Hinwege/Schultag';
    const mean = el('text', { x: width - PAD.right, y: 9, class: 'lc-mean' }, svg);
    mean.textContent = `Ø ${kmMean(data.meanM)}`;

    // Säulen: Fuß unten, dann Rad, ÖPNV, Auto
    const slot = plotW / data.bins.length;
    const barW = Math.max(2, Math.min(MAX_BAR, slot - GAP));
    data.bins.forEach((bin, i) => {
      const x0 = PAD.left + i * slot;
      const bx = x0 + (slot - barW) / 2;
      const col = el('g', {
        class: 'lc-col', tabindex: '0', role: 'img',
        'aria-label': `${binLabel(bin)}: ${modes.map(m => `${m.label} ${trips(bin.values[m.key])}`).join(', ')}, zusammen ${trips(bin.total)} Hinwege je Schultag`
      }, svg);
      // Trefferfläche: ganzer Spalt über die volle Höhe, nicht nur die Farbe
      el('rect', { x: x0, y: PAD.top, width: slot, height: PLOT_HEIGHT, class: 'lc-hit' }, col);
      const present = modes.filter(m => bin.values[m.key] > 0);
      let cum = 0;
      present.forEach((m, k) => {
        const v = bin.values[m.key];
        const yTop = y(cum + v);
        const yBottom = y(cum);
        cum += v;
        const isBottom = k === 0;
        const isTop = k === present.length - 1;
        const top = yTop + (isTop ? 0 : GAP / 2);
        const bottom = yBottom - (isBottom ? 0 : GAP / 2);
        if (bottom - top < 0.5) return; // kleiner als die Lücke: steht in Tooltip und Tabelle
        el('path', { d: segmentPath(bx, top, barW, bottom - top, isTop), class: `lc-seg lc-seg--${m.key}` }, col);
      });
      const show = () => this._showTooltip(col, bin, modes, svg);
      col.addEventListener('pointerenter', show);
      col.addEventListener('focus', show);
      col.addEventListener('pointerleave', () => this._hideTooltip(svg));
      col.addEventListener('blur', () => this._hideTooltip(svg));
    });

    // x-Achse: runde km-Werte (Vielfache der Klassenbreite), so dicht, wie die
    // Beschriftung Platz hat; die letzte Beschriftung trägt die Einheit
    const regular = data.bins.filter(b => b.toM != null).length;
    const labelM = BIN_WIDTHS_M.find(w => w % data.binM === 0 && (w / data.binM) * slot >= LABEL_MIN_PX)
      || data.binM * Math.ceil(LABEL_MIN_PX / slot);
    const every = labelM / data.binM;
    const overflowX = data.overflow ? PAD.left + (regular + 0.5) * slot : null;
    const labels = [];
    for (let i = 0; i <= regular; i += every) {
      const x = PAD.left + i * slot;
      if (overflowX != null && overflowX - x < 34) continue;
      labels.push({ x, text: km(i * data.binM) });
    }
    if (overflowX != null) labels.push({ x: overflowX, text: `≥ ${km(data.rangeM)}` });
    labels[labels.length - 1].text += ' km';
    for (const { x, text } of labels) {
      // am Rand nicht abschneiden: dann bündig statt zentriert
      const half = text.length * 2.9;
      const anchor = x + half > width - 1 ? 'end' : x - half < 0 ? 'start' : 'middle';
      const t = el('text', {
        x: anchor === 'end' ? width - 1 : anchor === 'start' ? 0 : x,
        y: base + 13, class: 'lc-tick lc-tick-x', 'text-anchor': anchor
      }, svg);
      t.textContent = text;
    }
  },

  _showTooltip(col, bin, modes, svg) {
    svg.classList.add('is-hovering');
    svg.querySelectorAll('.lc-col.is-active').forEach(c => c.classList.remove('is-active'));
    col.classList.add('is-active');
    if (!this._tooltip) {
      this._tooltip = html('div', 'lc-tooltip', null, document.body);
      this._tooltip.setAttribute('role', 'presentation');
    }
    const tip = this._tooltip;
    tip.textContent = '';
    html('div', 'lc-tt-head', binLabel(bin), tip);
    for (const m of [...modes].reverse()) { // oben im Stapel = oben in der Liste
      const row = html('div', 'lc-tt-row', null, tip);
      html('span', `lc-tt-key lc-swatch--${m.key}`, null, row);
      html('strong', '', bin.values[m.key] > 0 ? trips(bin.values[m.key]) : '–', row);
      html('span', '', m.label, row);
    }
    const sum = html('div', 'lc-tt-row lc-tt-total', null, tip);
    html('strong', '', trips(bin.total), sum);
    html('span', '', 'Hinwege/Schultag', sum);
    tip.classList.add('is-visible');
    // über dem oberen Ende des Stapels, im Fenster gehalten
    const segs = col.querySelectorAll('.lc-seg');
    const r = (segs.length ? segs[segs.length - 1] : col).getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
    const top = Math.max(8, r.top - t.height - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  },

  _hideTooltip(svg = null) {
    if (svg) {
      svg.classList.remove('is-hovering');
      svg.querySelectorAll('.lc-col.is-active').forEach(c => c.classList.remove('is-active'));
    }
    if (this._tooltip) this._tooltip.classList.remove('is-visible');
  },

  /** Dieselben Werte als Tabelle (zum Aufklappen). */
  _table(container, data, modes) {
    const details = html('details', 'lc-table', null, container);
    html('summary', '', 'Als Tabelle', details);
    const table = html('table', '', null, details);
    const head = html('tr', '', null, html('thead', '', null, table));
    html('th', '', 'Länge', head);
    for (const m of modes) html('th', '', m.label, head);
    html('th', '', 'Summe', head);
    const body = html('tbody', '', null, table);
    for (const bin of data.bins) {
      const tr = html('tr', '', null, body);
      html('th', '', binLabel(bin), tr);
      for (const m of modes) html('td', '', bin.values[m.key] > 0 ? trips(bin.values[m.key]) : '–', tr);
      html('td', '', bin.total > 0 ? trips(bin.total) : '–', tr);
    }
    const foot = html('tfoot', '', null, table);
    const sumRow = html('tr', '', null, foot);
    html('th', '', 'Summe', sumRow);
    for (const m of modes) html('td', '', trips(data.perMode[m.key].trips), sumRow);
    html('td', '', trips(data.total), sumRow);
    const meanRow = html('tr', '', null, foot);
    html('th', '', 'Ø Länge', meanRow);
    for (const m of modes) {
      const meanM = data.perMode[m.key].meanM;
      html('td', '', meanM != null ? kmMean(meanM) : '–', meanRow);
    }
    html('td', '', kmMean(data.meanM), meanRow);
  }
};
