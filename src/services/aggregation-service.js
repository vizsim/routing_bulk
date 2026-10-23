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
//
// Infrastruktur (docs/INFRA_ANSICHT.md): Jede Kante führt zusätzlich je
// Laufrichtung Zählung und Path-Detail-Werte (dir.ab / dir.ba). Die Geometrie
// liegt immer in Schlüsselrichtung a→b; 'ab' heißt "entlang coords". Viele
// Encoded Values sind richtungsabhängig (sidewalk = Gehweg rechts in
// Laufrichtung, bicycle_infra, max_speed …), deshalb die Trennung.
import { API } from '../domain/api.js';
import { Geo } from '../domain/geo.js';

const newDir = () => ({ count: 0, byProfile: {}, attrs: {} });

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
   * @returns {Array} - [{key, coords, count, byProfile, bySource, edgeId?, lengthM?, dir?}]
   *   dir = { ab: {count, byProfile, attrs}, ba: {…} } nur für GraphHopper-Kanten
   */
  aggregateRoutes(items) {
    const edgeMap = new Map(); // key -> {count, coords, byProfile, bySource}
    const rnd = (v) => Math.round(v * 1e6) / 1e6; // ~10cm, robust gegen Float-Rauschen
    let skipped = 0;

    const bump = (key, coordsLatLng, profile, source, weight) => {
      let entry = edgeMap.get(key);
      if (!entry) {
        entry = { key, count: 0, coords: coordsLatLng, byProfile: {}, bySource: {} };
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
      // gibt jeder Route ein Gewicht (Wege ÷ Stichprobengröße)
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

      // Werte der übrigen Path Details je edge_id-Intervall (Infrastruktur)
      const detailsAt = API.makeDetailCursor(resp.paths[0].details);

      for (const [from, to, edgeId] of intervals) {
        if (!(to > from)) continue;
        const slice = coords.slice(from, to + 1);
        const a = `${rnd(slice[0][0])},${rnd(slice[0][1])}`;
        const b = `${rnd(slice[slice.length - 1][0])},${rnd(slice[slice.length - 1][1])}`;
        // Läuft die Route in Schlüsselrichtung (a→b)? Dann entspricht ihre
        // Laufrichtung der gespeicherten Geometrie, sonst der Gegenrichtung.
        const along = a < b;
        const key = along ? `${edgeId}:${a}:${b}` : `${edgeId}:${b}:${a}`;

        const latlng = slice.map(([lon, lat]) => [lat, lon]);
        if (!along) latlng.reverse(); // Geometrie immer a→b
        const entry = bump(key, latlng, profile, source, weight);

        if (entry.edgeId === undefined) {
          entry.edgeId = edgeId;
          entry.lengthM = Geo.routeLengthMeters(entry.coords);
          entry.dir = { ab: newDir(), ba: newDir() };
        }
        const d = along ? entry.dir.ab : entry.dir.ba;
        d.count += weight;
        if (profile) d.byProfile[profile] = (d.byProfile[profile] || 0) + weight;
        // Werte sind je Kante und Richtung konstant; Fuß- und Rad-Routen
        // liefern verschiedene Details → zusammenführen, erster Wert gilt
        const values = detailsAt(from);
        for (const k in values) {
          if (!(k in d.attrs) && values[k] !== undefined) d.attrs[k] = values[k];
        }
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
