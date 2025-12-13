// ==== State-Management ====
const State = {
  // Map & Layer
  map: null,
  layerGroup: null,
  
  // Route State
  lastTarget: null,
  lastStarts: null,
  lastColors: null,
  startMarkers: [],
  routePolylines: [],
  allRouteData: [],
  allRouteResponses: [],
  expectedDistribution: null, // Manuell angepasste erwartete Verteilung
  
  // Getter
  getMap() { return this.map; },
  getLayerGroup() { return this.layerGroup; },
  getLastTarget() { return this.lastTarget; },
  getLastStarts() { return this.lastStarts; },
  getLastColors() { return this.lastColors; },
  getStartMarkers() { return this.startMarkers; },
  getRoutePolylines() { return this.routePolylines; },
  getAllRouteData() { return this.allRouteData; },
  getAllRouteResponses() { return this.allRouteResponses; },
  getExpectedDistribution() { return this.expectedDistribution; },
  
  // Setter
  setMap(map) { this.map = map; },
  setLayerGroup(layerGroup) { this.layerGroup = layerGroup; },
  setLastTarget(target) { this.lastTarget = target; },
  setLastStarts(starts) { this.lastStarts = starts; },
  setLastColors(colors) { this.lastColors = colors; },
  setStartMarkers(markers) { this.startMarkers = markers; },
  setRoutePolylines(polylines) { this.routePolylines = polylines; },
  setAllRouteData(data) { this.allRouteData = data; },
  setAllRouteResponses(responses) { this.allRouteResponses = responses; },
  setExpectedDistribution(dist) { this.expectedDistribution = dist; },
  
  // Reset
  resetRouteData() {
    this.routePolylines = [];
    this.allRouteData = [];
    this.allRouteResponses = [];
  }
};

