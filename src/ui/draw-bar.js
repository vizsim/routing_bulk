// ==== Zeichenleiste: Hinweis + Punkt zurück / Abbrechen / Fertig ====
//
// Wie die Zeichenleiste der Unfallkarte: oben mittig (am Handy neben dem
// Lupen-Knopf), solange ein Bereich für die Gebietsanalyse gezeichnet wird.
// Vorher stand der Hinweis im Panel („Doppelklick oder Enter: fertig“) — am
// Handy gibt es weder Doppelklick noch Enter, und das Panel ist dort beim
// Zeichnen zugeklappt.

export const DrawBar = {
  _el: null,
  _handlers: {},

  _build() {
    const el = document.createElement('div');
    el.className = 'draw-bar';
    el.id = 'draw-bar';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', 'Bereich zeichnen');
    el.hidden = true;
    el.innerHTML = `
      <p class="draw-hint" aria-live="polite"></p>
      <div class="draw-actions">
        <button type="button" class="draw-undo" title="Letzten Punkt entfernen (Rücktaste)">Punkt zurück</button>
        <button type="button" class="draw-cancel" title="Zeichnen abbrechen (Esc)">Abbrechen</button>
        <button type="button" class="draw-done" title="Bereich schließen (Enter oder Doppelklick)">Fertig</button>
      </div>`;
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      if (btn.classList.contains('draw-undo')) this._handlers.onUndo?.();
      else if (btn.classList.contains('draw-cancel')) this._handlers.onCancel?.();
      else if (btn.classList.contains('draw-done')) this._handlers.onDone?.();
    });
    document.body.appendChild(el);
    return el;
  },

  /** Leiste zeigen. @param {{onUndo, onCancel, onDone}} handlers */
  show(handlers = {}) {
    if (!this._el) this._el = this._build();
    this._handlers = handlers;
    this.update(0);
    this._el.hidden = false;
  },

  /** Hinweis und Knöpfe an die Zahl gesetzter Punkte anpassen. */
  update(points) {
    if (!this._el) return;
    this._el.querySelector('.draw-hint').innerHTML = hintText(points);
    this._el.querySelector('.draw-undo').disabled = points === 0;
    this._el.querySelector('.draw-done').disabled = points < 3;
  },

  hide() {
    if (this._el) this._el.hidden = true;
    this._handlers = {};
  },

  isVisible() {
    return !!this._el && !this._el.hidden;
  }
};

/** Hinweistext je nach Fortschritt (rein, damit testbar). */
export function hintText(points) {
  if (points <= 0) return '<strong>Bereich zeichnen:</strong> Punkte in die Karte setzen';
  const n = points === 1 ? '1 Punkt' : `${points} Punkte`;
  if (points < 3) return `<strong>${n}</strong> — mindestens 3 für einen Bereich`;
  return `<strong>${n}</strong> — weiter setzen oder „Fertig“`;
}
