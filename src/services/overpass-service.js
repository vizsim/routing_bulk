// ==== Overpass Service: Abfragen von OpenStreetMap-Daten ====
const OverpassService = {
  _defaultServers: [
    'https://overpass-api.de/api/',
    'https://overpass.kumi.systems/api/',
    'https://maps.mail.ru/osm/tools/overpass/api/',
    'https://overpass.openstreetmap.ru/api/'
  ],

  /**
   * Behandelt Fehler von Overpass API-Abfragen
   * @param {Response|null} response - Die Response von der Overpass API (null bei Netzwerkfehler)
   * @param {string} entityType - Typ der Entität (z.B. "Schulen" oder "ÖPNV-Haltestellen")
   * @throws {Error} Wirft einen Error mit spezifischer Meldung
   */
  _handleOverpassError(response, entityType) {
    if (!response) {
      const message = `Alle Overpass-Server nicht erreichbar. Fehler beim Laden der ${entityType}. ` +
        `Bitte versuche es später erneut.`;
      Utils.showError(message, true);
      throw new Error('Overpass API: alle Server fehlgeschlagen');
    }
    if (response.status === 504) {
      const message = `Die Overpass API hat ein Timeout zurückgegeben. ` +
        `Daten werden direkt via Overpass abgefragt, bitte nicht zu viele Abfragen machen :) ` +
        `Bitte versuche es in ein paar Sekunden erneut.`;
      Utils.showError(message, true);
      throw new Error(`Overpass API Gateway Timeout (504)`);
    }
    const message = `Fehler beim Laden der ${entityType}. ` +
      `Daten werden direkt via Overpass abgefragt, bitte nicht zu viele Abfragen machen :) ` +
      `Bitte versuche es später erneut.`;
    Utils.showError(message, true);
    throw new Error(`Overpass API error: ${response.status}`);
  },

  /**
   * Führt eine Overpass-Anfrage aus; bei Fehler wird der nächste Server aus der Liste versucht.
   * @param {string} query - Overpass QL Query
   * @param {string} entityType - z.B. "Schulen" oder "ÖPNV-Haltestellen"
   * @returns {Promise<Response>} Response mit response.ok
   * @throws {Error} Wenn alle Server fehlschlagen
   */
  async _fetchWithFallback(query, entityType) {
    const servers = (typeof CONFIG !== 'undefined' && CONFIG.OVERPASS_SERVERS?.length)
      ? CONFIG.OVERPASS_SERVERS
      : this._defaultServers;
    let lastResponse = null;
    let lastError = null;

    for (const baseUrl of servers) {
      const url = baseUrl.replace(/\/?$/, '/') + 'interpreter';
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`
        });
        if (response.ok) {
          return response;
        }
        lastResponse = response;
      } catch (err) {
        lastError = err;
        console.warn(`Overpass ${url} fehlgeschlagen:`, err.message || err);
      }
    }

    this._handleOverpassError(lastResponse, entityType);
  },
  
  /**
   * Sucht Schulen im Umkreis einer Position
   * @param {number} lat - Breitengrad
   * @param {number} lng - Längengrad
   * @param {number} radius - Radius in Metern (Standard: 1000)
   * @returns {Promise<Array>} Array von Schul-Objekten mit {id, type, lat, lng, coordinates, name, tags}
   */
  async searchSchools(lat, lng, radius = 1000) {
    // Overpass QL Query für Schulen
    // Wir brauchen die vollständige Geometrie für Ways und Center für Relations
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
      relation["amenity"="school"](around:${radius},${lat},${lng});
      out center;
    `;
    
    try {
      const response = await this._fetchWithFallback(query, 'Schulen');
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
      
      // Verarbeite Relations (als Punkt)
      for (const relation of relations) {
        if (!relation.tags || relation.tags.amenity !== 'school') continue;
        
        // Für Relations verwenden wir den Center-Punkt
        // Overpass gibt center als {lat, lon} zurück
        if (relation.center && relation.center.lat && relation.center.lon) {
          schools.push({
            id: relation.id,
            type: 'relation',
            lat: relation.center.lat,
            lng: relation.center.lon,
            name: relation.tags?.name || 'Unbenannte Schule',
            tags: relation.tags || {}
          });
        } else if (relation.lat && relation.lon) {
          // Fallback: Falls center direkt auf der Relation ist
          schools.push({
            id: relation.id,
            type: 'relation',
            lat: relation.lat,
            lng: relation.lon,
            name: relation.tags?.name || 'Unbenannte Schule',
            tags: relation.tags || {}
          });
        }
      }
      
      return schools;
    } catch (error) {
      // Fehler wurde bereits in _handleOverpassError behandelt
      console.error('Fehler bei Overpass-Abfrage (Schulen):', error);
      return [];
    }
  },
  
  /**
   * Sucht ÖPNV-Haltestellen (public_transport=platform) im Umkreis einer Position
   * @param {number} lat - Breitengrad
   * @param {number} lng - Längengrad
   * @param {number} radius - Radius in Metern (Standard: 1000)
   * @returns {Promise<Array>} Array von Haltestellen-Objekten mit {id, type, lat, lng, coordinates, name, tags}
   */
  async searchPublicTransportPlatforms(lat, lng, radius = 1000) {
    // Overpass QL Query für ÖPNV-Haltestellen
    // Wir brauchen die vollständige Geometrie für Ways und Center für Relations
    const query = `
      [out:json][timeout:25];
      (
        node["public_transport"="platform"](around:${radius},${lat},${lng});
        way["public_transport"="platform"](around:${radius},${lat},${lng});
        relation["public_transport"="platform"](around:${radius},${lat},${lng});
      );
      out body;
      >;
      out skel qt;
      relation["public_transport"="platform"](around:${radius},${lat},${lng});
      out center;
    `;
    
    try {
      const response = await this._fetchWithFallback(query, 'ÖPNV-Haltestellen');
      const data = await response.json();
      
      // Verarbeite die Ergebnisse
      const platforms = [];
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
        if (element.type === 'node' && element.tags && element.tags.public_transport === 'platform') {
          platforms.push({
            id: element.id,
            type: 'node',
            lat: element.lat,
            lng: element.lon,
            name: element.tags?.name || 'Unbenannte Haltestelle',
            tags: element.tags || {}
          });
        }
      }
      
      // Verarbeite Ways (als Polygone)
      for (const way of ways) {
        if (!way.tags || way.tags.public_transport !== 'platform') continue;
        
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
          
          platforms.push({
            id: way.id,
            type: 'way',
            coordinates: coordinates,
            name: way.tags?.name || 'Unbenannte Haltestelle',
            tags: way.tags || {}
          });
        }
      }
      
      // Verarbeite Relations (als Punkt)
      for (const relation of relations) {
        if (!relation.tags || relation.tags.public_transport !== 'platform') continue;
        
        // Für Relations verwenden wir den Center-Punkt
        // Overpass gibt center als {lat, lon} zurück
        if (relation.center && relation.center.lat && relation.center.lon) {
          platforms.push({
            id: relation.id,
            type: 'relation',
            lat: relation.center.lat,
            lng: relation.center.lon,
            name: relation.tags?.name || 'Unbenannte Haltestelle',
            tags: relation.tags || {}
          });
        } else if (relation.lat && relation.lon) {
          // Fallback: Falls center direkt auf der Relation ist
          platforms.push({
            id: relation.id,
            type: 'relation',
            lat: relation.lat,
            lng: relation.lon,
            name: relation.tags?.name || 'Unbenannte Haltestelle',
            tags: relation.tags || {}
          });
        }
      }
      
      return platforms;
    } catch (error) {
      // Fehler wurde bereits in _handleOverpassError behandelt
      console.error('Fehler bei Overpass-Abfrage (Haltestellen):', error);
      return [];
    }
  }
};

