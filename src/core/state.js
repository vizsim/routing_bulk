// ==== State-Management ====
const State = {
  // Map & Layer
  map: null,
  layerGroup: null,
  
  // Route State
  lastTarget: null,
  allTargets: [], // Array für mehrere Zielpunkte
  targetMarkers: [], // Marker für alle Zielpunkte
  currentTargetMarker: null, // Marker für aktuellen Zielpunkt im normalen Modus
  targetRoutes: [], // Routen pro Zielpunkt: [{target: [lat, lng], routeData: [...], routeResponses: [...], routePolylines: [...], starts: [...], colors: [...]}, ...]
  lastStarts: null,
  lastColors: null,
  startMarkers: [],
  routePolylines: [],
  allRouteData: [],
  allRouteResponses: [],
  expectedDistribution: null, // Manuell angepasste erwartete Verteilung
  schoolMarkers: [], // Marker für gefundene Schulen
  schoolSearchRadiusCircle: null, // Kreis für Suchradius-Visualisierung
  platformMarkers: [], // Marker für gefundene ÖPNV-Haltestellen
  platformSearchRadiusCircle: null, // Kreis für Haltestellen-Suchradius-Visualisierung
  selectedTargetIndex: null, // Index des ausgewählten Zielpunkts
  nextTargetId: 1, // Nächste eindeutige ID für Zielpunkte (z1, z2, z3, ...)
  targetIdMap: new Map(), // Map: target string -> targetId (für schnellen Zugriff)
  
  // Getter
  getMap() { return this.map; },
  getLayerGroup() { return this.layerGroup; },
  getLastTarget() { return this.lastTarget; },
  getAllTargets() { return this.allTargets; },
  getTargetMarkers() { return this.targetMarkers; },
  getCurrentTargetMarker() { return this.currentTargetMarker; },
  getTargetRoutes() { return this.targetRoutes; },
  getLastStarts() { return this.lastStarts; },
  getLastColors() { return this.lastColors; },
  getStartMarkers() { return this.startMarkers; },
  getRoutePolylines() { return this.routePolylines; },
  getAllRouteData() { return this.allRouteData; },
  getAllRouteResponses() { return this.allRouteResponses; },
  getExpectedDistribution() { return this.expectedDistribution; },
  getSchoolMarkers() { return this.schoolMarkers; },
  getSchoolSearchRadiusCircle() { return this.schoolSearchRadiusCircle; },
  getPlatformMarkers() { return this.platformMarkers; },
  getPlatformSearchRadiusCircle() { return this.platformSearchRadiusCircle; },
  getSelectedTargetIndex() { return this.selectedTargetIndex; },
  getNextTargetId() { return this.nextTargetId; },
  getTargetId(target) { 
    const key = `${target[0]},${target[1]}`;
    return this.targetIdMap.get(key);
  },
  
  // Setter
  setMap(map) { this.map = map; },
  setLayerGroup(layerGroup) { this.layerGroup = layerGroup; },
  setLastTarget(target) { this.lastTarget = target; },
  setAllTargets(targets) { this.allTargets = targets; },
  setTargetMarkers(markers) { this.targetMarkers = markers; },
  setCurrentTargetMarker(marker) { this.currentTargetMarker = marker; },
  setTargetRoutes(routes) { this.targetRoutes = routes; },
  setLastStarts(starts) { this.lastStarts = starts; },
  setLastColors(colors) { this.lastColors = colors; },
  setStartMarkers(markers) { this.startMarkers = markers; },
  setRoutePolylines(polylines) { this.routePolylines = polylines; },
  setAllRouteData(data) { this.allRouteData = data; },
  setAllRouteResponses(responses) { this.allRouteResponses = responses; },
  setExpectedDistribution(dist) { this.expectedDistribution = dist; },
  setSchoolMarkers(markers) { this.schoolMarkers = markers; },
  setSchoolSearchRadiusCircle(circle) { this.schoolSearchRadiusCircle = circle; },
  setPlatformMarkers(markers) { this.platformMarkers = markers; },
  setPlatformSearchRadiusCircle(circle) { this.platformSearchRadiusCircle = circle; },
  setSelectedTargetIndex(index) { this.selectedTargetIndex = index; },
  setNextTargetId(id) { this.nextTargetId = id; },
  incrementNextTargetId() { this.nextTargetId++; },
  setTargetId(target, id) {
    const key = `${target[0]},${target[1]}`;
    this.targetIdMap.set(key, id);
  },
  removeTargetId(target) {
    const key = `${target[0]},${target[1]}`;
    this.targetIdMap.delete(key);
  },
  
  // Reset
  resetRouteData() {
    this.routePolylines = [];
    this.allRouteData = [];
    this.allRouteResponses = [];
  }
};

