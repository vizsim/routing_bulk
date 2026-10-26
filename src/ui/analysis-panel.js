// ==== Analysis-Panel: UI der Gebietsanalyse (experimentell) ====
//
// Eigener Panel-Modus über die Tabs oben: "Routing" zeigt die bekannten
// Bereiche, "Gebietsanalyse" blendet sie aus und zeigt dieses Panel. Beim
// Moduswechsel werden Karte und Zustand der jeweils anderen Seite geräumt.
import { CONFIG } from '../core/config.js';
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';
import { SOURCES, SIGMA, DETOUR_FACTOR, modelSourceIds } from '../domain/school-trips.js';
import { STOP_CLASS_LABELS, STOP_CLASSES } from '../domain/transit-stops.js';
import {
  AnalysisService, FACILITY_TYPES, MODES, TRIP_UNIT, typeSettingsFor
} from '../services/analysis-service.js';
import { LengthChart } from '../visualization/length-chart.js';
import { MapRenderer } from '../visualization/map-renderer.js';
import { RouteRenderer } from '../visualization/route-renderer.js';
import { DrawBar } from './draw-bar.js';
import { MobileLayout } from './mobile-layout.js';
import { PolygonDraw } from './polygon-draw.js';

const fmtKm = (km) => km.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const de = (v) => v.toLocaleString('de-DE');
const pct = (share) => Math.round(share * 100);

/** Kurzlabel und Tooltip für die Herkunft der Wegezahl einer Einrichtung. */
export function tripsSourceInfo(facility, pupilSources = {}) {
  const src = facility.tripsSource || { kind: 'placeholder' };
  if (src.kind === 'official') {
    const meta = pupilSources[src.source] || {};
    const year = src.year ? ` ${src.year}` : '';
    const how = src.match === 'osm'
      ? 'über den OSM-Abgleich (osm-schulabgleich) zugeordnet'
      : `räumlich zugeordnet (${src.distanceM} m entfernt)`;
    // Berufliche Schulen: nur der Teil, der an einem Schultag da ist
    const partial = src.presence != null && src.presence < 1;
    const count = partial
      ? ` · ${de(src.pupils)} Schüler:innen, davon ${pct(src.presence)} % an einem Schultag = ${de(facility.trips)} Hinwege`
      : '';
    return {
      kind: 'official',
      label: `amtlich${src.year ? ` ${String(src.year).replace(/^20(\d\d)\/(\d\d)$/, '$1/$2')}` : ''}${partial ? ' · anteilig' : ''}`,
      title: `${meta.label || src.source || 'Amtliche Statistik'}${year}: ${src.officialName || ''}`
        + ` (${src.officialId}) · ${how}${count}`
    };
  }
  if (src.kind === 'manual') {
    return { kind: 'manual', label: 'eigener Wert', title: 'Von Hand eingetragen (Hinwege je Schultag)' };
  }
  const type = FACILITY_TYPES[facility.type];
  if (facility.type === 'kindergarten') {
    return {
      kind: 'placeholder',
      label: 'Platzhalter',
      title: `Platzhalter für ${type.label} — für Kitas gibt es keine Daten. Bitte anpassen.`
    };
  }
  const presence = type.model ? type.model.presence : 1;
  const assumed = presence < 1
    ? `: ${de(type.pupils)} Schüler:innen, davon ${pct(presence)} % an einem Schultag`
    : '';
  return {
    kind: 'placeholder',
    label: 'Platzhalter',
    title: `Platzhalter für ${type.label}${assumed} — keine amtliche Schülerzahl gefunden. `
      + 'Bitte anpassen (Hinwege je Schultag).'
  };
}

// Eingabefeld je Einrichtung: Hinwege je Schultag
const MAX_TRIPS = 10000;
const TRIPS_INPUT_LABEL = {
  kindergarten: 'Kinder (Hinwege je Schultag)',
  beruflich: 'Anwesende Schüler:innen (Hinwege je Schultag)',
  schule: 'Schüler:innen (Hinwege je Schultag)'
};

