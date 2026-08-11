// ==== State-Management ====
export const State = {
  // Map
  map: null,

  // Route State
  lastTarget: null,
  allTargets: [], // Array für mehrere Zielpunkte
  targetMarkers: [], // Marker für alle Zielpunkte
  currentTargetMarker: null, // Marker für aktuellen Zielpunkt im normalen Modus
  targetRoutes: [], // Routen pro Zielpunkt: [{target: [lat, lng], routeData: [...], routeResponses: [...], routePolylines: [...], starts: [...], colors: [...]}, ...]
  lastStarts: null,
  lastStartSources: null, // 'residential' | 'transit' je Startpunkt (steuert das Profil)
  lastColors: null,
  startMarkers: [],
  routePolylines: [],
  allRouteData: [],
  allRouteResponses: [],
  expectedDistribution: null, // Manuell angepasste erwartete Verteilung
  demandInfo: null, // Ergebnis der letzten Startpunkt-Erzeugung (Kapazität, Quellen-Mix)
  analysisMode: false, // Gebietsanalyse aktiv (eigener Panel-Modus, Karten-Klicks setzen kein Ziel)
  selectedTargetIndex: null, // Index des ausgewählten Zielpunkts
  nextTargetId: 1, // Nächste eindeutige ID für Zielpunkte (z1, z2, z3, ...)
  targetIdMap: new Map(), // Map: target string -> targetId (für schnellen Zugriff)
  
  // Getter
  getMap() { return this.map; },
  getLastTarget() { return this.lastTarget; },
  getAllTargets() { return this.allTargets; },
  getTargetMarkers() { return this.targetMarkers; },
  getCurrentTargetMarker() { return this.currentTargetMarker; },
  getTargetRoutes() { return this.targetRoutes; },
  getLastStarts() { return this.lastStarts; },
  getLastStartSources() { return this.lastStartSources; },
  getLastColors() { return this.lastColors; },
  getStartMarkers() { return this.startMarkers; },
  getRoutePolylines() { return this.routePolylines; },
  getAllRouteData() { return this.allRouteData; },
  getAllRouteResponses() { return this.allRouteResponses; },
  getExpectedDistribution() { return this.expectedDistribution; },
  getDemandInfo() { return this.demandInfo; },
  isAnalysisMode() { return this.analysisMode; },
  getSelectedTargetIndex() { return this.selectedTargetIndex; },
  getNextTargetId() { return this.nextTargetId; },
  getTargetId(target) { 
    const key = `${target[0]},${target[1]}`;
    return this.targetIdMap.get(key);
  },
  
  // Setter
  setMap(map) { this.map = map; },
  setLastTarget(target) { this.lastTarget = target; },
  setAllTargets(targets) { this.allTargets = targets; },
  setTargetMarkers(markers) { this.targetMarkers = markers; },
  setCurrentTargetMarker(marker) { this.currentTargetMarker = marker; },
  setTargetRoutes(routes) { this.targetRoutes = routes; },
  setLastStarts(starts) { this.lastStarts = starts; },
  setLastStartSources(sources) { this.lastStartSources = sources; },
  setLastColors(colors) { this.lastColors = colors; },
  setStartMarkers(markers) { this.startMarkers = markers; },
  setRoutePolylines(polylines) { this.routePolylines = polylines; },
  setAllRouteData(data) { this.allRouteData = data; },
  setAllRouteResponses(responses) { this.allRouteResponses = responses; },
  setExpectedDistribution(dist) { this.expectedDistribution = dist; },
  setDemandInfo(info) { this.demandInfo = info; },
  setAnalysisMode(active) { this.analysisMode = active; },
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

