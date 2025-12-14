// ==== Overpass Service: Abfragen von OpenStreetMap-Daten ====
const OverpassService = {
  /**
   * Sucht Schulen im Umkreis einer Position
   * @param {number} lat - Breitengrad
   * @param {number} lng - Längengrad
   * @param {number} radius - Radius in Metern (Standard: 500)
   * @returns {Promise<Array>} Array von Schul-Objekten mit {id, type, lat, lng, coordinates, name, tags}
   */
  async searchSchools(lat, lng, radius = 500) {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    
    // Overpass QL Query für Schulen
    // Wir brauchen die vollständige Geometrie für Ways
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="school"](around:${radius},${lat},${lng});
        way["amenity"="school"](around:${radius},${lat},${lng});
        relation["amenity"="school"](around:${radius},${lat},${lng});
      );
      out body;
      >;
      out skel qt;
    `;
    
    try {
      const response = await fetch(overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`
      });
      
      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Verarbeite die Ergebnisse
      const schools = [];
      const elements = data.elements || [];
      
      // Erstelle eine Map von Node-IDs zu Koordinaten (für Ways)
      const nodeMap = new Map();
      const ways = [];
      const relations = [];
      
      // Zuerst alle Nodes sammeln
      for (const element of elements) {
        if (element.type === 'node' && element.lat !== undefined && element.lon !== undefined) {
          nodeMap.set(element.id, [element.lat, element.lon]);
        }
      }
      
      // Dann alle Ways und Relations sammeln
      for (const element of elements) {
        if (element.type === 'way' && element.nodes) {
          ways.push(element);
        } else if (element.type === 'relation') {
          relations.push(element);
        }
      }
      
      // Verarbeite Nodes (als Punkt-Marker)
      for (const element of elements) {
        if (element.type === 'node' && element.tags && element.tags.amenity === 'school') {
          schools.push({
            id: element.id,
            type: 'node',
            lat: element.lat,
            lng: element.lon,
            name: element.tags?.name || 'Unbenannte Schule',
            tags: element.tags || {}
          });
        }
      }
      
      // Verarbeite Ways (als Polygone)
      for (const way of ways) {
        if (!way.tags || way.tags.amenity !== 'school') continue;
        
        // Sammle Koordinaten der Nodes des Ways
        const coordinates = [];
        for (const nodeId of way.nodes) {
          const coord = nodeMap.get(nodeId);
          if (coord) {
            coordinates.push(coord);
          }
        }
        
        // Nur Ways mit mindestens 3 Punkten (geschlossenes Polygon)
        if (coordinates.length >= 3) {
          // Stelle sicher, dass das Polygon geschlossen ist
          if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
              coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
            coordinates.push(coordinates[0]);
          }
          
          schools.push({
            id: way.id,
            type: 'way',
            coordinates: coordinates,
            name: way.tags?.name || 'Unbenannte Schule',
            tags: way.tags || {}
          });
        }
      }
      
      // Verarbeite Relations (vereinfacht als Punkt, da komplexer)
      for (const relation of relations) {
        if (!relation.tags || relation.tags.amenity !== 'school') continue;
        
        // Für Relations verwenden wir den Center-Punkt (falls vorhanden)
        if (relation.center) {
          schools.push({
            id: relation.id,
            type: 'relation',
            lat: relation.center.lat,
            lng: relation.center.lon,
            name: relation.tags?.name || 'Unbenannte Schule',
            tags: relation.tags || {}
          });
        }
      }
      
      return schools;
    } catch (error) {
      console.error('Fehler bei Overpass-Abfrage:', error);
      Utils.showError('Fehler beim Laden der Schulen. Bitte versuchen Sie es später erneut.', true);
      return [];
    }
  }
};

