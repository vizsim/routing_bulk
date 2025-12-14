// ==== Event-Bus für lose Kopplung ====
const EventBus = {
  _listeners: {},
  
  /**
   * Registriert einen Event-Listener
   * @param {string} event - Event-Name
   * @param {Function} callback - Callback-Funktion
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
  },
  
  /**
   * Entfernt einen Event-Listener
   * @param {string} event - Event-Name
   * @param {Function} callback - Callback-Funktion
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  },
  
  /**
   * Emittiert ein Event
   * @param {string} event - Event-Name
   * @param {*} data - Event-Daten
   */
  emit(event, data = null) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  },
  
  /**
   * Entfernt alle Listener für ein Event
   * @param {string} event - Event-Name
   */
  clear(event) {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }
};

// Event-Namen als Konstanten (für bessere IDE-Unterstützung)
const Events = {
  // Config Events
  CONFIG_CHANGED: 'config:changed',
  CONFIG_PROFILE_CHANGED: 'config:profile:changed',
  CONFIG_AGGREGATION_CHANGED: 'config:aggregation:changed',
  
  // Target Events
  TARGET_ADDED: 'target:added',
  TARGET_REMOVED: 'target:removed',
  TARGET_SELECTED: 'target:selected',
  TARGET_HOVER: 'target:hover',
  TARGET_UNHOVER: 'target:unhover',
  
  // Route Events
  ROUTES_CALCULATED: 'routes:calculated',
  ROUTES_UPDATED: 'routes:updated',
  ROUTE_UPDATED: 'route:updated',
  
  // Map Events
  MAP_CLICK: 'map:click',
  MAP_READY: 'map:ready',
  
  // Visualization Events
  VISUALIZATION_MODE_CHANGED: 'visualization:mode:changed',
  VISUALIZATION_UPDATE: 'visualization:update',
  
  // Export Events
  EXPORT_REQUESTED: 'export:requested',
  EXPORT_COMPLETED: 'export:completed'
};

