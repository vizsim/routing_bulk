// ==== Public Transport Renderer: ÖPNV-Haltestellen-Visualisierung ====
const PublicTransportRenderer = {
  /**
   * Erstellt ein Haltestellen-Icon basierend auf dem aktuellen Zoom-Level
   * @param {number} zoom - Aktueller Zoom-Level
   * @returns {L.DivIcon} - Icon für Haltestellen-Marker
   */
  createPlatformIcon(zoom) {
    // Größe basierend auf Zoom-Level: kleiner bei niedrigem Zoom, größer bei hohem Zoom
    // Zoom 10: 10px, Zoom 15: 28px, Zoom 19: 36px
    const baseSize = Math.max(10, Math.min(36, 10 + (zoom - 10) * 2.8));
    const svgSize = Math.max(6, Math.min(22, 6 + (zoom - 10) * 2.8));
    const borderWidth = zoom < 13 ? 1.5 : 2;
    
    return L.divIcon({
      className: 'platform-marker-icon',
      html: `
        <div style="
          width: ${baseSize}px;
          height: ${baseSize}px;
          background-color: white;
          border: ${borderWidth}px solid #10b981;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        ">
          <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="#10b981" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
          </svg>
        </div>
      `,
      iconSize: [baseSize, baseSize],
      iconAnchor: [baseSize / 2, baseSize / 2]
    });
  },
  
  /**
   * Aktualisiert alle Haltestellen-Marker-Icons basierend auf dem aktuellen Zoom-Level
   */
  updatePlatformIcons() {
    const map = State.getMap();
    if (!map) return;
    
    const zoom = map.getZoom();
    const platformLayers = State.getPlatformMarkers() || [];
    const newIcon = this.createPlatformIcon(zoom);
    
    platformLayers.forEach(layer => {
      // Nur Marker aktualisieren (nicht Polygone)
      if (layer instanceof L.Marker && layer._isPlatformLayer) {
        layer.setIcon(newIcon);
      }
    });
  },
  
  /**
   * Zeichnet ÖPNV-Haltestellen auf der Karte
   * - Nodes werden als Marker dargestellt
   * - Ways werden als Polygone dargestellt
   * @param {Array} platforms - Array von Haltestellen-Objekten mit {type, lat, lng, coordinates, name, tags}
   * @returns {Array} Array von Layer-Referenzen (Marker oder Polygone)
   */
  drawPlatforms(platforms) {
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      console.warn('[PublicTransportRenderer] LayerGroup nicht verfügbar');
      return [];
    }
    
    const map = State.getMap();
    const layers = [];
    
    // Icon für Haltestellen-Marker basierend auf aktuellem Zoom-Level
    const currentZoom = map ? map.getZoom() : 13;
    const platformIcon = this.createPlatformIcon(currentZoom);
    
    // Hilfsfunktion zum Erstellen von Popup-Content
    const createPopupContent = (platform) => {
      let popupContent = `<strong>${platform.name}</strong>`;
      
      // Zusätzliche Informationen aus Tags
      if (platform.tags) {
        if (platform.tags['addr:street'] && platform.tags['addr:housenumber']) {
          popupContent += `<br>${platform.tags['addr:street']} ${platform.tags['addr:housenumber']}`;
        }
        if (platform.tags['addr:postcode'] && platform.tags['addr:city']) {
          popupContent += `<br>${platform.tags['addr:postcode']} ${platform.tags['addr:city']}`;
        }
        if (platform.tags.network) {
          popupContent += `<br>Netzwerk: ${platform.tags.network}`;
        }
        if (platform.tags.operator) {
          popupContent += `<br>Betreiber: ${platform.tags.operator}`;
        }
        if (platform.tags.tram) {
          popupContent += `<br>Straßenbahn: ${platform.tags.tram === 'yes' ? 'Ja' : 'Nein'}`;
        }
        if (platform.tags.bus) {
          popupContent += `<br>Bus: ${platform.tags.bus === 'yes' ? 'Ja' : 'Nein'}`;
        }
      }
      
      return popupContent;
    };
    
    platforms.forEach(platform => {
      if (platform.type === 'way' && platform.coordinates) {
        // Way als Polygon zeichnen
        const polygon = L.polygon(platform.coordinates, {
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.3,
          weight: 2,
          opacity: 0.8
        }).addTo(layerGroup);
        
        // Markiere als Haltestellen-Layer
        polygon._isPlatformLayer = true;
        polygon._platformId = platform.id;
        
        // Popup hinzufügen
        polygon.bindPopup(createPopupContent(platform), {
          maxWidth: 250,
          className: 'platform-popup'
        });
        
        layers.push(polygon);
        
        // Berechne Mittelpunkt des Polygons für Icon
        let centerLat = 0;
        let centerLng = 0;
        const coords = platform.coordinates;
        // Entferne letztes Element falls es das erste wiederholt (geschlossenes Polygon)
        const uniqueCoords = coords.length > 0 && 
          coords[0][0] === coords[coords.length - 1][0] && 
          coords[0][1] === coords[coords.length - 1][1] 
          ? coords.slice(0, -1) 
          : coords;
        
        uniqueCoords.forEach(coord => {
          centerLat += coord[0];
          centerLng += coord[1];
        });
        centerLat /= uniqueCoords.length;
        centerLng /= uniqueCoords.length;
        
        // Marker mit Icon in der Mitte des Polygons
        const centerMarker = L.marker([centerLat, centerLng], { icon: platformIcon })
          .addTo(layerGroup);
        
        // Markiere als Haltestellen-Layer
        centerMarker._isPlatformLayer = true;
        centerMarker._platformId = platform.id;
        
        // Popup hinzufügen
        centerMarker.bindPopup(createPopupContent(platform), {
          maxWidth: 250,
          className: 'platform-popup'
        });
        
        layers.push(centerMarker);
      } else if (platform.lat && platform.lng) {
        // Node oder Relation als Marker zeichnen
        const marker = L.marker([platform.lat, platform.lng], { icon: platformIcon })
          .addTo(layerGroup);
        
        // Markiere als Haltestellen-Layer
        marker._isPlatformLayer = true;
        marker._platformId = platform.id;
        
        // Popup hinzufügen
        marker.bindPopup(createPopupContent(platform), {
          maxWidth: 250,
          className: 'platform-popup'
        });
        
        layers.push(marker);
      }
    });
    
    return layers;
  },
  
  /**
   * Entfernt alle Haltestellen-Layer von der Karte (Marker und Polygone)
   * @param {Array} platformLayers - Array von Layer-Referenzen (Marker oder Polygone)
   */
  clearPlatforms(platformLayers) {
    if (!platformLayers || platformLayers.length === 0) return;
    
    const layerGroup = State.getLayerGroup();
    platformLayers.forEach(layer => {
      if (layer && layerGroup) {
        layerGroup.removeLayer(layer);
      }
    });
  },
  
  /**
   * Zeichnet einen Radius-Kreis für die Haltestellen-Suche
   * @param {number} lat - Breitengrad des Zentrums
   * @param {number} lng - Längengrad des Zentrums
   * @param {number} radiusMeters - Radius in Metern
   * @returns {L.Circle} - Circle-Layer
   */
  drawPlatformSearchRadius(lat, lng, radiusMeters) {
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      console.warn('[PublicTransportRenderer] LayerGroup nicht verfügbar');
      return null;
    }
    
    // Entferne alten Kreis, falls vorhanden
    const oldCircle = State.getPlatformSearchRadiusCircle();
    if (oldCircle) {
      layerGroup.removeLayer(oldCircle);
    }
    
    // Erstelle neuen Kreis
    const circle = L.circle([lat, lng], {
      radius: radiusMeters,
      color: '#666666',
      fillColor: '#999999',
      fillOpacity: 0.2,
      weight: 2,
      opacity: 0.5
    }).addTo(layerGroup);
    
    State.setPlatformSearchRadiusCircle(circle);
    return circle;
  },
  
  /**
   * Entfernt den Radius-Kreis für die Haltestellen-Suche
   */
  clearPlatformSearchRadius() {
    const oldCircle = State.getPlatformSearchRadiusCircle();
    if (oldCircle) {
      const layerGroup = State.getLayerGroup();
      if (layerGroup) {
        layerGroup.removeLayer(oldCircle);
      }
      State.setPlatformSearchRadiusCircle(null);
    }
  }
};

