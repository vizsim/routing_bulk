// ==== Route-Warning: Warnung bei vielen Routen ====
const RouteWarning = {
  // Flag, um zu verhindern, dass die Warnung mehrfach angezeigt wird
  _warningShown: false,
  _userDismissed: false,
  
  /**
   * Initialisiert die Route-Warnung
   */
  init() {
    const modal = Utils.getElement('#route-warning-modal');
    const continueBtn = Utils.getElement('#route-warning-continue');
    const closeBtn = Utils.getElement('#route-warning-close');
    
    if (!modal || !continueBtn) return;
    
    // Event-Handler für Continue-Button
    continueBtn.addEventListener('click', () => {
      this.hide();
      this._userDismissed = true;
    });
    
    // Event-Handler für Close-Button (falls vorhanden)
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hide();
        this._userDismissed = true;
      });
    }
    
    // Klick außerhalb des Modals schließt es
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hide();
        this._userDismissed = true;
      }
    });
    
    // ESC-Taste schließt das Modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        this.hide();
        this._userDismissed = true;
      }
    });
  },
  
  /**
   * Berechnet die Gesamtzahl der dargestellten Routen
   * @returns {number} - Anzahl der Routen
   */
  getTotalRouteCount() {
    if (isRememberMode()) {
      // Im "Zielpunkte merken" Modus: Summe aller Routen aller Zielpunkte
      const targetRoutes = State.getTargetRoutes();
      let totalCount = 0;
      
      targetRoutes.forEach(routeInfo => {
        if (routeInfo && routeInfo.routeData) {
          totalCount += routeInfo.routeData.length;
        }
      });
      
      return totalCount;
    } else {
      // Im normalen Modus: Anzahl der aktuellen Routen
      return State.getAllRouteData().length;
    }
  },
  
  /**
   * Zeigt die Warnung an, wenn mehr als 500 Routen vorhanden sind
   * @param {boolean} force - Wenn true, zeigt die Warnung auch an, wenn sie bereits angezeigt wurde
   */
  checkAndShow(force = false) {
    // Wenn Benutzer bereits abgelehnt hat, nicht erneut anzeigen (außer bei force)
    if (this._userDismissed && !force) {
      return;
    }
    
    const totalRoutes = this.getTotalRouteCount();
    
    if (totalRoutes > 500) {
      // Warnung nur einmal pro Session anzeigen (außer bei force)
      if (!this._warningShown || force) {
        this.show(totalRoutes);
        this._warningShown = true;
      }
    }
  },
  
  /**
   * Zeigt die Warnung an
   * @param {number} routeCount - Anzahl der Routen
   */
  show(routeCount) {
    const modal = Utils.getElement('#route-warning-modal');
    const countElement = Utils.getElement('#route-warning-count');
    
    if (!modal || !countElement) return;
    
    // Anzahl aktualisieren
    countElement.textContent = routeCount.toLocaleString('de-DE');
    
    // Modal anzeigen
    modal.style.display = 'flex';
  },
  
  /**
   * Versteckt die Warnung
   */
  hide() {
    const modal = Utils.getElement('#route-warning-modal');
    if (!modal) return;
    
    modal.style.display = 'none';
  },
  
  /**
   * Setzt den Status zurück (z.B. wenn Routen gelöscht werden)
   */
  reset() {
    this._warningShown = false;
    this._userDismissed = false;
  }
};

