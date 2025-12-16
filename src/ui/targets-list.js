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
    
    // Event-Listener für Marker-Hover (um Panel-Item zu highlighten)
    EventBus.on(Events.TARGET_HOVER, (data) => this._highlightItem(data.index));
    EventBus.on(Events.TARGET_UNHOVER, () => this._unhighlightAll());
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
    const targetRoutes = State.getTargetRoutes();
    
    allTargets.forEach((target, index) => {
      const item = document.createElement('div');
      item.className = 'target-item';
      item.dataset.targetIndex = index;
      
      // Config-Informationen aus targetRoutes holen
      const routeInfo = targetRoutes.find(tr => 
        TargetService.isEqual(tr.target, target)
      );
      
      // Stabile ID verwenden (aus routeInfo oder Marker)
      let targetId = null;
      if (routeInfo && routeInfo.targetId) {
        targetId = routeInfo.targetId;
      } else {
        // Fallback: ID aus Marker holen
        const targetMarkers = State.getTargetMarkers();
        const marker = targetMarkers.find(m => 
          m && m._targetLatLng && TargetService.isEqual(m._targetLatLng, target)
        );
        if (marker && marker._targetId) {
          targetId = marker._targetId;
        } else {
          // Letzter Fallback: Index verwenden (sollte nicht passieren)
          targetId = index + 1;
        }
      }
      
      const label = document.createElement('span');
      label.className = 'target-item-label';
      label.textContent = `z${targetId}:`;
      
      const configText = document.createElement('span');
      configText.className = 'target-item-coords';
      
      if (routeInfo && routeInfo.config && routeInfo.distributionType) {
        // Format: "bike | 10 | 2 | lognormal"
        configText.textContent = `${routeInfo.config.profile} | ${routeInfo.config.n} | ${routeInfo.config.radiusKm} | ${routeInfo.distributionType}`;
      } else {
        // Fallback: Koordinaten anzeigen, wenn keine Config vorhanden
        configText.textContent = `${target[0].toFixed(5)}, ${target[1].toFixed(5)}`;
      }
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'target-item-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Zielpunkt entfernen';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleRemove(index);
      });
      
      // Bearbeiten-Button (Stift-Icon) - immer anzeigen wenn Zielpunkt ausgewählt ist
      const selectedIndex = State.getSelectedTargetIndex();
      let editBtn = null;
      
      if (selectedIndex === index) {
        editBtn = document.createElement('button');
        editBtn.className = 'target-item-edit';
        editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        editBtn.title = 'Config-Änderungen übernehmen';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._handleApplyChanges(index);
        });
      }
      
      // Ausgewählter Zielpunkt-Indikator
      if (selectedIndex === index) {
        item.classList.add('target-item-selected');
      }
      
      // Klick-Event: Startpunkte dieses Zielpunkts anzeigen
      item.addEventListener('click', (e) => {
        // Verhindere, dass Buttons auch das Item-Event auslösen
        if (e.target.closest('.target-item-remove') || e.target.closest('.target-item-edit')) return;
        
        // Zielpunkt auswählen und Config-Werte wiederherstellen
        Visualization._showStartPointsForTarget(index);
      });
      
      // Hover-Events für Highlighting
      item.addEventListener('mouseenter', () => {
        EventBus.emit(Events.TARGET_HOVER, { index, target });
      });
      item.addEventListener('mouseleave', () => {
        EventBus.emit(Events.TARGET_UNHOVER);
      });
      
      const buttonGroup = document.createElement('div');
      buttonGroup.className = 'target-item-buttons';
      if (editBtn) {
        buttonGroup.appendChild(editBtn);
      }
      buttonGroup.appendChild(removeBtn);
      
      item.appendChild(label);
      item.appendChild(configText);
      item.appendChild(buttonGroup);
      this._container.appendChild(item);
    });
  },
  
  /**
   * Behandelt das Übernehmen von Änderungen für einen Zielpunkt
   */
  async _handleApplyChanges(index) {
    const allTargets = State.getAllTargets();
    if (index < 0 || index >= allTargets.length) return;
    
    const target = allTargets[index];
    
    // Routen neu berechnen und übernehmen
    await App._recalculateTargetRoutes(target, index);
    
    // Panel aktualisieren
    this.update();
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
        
        // Startpunkte entfernen
        const startMarkers = State.getStartMarkers();
        const layerGroup = State.getLayerGroup();
        if (layerGroup && startMarkers) {
          startMarkers.forEach(marker => {
            if (marker) layerGroup.removeLayer(marker);
          });
        }
        State.setStartMarkers([]);
      }
      
      // Wenn der entfernte Zielpunkt ausgewählt war, Auswahl zurücksetzen
      const selectedIndex = State.getSelectedTargetIndex();
      if (selectedIndex === index) {
        State.setSelectedTargetIndex(null);
        Visualization.updateSelectedTargetMarker();
      } else if (selectedIndex !== null && selectedIndex > index) {
        // Index anpassen, wenn ein Zielpunkt vor dem ausgewählten entfernt wurde
        State.setSelectedTargetIndex(selectedIndex - 1);
        Visualization.updateSelectedTargetMarker();
      }
      
      // Alle verbleibenden Routen neu zeichnen
      if (isRememberMode()) {
        EventBus.emit(Events.VISUALIZATION_UPDATE);
      }
      
      EventBus.emit(Events.EXPORT_REQUESTED); // Trigger Export-Button Update
    }
  },
  
  /**
   * Highlightet ein Panel-Item
   */
  _highlightItem(index) {
    if (!this._container) return;
    const items = this._container.querySelectorAll('.target-item');
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('target-item-highlighted');
      } else {
        item.classList.remove('target-item-highlighted');
      }
    });
  },
  
  /**
   * Entfernt Highlighting von allen Panel-Items
   */
  _unhighlightAll() {
    if (!this._container) return;
    const items = this._container.querySelectorAll('.target-item');
    items.forEach(item => {
      item.classList.remove('target-item-highlighted');
    });
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

