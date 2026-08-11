// ==== Demand-Selector: UI für den Bereich "Nachfragedetails" ====
import { CONFIG, isRememberMode } from '../core/config.js';
import { EventBus, Events } from '../core/events.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';

export const DemandSelector = {
  /**
   * @param {Function} onChange - wird bei Änderung gerufen (Routen neu berechnen)
   */
  init(onChange) {
    this._onChange = onChange;
    this._initWeightToggle();
    this._initBasisButtons();
    this._initTransitSlider();

    // Info-Zeile aktualisieren, sobald Startpunkte erzeugt wurden
    EventBus.on(Events.DEMAND_UPDATED, (info) => this.renderInfo(info));

    // Ohne Zensus-Daten ergibt der ganze Bereich keinen Sinn
    if (!(CONFIG.POPULATION_PMTILES_URL || '').trim()) {
      const block = Utils.getElement('#demand-block');
      if (block) block.style.display = 'none';
    }
    // Ohne Haltestellen-Tiles nur den ÖPNV-Teil ausblenden
    if (!(CONFIG.PLATFORMS_PMTILES_URL || '').trim()) {
      const group = Utils.getElement('#transit-share-group');
      if (group) group.style.display = 'none';
    }
  },

  /**
   * Grundschalter des Nachfragemodells: ohne Einwohner-Gewichtung werden
   * Startpunkte rein geometrisch verteilt — dann wirken Basis und ÖPNV-Anteil
   * nicht, also werden sie sichtbar deaktiviert.
   */
  _initWeightToggle() {
    const checkbox = Utils.getElement('#config-population-weight-starts');
    if (!checkbox) return;

    const sync = () => {
      const options = Utils.getElement('#demand-options');
      const hint = Utils.getElement('#demand-disabled-hint');
      if (options) options.classList.toggle('is-disabled', !checkbox.checked);
      if (hint) hint.style.display = checkbox.checked ? 'none' : 'block';
    };
    sync();

    checkbox.addEventListener('change', () => {
      sync();
      this._recalculate();
    });
  },

  _initBasisButtons() {
    const btns = Utils.getElements('.demand-basis-btn');
    if (!btns || btns.length === 0) return;
    btns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.basis === CONFIG.DEMAND_BASIS);
      btn.addEventListener('click', () => {
        if (btn.dataset.basis === CONFIG.DEMAND_BASIS) return;
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        CONFIG.DEMAND_BASIS = btn.dataset.basis || 'population';
        this._recalculate();
      });
    });
  },

  _initTransitSlider() {
    const slider = Utils.getElement('#config-transit-share');
    const value = Utils.getElement('#transit-share-value');
    const stopsInput = Utils.getElement('#config-transit-stops');
    const stopsField = Utils.getElement('#transit-stops-field');

    const syncStopsVisibility = () => {
      if (stopsField) stopsField.style.display = Number(slider?.value) > 0 ? 'flex' : 'none';
    };

    if (slider) {
      slider.value = CONFIG.DEMAND_TRANSIT_SHARE;
      const label = () => { if (value) value.textContent = `${slider.value} %`; };
      label();
      syncStopsVisibility();

      // Während des Ziehens nur die Beschriftung, erst beim Loslassen rechnen
      slider.addEventListener('input', () => { label(); syncStopsVisibility(); });
      slider.addEventListener('change', () => {
        CONFIG.DEMAND_TRANSIT_SHARE = Number(slider.value) || 0;
        this._recalculate();
      });
    }

    if (stopsInput) {
      stopsInput.value = CONFIG.DEMAND_TRANSIT_STOPS;
      stopsInput.addEventListener('change', () => {
        CONFIG.DEMAND_TRANSIT_STOPS = Utils.validateNumber(stopsInput.value, 1, 20, CONFIG.DEMAND_TRANSIT_STOPS);
        stopsInput.value = CONFIG.DEMAND_TRANSIT_STOPS;
        if (CONFIG.DEMAND_TRANSIT_SHARE > 0) this._recalculate();
      });
    }
  },

  /** Startpunkte müssen neu gezogen werden (nicht nur neu gezeichnet). */
  _recalculate() {
    // Im "Zielpunkte merken"-Modus mit ausgewähltem Ziel gilt die übliche Regel:
    // Änderungen erst übernehmen, wenn der Nutzer sie explizit anwendet.
    if (isRememberMode() && State.getSelectedTargetIndex() !== null) return;
    if (!State.getLastTarget()) return;
    if (typeof this._onChange === 'function') this._onChange();
  },

  /**
   * Zeigt, woher die Startpunkte kamen und ob die Personenzahl gereicht hat.
   * @param {Object} info - aus DemandService.generateStartPoints
   */
  renderInfo(info) {
    const el = Utils.getElement('#demand-info');
    if (!el || !info) return;

    const label = info.basis === 'under18' ? 'unter 18-Jährige' : 'Einwohner';
    const usedStops = info.transitStops || [];
    const parts = [];
    if (info.residential > 0) parts.push(`${info.residential} vom Wohnort`);
    // Ab Haltestelle wird immer zu Fuß geroutet — bei anderem Profil dazusagen
    if (info.transit > 0) {
      parts.push(`${info.transit} vom ÖPNV${CONFIG.PROFILE !== 'foot' ? ' (zu Fuß)' : ''}`);
    }

    let html = `<div>${parts.join(' · ') || 'Keine Startpunkte'}</div>`;
    // Genutzte Ausstiegs-Haltestellen mit Luftlinie zum Ziel
    if (usedStops.length > 0) {
      const rows = usedStops
        .map(s => `<div class="demand-info-stop">${s.count}× ${Utils.escapeHtml(s.name || 'Haltestelle')} <span>(${s.distance} m)</span></div>`)
        .join('');
      html += `<div class="demand-info-stops">${rows}</div>`;
    }
    // Kapazität nur zeigen, wenn überhaupt Wohn-Startpunkte angefragt waren
    // (bei 100 % ÖPNV werden die Zensus-Zellen gar nicht erst geladen)
    if (info.residentialRequested > 0) {
      html += `<div class="demand-info-sub">Im Radius: ${info.capacity.toLocaleString('de-DE')} ${label}</div>`;
    }
    if (info.capacityLimited) {
      html += `<div class="demand-info-warn">Weniger Startpunkte als angefragt (${info.requested}): `
        + `mehr Routen als ${label} im Radius. Radius vergrößern oder Anzahl reduzieren.</div>`;
    }
    el.innerHTML = html;
    el.style.display = 'block';
  }
};
