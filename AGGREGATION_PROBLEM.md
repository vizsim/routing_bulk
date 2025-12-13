# Aggregierungs-Problem: Lange und kurze überlappende Segmente

## Problem-Beschreibung

Bei der Aggregierung von Routen gibt es ein Problem, wenn ein **langes Segment** und ein **kurzes Segment** übereinander liegen:

- **Beispiel**: Route A hat ein Segment von Punkt 1 → Punkt 5 (100m lang)
- Route B hat Segmente: Punkt 1 → Punkt 2 (20m), Punkt 2 → Punkt 3 (20m), etc.
- **Erwartung**: Das lange Segment sollte an den Schnittpunkten "geschnitten" werden, damit beide Routen korrekt aggregiert werden
- **Aktuelles Verhalten**: Die Segmente werden nicht als überlappend erkannt, da sie unterschiedliche Start-/Endpunkte haben

### Warum ist das ein Problem?

- Die Aggregation zählt nur exakt übereinstimmende Segmente
- Lange und kurze Segmente, die den gleichen Weg nutzen, werden nicht korrekt gezählt
- Die Visualisierung zeigt dann falsche Counts an

## Aktuelle Implementierung

Die aktuelle Aggregierung funktioniert so:

1. **Normalisierung**: Koordinaten werden auf ein Grid gerundet (~10m Toleranz)
2. **Segment-Matching**: Segmente werden nur als "gleich" erkannt, wenn Start- und Endpunkt normalisiert übereinstimmen
3. **Problem**: Ein langes Segment (P1→P5) und ein kurzes Segment (P1→P2) haben unterschiedliche Endpunkte und werden nicht gematcht

## Getestete Lösungsversuche

### Versuch 1: Alle Segmente unterteilen ❌

**Ansatz**: Alle Segmente in kleine Stücke (~10m) aufteilen, bevor sie aggregiert werden.

**Code-Änderung**:
- Jedes Segment wird in gleichmäßige ~10m Stücke aufgeteilt
- Diese kleinen Stücke werden dann aggregiert

**Probleme**:
- **Fehleranfällig**: Viele kleine Segmente führen zu Fragmentierung
- **Performance**: Alle Segmente werden unterteilt, auch kurze
- **Visualisierung**: Kann fragmentiert/zerstückelt aussehen
- **Zu viele Segmente**: Bei vielen Routen entstehen sehr viele kleine Segmente

**Status**: Verworfen - zu fehleranfällig

---

### Versuch 2: Nur lange Segmente unterteilen ❌

**Ansatz**: Nur Segmente > 50m werden in ~10m Stücke aufgeteilt, kurze Segmente bleiben unverändert.

**Code-Änderung**:
- Segment-Länge wird berechnet
- Wenn > 50m: Unterteilung in ~10m Stücke
- Wenn ≤ 50m: Segment bleibt unverändert

**Probleme**:
- **Keine signifikante Verbesserung**: Das Problem tritt weiterhin auf
- **Warum?**: Wenn ein langes Segment (100m) und ein kurzes Segment (20m) überlappen, wird das lange Segment zwar unterteilt, aber das kurze Segment bleibt unverändert
- Die Unter-Segmente des langen Segments matchen immer noch nicht mit dem kurzen Segment

**Status**: Verworfen - keine Verbesserung

---

### Versuch 3: Aktuelle stabile Version ✅

**Ansatz**: Zurück zur einfachen, stabilen Version ohne Unterteilung.

**Code-Änderung**:
- Keine Segment-Unterteilung
- Nur exakte Segment-Matches werden gezählt

**Vorteile**:
- **Stabil**: Funktioniert zuverlässig
- **Schnell**: Keine zusätzlichen Berechnungen
- **Wartbar**: Einfacher Code

**Nachteile**:
- **Edge-Case**: Lange/kurze überlappende Segmente werden nicht korrekt erkannt

**Status**: Aktuell aktiv - funktioniert für die meisten Fälle

## Mögliche zukünftige Lösungsansätze

### Option A: Schnittpunkt-basierte Segmentierung

**Idee**: 
- Finde alle Schnittpunkte zwischen Segmenten
- Teile Segmente an diesen Schnittpunkten
- Aggregiere dann die resultierenden Segmente

