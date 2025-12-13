# Aggregierungs-Parameter: Anpassungs-Guide

## Parameter-Übersicht

```javascript
const GRID_SIZE = 0.0001;        // ~10m - Normalisierung für finales Matching
const GRID_CELL_SIZE = 0.0002;   // ~20m - Räumlicher Index (Performance)
const EPSILON_DIST = 0.00005;    // ~5m - Toleranz für Overlap-Erkennung
const MAX_ANGLE_RAD = Math.PI/12; // ~15° - Winkel-Toleranz
```

## Parameter-Details

### 1. GRID_SIZE (0.0001 = ~10m)

**Was macht es?**
- Normalisiert Koordinaten für das finale Segment-Matching
- Segmente mit normalisierten Koordinaten werden als "gleich" erkannt

**Anpassung:**
- **Kleiner** (z.B. 0.00005 = ~5m): 
  - ✅ Präziseres Matching
  - ❌ Mehr Segmente werden nicht erkannt (zu strikt)
  - ❌ Mehr Fragmentierung
  
- **Größer** (z.B. 0.0002 = ~20m):
  - ✅ Weniger Fragmentierung
  - ✅ Mehr Segmente werden als gleich erkannt
  - ❌ Kann falsche Matches erzeugen (Segmente die nicht wirklich gleich sind)

**Empfehlung**: 0.0001 (~10m) ist ein guter Kompromiss

---

### 2. GRID_CELL_SIZE (0.0002 = ~20m)

**Was macht es?**
- Größe der Grid-Zellen für räumlichen Index
- Bestimmt, wie viele Segmente als Kandidaten für Overlap-Checks geprüft werden

**Anpassung:**
- **Kleiner** (z.B. 0.0001 = ~10m):
  - ✅ Weniger Kandidaten pro Check (schneller)
  - ❌ Könnte relevante Segmente übersehen
  - ❌ Mehr Grid-Zellen = mehr Speicher
  
- **Größer** (z.B. 0.0005 = ~50m):
  - ✅ Weniger Grid-Zellen (weniger Speicher)
  - ❌ Mehr Kandidaten pro Check (langsamer)
  - ✅ Weniger Chance, Segmente zu übersehen

**Empfehlung**: 0.0002 (~20m) oder 2× GRID_SIZE

---

### 3. EPSILON_DIST (0.00005 = ~5m) ⚠️ WICHTIG

**Was macht es?**
- Maximale Distanz, die ein Punkt vom Segment haben darf, um als "auf dem Segment liegend" zu gelten
- **Kritisch für Overlap-Erkennung!**

**Anpassung:**
- **Kleiner** (z.B. 0.00002 = ~2m):
  - ✅ Präzisere Overlap-Erkennung
  - ❌ Kann echte Overlaps übersehen (zu strikt)
  - ❌ Problem: Routen verlaufen nicht exakt identisch (GPS-Ungenauigkeit, Routing-Algorithmus)
  
- **Größer** (z.B. 0.0001 = ~10m):
  - ✅ Erkennt mehr Overlaps (auch bei leichten Abweichungen)
  - ❌ Kann falsche Overlaps erkennen (Segmente die parallel aber nicht identisch sind)
  - ⚠️ **Achtung**: Zu groß kann zu falschen Splits führen

**Empfehlung**: 
- **Start**: 0.00005 (~5m) - guter Startwert
- **Wenn Overlaps übersehen werden**: Auf 0.00008 (~8m) erhöhen
- **Wenn falsche Overlaps erkannt werden**: Auf 0.00003 (~3m) verringern

---

### 4. MAX_ANGLE_RAD (π/12 = ~15°) ⚠️ WICHTIG

**Was macht es?**
- Maximale Winkel-Differenz zwischen zwei Segmenten, um als "parallel" zu gelten
- Verhindert, dass senkrechte oder stark abweichende Segmente als Overlap erkannt werden

**Anpassung:**
- **Kleiner** (z.B. π/24 = ~7.5°):
  - ✅ Striktere Parallelitäts-Prüfung
  - ❌ Kann Overlaps übersehen, wenn Routen leicht unterschiedliche Richtungen haben
  
- **Größer** (z.B. π/6 = ~30°):
  - ✅ Erkennt Overlaps auch bei größeren Winkel-Unterschieden
  - ❌ Kann falsche Overlaps erkennen (z.B. bei Kurven)

**Empfehlung**: 
- **Start**: π/12 (~15°) - guter Kompromiss
- **Bei Kurven/Abzweigungen**: Auf π/18 (~10°) verringern
- **Bei sehr ähnlichen Routen**: Auf π/8 (~22.5°) erhöhen

---

## Typische Anpassungs-Szenarien

### Problem: Overlaps werden nicht erkannt

**Symptom**: Lange/kurze Segmente werden nicht aggregiert

**Lösung**:
```javascript
const EPSILON_DIST = 0.00008;    // Erhöhen auf ~8m
const MAX_ANGLE_RAD = Math.PI / 8; // Erhöhen auf ~22.5°
```

---

### Problem: Falsche Overlaps werden erkannt

**Symptom**: Segmente die nicht wirklich überlappen werden gesplittet

**Lösung**:
```javascript
const EPSILON_DIST = 0.00003;    // Verringern auf ~3m
const MAX_ANGLE_RAD = Math.PI / 18; // Verringern auf ~10°
```

---

### Problem: Zu langsam bei vielen Routen

**Symptom**: Performance-Probleme

**Lösung**:
```javascript
const GRID_CELL_SIZE = 0.0003;   // Erhöhen auf ~30m (weniger Checks)
```

---

### Problem: Zu viele kleine Fragmente

**Symptom**: Viele sehr kurze Segmente in der Visualisierung

**Lösung**:
```javascript
const GRID_SIZE = 0.00015;       // Erhöhen auf ~15m (weniger Fragmentierung)
```

---

## Empfohlene Startwerte

Für **städtische Routen** (viele Kurven, Abzweigungen):
```javascript
const EPSILON_DIST = 0.00005;    // ~5m
const MAX_ANGLE_RAD = Math.PI / 18; // ~10° (strikter)
```

Für **Autobahn/Landstraßen** (lange gerade Strecken):
```javascript
const EPSILON_DIST = 0.00008;    // ~8m (toleranter)
const MAX_ANGLE_RAD = Math.PI / 8; // ~22.5° (toleranter)
```

---

## Debugging-Tipps

1. **Console-Logging hinzufügen**:
```javascript
if (overlap) {
  console.log('Overlap gefunden:', { 
    dist1: p1.dist, 
    dist2: p2.dist, 
    angle: angle * 180 / Math.PI 
  });
}
```

2. **Parameter schrittweise anpassen**: 
   - Immer nur einen Parameter ändern
   - Testen und beobachten
   - Dann nächsten Parameter anpassen

3. **Visuelle Inspektion**: 
   - Schauen welche Segmente gesplittet werden
   - Prüfen ob das sinnvoll ist

