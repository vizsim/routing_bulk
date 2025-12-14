// ==== Aggregation-Service: Routen-Aggregierung ====
const AggregationService = {
  // Einfache Aggregierungsmethode (schnell, stabil)
  aggregateRoutesSimple(routeDataArray) {
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
  },
  
  // Lazy Overlap Splitting Methode (präzise, erkennt überlappende Segmente)
  aggregateRoutesLazyOverlap(routeDataArray) {
    // Parameter für präzise Overlap-Erkennung
    // Aktuell aktiv: Mittel-Variante (gut ausbalanciert)
    const GRID_SIZE = 0.00008; // ~8m in Grad für Grid-Normalisierung (präziser)
    const GRID_CELL_SIZE = 0.0001; // ~10m für Grid-Index (kleinere Zellen = mehr Checks, aber präziser)
    const EPSILON_DIST = 0.0001; // ~10m Toleranz für Overlap-Erkennung (toleranter)
    const MAX_ANGLE_RAD = Math.PI / 8; // ~22.5 Grad Winkel-Toleranz (toleranter für Kurven)
    
    // Langsamere, aber bessere Variante (maximale Präzision)
    // const GRID_SIZE = 0.00005; // ~5m in Grad für Grid-Normalisierung (sehr präzise)
    // const GRID_CELL_SIZE = 0.00008; // ~8m für Grid-Index (sehr kleine Zellen = viele Checks)
    // const EPSILON_DIST = 0.00012; // ~12m Toleranz für Overlap-Erkennung (sehr tolerant)
    // const MAX_ANGLE_RAD = Math.PI / 6; // ~30 Grad Winkel-Toleranz (sehr tolerant)
    
    // Schnellere, aber schlechtere Variante (weniger präzise)
    // const GRID_SIZE = 0.00015; // ~15m in Grad für Grid-Normalisierung (weniger präzise)
    // const GRID_CELL_SIZE = 0.0002; // ~20m für Grid-Index (größere Zellen = weniger Checks)
    // const EPSILON_DIST = 0.00008; // ~8m Toleranz für Overlap-Erkennung (weniger tolerant)
    // const MAX_ANGLE_RAD = Math.PI / 12; // ~15 Grad Winkel-Toleranz (weniger tolerant)
    
    // Schritt 1: Sammle alle Segmente
    const allSegments = [];
    routeDataArray.forEach(routeCoords => {
      if (!routeCoords || routeCoords.length < 2) return;
      for (let i = 0; i < routeCoords.length - 1; i++) {
        allSegments.push({
          start: routeCoords[i],
          end: routeCoords[i + 1],
          id: allSegments.length
        });
      }
    });
    
    const grid = new Map(); // Grid-Zelle -> [segment indices]
    
    // Hilfsfunktion: Projektion eines Punktes auf ein Segment
    const projectPointToSegment = (p, a, b) => {
      const ab = [b[0] - a[0], b[1] - a[1]];
      const ap = [p[0] - a[0], p[1] - a[1]];
      const ab2 = ab[0] * ab[0] + ab[1] * ab[1];
      
      if (ab2 === 0) {
        return { t: 0, proj: a, dist: Math.hypot(ap[0], ap[1]) };
      }
      
      let t = (ap[0] * ab[0] + ap[1] * ab[1]) / ab2;
      t = Math.max(0, Math.min(1, t));
      const proj = [a[0] + ab[0] * t, a[1] + ab[1] * t];
      const dist = Math.hypot(p[0] - proj[0], p[1] - proj[1]);
      return { t, proj, dist };
    };
    
    // Hilfsfunktion: Winkel zwischen zwei Segmenten
    const angleBetweenSegments = (A1, A2, B1, B2) => {
      const vA = [A2[0] - A1[0], A2[1] - A1[1]];
      const vB = [B2[0] - B1[0], B2[1] - B1[1]];
      const lenA = Math.hypot(vA[0], vA[1]);
      const lenB = Math.hypot(vB[0], vB[1]);
      if (lenA === 0 || lenB === 0) return 0;
      const dot = (vA[0] * vB[0] + vA[1] * vB[1]) / (lenA * lenB);
      return Math.acos(Math.max(-1, Math.min(1, dot)));
    };
    
    // Hilfsfunktion: Prüfe ob Segment B auf Segment A liegt
    const segmentCoversSegment = (A1, A2, B1, B2) => {
      const angle = angleBetweenSegments(A1, A2, B1, B2);
      if (Math.min(angle, Math.PI - angle) > MAX_ANGLE_RAD) return null;
      
      const p1 = projectPointToSegment(B1, A1, A2);
      const p2 = projectPointToSegment(B2, A1, A2);
      
      if (p1.dist > EPSILON_DIST || p2.dist > EPSILON_DIST) return null;
      
      return {
        t0: Math.min(p1.t, p2.t),
        t1: Math.max(p1.t, p2.t)
      };
    };
    
    // Hilfsfunktion: Teile Segment an t-Werten
    const splitSegmentAtTs = (A1, A2, t0, t1) => {
      const ab = [A2[0] - A1[0], A2[1] - A1[1]];
      const p0 = [A1[0] + ab[0] * t0, A1[1] + ab[1] * t0];
      const p1 = [A1[0] + ab[0] * t1, A1[1] + ab[1] * t1];
      
      const result = [];
      if (t0 > 1e-6) {
        result.push([A1, p0]);
      }
      if (t1 - t0 > 1e-6) {
        result.push([p0, p1]);
      }
      if (t1 < 1 - 1e-6) {
        result.push([p1, A2]);
      }
      
      return result.filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6);
    };
    
    // Hilfsfunktion: Grid-Zellen für Segment
    const cellsForSegment = (a, b) => {
      const minX = Math.min(a[0], b[0]);
      const maxX = Math.max(a[0], b[0]);
      const minY = Math.min(a[1], b[1]);
      const maxY = Math.max(a[1], b[1]);
      
      const cells = [];
      for (let x = Math.floor(minX / GRID_CELL_SIZE); x <= Math.floor(maxX / GRID_CELL_SIZE); x++) {
        for (let y = Math.floor(minY / GRID_CELL_SIZE); y <= Math.floor(maxY / GRID_CELL_SIZE); y++) {
          cells.push(`${x}:${y}`);
        }
      }
      return cells;
    };
    
    // Hilfsfunktion: Normalisiere Koordinate für Matching-Key
    const normalizeForKey = (coord) => {
      return [
        Math.round(coord[0] / GRID_SIZE) * GRID_SIZE,
        Math.round(coord[1] / GRID_SIZE) * GRID_SIZE
      ];
    };
    
    // Hilfsfunktion: Erstelle normalisierten Key für Segment
    const createSegmentKey = (p1, p2) => {
      const np1 = normalizeForKey(p1);
      const np2 = normalizeForKey(p2);
      const key = np1[0] < np2[0] || (np1[0] === np2[0] && np1[1] < np2[1])
        ? `${np1[0]},${np1[1]}-${np2[0]},${np2[1]}`
        : `${np2[0]},${np2[1]}-${np1[0]},${np1[1]}`;
      return key;
    };
    
    // Schritt 2: Baue Grid-Index auf
    allSegments.forEach((seg, idx) => {
      cellsForSegment(seg.start, seg.end).forEach(cell => {
        if (!grid.has(cell)) grid.set(cell, []);
        grid.get(cell).push(idx);
      });
    });
    
    // Schritt 3: Finde Overlaps und sammle Split-Punkte für jedes Segment
    const segmentSplitPoints = new Map(); // idx -> Set von t-Werten
    
    allSegments.forEach((seg, idx) => {
      if (!segmentSplitPoints.has(idx)) {
        segmentSplitPoints.set(idx, new Set([0, 1])); // Start und Ende
      }
      
      const cells = cellsForSegment(seg.start, seg.end);
      const candidateIndices = new Set();
      cells.forEach(cell => {
        const indices = grid.get(cell);
        if (indices) {
          indices.forEach(i => {
            if (i !== idx) {
              candidateIndices.add(i);
            }
          });
        }
      });
      
      // Prüfe Overlaps: Wenn other auf seg liegt, splitte seg
      candidateIndices.forEach(otherIdx => {
        const other = allSegments[otherIdx];
        
        // other liegt auf seg? (other ist das kurze Segment)
        const overlap = segmentCoversSegment(seg.start, seg.end, other.start, other.end);
        if (overlap) {
          segmentSplitPoints.get(idx).add(overlap.t0);
          segmentSplitPoints.get(idx).add(overlap.t1);
        }
        
        // seg liegt auf other? (seg ist das kurze Segment)
        const overlapReverse = segmentCoversSegment(other.start, other.end, seg.start, seg.end);
        if (overlapReverse) {
          if (!segmentSplitPoints.has(otherIdx)) {
            segmentSplitPoints.set(otherIdx, new Set([0, 1]));
          }
          segmentSplitPoints.get(otherIdx).add(overlapReverse.t0);
          segmentSplitPoints.get(otherIdx).add(overlapReverse.t1);
        }
      });
    });
    
    // Schritt 4: Splitte alle Segmente an ihren Split-Punkten
    const finalSegments = [];
    allSegments.forEach((seg, idx) => {
      const splitPoints = segmentSplitPoints.get(idx);
      if (splitPoints && splitPoints.size > 2) {
        // Sortiere Split-Punkte
        const sortedPoints = Array.from(splitPoints).sort((a, b) => a - b);
        
        // Teile Segment
        for (let i = 0; i < sortedPoints.length - 1; i++) {
          const t0 = sortedPoints[i];
          const t1 = sortedPoints[i + 1];
          if (t1 - t0 > 1e-6) {
            const ab = [seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]];
            const p0 = [seg.start[0] + ab[0] * t0, seg.start[1] + ab[1] * t0];
            const p1 = [seg.start[0] + ab[0] * t1, seg.start[1] + ab[1] * t1];
            finalSegments.push({ start: p0, end: p1 });
          }
        }
      } else {
        // Kein Split nötig
        finalSegments.push(seg);
      }
    });
    
    // Schritt 4: Aggregiere alle finalen Segmente
    const segmentMap = new Map();
    finalSegments.forEach(seg => {
      const key = createSegmentKey(seg.start, seg.end);
      if (!segmentMap.has(key)) {
        segmentMap.set(key, { count: 0, segments: [] });
      }
      segmentMap.get(key).count++;
      segmentMap.get(key).segments.push({ start: seg.start, end: seg.end });
    });
    
    // Aggregierte Segmente zurückgeben
    const aggregatedSegments = [];
    segmentMap.forEach((entry, key) => {
      const representative = entry.segments[0];
      aggregatedSegments.push({
        start: representative.start,
        end: representative.end,
        count: entry.count
      });
    });
    
    return aggregatedSegments;
  },
  
  // Hauptfunktion - wählt Methode basierend auf CONFIG
  aggregateRoutes(routeDataArray) {
    if (CONFIG.AGGREGATION_METHOD === "lazyOverlap") {
      return this.aggregateRoutesLazyOverlap(routeDataArray);
    } else {
      return this.aggregateRoutesSimple(routeDataArray);
    }
  }
};

