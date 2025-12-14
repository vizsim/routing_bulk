// ==== Targets-List: UI-Komponente für Zielpunkte-Liste ====
const TargetsList = {
  _container: null,
  
  /**
   * Initialisiert die Komponente
   */
  init() {
    this._container = Utils.getElement('#targets-list');
    if (!this._container) return;
    
    // Event-Listener für Target-Änderungen
    EventBus.on(Events.TARGET_ADDED, () => this.update());
    EventBus.on(Events.TARGET_REMOVED, () => this.update());
  },
  
  /**
   * Aktualisiert die Liste
   */
  update() {
    if (!this._container) return;
    
    const allTargets = State.getAllTargets();
    
    // Liste leeren
    this._container.innerHTML = '';
    
    if (allTargets.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'target-item';
      emptyMsg.style.fontSize = '12px';
      emptyMsg.style.color = '#999';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.textContent = 'Keine Zielpunkte gespeichert';
      this._container.appendChild(emptyMsg);
      return;
    }
    
    // Zielpunkte anzeigen
    allTargets.forEach((target, index) => {
      const item = document.createElement('div');
      item.className = 'target-item';
      
      const label = document.createElement('span');
      label.className = 'target-item-label';
      label.textContent = `z${index + 1}:`;
      
      const coords = document.createElement('span');
      coords.className = 'target-item-coords';
      coords.textContent = `${target[0].toFixed(5)}, ${target[1].toFixed(5)}`;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'target-item-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Zielpunkt entfernen';
      removeBtn.addEventListener('click', () => {
        this._handleRemove(index);
      });
      
      item.appendChild(label);
      item.appendChild(coords);
      item.appendChild(removeBtn);
      this._container.appendChild(item);
    });
  },
  
  /**
   * Behandelt das Entfernen eines Zielpunkts
   */
  _handleRemove(index) {
    const target = TargetService.removeTarget(index);
    if (target) {
      // Routen zu diesem Zielpunkt entfernen
      TargetService.removeTargetRoutes(target);
      
      // Wenn es der aktuelle Zielpunkt war, State zurücksetzen
      const lastTarget = State.getLastTarget();
      if (lastTarget && TargetService.isEqual(lastTarget, target)) {
        State.setLastTarget(null);
        State.resetRouteData();
      }
      
      // Alle verbleibenden Routen neu zeichnen
      if (CONFIG.REMEMBER_TARGETS) {
        EventBus.emit(Events.VISUALIZATION_UPDATE);
      }
      
      EventBus.emit(Events.EXPORT_REQUESTED); // Trigger Export-Button Update
    }
  },
  
  /**
   * Zeigt/versteckt die Liste
   */
  toggle(show) {
    const group = Utils.getElement('#targets-list-group');
    if (group) {
      group.style.display = show ? 'block' : 'none';
    }
    if (show) {
      this.update();
    }
  }
};

