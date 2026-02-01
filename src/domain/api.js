// ==== API-Funktionen ====
const API = {
  async fetchRoute(startLatLng, endLatLng) {
    const body = {
      profile: CONFIG.PROFILE,
      points: [
        Geo.llToGhPoint(startLatLng[0], startLatLng[1]),
        Geo.llToGhPoint(endLatLng[0], endLatLng[1]),
      ],
      points_encoded: false, // Wichtig: unencoded coordinates zurückgeben
      instructions: false, // Nicht benötigt
      elevation: false
    };

    const res = await fetch(CONFIG.GH_ROUTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Route-Fehler ${res.status}: ${txt.slice(0,200)}`);
    }

    const data = await res.json();
    return data;
  },
  
  extractRouteCoordinates(ghResponse) {
    const path = ghResponse.paths?.[0];
    if (!path) {
      return null;
    }

    let coords = null;
    
    // Versuche verschiedene Formate
    if (path.points?.coordinates) {
      coords = path.points.coordinates;
    } else if (path.geometry?.coordinates) {
      coords = path.geometry.coordinates;
    } else if (path.points && typeof path.points === 'string') {
      return null;
    }

    if (!coords || !coords.length) {
      return null;
    }

    // GraphHopper gibt [lon, lat] zurück, konvertiere zu [lat, lon]
    return coords.map(([lon, lat]) => [lat, lon]);
  },

  /**
   * Liest die Routenlänge in Metern aus der GraphHopper-Response (paths[0].distance).
   * @param {Object} ghResponse - Response von POST /route
   * @returns {number|null} - Distanz in Metern oder null
   * @see https://docs.graphhopper.com/openapi/routing/postroute
   */
  extractRouteDistance(ghResponse) {
    const path = ghResponse.paths?.[0];
    if (path == null || typeof path.distance !== 'number') return null;
    return path.distance;
  }
};

