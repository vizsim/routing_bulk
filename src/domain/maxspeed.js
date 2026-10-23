// ==== Tempolimit eines OSM-Wegs (maxspeed-Kacheln der Unfallkarte) ====
//
// Eine Regel für die Kartenebene „Zulässige Geschwindigkeit“ (als MapLibre-Ausdruck
// in visualization/context-layers.js) und für die Querungen (domain/crossing-roads.js).

/** maxspeed:type ohne Zahl → km/h (Zone 30/20, inner-/außerorts, verkehrsberuhigt) */
export const MAXSPEED_TYPE_KMH = { 'DE:zone30': 30, 'DE:zone20': 20, 'DE:urban': 50, 'DE:rural': 100, 'DE:living_street': 7 };
/** Verkehrsberuhigter Bereich ohne Angabe: Schritttempo */
export const LIVING_STREET_KMH = 7;
/** maxspeed=none (unbegrenzt) */
export const UNLIMITED_KMH = 999;

/**
 * Tempo eines Wegs in km/h: maxspeed, sonst ein Richtungswert; ohne Zahl helfen
 * maxspeed:type und der verkehrsberuhigte Bereich.
 * @param {Object} p - Kachel-Properties (maxspeed, maxspeed_forward, …, maxspeed_type, highway)
 * @returns {number|null} km/h, UNLIMITED_KMH oder null = keine Angabe
 */
export function speedOfWay(p) {
  const raw = String(p.maxspeed ?? p.maxspeed_forward ?? p.maxspeed_backward ?? '').trim();
  if (raw.toLowerCase() === 'none') return UNLIMITED_KMH;
  const n = Number(raw);
  if (raw && Number.isFinite(n) && n > 0) return n;
  if (MAXSPEED_TYPE_KMH[p.maxspeed_type] != null) return MAXSPEED_TYPE_KMH[p.maxspeed_type];
  if (p.highway === 'living_street') return LIVING_STREET_KMH;
  return null;
}

/** „50 km/h“, „Schritttempo“, „unbegrenzt“ bzw. „Tempo nicht erfasst“. */
export function formatSpeed(v) {
  if (v == null) return 'Tempo nicht erfasst';
  if (v >= UNLIMITED_KMH) return 'unbegrenzt';
  if (v <= LIVING_STREET_KMH) return 'Schritttempo';
  return `${Math.round(v)} km/h`;
}
