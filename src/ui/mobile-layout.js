// ==== Mobile-Layout: Panel als Bottom-Sheet, Suche als Lupe ====
//
// Nach dem Vorbild von vizsim/unfallkarte (js/ui/mobileLayout.js). Am Desktop steht
// das Panel oben rechts UNTER der Suchzeile; unter 640 px wandert es per Media-Query
// (style.css, Abschnitt „Mobile“) an den unteren Rand und wird zum Bottom-Sheet:
// zugeklappt bleibt ein Streifen mit Titel und Fußzeile stehen, aufgeklappt fährt es
// über höchstens 72 % der Höhe. Die Suche schrumpft dort zum Lupen-Knopf. Vorher lagen
// Suchfeld und Panel am Handy übereinander, und das Panel verdeckte die ganze Karte.
//
// Hier lebt nur, was CSS nicht kann:
//   1. Auf-/Zuklappen über die Titelzeile (Desktop und Handy) samt Pfeil und aria,
//   2. beim ersten Laden am Handy zuklappen — die Klasse setzt schon ein Inline-Skript
//      am Anfang des Panels (index.html) VOR dem ersten Bild; hier kommen Pfeil/aria,
//      Suche und Attribution nach,
//   3. die Höhe des zugeklappten Streifens als `--panel-peek` melden, damit Zoom-Kacheln,
//      Attribution, Fortschritt und Infokarte exakt darüber sitzen,
//   4. die Suche auf-/zuklappen samt Fokus und Tastatur,
//   5. das Sheet mit dem Finger hochziehen/zuschieben (Tippen klappt weiter um),
//   6. die Chips der Fußzeile (Profil · Routen · Radius) aktuell halten.

import { CONFIG } from '../core/config.js';
import { EventBus, Events } from '../core/events.js';
import { State } from '../core/state.js';

// Muss mit der Media-Query in style.css UND dem Inline-Skript im Panel (index.html)
// übereinstimmen.
export const MOBILE_QUERY = '(max-width: 640px)';

const PROFILE_LABELS = { foot: 'Fuß', bike: 'Rad', car: 'Auto', oepnv: 'ÖPNV' };

