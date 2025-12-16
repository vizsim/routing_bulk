// ==== Geocoder: Adresssuche mit Photon ====
const Geocoder = {
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
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`;
    
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
    return features.map(feature => {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates || [];
      
      // Erstelle eine lesbare Adresszeile
      const addressParts = [];
      
      if (props.name) {
        addressParts.push(props.name);
      }
      
      if (props.housenumber && props.street) {
        addressParts.push(`${props.housenumber} ${props.street}`);
      } else if (props.street) {
        addressParts.push(props.street);
      }
      
      if (props.city) {
        addressParts.push(props.city);
      }
      
      if (props.postcode) {
        addressParts.push(props.postcode);
      }
      
      if (props.state) {
        addressParts.push(props.state);
      }
      
      if (props.country) {
        addressParts.push(props.country);
      }
      
      const addressLine = addressParts.join(', ');
      
      // Erstelle eine kurze Beschreibung (Typ + Ort)
      const typeParts = [];
      if (props.osm_type) {
        typeParts.push(props.osm_type);
      }
      if (props.type) {
        typeParts.push(props.type);
      }
      const type = typeParts.join(' / ') || 'Ort';
      
      return {
        name: props.name || addressLine,
        address: addressLine,
        type: type,
        lat: coords[1] || null,
        lng: coords[0] || null,
        coordinates: coords.length === 2 ? [coords[1], coords[0]] : null, // [lat, lng]
        raw: feature // Original-Feature für weitere Details
      };
    });
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
      const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
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
   * Erstellt das Input-Feld oben links auf der Karte
   */
  _createInputField() {
    const wrapper = document.createElement('div');
    wrapper.className = 'geocoder-map-control';
    
    // Icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'geocoder-icon');
    icon.setAttribute('width', '18');
    icon.setAttribute('height', '18');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '8');
    icon.appendChild(circle);
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm21 21-4.35-4.35');
    icon.appendChild(path);
    
    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'geocoder-input';
    input.className = 'geocoder-input';
    input.placeholder = 'Adresse suchen...';
    input.autocomplete = 'off';
    
    // Clear Button
    const clearButton = document.createElement('button');
    clearButton.className = 'geocoder-clear';
    clearButton.id = 'geocoder-clear';
    clearButton.style.display = 'none';
    clearButton.title = 'Löschen';
    clearButton.type = 'button';
    
    const clearIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    clearIcon.setAttribute('width', '16');
    clearIcon.setAttribute('height', '16');
    clearIcon.setAttribute('viewBox', '0 0 24 24');
    clearIcon.setAttribute('fill', 'none');
    clearIcon.setAttribute('stroke', 'currentColor');
    clearIcon.setAttribute('stroke-width', '2');
    clearIcon.setAttribute('stroke-linecap', 'round');
    clearIcon.setAttribute('stroke-linejoin', 'round');
    
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '18');
    line1.setAttribute('y1', '6');
    line1.setAttribute('x2', '6');
    line1.setAttribute('y2', '18');
    clearIcon.appendChild(line1);
    
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '6');
    line2.setAttribute('y1', '6');
    line2.setAttribute('x2', '18');
    line2.setAttribute('y2', '18');
    clearIcon.appendChild(line2);
    
    clearButton.appendChild(clearIcon);
    
    wrapper.appendChild(icon);
    wrapper.appendChild(input);
    wrapper.appendChild(clearButton);
    
    // Füge oben links auf der Karte hinzu
    const mapContainer = Utils.getElement('#map');
    if (mapContainer) {
      mapContainer.appendChild(wrapper);
    }
    
    this._input = input;
    this._clearButton = clearButton;
  },

  /**
   * Erstellt den Container für Adressvorschläge
   */
  _createSuggestionsContainer() {
    const container = document.createElement('div');
    container.className = 'geocoder-suggestions';
    container.id = 'geocoder-suggestions';
    container.style.display = 'none';
    
    // Füge zum Input-Wrapper hinzu
    const wrapper = this._input?.parentNode;
    if (wrapper) {
      wrapper.appendChild(container);
    }
    
    this._suggestionsContainer = container;
  },

  /**
   * Richtet Event-Listener ein
   */
  _setupEventListeners() {
    if (!this._input) return;

    const wrapper = this._input.parentNode;

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
    
    return `
      <div class="geocoder-suggestion ${isHighlighted}" data-index="${index}">
        <div class="geocoder-suggestion-name">${this._escapeHtml(suggestion.name)}</div>
        <div class="geocoder-suggestion-address">${this._escapeHtml(suggestion.address)}</div>
        <div class="geocoder-suggestion-type">${this._escapeHtml(suggestion.type)}</div>
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
