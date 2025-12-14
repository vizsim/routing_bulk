// ==== State-Management ====
const State = {
  // Map & Layer
  map: null,
  layerGroup: null,
  
  // Route State
  lastTarget: null,
  allTargets: [], // Array für mehrere Zielpunkte
  targetMarkers: [], // Marker für alle Zielpunkte
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
  
  // Getter
  getMap() { return this.map; },
  getLayerGroup() { return this.layerGroup; },
  getLastTarget() { return this.lastTarget; },
  getAllTargets() { return this.allTargets; },
  getTargetMarkers() { return this.targetMarkers; },
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
  
  // Setter
  setMap(map) { this.map = map; },
  setLayerGroup(layerGroup) { this.layerGroup = layerGroup; },
  setLastTarget(target) { this.lastTarget = target; },
  setAllTargets(targets) { this.allTargets = targets; },
  setTargetMarkers(markers) { this.targetMarkers = markers; },
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
  
  // Reset
  resetRouteData() {
    this.routePolylines = [];
    this.allRouteData = [];
    this.allRouteResponses = [];
  }
};