export const MobileLayout = {
  _panel: null,
  _mql: null,
  _publishPeek: () => {},

  init() {
    const panel = document.getElementById('main-panel');
    if (!panel) return;
    this._panel = panel;

    this._setupCollapseToggle(panel);
    this._setupStats(panel);

    if (!window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    this._mql = mql;

    // Höhe des zugeklappten Sheets an CSS melden. Nur zugeklappt messen: aufgeklappt
    // blendet das CSS die Bedienelemente ohnehin aus. Während einer Zieh-Geste ist das
    // Sheet noch `collapsed`, wird aber schon voll gerendert — keine Streifenhöhe.
    const publishPeek = () => {
      if (!mql.matches || !panel.classList.contains('collapsed')) return;
      if (panel.classList.contains('is-dragging')) return;
      const height = Math.round(panel.getBoundingClientRect().height);
      if (height > 0) document.documentElement.style.setProperty('--panel-peek', `${height}px`);
    };
    this._publishPeek = publishPeek;

    if (window.ResizeObserver) new ResizeObserver(publishPeek).observe(panel);
    // Chips und Untertitel ändern sich ohne Größenänderung des Sheets, die Klasse beim
    // Auf-/Zuklappen: beides über den Attribut-/Inhaltswechsel mitnehmen.
    new MutationObserver(publishPeek).observe(panel, {
      attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true
    });

    const setGeocoderCollapsed = setupGeocoderToggle(mql);
    setupSheetDrag(mql, panel, (collapsed) => this.setCollapsed(collapsed), publishPeek);

    const applyBreakpoint = (matches) => {
      this.setCollapsed(matches);
      setGeocoderCollapsed(matches);
      collapseAttribution(matches);
      publishPeek();
    };

    if (mql.matches) applyBreakpoint(true);
    // Die Attribution füllt MapLibre erst mit dem Style — und klappt sie dabei am Handy
    // wieder auf. Darum nach dem Laden noch einmal zuklappen.
    const map = State.getMap();
    if (map && !map.loaded()) map.once('load', () => collapseAttribution(mql.matches));
    // Beim Drehen/Größenändern über die Grenze nachziehen — aber NICHT bei jeder
    // Größenänderung, sonst klappte das Sheet dem Nutzer unter den Fingern weg.
    mql.addEventListener('change', (e) => applyBreakpoint(e.matches));
  },

  isMobile() {
    return !!this._mql?.matches;
  },

  isCollapsed() {
    return !!this._panel?.classList.contains('collapsed');
  },

  /** Panel auf-/zuklappen (Pfeil und aria inklusive). */
  setCollapsed(collapsed) {
    const panel = this._panel;
    if (!panel) return;
    panel.classList.toggle('collapsed', collapsed);
    const arrow = panel.querySelector('#collapse-panel');
    if (arrow) {
      arrow.classList.toggle('open', !collapsed);
      arrow.setAttribute('aria-expanded', String(!collapsed));
    }
    if (collapsed) panel.scrollTop = 0;
  },

  /** Am Handy das Sheet zuklappen, wenn die Karte gebraucht wird (z. B. Bereich zeichnen). */
  collapseOnMobile() {
    if (this.isMobile()) this.setCollapsed(true);
  },

  /** Höhe des Streifens (px) — für fitBounds-Ränder am Handy. */
  peekHeight() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-peek')) || 0;
  },

  _setupCollapseToggle(panel) {
    const title = panel.querySelector('.panel-title');
    // Ein Handler an der Titelzeile; der Pfeil ist ein <button> darin (Tastatur/Screenreader)
    title?.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      this.setCollapsed(!panel.classList.contains('collapsed'));
    });
    // Zugeklappt gehört die Fußzeile zum Streifen: Tippen darauf klappt ebenfalls auf
    panel.querySelector('.panel-footer')?.addEventListener('click', (e) => {
      if (!panel.classList.contains('collapsed') || e.target.closest('a, button')) return;
      this.setCollapsed(false);
    });
  },

  // ---- Fußzeile: Chips mit den aktuellen Einstellungen ----

  _setupStats(panel) {
    const render = () => this.renderStats();
    // Einstellungen ändern sich über Knöpfe und Felder im Panel — danach neu zeichnen
    // (setTimeout: erst nachdem die Handler CONFIG aktualisiert haben)
    panel.addEventListener('click', () => setTimeout(render, 0));
    panel.addEventListener('change', () => setTimeout(render, 0));
    [Events.CONFIG_CHANGED, Events.CONFIG_PROFILE_CHANGED, Events.ROUTES_CALCULATED].forEach(ev => {
      EventBus.on(ev, render);
    });
    render();
  },

  renderStats() {
    const host = document.getElementById('panel-stats');
    if (!host) return;
    const chips = statChips({
      analysis: State.isAnalysisMode(),
      profile: CONFIG.PROFILE,
      n: CONFIG.N,
      radiusM: CONFIG.RADIUS_M
    });
    const icon = this._panel?.querySelector('.profile-btn.active svg');
    host.replaceChildren(...chips.map((c) => {
      const el = document.createElement('span');
      el.className = 'fc-stat';
      el.title = c.title;
      if (c.icon === 'profile' && icon) {
        const svg = icon.cloneNode(true);
        svg.setAttribute('aria-hidden', 'true');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        el.appendChild(svg);
      }
      for (const part of c.parts) {
        if (part.strong) {
          const b = document.createElement('strong');
          b.textContent = part.text;
          el.appendChild(b);
        } else {
          el.appendChild(document.createTextNode(part.text));
        }
      }
      return el;
    }));
  }
};

/**
 * Chips der Fußzeile — rein, damit testbar. Zwei Chips wie die zwei Kennzahlen der
 * Unfallkarte: am Desktop untereinander, im Handy-Streifen nebeneinander.
 * @returns {Array<{title: string, icon?: string, parts: Array<{text: string, strong?: boolean}>}>}
 */
