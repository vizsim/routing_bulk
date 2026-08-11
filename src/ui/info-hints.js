// ==== Info-Hints: Tooltip-Positionierung für die ⓘ-Icons im Panel ====
//
// Die Tooltips sind position:fixed, damit sie nicht vom scrollenden Panel
// (overflow) abgeschnitten werden. CSS blendet sie per :hover ein; hier wird
// beim Hovern nur die Position am Icon ausgerichtet und im Viewport geklemmt.

const MARGIN = 8;

export function initInfoHints(root = document) {
  root.querySelectorAll('.info-hint').forEach(hint => {
    const text = hint.querySelector('.info-hint-text');
    if (!text) return;
    hint.addEventListener('mouseenter', () => {
      // visibility:hidden hat Layout — Messung funktioniert vor dem Einblenden
      const icon = hint.getBoundingClientRect();
      const tip = text.getBoundingClientRect();

      let left = icon.left + icon.width / 2 - tip.width / 2;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - tip.width - MARGIN));

      // Bevorzugt über dem Icon; darunter, wenn oben kein Platz ist
      let top = icon.top - tip.height - MARGIN;
      if (top < MARGIN) top = icon.bottom + MARGIN;

      text.style.left = `${left}px`;
      text.style.top = `${top}px`;
    });
  });
}
