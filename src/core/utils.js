// ==== Utility-Funktionen ====
const Utils = {
  /**
   * Validiert und normalisiert eine Zahl
   * @param {number|string} value - Der zu validierende Wert
   * @param {number} min - Minimalwert
   * @param {number} max - Maximalwert
   * @param {number} defaultValue - Standardwert bei ungültiger Eingabe
   * @returns {number} - Validierter Wert
   */
  validateNumber(value, min = 0, max = Infinity, defaultValue = 0) {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || !isFinite(num)) return defaultValue;
    return Math.max(min, Math.min(max, num));
  },

  /**
   * Holt ein DOM-Element mit Fehlerbehandlung
   * @param {string} selector - CSS-Selektor
   * @param {string} errorMsg - Fehlermeldung falls Element nicht gefunden
   * @returns {HTMLElement|null} - Element oder null
   */
  getElement(selector, errorMsg = null) {
    const element = document.querySelector(selector);
    if (!element && errorMsg) {
      console.warn(`Element nicht gefunden: ${selector} - ${errorMsg}`);
    }
    return element;
  },

  /**
   * Holt mehrere DOM-Elemente mit Fehlerbehandlung
   * @param {string} selector - CSS-Selektor
   * @returns {NodeList} - NodeList der Elemente
   */
  getElements(selector) {
    return document.querySelectorAll(selector);
  },

  /**
   * Prüft ob ein Wert existiert und nicht null/undefined ist
   * @param {*} value - Zu prüfender Wert
   * @param {string} name - Name für Fehlermeldung
   * @returns {boolean} - true wenn gültig
   */
  assertExists(value, name = 'Value') {
    if (value === null || value === undefined) {
      console.error(`${name} ist null oder undefined`);
      return false;
    }
    return true;
  },

  /**
   * Loggt Fehler konsistent
   * @param {string} context - Kontext (z.B. "Route-Fehler")
   * @param {Error|string} error - Fehlerobjekt oder -meldung
   */
  logError(context, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${context}] ${message}`, error);
  },

  /**
   * Erstellt eine Fehlermeldung für den Benutzer
   * @param {string} message - Fehlermeldung
   * @param {boolean} useAlert - true für alert(), false für console
   */
  showError(message, useAlert = false) {
    if (useAlert) {
      alert(message);
    } else {
      console.error(message);
    }
  },
  
  /**
   * Zeigt eine Info-Nachricht für den Benutzer
   * @param {string} message - Info-Nachricht
   * @param {boolean} useAlert - true für alert(), false für console
   */
  showInfo(message, useAlert = false) {
    if (useAlert) {
      alert(message);
    } else {
      console.log(message);
    }
  }
};

