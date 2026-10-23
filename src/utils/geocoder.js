// ==== Geocoder: Adresssuche mit Photon ====
import { State } from '../core/state.js';
import { Utils } from '../core/utils.js';

export const Geocoder = {
  _container: null,
  _input: null,
  _clearButton: null,
  _suggestionsContainer: null,
  _suggestions: [],
  _selectedIndex: -1,
  _debounceTimeout: null,
  _isOpen: false,
  _onSelect: null,

  /**
   * Sucht Adressen mit Photon Geocoder
   * @param {string} query - Suchbegriff
   * @param {Object} options - Optionen (lat, lng, limit)
   * @returns {Promise<Array>} Array von Adress-Objekten
   */
  async search(query, options = {}) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const { lat, lng, limit = 10 } = options;
    
    // Photon API URL
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}&lang=de`;
    
    // Wenn Koordinaten vorhanden, für bessere Ergebnisse hinzufügen
    if (lat !== undefined && lng !== undefined) {
      url += `&lat=${lat}&lon=${lng}`;
    }
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Geocoder-Fehler: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Formatiere die Ergebnisse
      return this._formatResults(data.features || []);
    } catch (error) {
      console.error('[Geocoder] Fehler bei der Suche:', error);
      return [];
    }
  },

  /**
   * Formatiert Photon-Ergebnisse zu einem einheitlichen Format
   * @param {Array} features - Photon Features
   * @returns {Array} Formatierte Adress-Objekte
   */
  _formatResults(features) {
    return features.map(formatPhotonFeature);
  },

  /**
   * Reverse Geocoding: Koordinaten zu Adresse
   * @param {number} lat - Breitengrad
   * @param {number} lng - Längengrad
   * @returns {Promise<Object|null>} Adress-Objekt oder null
   */
  async reverse(lat, lng) {
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      return null;
    }

    try {
      const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=de`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Reverse Geocoder-Fehler: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const formatted = this._formatResults([data.features[0]]);
        return formatted[0] || null;
      }
      
      return null;
    } catch (error) {
      console.error('[Geocoder] Fehler bei Reverse Geocoding:', error);
      return null;
    }
  },

  /**
   * Initialisiert die Geocoder-UI
   * @param {Function} onSelect - Callback wenn eine Adresse ausgewählt wird (lat, lng, suggestion)
   */
  init(onSelect) {
    this._onSelect = onSelect || (() => {});

    // Erstelle Input-Feld oben links auf der Karte
    this._createInputField();

    // Erstelle Container für Vorschläge
    this._createSuggestionsContainer();

    // Event-Listener
    this._setupEventListeners();

    // Initialisiere mit Reverse Geocoding für aktuelle Kartenposition
    this._initReverseGeocoding();
  },

  /**
   * Erstellt die Suche oben links auf der Karte (Aufbau wie in der Unfallkarte:
   * Umrandung mit Lupe, Feld und ×; die Ergebnisliste darunter als Geschwister —
   * am Handy faltet src/ui/mobile-layout.js die Umrandung zum Lupen-Knopf).
   */
  _createInputField() {
    const container = document.createElement('div');
    container.className = 'geocoder-map-control';
    container.innerHTML = `
      <div class="geocoder-input-wrapper">
        <svg class="geocoder-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input type="text" id="geocoder-input" class="geocoder-input" placeholder="Adresse suchen…"
          autocomplete="off" aria-label="Adresse suchen" />
        <button type="button" class="geocoder-clear" id="geocoder-clear" title="Löschen" aria-label="Suche leeren"
          style="display: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>`;

    // Oben links auf der Karte
    const mapContainer = Utils.getElement('#map');
    if (mapContainer) {
      mapContainer.appendChild(container);
    }

    this._container = container;
    this._input = container.querySelector('#geocoder-input');
    this._clearButton = container.querySelector('#geocoder-clear');
  },

  /**
   * Erstellt den Container für Adressvorschläge (unter der Eingabe)
   */
  _createSuggestionsContainer() {
    const container = document.createElement('div');
    container.className = 'geocoder-suggestions';
    container.id = 'geocoder-suggestions';
    container.style.display = 'none';
    this._container?.appendChild(container);
    this._suggestionsContainer = container;
  },

  /**
   * Richtet Event-Listener ein
   */
  _setupEventListeners() {
    if (!this._input) return;

    const wrapper = this._container;

    // Verhindere, dass Klicks auf Geocoder-Elemente Map-Clicks auslösen
    if (wrapper) {
      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      wrapper.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }

    this._input.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    this._input.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // Input-Änderungen (mit Debouncing)
    this._input.addEventListener('input', (e) => {
      this._handleInput(e.target.value);
      this._updateClearButton(e.target.value);
    });
    
    // Clear Button
    if (this._clearButton) {
      this._clearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clear();
      });
    }

    // Fokus
    this._input.addEventListener('focus', () => {
      if (this._suggestions.length > 0) {
        this._showSuggestions();
      }
    });

    // Klick außerhalb schließt Vorschläge
    document.addEventListener('click', (e) => {
      if (!this._input.contains(e.target) && 
          !this._suggestionsContainer.contains(e.target)) {
        this._hideSuggestions();
      }
    });

    // Tastatur-Navigation
    this._input.addEventListener('keydown', (e) => {
      this._handleKeyDown(e);
    });

    // Enter-Taste
    this._input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this._selectedIndex >= 0 && this._suggestions[this._selectedIndex]) {
          this._selectSuggestion(this._suggestions[this._selectedIndex]);
        }
      }
    });
  },

  /**
   * Behandelt Eingaben im Suchfeld (mit Debouncing)
   */
  _handleInput(value) {
    // Debouncing: Warte 300ms nach der letzten Eingabe
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }

    this._debounceTimeout = setTimeout(async () => {
      if (value.trim().length < 2) {
        this._suggestions = [];
        this._hideSuggestions();
        return;
      }

      await this._searchAddresses(value);
    }, 300);
  },

  /**
   * Sucht Adressen
   */
  async _searchAddresses(query) {
    try {
      // Hole aktuelle Kartenposition für bessere Ergebnisse
      const map = State.getMap();
      let lat, lng;
      if (map) {
        const center = map.getCenter();
        lat = center.lat;
        lng = center.lng;
      }

      const results = await this.search(query, { lat, lng, limit: 8 });
      this._suggestions = results;
      this._selectedIndex = -1;
      
      if (results.length > 0) {
        this._showSuggestions();
      } else {
        this._hideSuggestions();
      }
    } catch (error) {
      console.error('[Geocoder] Fehler bei der Suche:', error);
      this._suggestions = [];
      this._hideSuggestions();
    }
  },

  /**
   * Zeigt die Vorschläge an
   */
  _showSuggestions() {
    if (!this._suggestionsContainer || this._suggestions.length === 0) {
      return;
    }

    // Erstelle HTML für Vorschläge
    const html = this._suggestions.map((suggestion, index) => {
      return this._createSuggestionHTML(suggestion, index);
    }).join('');

    this._suggestionsContainer.innerHTML = html;
    this._suggestionsContainer.style.display = 'block';
    this._isOpen = true;

    // Event-Listener für Klicks auf Vorschläge
    this._suggestionsContainer.querySelectorAll('.geocoder-suggestion').forEach((el, index) => {
      el.addEventListener('click', () => {
        this._selectSuggestion(this._suggestions[index]);
      });
      
      el.addEventListener('mouseenter', () => {
        this._selectedIndex = index;
        this._updateHighlight();
      });
    });
  },

  /**
   * Erstellt HTML für einen Vorschlag
   */
  _createSuggestionHTML(suggestion, index) {
    const isHighlighted = index === this._selectedIndex ? 'highlighted' : '';
    
    const secondary = suggestion.secondary
      ? `<div class="geocoder-suggestion-address">${this._escapeHtml(suggestion.secondary)}</div>`
      : '';
    return `
      <div class="geocoder-suggestion ${isHighlighted}" data-index="${index}">
        <div class="geocoder-suggestion-name">${this._escapeHtml(suggestion.name)}</div>
        ${secondary}
      </div>
    `;
  },

  /**
   * Escaped HTML-Zeichen
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Versteckt die Vorschläge
   */
  _hideSuggestions() {
    if (this._suggestionsContainer) {
      this._suggestionsContainer.style.display = 'none';
      this._isOpen = false;
    }
  },

  /**
   * Behandelt Tastatur-Navigation
   */
  _handleKeyDown(e) {
    if (!this._isOpen || this._suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._selectedIndex = Math.min(this._selectedIndex + 1, this._suggestions.length - 1);
        this._updateHighlight();
        this._scrollToSelected();
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, -1);
        this._updateHighlight();
        this._scrollToSelected();
        break;
      
      case 'Escape':
        e.preventDefault();
        this._hideSuggestions();
        this._input.blur();
        break;
    }
  },

  /**
   * Aktualisiert die Hervorhebung
   */
  _updateHighlight() {
    if (!this._suggestionsContainer) return;

    const suggestions = this._suggestionsContainer.querySelectorAll('.geocoder-suggestion');
    suggestions.forEach((el, index) => {
      if (index === this._selectedIndex) {
        el.classList.add('highlighted');
      } else {
        el.classList.remove('highlighted');
      }
    });
  },

  /**
   * Scrollt zur ausgewählten Vorschlag
   */
  _scrollToSelected() {
    if (this._selectedIndex < 0 || !this._suggestionsContainer) return;

    const selected = this._suggestionsContainer.querySelector(
      `.geocoder-suggestion[data-index="${this._selectedIndex}"]`
    );
    
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  },

  /**
   * Wählt einen Vorschlag aus
   */
  _selectSuggestion(suggestion) {
    if (!suggestion || !suggestion.coordinates) {
      return;
    }

    const [lat, lng] = suggestion.coordinates;
    
    // Input-Wert setzen
    this._input.value = suggestion.address;
    
    // Vorschläge verstecken
    this._hideSuggestions();
    
    // Callback aufrufen
    if (this._onSelect) {
      this._onSelect(lat, lng, suggestion);
    }
  },

  /**
   * Initialisiert Reverse Geocoding für aktuelle Kartenposition
   * (Nur für Info, Placeholder bleibt unverändert)
   */
  async _initReverseGeocoding() {
    // Reverse Geocoding wird nicht mehr für Placeholder verwendet
    // Der Placeholder bleibt immer "Adresse suchen..."
  },

  /**
   * Setzt den Wert des Input-Feldes
   */
  setValue(value) {
    if (this._input) {
      this._input.value = value || '';
    }
  },

  /**
   * Aktualisiert die Sichtbarkeit des Clear-Buttons
   */
  _updateClearButton(value) {
    if (this._clearButton) {
      this._clearButton.style.display = value && value.trim().length > 0 ? 'flex' : 'none';
    }
  },

  /**
   * Leert das Input-Feld
   */
  clear() {
    this.setValue('');
    this._suggestions = [];
    this._hideSuggestions();
    if (this._clearButton) {
      this._clearButton.style.display = 'none';
    }
  }
};