**Komplexität**: 
- **Code**: Hoch (Schnittpunkt-Algorithmus, Segment-Zerlegung)
- **Performance**: Mittel (mehr Berechnungen, aber nur bei Bedarf)
- **Wartbarkeit**: Mittel (komplexere Logik)

**Vorteile**:
- Präzise Lösung
- Löst das Problem vollständig

**Nachteile**:
- Viel Code
- Mehr Edge-Cases zu berücksichtigen
- Potenziell langsamer

---

### Option B: Distanz-basiertes Matching

**Idee**:
- Statt exakter Segment-Matches, prüfe ob Segmente "nahe genug" beieinander sind
- Verwende Distanz-Toleranz statt exakter Punkt-Matches

**Komplexität**:
- **Code**: Mittel (Distanz-Berechnung, Toleranz-Logik)
- **Performance**: Niedrig (einfache Distanz-Berechnung)
- **Wartbarkeit**: Mittel

**Vorteile**:
- Einfacher als Schnittpunkt-Methode
- Sollte die meisten Fälle abdecken

**Nachteile**:
- Kann zu falschen Matches führen (wenn Segmente zufällig nahe sind)
- Toleranz-Wert muss gut gewählt werden

---

### Option C: Grid-basierte Heatmap

**Idee**:
- Teile Karte in Grid-Zellen auf
- Zähle wie viele Routen durch jede Zelle gehen
- Visualisiere als Heatmap

**Komplexität**:
- **Code**: Niedrig (einfache Grid-Logik)
- **Performance**: Niedrig (einfache Zählung)
- **Wartbarkeit**: Hoch (sehr einfacher Code)

**Vorteile**:
- Sehr einfach
- Sehr schnell
- Sehr wartbar

**Nachteile**:
- Verliert Genauigkeit (Grid-Auflösung)
- Andere Visualisierung (Heatmap statt Linien)

---

### Option D: Akzeptieren als Edge-Case

**Idee**: 
- Problem als bekanntes Limitation dokumentieren
- Für die meisten Anwendungsfälle ist die aktuelle Lösung ausreichend

**Komplexität**: 
- **Code**: Keine Änderung
- **Performance**: Keine Änderung
- **Wartbarkeit**: Keine Änderung

**Vorteile**:
- Kein zusätzlicher Code
- Keine neuen Fehlerquellen
- Fokus auf andere Features

**Nachteile**:
- Problem bleibt bestehen

## Empfehlung

**Aktuell**: Option D (Edge-Case akzeptieren) oder Option C (Grid-Heatmap als Alternative)

**Zukünftig**: Option B (Distanz-basiertes Matching) wenn das Problem häufiger auftritt

## Technische Details

### Aktuelle Segment-Matching-Logik

```javascript
// Normalisierung auf ~10m Grid
const normalizeForKey = (coord) => {
  return [
    Math.round(coord[0] / GRID_SIZE) * GRID_SIZE,
    Math.round(coord[1] / GRID_SIZE) * GRID_SIZE
  ];
};

// Segment-Key erstellen (normalisiert, sortiert)
const createSegmentKey = (p1, p2) => {
  const np1 = normalizeForKey(p1);
  const np2 = normalizeForKey(p2);
  // Sortiere, damit Richtung egal ist
  return `${np1}-${np2}` oder `${np2}-${np1}`;
};
```

### Warum funktioniert es nicht für lange/kurze Segmente?

- Segment A: P1 (normalisiert: P1') → P5 (normalisiert: P5')
- Segment B: P1 (normalisiert: P1') → P2 (normalisiert: P2')
- Keys: `P1'-P5'` vs `P1'-P2'` → **Nicht gleich** ❌
- Obwohl Segment B ein Teil von Segment A ist, werden sie nicht erkannt

## Zusammenfassung

Das Problem ist **algorithmisch anspruchsvoll** und erfordert entweder:
1. Komplexere Segment-Zerlegung (Schnittpunkte finden)
2. Andere Matching-Strategie (Distanz-basiert)
3. Andere Visualisierung (Grid-Heatmap)
4. Oder: Als bekannte Limitation akzeptieren

Die aktuelle Lösung funktioniert für **die meisten Fälle** gut und ist **stabil und wartbar**.

