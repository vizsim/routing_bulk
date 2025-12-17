# Relations-Problematik bei Schul-Visualisierung

## Problemstellung

In OpenStreetMap können Schulen als verschiedene Elemente modelliert sein:
- **Nodes**: Einzelne Punkte
- **Ways**: Polygone (Gebäude/Gelände)
- **Relations**: Komplexe Strukturen, z.B. Multipolygone mit mehreren Ways als Member

## Ursprüngliches Ziel

Relations sollten **genauso wie Ways** als Polygone visualisiert werden. Die Member-Ways einer Relation (insbesondere bei Multipolygonen) sollten als gefüllte Polygone dargestellt werden.

## Warum es nicht funktioniert hat

1. **Overpass Query-Komplexität**: Um Relations als Polygone zu zeichnen, müssen die Member-Ways geholt werden (`(._;>;)`), was die Query teurer macht.

2. **Koordinaten-Zusammenführung**: Bei Multipolygonen mit mehreren outer Ways müssen diese zu einem Polygon kombiniert werden. Die Implementierung war komplex und fehleranfällig.

3. **Rendering-Probleme**: Selbst wenn die Ways korrekt geholt wurden, wurden sie nicht als gefüllte Polygone dargestellt, sondern nur als Umrisse.

## Aktuelle Lösung

Relations werden **als Punkt-Marker im Center** dargestellt:
- Overpass Query holt den Center-Punkt der Relation mit `out center;`
- Relations werden wie Nodes als Marker visualisiert
- Dies ist eine pragmatische Lösung, die funktioniert, auch wenn sie weniger detailliert ist als Polygon-Visualisierung

## Code-Stelle

Die Implementierung befindet sich in `src/services/overpass-service.js` (Zeilen 114-140).

## Ausblick

Für eine vollständige Polygon-Visualisierung von Relations müsste:
1. Die Overpass Query erweitert werden, um Member-Ways zu holen
2. Die Ways korrekt zu einem Multipolygon kombiniert werden
3. Das Rendering in `school-renderer.js` angepasst werden, um Multipolygone zu unterstützen

Dies ist aktuell nicht priorisiert, da die Punkt-Darstellung für den Use Case ausreichend ist.

