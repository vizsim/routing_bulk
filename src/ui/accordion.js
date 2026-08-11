// ==== Accordion: einklappbare Panel-Bereiche ====
//
// Jede .config-block-Sektion wird einklappbar: der Titel (h4) togglet, der
// restliche Inhalt wird in einen animierbaren Wrapper verschoben. Der Zustand
// wird pro Block in localStorage gemerkt; ohne gespeicherten Zustand gilt
// data-default-collapsed aus dem Markup.

const STORAGE_KEY = 'routing_bulk.panel.collapsed';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage nicht verfügbar (z.B. Privatmodus) — dann eben ohne Merken
  }
}

export const Accordion = {
  _state: {},

  init() {
    this._state = loadState();

    document.querySelectorAll('.config-block').forEach(block => {
      const title = block.querySelector('.config-block-title');
      if (!title || block.dataset.accordion === '1') return;
      block.dataset.accordion = '1';

      // Inhalt (alles nach dem Titel) in einen animierbaren Doppel-Wrapper
      // verschieben (grid-template-rows 1fr/0fr braucht inner mit min-height 0)
      const body = document.createElement('div');
      body.className = 'config-block-body';
      const inner = document.createElement('div');
      inner.className = 'config-block-body-inner';
      body.appendChild(inner);
      while (title.nextSibling) inner.appendChild(title.nextSibling);
      block.appendChild(body);

      const key = title.id || title.textContent.trim();
      const stored = this._state[key];
      const collapsed = stored != null ? stored : block.dataset.defaultCollapsed === 'true';
      block.classList.toggle('collapsed', collapsed);

      // Titel als Toggle (klick- und tastaturbedienbar)
      title.setAttribute('role', 'button');
      title.setAttribute('tabindex', '0');
      title.setAttribute('aria-expanded', String(!collapsed));
      const toggle = () => {
        const nowCollapsed = !block.classList.contains('collapsed');
        block.classList.toggle('collapsed', nowCollapsed);
        title.setAttribute('aria-expanded', String(!nowCollapsed));
        this._state[key] = nowCollapsed;
        saveState(this._state);
      };
      title.addEventListener('click', toggle);
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  },

  /**
   * Öffnet einen Block programmatisch (z.B. Nachfrage-Block bei Kapazitätswarnung).
   * @param {string} headingId - id des .config-block-title (z.B. 'block-nachfrage-heading')
   */
  expand(headingId) {
    const title = document.getElementById(headingId);
    const block = title && title.closest('.config-block');
    if (!block || !block.classList.contains('collapsed')) return;
    block.classList.remove('collapsed');
    title.setAttribute('aria-expanded', 'true');
    this._state[headingId] = false;
    saveState(this._state);
  }
};