export function statChips({ analysis, profile, n, radiusM }) {
  if (analysis) {
    return [{ title: 'Modus', parts: [{ text: 'Gebietsanalyse', strong: true }] }];
  }
  const km = (Number(radiusM) || 0) / 1000;
  const count = Number(n) || 0;
  return [
    { title: 'Profil', icon: 'profile', parts: [{ text: PROFILE_LABELS[profile] || profile || '–', strong: true }] },
    {
      title: 'Routen je Ziel · Radius der Startpunkte',
      parts: [
        { text: count.toLocaleString('de-DE'), strong: true },
        { text: count === 1 ? ' Route · ' : ' Routen · ' },
        { text: km.toLocaleString('de-DE', { maximumFractionDigits: 1 }), strong: true },
        { text: ' km' }
      ]
    }
  ];
}

/**
 * Attribution am Handy als ⓘ-Knopf starten.
 *
 * MapLibre schaltet unter 640 px selbst in die kompakte Form, öffnet sie aber
 * ausgeklappt: ein Band über die volle Breite, das über dem Streifen auf den
 * Zoom-Kacheln läge. Zugeklappt ist es ein ⓘ, das mit einem Tipp den vollen Text
 * zeigt — die Nennung (OSM/ODbL, OpenFreeMap, Zensus) bleibt so erreichbar.
 */
function collapseAttribution(matches) {
  if (!matches) return;
  const attrib = document.querySelector('.maplibregl-ctrl-attrib');
  if (!attrib) return;
  attrib.classList.remove('maplibregl-compact-show');
  attrib.removeAttribute('open');
}

// ── Zieh-Geste ──────────────────────────────────────────────────────────────────────
const DRAG_SLOP = 8;   // px — darunter ist es ein Tippen, keine Geste
const SNAP_MS = 180;   // Dauer der Schnapp-Animation beim Loslassen
const FLING = 0.4;     // px/ms — darüber entscheidet die Wurfrichtung, nicht der Weg

/**
 * Das Sheet mit dem Finger hochziehen bzw. zuschieben (1:1 nach der Unfallkarte).
 *
 * Zugeklappt blendet CSS alles außer dem Streifen aus — zum Ziehen muss der Inhalt aber
 * schon da sein. Während der Geste trägt das Panel darum `is-dragging`, rendert also in
 * voller Höhe, und wird per `transform` so weit nach unten geschoben, dass genau der
 * Streifen stehen bleibt. Beim Loslassen schnappt es in den näheren Zustand — oder in
 * den, in den geworfen wurde (Geschwindigkeit schlägt Weg).
 *
 * Kurzes Tippen (< DRAG_SLOP) ist KEINE Geste: bis der Finger die Schwelle reißt, rührt
 * dieser Code das DOM nicht an, und der Klick-Handler klappt um wie bisher. Nach einer
 * echten Geste darf umgekehrt kein Klick mehr durchrutschen.
 *
 * Bewusst ohne Filter auf `pointerType`: im schmalen Fenster geht es auch mit der Maus —
 * nur so lässt es sich im Test fahren.
 */
