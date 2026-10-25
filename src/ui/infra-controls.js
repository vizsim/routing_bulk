// ==== Infra-Controls: Bedienleiste und Legende der Infrastruktur-Ansicht ====
//
// „Färben nach: Anzahl | Infrastruktur“, dazu Modus (Fuß/Rad) und Merkmal
// (Führung, Untergrund, Steigung, Tempo, Licht). Dieselbe Leiste erscheint im
// Routing-Tab (Routendarstellung) und im Ergebnis der Gebietsanalyse; beide
// schreiben in CONFIG und lösen Events.INFRA_VIEW_CHANGED aus. Die Legende
// zeigt je Klasse den Anteil an den Weg-km des Modus; ein Eintrag hebt beim
// Überfahren seine Segmente auf der Karte hervor, Klick/Tippen hält das fest.
import { CONFIG } from '../core/config.js';
import { EventBus, Events } from '../core/events.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';
import { INFRA_ATTRS, INFRA_MODES } from '../domain/infra.js';
import { MapRenderer } from '../visualization/map-renderer.js';

const CONTROL_HOSTS = ['#infra-controls', '#analysis-infra-controls'];
const LEGEND_HOSTS = ['#infra-legend', '#analysis-infra-legend'];

export const InfraControls = {
  // Letzte gezeichnete Ansicht (vorhandene Modi, aufgelöster Modus/Merkmal)
  _view: null,
  _stats: null,
  _unit: null,
  // Hervorgehobene Klasse: überfahren (Maus) bzw. per Klick festgehalten
  _hoverCls: null,
  _pinnedCls: null,
  _appliedCls: null,
  _legendView: null,

  init() {
    CONTROL_HOSTS.forEach(sel => {
      const host = Utils.getElement(sel);
      if (!host) return;
      host.addEventListener('click', (e) => this._onClick(e));
    });
    LEGEND_HOSTS.forEach(sel => {
      const host = Utils.getElement(sel);
      if (!host) return;
      // Touch hat kein Hover: dort zählt nur das Tippen (Festhalten)
      host.addEventListener('pointerover', (e) => {
        if (e.pointerType === 'touch') return;
        this._hoverCls = e.target.closest('.infra-legend-row')?.dataset.cls || null;
        this._applyHighlight();
      });
      host.addEventListener('pointerleave', () => {
        this._hoverCls = null;
        this._applyHighlight();
      });
      host.addEventListener('click', (e) => {
        const cls = e.target.closest('.infra-legend-row')?.dataset.cls;
        if (!cls) return;
        this._pinnedCls = this._pinnedCls === cls ? null : cls;
        this._markPinned();
        this._applyHighlight();
      });
    });
    EventBus.on(Events.AGGREGATION_DRAWN, ({ view, stats, unit }) => {
      this._view = view;
      this._stats = stats;
      this._unit = unit || null;
      this.render();
    });
    // Karte geleert (neue Berechnung, Tab-Wechsel, Analyse zurückgesetzt):
    // Legende verbergen, bis wieder gezeichnet wird
    EventBus.on(Events.AGGREGATION_CLEARED, () => {
      this._view = null;
      this._stats = null;
      this.render();
    });
    this.render();
  },

  _onClick(e) {
    const btn = e.target.closest('button[data-colorby], button[data-mode], button[data-attr]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.colorby) CONFIG.COLOR_BY = btn.dataset.colorby;
    if (btn.dataset.mode) CONFIG.INFRA_MODE = btn.dataset.mode;
    if (btn.dataset.attr) CONFIG.INFRA_ATTR = btn.dataset.attr;
    this.render();
    EventBus.emit(Events.INFRA_VIEW_CHANGED, {
      colorBy: CONFIG.COLOR_BY, mode: CONFIG.INFRA_MODE, attr: CONFIG.INFRA_ATTR
    });
  },

  /** Aufgelöste Ansicht: was gezeichnet wurde, sonst CONFIG. */
  _current() {
    const colorBy = CONFIG.COLOR_BY === 'infra' ? 'infra' : 'count';
    const modes = this._view?.modes || [];
    const mode = this._view?.mode || CONFIG.INFRA_MODE || (CONFIG.PROFILE === 'bike' ? 'bike' : 'foot');
    const attrDef = INFRA_ATTRS[CONFIG.INFRA_ATTR];
    const attr = attrDef && attrDef.modes.includes(mode) ? CONFIG.INFRA_ATTR : 'guidance';
    return { colorBy, modes, mode, attr };
  },

  render() {
    const cur = this._current();
    const html = this._controlsHtml(cur);
    CONTROL_HOSTS.forEach(sel => {
      const host = Utils.getElement(sel);
      if (host) host.innerHTML = html;
    });
    this._renderLegend(cur);
    this._toggleCountLegend(cur);
  },

  _controlsHtml(cur) {
    const btn = (attrs, label, active, disabled = false, title = '') =>
      `<button type="button" class="infra-btn${active ? ' active' : ''}" ${attrs}${disabled ? ' disabled' : ''}${title ? ` title="${Utils.escapeHtml(title)}"` : ''}>${label}</button>`;

    let html = `
      <div class="infra-row">
        <span class="infra-row-label">Färben nach:</span>
        <div class="infra-seg">
          ${btn('data-colorby="count"', 'Anzahl', cur.colorBy === 'count')}
          ${btn('data-colorby="infra"', 'Infrastruktur', cur.colorBy === 'infra')}
        </div>
      </div>`;
    if (cur.colorBy !== 'infra') return html;

    const modeButtons = Object.entries(INFRA_MODES).map(([key, m]) => {
      const missing = cur.modes.length > 0 && !cur.modes.includes(key);
      return btn(`data-mode="${key}"`, m.label, cur.mode === key, missing,
        missing ? `Keine ${m.longLabel}-Routen in der Auswahl` : m.longLabel);
    }).join('');
    const attrButtons = Object.entries(INFRA_ATTRS)
      .filter(([, def]) => def.modes.includes(cur.mode))
      .map(([key, def]) => btn(`data-attr="${key}"`, def.label, cur.attr === key))
      .join('');

    html += `
      <div class="infra-row">
        <span class="infra-row-label">Modus:</span>
        <div class="infra-seg">${modeButtons}</div>
      </div>
      <div class="infra-row">
        <span class="infra-row-label">Merkmal:</span>
        <div class="infra-seg infra-seg-wrap">${attrButtons}</div>
      </div>`;
    if (this._view && this._view.modes.length === 0) {
      html += '<p class="config-hint">Keine Fuß- oder Radrouten in der Auswahl — für Auto- und ÖPNV-Routen gibt es keine Infrastruktur-Ansicht.</p>';
    } else {
      html += '<p class="config-hint">Klick auf eine Linie zeigt die Infrastruktur des Abschnitts.</p>';
    }
    return html;
  },

  _renderLegend(cur) {
    const show = cur.colorBy === 'infra' && !!this._view?.mode;
    let html = '';
    if (show) {
      const { mode, attr } = this._view;
      const classes = INFRA_ATTRS[attr].classes(mode);
      const stats = this._stats || new Map();
      const total = [...stats.values()].reduce((s, v) => s + v, 0);
      const unitKm = this._unit ? 'Hinweg-km/Schultag' : 'Routen-km';
      const shown = classes.filter(c => (stats.get(c.key) || 0) > 0);
      // Hervorhebung nur innerhalb derselben Ansicht ('unknown' gibt es in
      // mehreren Merkmalen) und für Klassen, die es dort noch gibt
      const viewKey = `${mode}:${attr}`;
      if (viewKey !== this._legendView) {
        this._legendView = viewKey;
        this._hoverCls = this._pinnedCls = null;
      }
      const keys = shown.map(c => c.key);
      if (!keys.includes(this._hoverCls)) this._hoverCls = null;
      if (!keys.includes(this._pinnedCls)) this._pinnedCls = null;
      const rows = shown
        .map(c => {
          const share = total > 0 ? (stats.get(c.key) / total) * 100 : 0;
          const shareText = share >= 1 ? `${Math.round(share)} %` : '< 1 %';
          const pinned = c.key === this._pinnedCls ? ' is-pinned' : '';
          return `<li class="infra-legend-row${pinned}" data-cls="${Utils.escapeHtml(c.key)}">
              <span class="infra-swatch" style="background:${c.color}"></span>
              <span class="infra-legend-label">${Utils.escapeHtml(c.label)}</span>
              <span class="infra-legend-share">${shareText}</span>
            </li>`;
        }).join('');
      const partial = mode === 'foot' && attr === 'guidance' &&
        ((stats.get('sidewalk_yes') || 0) > 0 || (stats.get('no_sidewalk_partial') || 0) > 0);
      html = `
        <div class="legend-title">${INFRA_MODES[mode].longLabel} · ${INFRA_ATTRS[attr].label}</div>
        <ul class="infra-legend-list">${rows || '<li class="config-hint">Keine Segmente</li>'}</ul>
        <p class="config-hint">Anteil an ${total.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${unitKm} · Linienbreite = Menge${partial
          ? '<br>„Gegenseite offen“: GraphHopper meldet den Gehweg nur rechts in Laufrichtung; die andere Straßenseite ist bekannt, sobald eine Route den Abschnitt in Gegenrichtung nutzt.'
          : ''}<br>Eintrag überfahren oder antippen: Abschnitte auf der Karte hervorheben</p>`;
    } else {
      this._hoverCls = this._pinnedCls = null;
    }
    // Routing-Tab nur mit aggregierter Darstellung, Analyse-Legende nur im Analyse-Tab
    const analysis = State.isAnalysisMode();
    const visible = {
      '#infra-legend': show && !analysis && CONFIG.AGGREGATED,
      '#analysis-infra-legend': show && analysis
    };
    LEGEND_HOSTS.forEach(sel => {
      const host = Utils.getElement(sel);
      if (!host) return;
      host.innerHTML = html;
      host.style.display = visible[sel] ? 'block' : 'none';
    });
    this._applyHighlight();
  },

  _markPinned() {
    LEGEND_HOSTS.forEach(sel => {
      Utils.getElement(sel)?.querySelectorAll('.infra-legend-row').forEach(row => {
        row.classList.toggle('is-pinned', row.dataset.cls === this._pinnedCls);
      });
    });
  },

  /** Karte: überfahrene Klasse hervorheben, sonst die festgehaltene. */
  _applyHighlight() {
    const cls = this._hoverCls || this._pinnedCls || null;
    if (cls === this._appliedCls) return;
    this._appliedCls = cls;
    MapRenderer.setHighlightedClass(cls);
  },

  /** Die Colormap-Legende gilt nur für „Färben nach Anzahl“. */
  _toggleCountLegend(cur) {
    const legend = Utils.getElement('#legend');
    if (legend) legend.style.display = CONFIG.AGGREGATED && cur.colorBy === 'count' ? 'block' : 'none';
  }
};
