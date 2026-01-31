// ==== Config-UI Helper-Funktionen ====
// Diese Funktionen werden noch als Fallback/Helper verwendet

/**
 * Aktualisiert CONFIG aus UI-Elementen
 */
function updateConfigFromUI() {
  // Profil vom aktiven Button
  const activeProfileBtn = Utils.getElement('.profile-btn.active');
  if (activeProfileBtn) {
    CONFIG.PROFILE = activeProfileBtn.dataset.profile || CONFIG.PROFILE;
  }
  
  // Anzahl der Routen validieren
  const nInput = Utils.getElement('#config-n');
  if (nInput) {
    CONFIG.N = Utils.validateNumber(nInput.value, 1, 1000, CONFIG.N);
  }
  
  // Radius validieren und von km zu m konvertieren
  const radiusInput = Utils.getElement('#config-radius');
  if (radiusInput) {
    const radiusKm = Utils.validateNumber(radiusInput.value, 0.1, 100, CONFIG.RADIUS_M / 1000);
    CONFIG.RADIUS_M = radiusKm * 1000;
  }
  
  // Aggregierte Darstellung
  const aggregatedInput = Utils.getElement('#config-aggregated');
  if (aggregatedInput) {
    CONFIG.AGGREGATED = aggregatedInput.checked;
  }
  
  // Aggregierungsmethode
  const methodInput = Utils.getElement('#config-aggregation-method');
  if (methodInput) {
    CONFIG.AGGREGATION_METHOD = methodInput.value || CONFIG.AGGREGATION_METHOD;
  }
  
  // Startpunkte ausblenden
  const hideStartPointsInput = Utils.getElement('#config-hide-start-points');
  if (hideStartPointsInput) {
    CONFIG.HIDE_START_POINTS = hideStartPointsInput.checked;
  }
  
  // Zielpunkte ausblenden
  const hideTargetPointsInput = Utils.getElement('#config-hide-target-points');
  if (hideTargetPointsInput) {
    CONFIG.HIDE_TARGET_POINTS = hideTargetPointsInput.checked;
  }
  
  // Zielpunkte merken
  const rememberTargetsInput = Utils.getElement('#config-remember-targets');
  if (rememberTargetsInput) {
    CONFIG.REMEMBER_TARGETS = rememberTargetsInput.checked;
  }

  // Einwohnerlayer anzeigen
  const populationLayerInput = Utils.getElement('#config-population-layer-visible');
  if (populationLayerInput) {
    CONFIG.POPULATION_LAYER_VISIBLE = populationLayerInput.checked;
  }
}

/**
 * Zeigt/versteckt die Aggregation-UI-Elemente
 */
function toggleAggregationUI() {
  const legend = Utils.getElement('#legend');
  const methodGroup = Utils.getElement('#aggregation-method-group');
  const hideStartPointsGroup = Utils.getElement('#hide-start-points-group');
  const hideTargetPointsGroup = Utils.getElement('#hide-target-points-group');
  
  if (legend) {
    legend.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
  if (methodGroup) {
    methodGroup.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
  if (hideStartPointsGroup) {
    hideStartPointsGroup.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
  if (hideTargetPointsGroup) {
    hideTargetPointsGroup.style.display = CONFIG.AGGREGATED ? 'block' : 'none';
  }
  
  // Legende-Gradient und Vorschau-Bars aktualisieren wenn sichtbar
  if (CONFIG.AGGREGATED && legend && legend.style.display === 'block') {
    Visualization.updateLegendGradient();
    Visualization.updateColormapPreviews();
  }
}

