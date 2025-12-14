// ==== Kompatibilitätsschicht ====
// Ermöglicht schrittweise Migration

// Aggregation → AggregationService
if (typeof AggregationService !== 'undefined' && typeof Aggregation === 'undefined') {
  const Aggregation = AggregationService;
}

// Visualization bleibt vorerst wie es ist
// Wird schrittweise durch neue Komponenten ersetzt