function setupSheetDrag(mql, panel, setCollapsed, publishPeek) {
  let drag = null;
  let settleTimer = null;

  const peekHeight = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-peek')) || 0;

  const swallowClick = () => {
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    panel.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => panel.removeEventListener('click', stop, { capture: true }), 400);
  };

  const settle = (open, span) => {
    panel.style.transition = `transform ${SNAP_MS}ms ease-out`;
    panel.style.transform = `translateY(${open ? 0 : span}px)`;
    // Kein `transitionend`: steht das Sheet schon am Ziel, käme es nie.
    settleTimer = setTimeout(() => {
      settleTimer = null;
      panel.style.transition = '';
      panel.style.transform = '';
      panel.classList.remove('is-dragging');
      setCollapsed(!open);
      publishPeek();
    }, SNAP_MS);
  };

  panel.addEventListener('pointerdown', (e) => {
    if (!mql.matches || e.button > 0) return;
    const collapsed = panel.classList.contains('collapsed');
    // Griff ist die Titelzeile, zugeklappt zusätzlich die Fußzeile. Aufgeklappt muss
    // der Inhalt darunter ganz normal scrollen dürfen.
    const onHandle = e.target.closest('.panel-title') || (collapsed && e.target.closest('.panel-footer'));
    if (!onHandle) return;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }

    // Nur merken. Angefasst wird erst, wenn aus dem Tippen eine Bewegung wird.
    drag = { id: e.pointerId, startY: e.clientY, collapsed, active: false, t: e.timeStamp, v: 0 };
    // Die Bewegung MUSS am Fenster hängen: der Finger zieht das Sheet unter sich weg.
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  });

  const startDrag = (e) => {
    const peek = peekHeight() || panel.getBoundingClientRect().height;
    panel.classList.add('is-dragging');             // jetzt rendert das Sheet voll …
    const span = Math.max(0, panel.getBoundingClientRect().height - peek);
    drag.span = span;
    drag.from = drag.collapsed ? span : 0;
    drag.offset = drag.from;
    // … und wird im selben Frame zurückgeschoben, sonst blitzt es offen auf.
    panel.style.transform = `translateY(${drag.from}px)`;
    if (drag.collapsed) panel.scrollTop = 0;
    drag.active = true;
    drag.startY = e.clientY;
  };

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.abs(e.clientY - drag.startY) < DRAG_SLOP) return;
      startDrag(e);
    }
    const dy = e.clientY - drag.startY;
    const next = Math.min(drag.span, Math.max(0, drag.from + dy));
    const dt = e.timeStamp - drag.t;
    if (dt > 0) drag.v = (next - drag.offset) / dt; // + = nach unten
    drag.t = e.timeStamp;
    drag.offset = next;
    panel.style.transform = `translateY(${next}px)`;
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { active, offset, span, v, from } = drag;
    drag = null;
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);

    if (!active) return; // Tippen: der Klick macht den Rest
    swallowClick();
    const open = e.type === 'pointercancel' ? from === 0
      : v < -FLING ? true
        : v > FLING ? false
          : offset < span / 2;
    settle(open, span);
  }
}

/**
 * Suche am Handy zum Lupen-Knopf falten. Liefert den Schalter zurück.
 * Der Knopf ist die vorhandene Eingabe-Umrandung — sie wird nur zusätzlich bedienbar
 * gemacht (Rolle, Tastatur, aria), statt ein zweites Element danebenzustellen.
 */
function setupGeocoderToggle(mql) {
  const geocoder = document.querySelector('.geocoder-map-control');
  const wrapper = geocoder?.querySelector('.geocoder-input-wrapper');
  const input = geocoder?.querySelector('#geocoder-input');
  if (!geocoder || !wrapper || !input) return () => {};

  const setCollapsed = (collapsed) => {
    geocoder.classList.toggle('is-collapsed', collapsed);
    // Nur zugeklappt ist die Umrandung selbst ein Knopf; aufgeklappt gehört der Fokus
    // ins Eingabefeld.
    if (collapsed) {
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute('tabindex', '0');
      wrapper.setAttribute('aria-label', 'Adresse suchen');
      wrapper.setAttribute('aria-expanded', 'false');
    } else {
      wrapper.removeAttribute('role');
      wrapper.removeAttribute('tabindex');
      wrapper.removeAttribute('aria-label');
      wrapper.removeAttribute('aria-expanded');
    }
  };

  const expand = () => {
    if (!geocoder.classList.contains('is-collapsed')) return;
    setCollapsed(false);
    input.focus();
  };

  wrapper.addEventListener('click', expand);
  wrapper.addEventListener('keydown', (e) => {
    if (e.target !== wrapper) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(); }
  });

  // Wieder einklappen, sobald die Suche aus dem Blick ist — aber nur mit LEEREM Feld:
  // ein getippter Suchbegriff soll nicht unter dem Finger verschwinden.
  const collapseIfIdle = () => {
    if (mql.matches && !input.value.trim()) setCollapsed(true);
  };
  input.addEventListener('blur', () => setTimeout(collapseIfIdle, 150)); // Klick auf ein Ergebnis zuerst
  // × leert das Feld (Geocoder.clear) — am Handy heißt das auch: Suche wieder wegräumen
  geocoder.querySelector('.geocoder-clear')?.addEventListener('click', () => {
    setTimeout(() => { if (document.activeElement !== input) collapseIfIdle(); }, 0);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    collapseIfIdle();
  });

  return setCollapsed;
}