export const AnalysisPanel = {
  _polygon: null,
  _facilities: [],
  // Bearbeitbare Kopie der Typ-Defaults (Radius + Split + Weglängenmodell je Typ)
  _typeSettings: null,
  // Raumtyp/Gemeinde des Bereichs (RegioStaR7 aus den Zensus-Zellen)
  _areaContext: null,
  // Sobald der Nutzer Split bzw. Radius angefasst hat, wird der Vorschlag für
  // den Raumtyp dort nicht mehr automatisch angewendet (nur noch per Knopf).
  // Die Weglängen je Verkehrsmittel folgen immer dem Raumtyp.
  _splitsEdited: false,
  _radiusEdited: false,
  // Ergebnis der Schülerzahl-Vorbelegung (für die Zusammenfassung)
  _pupilInfo: null,
  // Längenverteilung: 'route' (Routenlänge) oder 'beeline' (Luftlinie)
  _lengthMetric: 'route',

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

    // „Zielpunkt setzen“-Hinweis passt nur zum Routing-Modus
    const hint = Utils.getElement('#no-target-hint');
    if (hint) {
      const hasTarget = State.getAllTargets().length > 0 || State.getLastTarget() !== null;
      hint.classList.toggle('is-hidden', analysis || hasTarget);
    }

    // Panel-Bereiche umschalten. Die Kartenebenen (Einwohner, Schulen,
    // Haltestellen) sind Kontextdaten und bleiben in beiden Modi sichtbar.
    document.querySelectorAll('.panel-section > .config-block').forEach(block => {
      if (block.id === 'layers-block') return;
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
      MapRenderer.clearAnalysisFacilities();
      this._setProgress(null);
    }
  },

  // ---- Zeichnen & Einrichtungen ----

  _initButtons() {
    Utils.getElement('#analysis-draw-btn')?.addEventListener('click', () => this._startDrawing());
    Utils.getElement('#analysis-run-btn')?.addEventListener('click', () => this._run());
    Utils.getElement('#analysis-export-btn')?.addEventListener('click', () => AnalysisService.exportGeoJSON(this._polygon));
    Utils.getElement('#analysis-reset-btn')?.addEventListener('click', () => this._reset());
    document.querySelectorAll('.length-metric-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._lengthMetric = btn.dataset.metric;
        document.querySelectorAll('.length-metric-btn').forEach(b => b.classList.toggle('active', b === btn));
        this._renderLengthChart();
      });
    });
  },

  /** Längenverteilung der zuletzt gerechneten Wege (gestapelt nach Verkehrsmittel). */
  _renderLengthChart() {
    const group = Utils.getElement('#analysis-length-group');
    const result = AnalysisService.lastResult;
    if (!group) return;
    if (!result || !result.trips || result.trips.length === 0) {
      group.style.display = 'none';
      return;
    }
    group.style.display = 'block';
    LengthChart.render(Utils.getElement('#analysis-length-chart'), result.trips, {
      metric: this._lengthMetric,
      modes: MODES.map(m => ({ key: m.key, label: m.label })),
      note: 'ÖPNV = Fußweg ab der Haltestelle; die Fahrt mit Bus oder Bahn ist nicht enthalten.'
    });
  },

  _startDrawing() {
    this._reset();
    const btn = Utils.getElement('#analysis-draw-btn');
    if (btn) btn.disabled = true;

    // Am Handy braucht das Zeichnen die Karte: Sheet zuklappen, die Leiste oben
    // übernimmt Hinweis und Knöpfe (Fertig/Abbrechen/Punkt zurück)
    MobileLayout.collapseOnMobile();
    DrawBar.show({
      onUndo: () => PolygonDraw.undo(),
      onCancel: () => PolygonDraw.cancel(),
      onDone: () => PolygonDraw.finish()
    });

    PolygonDraw.start({
      onChange: (points) => DrawBar.update(points),
      onFinish: async (polygon) => {
        DrawBar.hide();
        if (btn) { btn.disabled = false; btn.textContent = 'Bereich neu zeichnen'; }
        this._polygon = polygon;
        // Nächster Schritt steht im Panel (Einrichtungen, Berechnen) — am Handy aufklappen
        if (MobileLayout.isMobile()) MobileLayout.setCollapsed(false);
        await this._loadFacilities();
      },
      onCancel: () => {
        DrawBar.hide();
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

    // Einrichtungen (schools.pmtiles) und Raumtyp (Zensus) parallel laden
    const [facilities, areaContext] = await Promise.all([
      AnalysisService.findFacilities(this._polygon),
      AnalysisService.getAreaContext(this._polygon).catch(() => null)
    ]);
    this._facilities = facilities;
    this._areaContext = areaContext;
    AnalysisService.areaContext = areaContext;
    // Amtliche Schülerzahlen vorbelegen (vor dem Zeichnen: kann den Typ schärfen
    // und damit die Reihenfolge ändern)
    this._pupilInfo = await AnalysisService.prefillPupils(this._facilities, areaContext)
      .catch(err => { Utils.logError('AnalysisPanel', err); return null; });
    MapRenderer.setAnalysisFacilities(this._facilities, {
      onHover: (index) => this._highlightRow(index),
      onClick: (index) => this._revealRow(index)
    });
    if (this._facilities.length === 0) {
      listEl.innerHTML = '<div class="config-hint">Keine Schulen oder Kindergärten im Bereich gefunden.</div>';
      this._renderPupilInfo();
      return;
    }

    listEl.innerHTML = this._facilities.map((f, i) => {
      const src = tripsSourceInfo(f, AnalysisService.pupilSources);
      return `
      <div class="analysis-facility" data-index="${i}">
        <span class="analysis-facility-name" title="${Utils.escapeHtml(f.name)} — Klick zentriert die Karte">${Utils.escapeHtml(f.name)}</span>
        <span class="analysis-facility-tags">
          <span class="analysis-facility-type">${FACILITY_TYPES[f.type].label}</span>
          <span class="analysis-facility-src is-${src.kind}" title="${Utils.escapeHtml(src.title)}">${Utils.escapeHtml(src.label)}</span>
        </span>
        <input type="number" min="0" max="${MAX_TRIPS}" step="10" value="${f.trips}" data-facility="${i}" class="analysis-trips-input"
          aria-label="${TRIPS_INPUT_LABEL[f.type] || TRIPS_INPUT_LABEL.schule}" />
      </div>`;
    }).join('');
    listEl.querySelectorAll('.analysis-trips-input').forEach(input => {
      input.addEventListener('change', () => {
        const i = Number(input.dataset.facility);
        const f = this._facilities[i];
        const value = Utils.validateNumber(input.value, 0, MAX_TRIPS, f.trips);
        if (value !== f.trips) {
          f.trips = value;
          f.tripsSource = { kind: 'manual', previous: f.tripsSource || null };
          const chip = input.parentElement.querySelector('.analysis-facility-src');
          const src = tripsSourceInfo(f, AnalysisService.pupilSources);
          if (chip) {
            chip.className = `analysis-facility-src is-${src.kind}`;
            chip.textContent = src.label;
            chip.title = src.title;
          }
        }
        input.value = f.trips;
        this._renderPupilInfo();
        this._updateEstimate();
      });
    });
    this._renderPupilInfo();
    // Hover Panel → Karte (Halo am Icon); Klick auf den Namen zentriert die Karte
    listEl.querySelectorAll('.analysis-facility').forEach(row => {
      const i = Number(row.dataset.index);
      row.addEventListener('mouseenter', () => {
        row.classList.add('is-hovered');
        MapRenderer.setAnalysisFacilityHover(i);
      });
      row.addEventListener('mouseleave', () => {
        row.classList.remove('is-hovered');
        MapRenderer.setAnalysisFacilityHover(null);
      });
      row.querySelector('.analysis-facility-name').addEventListener('click', () => {
        const f = this._facilities[i];
        const map = State.getMap();
        if (f && map) map.easeTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 14) });
      });
    });

    // Vorschlag für den Raumtyp anwenden: Weglängen immer, Split und Radius
    // nur, solange der Nutzer sie noch nicht selbst angefasst hat
    this._applyAreaSuggestion({ splits: !this._splitsEdited, radius: !this._radiusEdited });
    this._renderTypeSettings();
    this._renderAreaContext();
    Utils.getElement('#analysis-settings-group').style.display = 'block';
    Utils.getElement('#analysis-run-group').style.display = 'block';
    this._updateEstimate();
  },

  /** Zeile unter der Liste: woher die Schülerzahlen kommen. */
  _renderPupilInfo() {
    const el = Utils.getElement('#analysis-pupils-info');
    if (!el) return;
    const kind = (f) => (f.tripsSource && f.tripsSource.kind) || 'placeholder';
    const schools = this._facilities.filter(f => f.type !== 'kindergarten');
    if (this._facilities.length === 0) { el.style.display = 'none'; return; }
    const official = schools.filter(f => kind(f) === 'official');
    const manual = this._facilities.filter(f => kind(f) === 'manual');
    const placeholders = this._facilities.length - official.length - manual.length;
    const sourceLabels = [...new Set(official.map(f => {
      const meta = AnalysisService.pupilSources[f.tripsSource.source] || {};
      return `${meta.label || f.tripsSource.source}${f.tripsSource.year ? ` ${f.tripsSource.year}` : ''}`;
    }))];
    const parts = [];
    if (official.length) parts.push(`${official.length} von ${schools.length} Schulen mit amtlicher Schülerzahl (${sourceLabels.map(Utils.escapeHtml).join(', ')})`);
    else if (schools.length) parts.push('Keine amtlichen Schülerzahlen für diesen Bereich gefunden');
    if (manual.length) parts.push(`${manual.length} ${manual.length === 1 ? 'eigener Wert' : 'eigene Werte'}`);
    if (placeholders) parts.push(`${placeholders} Platzhalter`);
    const vocational = this._typeSettings.beruflich && this._facilities.some(f => f.type === 'beruflich')
      ? this._typeSettings.beruflich.model.presence
      : 1;
    const presenceNote = vocational < 1
      ? ` Berufliche Schulen: nur wer an einem Schultag da ist (${pct(vocational)} % der Schüler:innen, Teilzeit-Berufsschule an einzelnen Tagen).`
      : '';
    el.innerHTML = `${parts.join(' · ')}. Eine Schülerin bzw. ein Schüler = ein Hinweg je Schultag; Rückwege gleich viele.${presenceNote}`;
    el.style.display = 'block';
  },

  /**
   * Überträgt den Vorschlag für den Raumtyp (ohne Raumtyp: bundesweit) in die
   * editierbaren Typ-Einstellungen. Die Weglängen folgen immer dem Raumtyp.
   */
  _applyAreaSuggestion({ splits = true, radius = true } = {}) {
    const suggestion = (this._areaContext && AnalysisService.suggestTypeSettings(this._areaContext.regioStaR7))
      || typeSettingsFor(null);
    for (const type of Object.keys(this._typeSettings)) {
      const s = suggestion[type];
      if (!s) continue;
      this._typeSettings[type].model = s.model;
      if (splits) this._typeSettings[type].split = { ...s.split };
      if (radius) this._typeSettings[type].radiusM = s.radiusM;
    }
  },

  /** Zeile „Gebiet: Gemeinde · Raumtyp" über der Split-Tabelle. */
  _renderAreaContext() {
    const el = Utils.getElement('#analysis-area-context');
    if (!el) return;
    const ctx = this._areaContext;
    if (!ctx) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const place = [ctx.gemeinde, ctx.label].filter(Boolean).map(Utils.escapeHtml).join(' · ');
    const hasSuggestion = !!AnalysisService.suggestTypeSettings(ctx.regioStaR7);
    if (!hasSuggestion) {
      el.innerHTML = `Gebiet: ${place}`;
    } else if (!this._splitsEdited && !this._radiusEdited) {
      el.innerHTML = `Gebiet: ${place} — Vorschlag für diesen Raumtyp angewendet (anpassbar, Quellen unten).`;
    } else {
      el.innerHTML = `Gebiet: ${place} · <button type="button" id="analysis-apply-split-btn" class="analysis-inline-btn">Vorschlag anwenden</button>`;
      Utils.getElement('#analysis-apply-split-btn')?.addEventListener('click', () => {
        this._applyAreaSuggestion();
        this._splitsEdited = false;
        this._radiusEdited = false;
        this._renderTypeSettings();
        this._renderAreaContext();
        this._updateEstimate();
      });
    }
  },

  /** Hebt eine Panel-Zeile hervor (Karte → Panel, index null = keine). */
  _highlightRow(index) {
    document.querySelectorAll('.analysis-facility.is-hovered').forEach(el => el.classList.remove('is-hovered'));
    if (index == null) return;
    // Nur markieren — gescrollt wird erst beim Klick (_revealRow), sonst springt
    // das Panel bei jeder Bewegung über die Karte
    document.querySelector(`.analysis-facility[data-index="${index}"]`)?.classList.add('is-hovered');
  },

  /** Klick auf eine Einrichtung in der Karte: Zeile im Panel zeigen und kurz aufleuchten lassen. */
  _revealRow(index) {
    const row = document.querySelector(`.analysis-facility[data-index="${index}"]`);
    if (!row) return;
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    row.classList.remove('is-revealed');
    void row.offsetWidth; // Animation neu starten, auch beim zweiten Klick
    row.classList.add('is-revealed');
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
          const sum = MODES.reduce((acc, m) => acc + (s.split[m.key] || 0), 0);
          return `<tr data-type="${type}"${sum !== 100 ? ' class="analysis-split-invalid"' : ''}>
            <td class="analysis-settings-type">${FACILITY_TYPES[type].label}</td>
            <td><input type="number" min="200" max="10000" step="100" value="${s.radiusM}" data-field="radiusM" /></td>
            ${MODES.map(m => `<td><input type="number" min="0" max="100" step="5" value="${s.split[m.key]}" data-field="${m.key}" /></td>`).join('')}
          </tr>`;
        }).join('')}
        </tbody>
      </table>
      <p class="config-hint">Radius in Metern — nur Kappung: Wege von weiter her
      starten am Rand. Split-Summe je Zeile sollte 100 % sein. Die Weglänge hängt
      vom Verkehrsmittel ab (MiD 2023): Fußwege kurz, Radwege mittel, Autowege lang.
      ÖPNV = Fußweg ab einer Haltestelle nahe der Einrichtung: Schiene mit größerem
      Einzugsbereich als Bus und Straßenbahn, und je länger die ÖPNV-Wege, desto
      öfter Schiene (kein Fahrplan-Routing, alle Anfragen gehen an den eigenen
      Routing-Server). Einzugsgrenzen: Kita/Grundschule
      nur aus der eigenen Gemeinde; weiterführende und berufliche Schulen bevorzugt
      aus dem eigenen Landkreis (außerhalb stark abgewertet, anderes Bundesland noch
      stärker).</p>
      <div id="analysis-sources-slot">${this._sourcesHtml(typesPresent)}</div>`;
    this._bindSourcesToggle();

    el.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        const type = input.closest('tr').dataset.type;
        const field = input.dataset.field;
        const s = this._typeSettings[type];
        if (field === 'radiusM') {
          s.radiusM = Utils.validateNumber(input.value, 200, 10000, s.radiusM);
          input.value = s.radiusM;
          if (!this._radiusEdited) {
            this._radiusEdited = true;
            this._renderAreaContext();
          }
        } else {
          s.split[field] = Utils.validateNumber(input.value, 0, 100, s.split[field]);
          input.value = s.split[field];
          const sum = MODES.reduce((acc, m) => acc + (s.split[m.key] || 0), 0);
          input.closest('tr').classList.toggle('analysis-split-invalid', sum !== 100);
          if (!this._splitsEdited) {
            this._splitsEdited = true;
            this._renderAreaContext();
          }
        }
        const slot = Utils.getElement('#analysis-sources-slot');
        if (slot) {
          slot.innerHTML = this._sourcesHtml(typesPresent);
          this._bindSourcesToggle();
        }
        this._updateEstimate();
      });
    });
  },

  /** Merkt sich, ob „Annahmen & Quellen“ aufgeklappt ist (übersteht Neuzeichnen). */
  _bindSourcesToggle() {
    const details = document.querySelector('#analysis-sources-slot details');
    if (details) details.addEventListener('toggle', () => { this._sourcesOpen = details.open; });
  },

  /**
   * „Annahmen & Quellen“: je Einrichtungstyp, woher Split und Weglängen
   * stammen, plus die Literaturliste — dieselben Angaben stehen im Export.
   */
  _sourcesHtml(types) {
    const ids = new Set();
    const esc = Utils.escapeHtml;
    const typeItems = types.map(type => {
      const s = this._typeSettings[type];
      const m = s.model;
      if (!m) return '';
      modelSourceIds(m).forEach(id => ids.add(id));
      const edited = MODES.some(x => (s.split[x.key] || 0) !== (m.split[x.key] || 0));
      const suggested = MODES.map(x => m.split[x.key]).join('/');
      const splitText = edited
        ? `eigene Werte (Vorschlag ${suggested} % nach ${esc(SOURCES[m.splitSource].label)})`
        : `${suggested} % nach ${esc(SOURCES[m.splitSource].label)} (${esc(m.splitNote)})`;
      const lengths = MODES.map(x => `${x.label} ${fmtKm(m.modes[x.key].meanKm)}`).join(' · ');
      const radiusNote = s.radiusM === m.radiusM ? '' : ` — eingestellt: ${fmtKm(s.radiusM / 1000)} km`;
      const quantile = `${pct(m.radiusQuantile)} % der Fuß-, Rad- und Autowege (Luftlinie)`;
      const radiusText = m.radiusCapped
        ? `Radius-Vorschlag ${fmtKm(m.radiusM / 1000)} km (Obergrenze; ${quantile} reichen bis ${fmtKm(m.radiusQuantileM / 1000)} km)`
        : `Radius-Vorschlag ${fmtKm(m.radiusM / 1000)} km = ${quantile}`;
      const presence = m.presence < 1 && SOURCES[m.presenceSource]
        ? `<div>An einem Schultag in der Schule: ${pct(m.presence)} % der Schüler:innen nach ${esc(SOURCES[m.presenceSource].label)} (${esc(m.presenceNote)})</div>`
        : '';
      const basis = s.basis === 'population'
        ? '<div>Startpunkte aus der ganzen Bevölkerung (Zensus), nicht nur unter 18-Jährige</div>'
        : '';
      const eg = m.egress;
      const egress = eg
        ? `<div>ÖPNV-Ausstieg: Schiene ${pct(eg.shares.rail)} · Straßenbahn ${pct(eg.shares.tram)} · Bus ${pct(eg.shares.bus)} %
          (aufgeteilt auf die Typen im Einzugsbereich: Schiene ${de(eg.radii.rail)} m, Bus/Straßenbahn ${de(eg.radii.bus)} m) —
          ${esc(SOURCES['mid2023-oev'].label)}, ${esc(SOURCES['leitlinie-nvp-by'].label)}</div>`
        : '';
      return `<li><strong>${esc(FACILITY_TYPES[type].label)}</strong>
        <div>Modal Split (Fuß/Rad/ÖPNV/Auto): ${splitText}</div>
        <div>Ø Weg ${fmtKm(m.meanKm)} km nach ${esc(SOURCES[m.meanSource].label)} (${esc(m.meanNote)})</div>
        <div>Ø je Verkehrsmittel: ${lengths} km — ${esc(SOURCES[m.modeSource].label)} (${esc(m.modeNote)}), auf diesen Wert skaliert</div>
        <div>${radiusText}${radiusNote}</div>
        ${egress}${presence}${basis}
      </li>`;
    }).join('');

    const link = (title, url) => (url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>`
      : esc(title));
    const sourceItems = [...ids].filter(id => SOURCES[id]).map(id => {
      const src = SOURCES[id];
      return `<li><strong>${esc(src.label)}:</strong> ${link(src.title, src.url)}. ${esc(src.citation)}.
        <span class="analysis-sources-note">${esc(src.note)}</span></li>`;
    });
    const pupilIds = [...new Set(this._facilities
      .filter(f => f.tripsSource && f.tripsSource.kind === 'official' && f.tripsSource.source)
      .map(f => f.tripsSource.source))];
    for (const id of pupilIds) {
      const src = AnalysisService.pupilSources[id] || { label: id, title: id };
      sourceItems.push(`<li><strong>${esc(src.label || id)}:</strong> ${link(src.title || id, src.url)}.
        ${src.license ? `Lizenz: ${esc(src.license)}.` : ''}
        <span class="analysis-sources-note">${esc(src.note || '')}</span></li>`);
    }
    return `<details class="analysis-sources"${this._sourcesOpen ? ' open' : ''}>
      <summary>Annahmen &amp; Quellen</summary>
      <ul class="analysis-sources-types">${typeItems}</ul>
      <p>Annahmen: Weglängen lognormal mit Streuung σ Fuß ${de(SIGMA.foot)}, Rad ${de(SIGMA.bike)},
      ÖPNV ${de(SIGMA.transit)}, Auto ${de(SIGMA.car)}; Umwegfaktor Netz/Luftlinie ${de(DETOUR_FACTOR)};
      eine Schülerin bzw. ein Schüler = ein Hinweg je Schultag (berufliche Schulen: nur der anwesende Anteil).</p>
      <ul class="analysis-sources-list">${sourceItems.join('')}</ul>
    </details>`;
  },

  _updateEstimate() {
    const el = Utils.getElement('#analysis-estimate');
    if (!el) return;
    const n = AnalysisService.estimateRoutes(this._facilities, this._typeSettings);
    const trips = this._facilities.reduce((s, f) => s + f.trips, 0);
    el.textContent = `${trips.toLocaleString('de-DE')} ${TRIP_UNIT} → ~${n.toLocaleString('de-DE')} Routen werden am eigenen Routing-Server gerechnet.`;
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
        this._renderModeFilter();
        this._applyModeFilter();
      }
      if (resultEl) {
        const s = result.stats;
        let html = `<div>${s.facilities} Einrichtungen · ${s.totalTrips.toLocaleString('de-DE')} ${TRIP_UNIT} `
          + `· ${s.ok.toLocaleString('de-DE')} Routen gerechnet${s.fail ? ` (${s.fail} fehlgeschlagen)` : ''}</div>`
          + '<div class="demand-info-sub">Karte zeigt die Hinwege; Rückwege etwa gleich viele auf denselben Kanten in Gegenrichtung.</div>';
        // Wo die ÖPNV-Wege enden: Mix der Ausstiegshaltestellen
        const byClass = s.transitByClass || {};
        const transitTotal = Object.values(byClass).reduce((a, b) => a + b, 0);
        if (transitTotal > 0) {
          const parts = STOP_CLASSES.filter(c => byClass[c] > 0)
            .map(c => `${STOP_CLASS_LABELS[c]} ${pct(byClass[c] / transitTotal)} %`);
          html += `<div class="demand-info-sub">ÖPNV-Wege enden an: ${parts.join(' · ')} `
            + `(${Math.round(transitTotal).toLocaleString('de-DE')} Hinwege)</div>`;
        }
        if (s.capacityLimited > 0) {
          html += `<div class="demand-info-warn">Bei ${s.capacityLimited} Einrichtung/Modus-Kombinationen wohnten weniger mögliche Startpersonen im Radius (unter 18-Jährige, bei beruflichen Schulen alle Einwohner) als Stichproben-Routen — Gewichte wurden entsprechend angehoben.</div>`;
        }
        resultEl.innerHTML = html;
      }
      this._renderLengthChart();
      // '' statt 'block': die Leiste ist per CSS ein Flex-Container (Zeilenabstand)
      Utils.getElement('#analysis-infra-controls').style.display = result.segments.length ? '' : 'none';
      this._toggleModeFilter(result.segments.length > 0);
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

  // ---- Modus-Filter für die Belastungskarte ----

  /** Baut die Checkboxen (alle an) neu auf — nach jedem Lauf. */
  _renderModeFilter() {
    const el = Utils.getElement('#analysis-mode-filter');
    if (!el) return;
    el.innerHTML = MODES.map(m => `
      <label class="analysis-mode-check">
        <input type="checkbox" data-mode="${m.key}" checked /> ${m.label}
      </label>`).join('');
    el.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => this._applyModeFilter());
    });
  },

  /**
   * Zeichnet die Belastungskarte für die angehakten Modi neu — aus den
   * vorhandenen Kanten-Summen (byProfile), ohne Neuberechnung. Die Farbskala
   * wird auf das Maximum der Auswahl skaliert.
   */
  _applyModeFilter() {
    const result = AnalysisService.lastResult;
    if (!result || !result.segments.length) return;
    // Infrastruktur-Ansicht: der Modus kommt aus der Infra-Leiste (Fuß inkl.
    // ÖPNV-Zubringer | Rad), die Checkboxen gelten nur für „Färben nach Anzahl“
    if (CONFIG.COLOR_BY === 'infra') {
      MapRenderer.clearRoutes();
      RouteRenderer.drawAggregatedRoutes(result.segments, 0, { unit: TRIP_UNIT });
      return;
    }
    const active = [...document.querySelectorAll('#analysis-mode-filter input:checked')]
      .map(i => i.dataset.mode);
    const segments = result.segments
      .map(seg => ({
        ...seg,
        count: active.reduce((sum, m) => sum + (seg.byProfile[m] || 0), 0)
      }))
      .filter(seg => seg.count > 0.05);
    MapRenderer.clearRoutes();
    if (segments.length === 0) return;
    const maxCount = Math.max(...segments.map(s => s.count));
    RouteRenderer.drawAggregatedRoutes(segments, maxCount, { unit: TRIP_UNIT });
  },

  /**
   * Infrastruktur-Leiste geändert: Modus-Checkboxen nur bei „Färben nach
   * Anzahl“ zeigen und die Belastungskarte neu zeichnen.
   */
  applyInfraView() {
    const result = AnalysisService.lastResult;
    this._toggleModeFilter(!!(result && result.segments.length));
    this._applyModeFilter();
  },

  _toggleModeFilter(hasResult) {
    const group = Utils.getElement('#analysis-filter-group');
    if (group) group.style.display = hasResult && CONFIG.COLOR_BY !== 'infra' ? 'block' : 'none';
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
    MapRenderer.clearAnalysisFacilities();
    this._polygon = null;
    this._facilities = [];
    this._setProgress(null);
    this._areaContext = null;
    this._pupilInfo = null;
    AnalysisService.areaContext = null;
    AnalysisService.pupilSources = {};
    ['#analysis-facilities-group', '#analysis-pupils-info', '#analysis-settings-group', '#analysis-run-group',
     '#analysis-result', '#analysis-length-group', '#analysis-area-context', '#analysis-filter-group',
     '#analysis-infra-controls', '#analysis-infra-legend',
     '#analysis-export-group', '#analysis-reset-group'].forEach(sel => {
      const el = Utils.getElement(sel);
      if (el) el.style.display = 'none';
    });
    const btn = Utils.getElement('#analysis-draw-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Bereich zeichnen'; }
  }
};
