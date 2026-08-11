// ==== Marker-Manager: Verwaltung von Target-Markern (MapLibre) ====
import { State } from '../core/state.js';
import { TargetService } from '../services/target-service.js';

export const MarkerManager = {
  /**
   * Highlightet einen Target-Marker auf der Karte
   * @param {number} index - Index des Zielpunkts
   */
  highlightTargetMarker(index) {
    const targetMarkers = State.getTargetMarkers();
    if (index >= 0 && index < targetMarkers.length && targetMarkers[index]) {
      const el = targetMarkers[index].getElement();
      if (el) {
        el.classList.add('target-marker-highlighted');
      }
    }
  },

  /**
   * Entfernt Highlighting von allen Target-Markern
   */
  unhighlightAllTargetMarkers() {
    const targetMarkers = State.getTargetMarkers();
    targetMarkers.forEach(marker => {
      if (marker) {
        marker.getElement().classList.remove('target-marker-highlighted');
      }
    });
    // Auch currentTargetMarker im normalen Modus
    const currentTargetMarker = State.getCurrentTargetMarker();
    if (currentTargetMarker) {
      currentTargetMarker.getElement().classList.remove('target-marker-highlighted');
    }
  },

  /**
   * Markiert den ausgewählten Zielpunkt-Marker (blauer Rahmen)
   */
  updateSelectedTargetMarker() {
    const selectedIndex = State.getSelectedTargetIndex();
    const targetMarkers = State.getTargetMarkers();
    const currentTargetMarker = State.getCurrentTargetMarker();

    // Alle Marker zurücksetzen
    targetMarkers.forEach(marker => {
      if (marker) {
        marker.getElement().classList.remove('target-marker-selected');
      }
    });
    if (currentTargetMarker) {
      currentTargetMarker.getElement().classList.remove('target-marker-selected');
    }

    // Ausgewählten Marker markieren
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < targetMarkers.length) {
      const marker = targetMarkers[selectedIndex];
      if (marker) {
        marker.getElement().classList.add('target-marker-selected');
      }
    }
  },

  /**
   * Entfernt verwaiste Target-Marker (Marker ohne zugehörigen Zielpunkt im State)
   */
  cleanupOrphanedTargetMarkers() {
    const allTargets = State.getAllTargets();
    const targetMarkers = State.getTargetMarkers();
    if (!allTargets) return;

    const validMarkers = [];

    targetMarkers.forEach((marker, index) => {
      if (!marker) return;

      const isValid = index < allTargets.length &&
                      allTargets[index] &&
                      marker._targetLatLng &&
                      TargetService.isEqual(marker._targetLatLng, allTargets[index]);

      if (isValid) {
        validMarkers[index] = marker;
      } else {
        marker.remove();
      }
    });

    State.setTargetMarkers(validMarkers);
  }
};
