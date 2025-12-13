// ==== Aggregierung ====
const Aggregation = {
  aggregateRoutes(routeDataArray) {
    const GRID_SIZE = 0.0001; // ~10m in Grad für Grid-Normalisierung (nur für Matching)
    const segmentMap = new Map(); // Key -> {count, segments[]}
    
    // Hilfsfunktion: Normalisiere Koordinate für Matching-Key (nur für Gruppierung)
    const normalizeForKey = (coord) => {
      return [
        Math.round(coord[0] / GRID_SIZE) * GRID_SIZE,
        Math.round(coord[1] / GRID_SIZE) * GRID_SIZE
      ];
    };
    
    // Hilfsfunktion: Erstelle normalisierten Key für Segment (nur für Matching)
    const createSegmentKey = (p1, p2) => {
      const np1 = normalizeForKey(p1);
      const np2 = normalizeForKey(p2);
      // Sortiere, damit Richtung egal ist
      const key = np1[0] < np2[0] || (np1[0] === np2[0] && np1[1] < np2[1])
        ? `${np1[0]},${np1[1]}-${np2[0]},${np2[1]}`
        : `${np2[0]},${np2[1]}-${np1[0]},${np1[1]}`;
      return key;
    };
    
    // Alle Routen durchgehen und Segmente sammeln
    routeDataArray.forEach(routeCoords => {
      if (!routeCoords || routeCoords.length < 2) return;
      
      for (let i = 0; i < routeCoords.length - 1; i++) {
        const originalStart = routeCoords[i];
        const originalEnd = routeCoords[i + 1];
        const key = createSegmentKey(originalStart, originalEnd);
        
        if (!segmentMap.has(key)) {
          segmentMap.set(key, {
            count: 0,
            segments: [] // Speichere originale Segmente für Visualisierung
          });
        }
        
        const entry = segmentMap.get(key);
        entry.count++;
        // Speichere originale Koordinaten (für Visualisierung)
        entry.segments.push({
          start: originalStart,
          end: originalEnd
        });
      }
    });
    
    // Aggregierte Segmente zurückgeben (mit originalen Koordinaten)
    const aggregatedSegments = [];
    segmentMap.forEach((entry, key) => {
      // Verwende das erste Segment als Repräsentant (oder Durchschnitt)
      // Für bessere Visualisierung: verwende das erste Segment
      const representative = entry.segments[0];
      aggregatedSegments.push({
        start: representative.start,
        end: representative.end,
        count: entry.count
      });
    });
    
    return aggregatedSegments;
  }
};

