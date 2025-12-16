// ==== Colormap-Selector: Colormap-Auswahl ====
const ColormapSelector = {
  /**
   * Initialisiert den Colormap-Selector
   */
  init() {
    const colormapPreviews = Utils.getElements('.colormap-preview');
    const colormapContainer = Utils.getElement('.colormap-preview-container');
    const legendGradientBar = Utils.getElement('#legend-gradient-bar');
    
    if (!colormapContainer) return;
    
    // Vorschau-Bars initialisieren
    Visualization.updateColormapPreviews();
    
    // Aktive Colormap markieren
    colormapPreviews.forEach(preview => {
      if (preview.dataset.colormap === CONFIG.COLORMAP) {
        preview.classList.add('active');
      }
    });
    
    // Funktion zum Ein-/Ausblenden der Vorschau-Bars
    const togglePreviews = (e) => {
      if (e) e.stopPropagation();
      const isVisible = colormapContainer.classList.contains('show');
      if (isVisible) {
        colormapContainer.classList.remove('show');
      } else {
        colormapContainer.classList.add('show');
      }
    };
    
    // Gradient-Bar-Klick: Vorschau-Bars ein-/ausblenden
    if (legendGradientBar) {
      legendGradientBar.style.cursor = 'pointer';
      legendGradientBar.addEventListener('click', togglePreviews);
    }
    
    // Klick auf Vorschau-Bar: Colormap ändern
    colormapPreviews.forEach(preview => {
      preview.addEventListener('click', async (e) => {
        await this._handleColormapChange(preview, colormapPreviews, colormapContainer, e);
      });
    });
    
    // Klick außerhalb: Vorschau-Bars schließen
    document.addEventListener('click', (e) => {
      if (!colormapContainer.contains(e.target) && 
          !(legendGradientBar && legendGradientBar.contains(e.target))) {
        colormapContainer.classList.remove('show');
      }
    });
  },
  
  /**
   * Behandelt Colormap-Änderung
   * @param {HTMLElement} preview - Die geklickte Vorschau
   * @param {NodeList} allPreviews - Alle Vorschau-Elemente
   * @param {HTMLElement} container - Container-Element
   * @param {Event} e - Event
   */
  async _handleColormapChange(preview, allPreviews, container, e) {
    e.stopPropagation();
    const colormap = preview.dataset.colormap;
    
    // CONFIG aktualisieren
    CONFIG.COLORMAP = colormap;
    
    // Aktive Vorschau aktualisieren
    allPreviews.forEach(p => p.classList.remove('active'));
    preview.classList.add('active');
    
    // Legende aktualisieren
    Visualization.updateLegendGradient();
    
    // Vorschau-Bars ausblenden nach Auswahl
    container.classList.remove('show');
    
    // Routen neu zeichnen wenn vorhanden (nur bei aggregierter Darstellung)
    if (CONFIG.AGGREGATED) {
      if (isRememberMode()) {
        // Im "Zielpunkte merken" Modus: Alle Routen zu allen Zielpunkten neu zeichnen
        RouteRenderer.drawAllTargetRoutes();
      } else {
        // Normaler Modus: Routen neu zeichnen
        EventBus.emit(Events.VISUALIZATION_UPDATE);
      }
    }
  }
};

