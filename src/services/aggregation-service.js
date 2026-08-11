// ==== Aggregation-Service: Routen-Aggregierung über GraphHopper-Kanten-IDs ====
//
// Zwei Routen benutzen genau dann dieselbe Kante, wenn GraphHopper dieselbe
// edge_id liefert (Path Detail, siehe API.fetchRoute) — kein Grid-Tuning,
// keine Winkel-Toleranzen, kein Overlap-Splitting. Gegenläufige Richtungen
// haben dieselbe edge_id und werden zusammengezählt (für "alle Routen zum
// selben Ziel" erwünscht).
//
// Die früheren geometrischen Methoden (simple/lazyOverlap) wurden entfernt;
// sie waren Workarounds für das Matching-Problem, das die Kanten-IDs exakt
// lösen (siehe docs/AGGREGATION_PROBLEM.md).
import { API } from '../domain/api.js';

export const AggregationService = {
  /**
   * Aggregiert Routen über die edge_id-Intervalle ihrer GraphHopper-Responses.
   *
   * Snap-Kanten am Start/Ziel: GraphHopper meldet auch für die virtuellen
   * Randstücke die ID der zugrundeliegenden echten Kante, traversiert sie aber
   * ggf. nur teilweise (ab Snap-Punkt). Deshalb ist der Schlüssel edge_id PLUS
   * richtungsnormalisierte Endpunkte des tatsächlich gefahrenen Stücks —
   * volle Traversierungen matchen exakt, unterschiedliche Teilstücke bleiben
   * getrennt (Zubringer-Stummel mit count=1).
   *
   * Akzeptiert Roh-Responses ODER Einträge {response, profile, startSource}
   * (aus routeResponses) — mit Einträgen wird zusätzlich pro Verkehrsmittel
   * (byProfile) und Quelle (bySource: residential/transit) gezählt.
   *
   * @param {Array} items - GH-Responses oder {response, profile?, startSource?}
   * @returns {Array} - [{coords, count, byProfile, bySource}]
   */
  aggregateRoutes(items) {
    const edgeMap = new Map(); // key -> {count, coords, byProfile, bySource}
    const rnd = (v) => Math.round(v * 1e6) / 1e6; // ~10cm, robust gegen Float-Rauschen
    let skipped = 0;

    const bump = (key, coordsLatLng, profile, source, weight) => {
      let entry = edgeMap.get(key);
      if (!entry) {
        entry = { count: 0, coords: coordsLatLng, byProfile: {}, bySource: {} };
        edgeMap.set(key, entry);
      }
      entry.count += weight;
      if (profile) entry.byProfile[profile] = (entry.byProfile[profile] || 0) + weight;
      if (source) entry.bySource[source] = (entry.bySource[source] || 0) + weight;
      return entry;
    };

    (items || []).forEach(item => {
      // Roh-Response oder routeResponses-Eintrag normalisieren
      const resp = item && item.paths ? item : item?.response;
      const profile = (item && !item.paths && item.profile) || null;
      const source = (item && !item.paths && item.startSource) || null;
      // Gewicht: 1 im Normalfall; die Gebietsanalyse rechnet Stichproben und
      // gibt jeder Route ein Gewicht (Fahrten ÷ Stichprobengröße)
      const weight = (item && !item.paths && typeof item.weight === 'number') ? item.weight : 1;

      // ÖPNV-Verbindungen (Beta): Aggregation pro Leg — gleiche Linie mit
      // gleichem Ein- und Ausstieg zählt zusammen (Fußweg-Legs über ihre
      // Endpunkte). Gröber als die edge_id-Aggregation: Teilüberlappungen
      // derselben Linie (früherer Ausstieg) werden nicht gesplittet.
      if (resp && resp.__transit) {
        for (const leg of resp.__transit.legs) {
          if (!leg.coords || leg.coords.length < 2) continue;
          const a = `${rnd(leg.coords[0][0])},${rnd(leg.coords[0][1])}`;
          const b = `${rnd(leg.coords[leg.coords.length - 1][0])},${rnd(leg.coords[leg.coords.length - 1][1])}`;
          const key = leg.mode === 'WALK'
            ? `ptw:${a}:${b}`
            : `pt:${leg.mode}:${leg.routeId || leg.route || ''}:${leg.fromStopId || a}:${leg.toStopId || b}`;
          bump(key, leg.coords, profile, source, weight);
        }
        return;
      }

      const coords = resp?.paths?.[0]?.points?.coordinates; // [lon, lat]
      const intervals = resp ? API.extractEdgeIntervals(resp) : null;
      if (!coords || !intervals) {
        if (resp) skipped++;
        return;
      }

      for (const [from, to, edgeId] of intervals) {
        if (!(to > from)) continue;
        const slice = coords.slice(from, to + 1);
        const a = `${rnd(slice[0][0])},${rnd(slice[0][1])}`;
        const b = `${rnd(slice[slice.length - 1][0])},${rnd(slice[slice.length - 1][1])}`;
        const key = a < b ? `${edgeId}:${a}:${b}` : `${edgeId}:${b}:${a}`;

        bump(key, slice.map(([lon, lat]) => [lat, lon]), profile, source, weight);
      }
    });

    if (skipped > 0) {
      console.warn(`[Aggregation] ${skipped} Route(n) ohne edge_id-Details übersprungen — liefert der Routing-Server Path Details?`);
    }

    const aggregatedSegments = [];
    edgeMap.forEach(entry => {
      aggregatedSegments.push(entry);
    });
    return aggregatedSegments;
  }
};
