// ==== Analysis-Panel: UI der Gebietsanalyse (experimentell) ====
//
// Eigener Panel-Modus über die Tabs oben: "Routing" zeigt die bekannten
// Bereiche, "Gebietsanalyse" blendet sie aus und zeigt dieses Panel. Beim
// Moduswechsel werden Karte und Zustand der jeweils anderen Seite geräumt.
import { CONFIG } from '../core/config.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';
import { AnalysisService, FACILITY_TYPES, MODES } from '../services/analysis-service.js';
import { MapRenderer } from '../visualization/map-renderer.js';
import { RouteRenderer } from '../visualization/route-renderer.js';
import { PolygonDraw } from './polygon-draw.js';

export const AnalysisPanel = {
  _polygon: null,
  _facilities: [],
  // Bearbeitbare Kopie der Typ-Defaults (Radius + Split je Typ)
  _typeSettings: null,

  init() {
    this._typeSettings = JSON.parse(JSON.stringify(FACILITY_TYPES));
    this._initTabs();
    this._initButtons();
  },

  // ---- Modus-Umschaltung ----

  _initTabs() {
    const tabRouting = Utils.getElement('#tab-routing');
    const tabAnalysis = Utils.getElement('#tab-analysis');
    if (!tabRouting || !tabAnalysis) return;
    tabRouting.addEventListener('click', () => this._setMode(false));
    tabAnalysis.addEventListener('click', () => this._setMode(true));
  },

  _setMode(analysis) {
    if (State.isAnalysisMode() === analysis) return;
    State.setAnalysisMode(analysis);

    Utils.getElement('#tab-routing')?.classList.toggle('active', !analysis);
    Utils.getElement('#tab-analysis')?.classList.toggle('active', analysis);
    Utils.getElement('#tab-routing')?.setAttribute('aria-selected', String(!analysis));
    Utils.getElement('#tab-analysis')?.setAttribute('aria-selected', String(analysis));

    // Panel-Bereiche umschalten
    document.querySelectorAll('.panel-section > .config-block').forEach(block => {
      const isAnalysisBlock = block.id === 'analysis-block';
      block.style.display = (isAnalysisBlock === analysis) ? '' : 'none';
    });

    if (analysis) {
      // Routing-Reste räumen (Routen, Marker); Layer-Toggles bleiben
      MapRenderer.clearLayersExceptSchools();
      State.setLastTarget(null);
      State.resetRouteData();
    } else {
      // Analyse-Reste räumen
      AnalysisService.abort();
      PolygonDraw.clear();
      MapRenderer.clearRoutes();
      this._setProgress(null);
    }
  },

  // ---- Zeichnen & Einrichtungen ----

  _initButtons() {
    Utils.getElement('#analysis-draw-btn')?.addEventListener('click', () => this._startDrawing());
    Utils.getElement('#analysis-run-btn')?.addEventListener('click', () => this._run());
    Utils.getElement('#analysis-export-btn')?.addEventListener('click', () => AnalysisService.exportGeoJSON(this._polygon));
    Utils.getElement('#analysis-reset-btn')?.addEventListener('click', () => this._reset());
  },

  _startDrawing() {
    this._reset();
    const hint = Utils.getElement('#analysis-draw-hint');
    const btn = Utils.getElement('#analysis-draw-btn');
    if (hint) hint.style.display = 'block';
    if (btn) btn.disabled = true;

    PolygonDraw.start({
      onFinish: async (polygon) => {
        if (hint) hint.style.display = 'none';
        if (btn) { btn.disabled = false; btn.textContent = 'Bereich neu zeichnen'; }
        this._polygon = polygon;
        await this._loadFacilities();
      },
      onCancel: () => {
        if (hint) hint.style.display = 'none';
        if (btn) btn.disabled = false;
      }
    });
  },

  async _loadFacilities() {
    const listEl = Utils.getElement('#analysis-facilities');
    const group = Utils.getElement('#analysis-facilities-group');
    if (!listEl || !group) return;
    group.style.display = 'block';
    listEl.innerHTML = '<div class="config-hint">Suche Einrichtungen im Bereich…</div>';

    this._facilities = await AnalysisService.findFacilities(this._polygon);
    if (this._facilities.length === 0) {
      listEl.innerHTML = '<div class="config-hint">Keine Schulen oder Kindergärten im Bereich gefunden.</div>';
      return;
    }

    listEl.innerHTML = this._facilities.map((f, i) => `
      <div class="analysis-facility">
        <span class="analysis-facility-name" title="${Utils.escapeHtml(f.name)}">${Utils.escapeHtml(f.name)}</span>
        <span class="analysis-facility-type">${FACILITY_TYPES[f.type].label}</span>
        <input type="number" min="0" max="5000" step="10" value="${f.trips}" data-facility="${i}" class="analysis-trips-input" />
      </div>`).join('');
    listEl.querySelectorAll('.analysis-trips-input').forEach(input => {
      input.addEventListener('change', () => {
        const i = Number(input.dataset.facility);
        this._facilities[i].trips = Utils.validateNumber(input.value, 0, 5000, this._facilities[i].trips);
        input.value = this._facilities[i].trips;
        this._updateEstimate();
      });
    });

    this._renderTypeSettings();
    Utils.getElement('#analysis-settings-group').style.display = 'block';
    Utils.getElement('#analysis-run-group').style.display = 'block';
    this._updateEstimate();
  },

  _renderTypeSettings() {
    const el = Utils.getElement('#analysis-settings');
    if (!el) return;
    const typesPresent = [...new Set(this._facilities.map(f => f.type))];
    el.innerHTML = `
      <table class="analysis-settings-table">
        <thead><tr><th></th><th>Radius</th>${MODES.map(m => `<th>${m.label}</th>`).join('')}</tr></thead>
        <tbody>
        ${typesPresent.map(type => {
          const s = this._typeSettings[type];
          return `<tr data-type="${type}">
            <td class="analysis-settings-type">${FACILITY_TYPES[type].label}</td>
            <td><input type="number" min="200" max="10000" step="100" value="${s.radiusM}" data-field="radiusM" /></td>
            ${MODES.map(m => `<td><input type="number" min="0" max="100" step="5" value="${s.split[m.key]}" data-field="${m.key}" /></td>`).join('')}
          </tr>`;
        }).join('')}
        </tbody>
      </table>
      <p class="config-hint">Radius in Metern · Split-Summe je Zeile sollte 100 % sein.</p>`;

    el.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        const type = input.closest('tr').dataset.type;
        const field = input.dataset.field;
        const s = this._typeSettings[type];
        if (field === 'radiusM') {
          s.radiusM = Utils.validateNumber(input.value, 200, 10000, s.radiusM);
          input.value = s.radiusM;
        } else {
          s.split[field] = Utils.validateNumber(input.value, 0, 100, s.split[field]);
          input.value = s.split[field];
          const sum = MODES.reduce((acc, m) => acc + (s.split[m.key] || 0), 0);
          input.closest('tr').classList.toggle('analysis-split-invalid', sum !== 100);
        }
        this._updateEstimate();
      });
    });
  },

  _updateEstimate() {
    const el = Utils.getElement('#analysis-estimate');
    if (!el) return;
    const n = AnalysisService.estimateRoutes(this._facilities, this._typeSettings);
    const trips = this._facilities.reduce((s, f) => s + f.trips, 0);
    el.textContent = `${trips.toLocaleString('de-DE')} Fahrten/Tag → ~${n.toLocaleString('de-DE')} Routen werden am eigenen Routing-Server gerechnet.`;
  },

  // ---- Berechnung & Ergebnis ----

  async _run() {
    const runBtn = Utils.getElement('#analysis-run-btn');
    const resultEl = Utils.getElement('#analysis-result');
    if (runBtn) runBtn.disabled = true;
    if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = 'Berechne…'; }
    MapRenderer.clearRoutes();

    try {
      const result = await AnalysisService.run(
        this._facilities, this._typeSettings,
        ({ phase, done, total }) => this._setProgress(phase === 'prepare'
          ? `Startpunkte: ${done}/${total} Einrichtungen`
          : `Routen: ${done}/${total}`)
      );
      this._setProgress(null);
      if (!result) return; // abgebrochen

      if (result.segments.length > 0) {
        const maxCount = Math.max(...result.segments.map(s => s.count));
        RouteRenderer.drawAggregatedRoutes(result.segments, maxCount, { unit: 'Fahrten/Tag' });
      }
      if (resultEl) {
        const s = result.stats;
        let html = `<div>${s.facilities} Einrichtungen · ${s.totalTrips.toLocaleString('de-DE')} Fahrten/Tag `
          + `· ${s.ok.toLocaleString('de-DE')} Routen gerechnet${s.fail ? ` (${s.fail} fehlgeschlagen)` : ''}</div>`;
        if (s.capacityLimited > 0) {
          html += `<div class="demand-info-warn">Bei ${s.capacityLimited} Einrichtung/Modus-Kombinationen gab es weniger unter 18-Jährige im Radius als Stichproben-Routen — Gewichte wurden entsprechend angehoben.</div>`;
        }
        resultEl.innerHTML = html;
      }
      Utils.getElement('#analysis-export-group').style.display = result.segments.length ? 'block' : 'none';
      Utils.getElement('#analysis-reset-group').style.display = 'block';
    } catch (err) {
      Utils.logError('AnalysisPanel', err);
      this._setProgress(null);
      if (resultEl) resultEl.textContent = 'Berechnung fehlgeschlagen — siehe Konsole.';
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  },

  _setProgress(text) {
    const el = Utils.getElement('#route-progress');
    if (!el) return;
    if (text == null) {
      el.style.display = 'none';
    } else {
      el.textContent = text;
      el.style.display = 'block';
    }
  },

  _reset() {
    AnalysisService.abort();
    AnalysisService.lastResult = null;
    PolygonDraw.clear();
    MapRenderer.clearRoutes();
    this._polygon = null;
    this._facilities = [];
    this._setProgress(null);
    ['#analysis-facilities-group', '#analysis-settings-group', '#analysis-run-group',
     '#analysis-result', '#analysis-export-group', '#analysis-reset-group'].forEach(sel => {
      const el = Utils.getElement(sel);
      if (el) el.style.display = 'none';
    });
    const btn = Utils.getElement('#analysis-draw-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Bereich zeichnen'; }
  }
};