/**
 * Photon-Feature → { name, secondary, address, … } (rein, damit testbar).
 * Hauptzeile = Name, sonst „Straße Hausnummer“ (deutsche Reihenfolge), sonst Ort;
 * Nebenzeile = was die Hauptzeile nicht schon sagt (Straße, PLZ Ort, Land, Staat).
 * `address` ist beides zusammen und landet nach der Auswahl im Suchfeld.
 */
export function formatPhotonFeature(feature) {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates || [];
  const street = [props.street, props.housenumber].filter(Boolean).join(' ');
  const locality = props.city || props.town || props.village || props.locality || props.district || '';
  const place = [props.postcode, locality].filter(Boolean).join(' ');
  const name = props.name || street || place || 'Unbekannter Ort';

  const parts = [];
  if (street && street !== name) parts.push(street);
  if (place && place !== name) parts.push(place);
  if (props.state && props.state !== locality && props.state !== name) parts.push(props.state);
  if (props.country && props.country !== name) parts.push(props.country);
  const secondary = parts.join(', ');

  const type = [props.osm_type, props.type].filter(Boolean).join(' / ') || 'Ort';
  const hasCoords = coords.length === 2;
  return {
    name,
    secondary,
    address: secondary ? `${name}, ${secondary}` : name,
    type,
    lat: hasCoords ? coords[1] : null,
    lng: hasCoords ? coords[0] : null,
    coordinates: hasCoords ? [coords[1], coords[0]] : null, // [lat, lng]
    raw: feature
  };
}
