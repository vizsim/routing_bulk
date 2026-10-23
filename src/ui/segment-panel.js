// ==== Segment-Panel: Infrastruktur eines aggregierten Abschnitts ====
//
// Öffnet sich im Infrastruktur-Modus beim Klick auf eine Linie
// (Events.SEGMENT_SELECTED aus MapRenderer). Inhalt aus
// domain/infra.js#describeSegment; am Desktop als Karte unten links, am Handy
// über dem Panel-Streifen (style.css, Mobile-Query). „‹ x von n ›“ blättert
// durch die Abschnitte derselben Klasse, sortiert nach Menge. Nach jedem
// Neuzeichnen wird die Auswahl über den Segment-Schlüssel wiedergefunden
// (Feature-IDs ändern sich).
import { EventBus, Events } from '../core/events.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';
import { INFRA_ATTRS, INFRA_MODES, describeSegment } from '../domain/infra.js';
import { MapRenderer } from '../visualization/map-renderer.js';
import { MobileLayout } from './mobile-layout.js';

export const SegmentPanel = {
  _el: null,
  _selectedKey: null,
  _selectedId: null,
  _view: null,
  _unit: null,
  _closeTimer: null,

  init() {
    this._el = this._build();
    EventBus.on(Events.SEGMENT_SELECTED, ({ id }) => this.selectById(id));
    EventBus.on(Events.AGGREGATION_DRAWN, ({ view, unit, infra }) => {
      clearTimeout(this._closeTimer);
      this._view = view;
      this._unit = unit || null;
      if (!infra) { this.close(); return; }
      this._reselect();
    });
    // Geleert und nicht gleich neu gezeichnet (z. B. Analyse zurückgesetzt) → schließen
    EventBus.on(Events.AGGREGATION_CLEARED, () => {
      clearTimeout(this._closeTimer);
      this._closeTimer = setTimeout(() => this.close(), 600);
    });
    // Klick neben die Linien (neues Ziel o. Ä.) schließt das Panel
    EventBus.on(Events.MAP_CLICK, () => this.close());
    EventBus.on(Events.CONFIG_AGGREGATION_CHANGED, () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  },

  _build() {
    const el = document.createElement('div');
    el.id = 'segment-panel';
    el.className = 'segment-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Infrastruktur des Abschnitts');
    el.hidden = true;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.segment-panel-close')) { this.close(); return; }
      const nav = e.target.closest('button[data-nav]');
      if (nav) this._step(Number(nav.dataset.nav));
    });
    document.body.appendChild(el);
    return el;
  },

  isOpen() {
    return !!this._el && !this._el.hidden;
  },

  close() {
    clearTimeout(this._closeTimer);
    this._selectedKey = null;
    this._selectedId = null;
    MapRenderer.setSelectedSegment(null);
    if (this._el) this._el.hidden = true;
    // Am Handy überdeckt die Karte die Zoom-Kacheln — die blendet style.css solange aus
    document.body.classList.remove('segment-open');
  },

  /** Wählt ein Segment über seine Feature-ID aus und zeigt das Panel. */
  selectById(id, { fit = false } = {}) {
    const entry = MapRenderer.getAggregatedEntry(id);
    if (!entry || !this._view?.mode) return;
    this._selectedKey = entry.seg.key;
    this._selectedId = id;
    MapRenderer.setSelectedSegment(id);
    this._render(id, entry);
    if (fit) this._fitTo(entry.seg);
  },

  /** Nach dem Neuzeichnen: dasselbe Segment (Schlüssel) wieder auswählen. */
  _reselect() {
    if (!this._selectedKey) return;
    for (const [id, entry] of MapRenderer.getAggregatedEntries()) {
      if (entry.seg.key === this._selectedKey) {
        this.selectById(id);
        return;
      }
    }
    this.close();
  },

  /** Feature-IDs derselben Klasse, absteigend nach Menge. */
  _sameClass(cls) {
    return [...MapRenderer.getAggregatedEntries()]
      .filter(([, e]) => e.cls === cls)
      .sort((x, y) => y[1].value - x[1].value)
      .map(([id]) => id);
  },

  _step(delta) {
    const entry = MapRenderer.getAggregatedEntry(this._selectedId);
    if (!entry) return;
    const list = this._sameClass(entry.cls);
    if (list.length < 2) return;
    const i = list.indexOf(this._selectedId);
    const next = list[(i + delta + list.length) % list.length];
    this.selectById(next, { fit: true });
  },

  _fitTo(seg) {
    const map = State.getMap();
    if (!map || !seg.coords?.length) return;
    const lats = seg.coords.map(c => c[0]);
    const lngs = seg.coords.map(c => c[1]);
    const card = this._el && !this._el.hidden ? this._el.offsetHeight : 0;
    let padding;
    if (MobileLayout.isMobile()) {
      // Handy: Suche oben, Streifen + Infokarte unten
      const bottom = Math.min(MobileLayout.peekHeight() + card + 24, window.innerHeight * 0.7);
      padding = { top: 64, bottom, left: 40, right: 40 };
    } else {
      // Desktop: Infokarte unten links, Panel rechts (sofern aufgeklappt)
      const panel = document.getElementById('main-panel');
      const right = panel && !MobileLayout.isCollapsed() ? panel.offsetWidth + 30 : 60;
      padding = { top: 70, bottom: card + 30, left: 60, right };
    }
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding, maxZoom: Math.max(map.getZoom(), 16), duration: 500 }
    );
  },

  _render(id, entry) {
    const d = describeSegment(entry.seg, this._view, { unit: this._unit });
    const esc = Utils.escapeHtml;
    const list = this._sameClass(entry.cls);
    const pos = list.indexOf(id);
    const rows = d.rows.map(r => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('');
    const links = d.links.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('');
    const nav = list.length > 1
      ? `<div class="segment-panel-nav">
          <button type="button" data-nav="-1" aria-label="Vorheriger Abschnitt dieser Klasse">‹</button>
          <span>${pos + 1} von ${list.length}</span>
          <button type="button" data-nav="1" aria-label="Nächster Abschnitt dieser Klasse">›</button>
        </div>`
      : '';
    const mode = INFRA_MODES[this._view.mode]?.longLabel || '';
    const attr = INFRA_ATTRS[this._view.attr]?.label || '';
    const eyebrow = [mode, attr].filter(Boolean).join(' · ');
    this._el.innerHTML = `
      <div class="segment-panel-head">
        <span class="segment-swatch" style="background:${esc(d.color)}"></span>
        <div class="segment-panel-titles">
          <div class="segment-panel-eyebrow">${esc(eyebrow)}</div>
          <div class="segment-panel-title">${esc(d.title)}</div>
          <div class="segment-panel-sub">${esc(d.subtitle)}</div>
        </div>
        <button type="button" class="segment-panel-close" aria-label="Schließen">×</button>
      </div>
      <dl class="segment-panel-rows">${rows}</dl>
      <div class="segment-panel-foot">
        <div class="segment-panel-links">${links}</div>
        ${nav}
      </div>`;
    this._el.hidden = false;
    document.body.classList.add('segment-open');
  }
};
