// ==== School-Renderer: Schul-Visualisierung ====
const SchoolRenderer = {
  /**
   * Erstellt ein Schul-Icon basierend auf dem aktuellen Zoom-Level
   * @param {number} zoom - Aktueller Zoom-Level
   * @returns {L.DivIcon} - Icon für Schul-Marker
   */
  createSchoolIcon(zoom) {
    // Größe basierend auf Zoom-Level: kleiner bei niedrigem Zoom, größer bei hohem Zoom
    // Zoom 10: 10px, Zoom 15: 28px, Zoom 19: 36px
    const baseSize = Math.max(10, Math.min(36, 10 + (zoom - 10) * 2.8));
    const svgSize = Math.max(6, Math.min(22, 6 + (zoom - 10) * 2.8));
    const borderWidth = zoom < 13 ? 1.5 : 2;
    
    return L.divIcon({
      className: 'school-marker-icon',
      html: `
        <div style="
          width: ${baseSize}px;
          height: ${baseSize}px;
          background-color: white;
          border: ${borderWidth}px solid #3b82f6;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        ">
          <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 512 512" fill="#3b82f6" xmlns="http://www.w3.org/2000/svg">
            <path d="M463.313,346.29c-0.758-2.274-2.224-4.747-4.085-6.608l-83.683-83.682l131.503-131.502c6.603-6.603,6.603-17.307,0-23.909
              L411.411,4.952C408.241,1.782,403.941,0,399.456,0s-8.785,1.782-11.954,4.952
              c-4.677,4.677-123.793,123.793-131.502,131.502l-71.724-71.725c-0.001-0.001-0.002-0.002-0.003-0.005
              c-0.001-0.002-0.002-0.002-0.005-0.003l-47.815-47.815c-19.819-19.821-51.904-19.826-71.727,0L16.908,64.726
              c-19.776,19.775-19.776,51.952,0,71.727l119.547,119.547C134.263,258.19,16.761,375.691,4.952,387.5
              c-6.603,6.603-6.603,17.307,0,23.909l95.637,95.639c3.171,3.17,7.47,4.952,11.954,4.952s8.785-1.782,11.954-4.952
              l131.502-131.502l83.682,83.682c1.853,1.853,4.317,3.322,6.608,4.085l143.456,47.818c6.058,2.02,12.762,0.455,17.301-4.085
              c4.529-4.528,6.11-11.226,4.085-17.301L463.313,346.29z M303.82,136.453l23.909,23.91c3.301,3.301,7.628,4.952,11.954,4.952
              s8.654-1.651,11.954-4.952c6.603-6.601,6.603-17.307,0-23.909l-23.909-23.909l23.909-23.909l23.91,23.909
              c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.65,11.954-4.952c6.603-6.603,6.603-17.307,0-23.909l-23.909-23.909
              l23.909-23.909l71.728,71.728L351.638,232.09l-71.728-71.728L303.82,136.453z M423.366,351.637l-23.91,23.91L148.408,124.499
              l23.909-23.909L423.366,351.637z M76.681,148.408l-35.864-35.864c-6.591-6.592-6.591-17.318,0-23.909l47.819-47.819
              c6.607-6.606,17.301-6.609,23.909,0l35.864,35.864C145.133,79.956,79.944,145.145,76.681,148.408z M112.545,471.183l-71.728-71.728
              l23.91-23.909l23.909,23.91c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.651,11.954-4.952c6.603-6.601,6.603-17.307,0-23.909
              l-23.908-23.91l23.909-23.909l23.91,23.909c3.301,3.301,7.628,4.952,11.954,4.952c4.326,0,8.654-1.65,11.954-4.952
              c6.603-6.603,6.603-17.307,0-23.909l-23.91-23.909l23.909-23.909l71.728,71.728L112.545,471.183z M351.637,423.366L100.59,172.317
              l23.909-23.909l251.048,251.048L351.637,423.366z M382.935,439.886l56.952-56.952l28.475,85.427L382.935,439.886z"/>
          </svg>
        </div>
      `,
      iconSize: [baseSize, baseSize],
      iconAnchor: [baseSize / 2, baseSize / 2]
    });
  },
  
  /**
   * Aktualisiert alle Schul-Marker-Icons basierend auf dem aktuellen Zoom-Level
   */
  updateSchoolIcons() {
    const map = State.getMap();
    if (!map) return;
    
    const zoom = map.getZoom();
    const schoolLayers = State.getSchoolMarkers() || [];
    const newIcon = this.createSchoolIcon(zoom);
    
    schoolLayers.forEach(layer => {
      // Nur Marker aktualisieren (nicht Polygone)
      if (layer instanceof L.Marker && layer._isSchoolLayer) {
        layer.setIcon(newIcon);
      }
    });
  },
  
  /**
   * Zeichnet Schulen auf der Karte
   * - Nodes werden als Marker dargestellt
   * - Ways werden als Polygone dargestellt
   * @param {Array} schools - Array von Schul-Objekten mit {type, lat, lng, coordinates, name, tags}
   * @returns {Array} Array von Layer-Referenzen (Marker oder Polygone)
   */
  drawSchools(schools) {
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      console.warn('[SchoolRenderer] LayerGroup nicht verfügbar');
      return [];
    }
    
    const map = State.getMap();
    const layers = [];
    
    // Icon für Schul-Marker basierend auf aktuellem Zoom-Level
    const currentZoom = map ? map.getZoom() : 13;
    const schoolIcon = this.createSchoolIcon(currentZoom);
    
    // Hilfsfunktion zum Erstellen von Popup-Content
    const createPopupContent = (school) => {
      let popupContent = `<strong>${school.name}</strong>`;
      
      // Zusätzliche Informationen aus Tags
      if (school.tags) {
        if (school.tags['addr:street'] && school.tags['addr:housenumber']) {
          popupContent += `<br>${school.tags['addr:street']} ${school.tags['addr:housenumber']}`;
        }
        if (school.tags['addr:postcode'] && school.tags['addr:city']) {
          popupContent += `<br>${school.tags['addr:postcode']} ${school.tags['addr:city']}`;
        }
        if (school.tags.website) {
          popupContent += `<br><a href="${school.tags.website}" target="_blank">Website</a>`;
        }
        if (school.tags.phone) {
          popupContent += `<br>Tel: ${school.tags.phone}`;
        }
      }
      
      return popupContent;
    };
    
    schools.forEach(school => {
      if (school.type === 'way' && school.coordinates) {
        // Way als Polygon zeichnen
        const polygon = L.polygon(school.coordinates, {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.3,
          weight: 2,
          opacity: 0.8
        }).addTo(layerGroup);
        
        // Markiere als Schul-Layer
        polygon._isSchoolLayer = true;
        polygon._schoolId = school.id;
        
        // Popup hinzufügen
        polygon.bindPopup(createPopupContent(school), {
          maxWidth: 250,
          className: 'school-popup'
        });
        
        layers.push(polygon);
        
        // Berechne Mittelpunkt des Polygons für Icon
        let centerLat = 0;
        let centerLng = 0;
        const coords = school.coordinates;
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
        const centerMarker = L.marker([centerLat, centerLng], { icon: schoolIcon })
          .addTo(layerGroup);
        
        // Markiere als Schul-Layer
        centerMarker._isSchoolLayer = true;
        centerMarker._schoolId = school.id;
        
        // Popup hinzufügen
        centerMarker.bindPopup(createPopupContent(school), {
          maxWidth: 250,
          className: 'school-popup'
        });
        
        layers.push(centerMarker);
      } else if (school.lat && school.lng) {
        // Node oder Relation als Marker zeichnen
        const marker = L.marker([school.lat, school.lng], { icon: schoolIcon })
          .addTo(layerGroup);
        
        // Markiere als Schul-Layer
        marker._isSchoolLayer = true;
        marker._schoolId = school.id;
        
        // Popup hinzufügen
        marker.bindPopup(createPopupContent(school), {
          maxWidth: 250,
          className: 'school-popup'
        });
        
        layers.push(marker);
      }
    });
    
    return layers;
  },
  
  /**
   * Entfernt alle Schul-Layer von der Karte (Marker und Polygone)
   * @param {Array} schoolLayers - Array von Layer-Referenzen (Marker oder Polygone)
   */
  clearSchools(schoolLayers) {
    if (!schoolLayers || schoolLayers.length === 0) return;
    
    const layerGroup = State.getLayerGroup();
    schoolLayers.forEach(layer => {
      if (layer && layerGroup) {
        layerGroup.removeLayer(layer);
      }
    });
  },
  
  /**
   * Zeichnet einen Radius-Kreis für die Schul-Suche
   * @param {number} lat - Breitengrad des Zentrums
   * @param {number} lng - Längengrad des Zentrums
   * @param {number} radiusMeters - Radius in Metern
   * @returns {L.Circle} - Circle-Layer
   */
  drawSchoolSearchRadius(lat, lng, radiusMeters) {
    const layerGroup = State.getLayerGroup();
    if (!layerGroup) {
      console.warn('[SchoolRenderer] LayerGroup nicht verfügbar');
      return null;
    }
    
    // Entferne alten Kreis, falls vorhanden
    const oldCircle = State.getSchoolSearchRadiusCircle();
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
    
    State.setSchoolSearchRadiusCircle(circle);
    return circle;
  },
  
  /**
   * Entfernt den Radius-Kreis für die Schul-Suche
   */
  clearSchoolSearchRadius() {
    const oldCircle = State.getSchoolSearchRadiusCircle();
    if (oldCircle) {
      const layerGroup = State.getLayerGroup();
      if (layerGroup) {
        layerGroup.removeLayer(oldCircle);
      }
      State.setSchoolSearchRadiusCircle(null);
    }
  }
};

