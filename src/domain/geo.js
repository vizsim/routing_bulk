// ==== Geo-Helfer ====
const Geo = {
  toRad(d) {
    return d * Math.PI / 180;
  },
  
  toDeg(r) {
    return r * 180 / Math.PI;
  },
  
  // Gleichverteilte Zufallspunkte in einem Kreis (nicht am Rand "häufiger")
  randomPointInRadius(lat, lon, radiusM) {
    const R = 6371000; // Erdradius
    const u = Math.random();
    const v = Math.random();
    const w = radiusM * Math.sqrt(u);
    const t = 2 * Math.PI * v;

    const dLat = (w * Math.sin(t)) / R;
    const dLon = (w * Math.cos(t)) / (R * Math.cos(this.toRad(lat)));

    return [lat + this.toDeg(dLat), lon + this.toDeg(dLon)];
  },
  
  // Leaflet [lat,lon] -> GraphHopper [lon,lat]
  llToGhPoint(lat, lon) {
    return [lon, lat];
  },
  
  // Berechnet die Luftlinien-Distanz zwischen zwei Punkten in Metern (Haversine-Formel)
  distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Erdradius in Metern
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * Berechnet die echte Routenlänge in Metern aus einer Koordinatenfolge [lat, lon][].
   * @param {Array<Array<number>>} coords - Array von [lat, lon]
   * @returns {number} Länge in Metern
   */
  routeLengthMeters(coords) {
    if (!coords || coords.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < coords.length; i++) {
      const [lat1, lon1] = coords[i - 1];
      const [lat2, lon2] = coords[i];
      sum += this.distanceMeters(lat1, lon1, lat2, lon2);
    }
    return sum;
  },
  
  // Generiert einen Punkt in einer bestimmten Distanz vom Zielpunkt
  pointAtDistance(lat, lon, distanceM, angleRad) {
    const R = 6371000; // Erdradius
    const dLat = (distanceM * Math.sin(angleRad)) / R;
    const dLon = (distanceM * Math.cos(angleRad)) / (R * Math.cos(this.toRad(lat)));
    return [lat + this.toDeg(dLat), lon + this.toDeg(dLon)];
  },
  
  // Generiert Startpunkte basierend auf angepasster Verteilung
  generatePointsFromDistribution(targetLat, targetLon, radiusM, numPoints) {
    const expectedDistribution = State.getExpectedDistribution();
    
    // Wenn keine angepasste Verteilung vorhanden, verwende Standard-Methode
    if (!expectedDistribution || expectedDistribution.length === 0) {
      return Array.from({ length: numPoints }, () => 
        this.randomPointInRadius(targetLat, targetLon, radiusM)
      );
    }
    
    // Berechne Bin-Größe
    const numBins = expectedDistribution.length;
    const binSize = radiusM / numBins;
    
    // Normalisiere Verteilung (sollte numPoints ergeben)
    const totalExpected = expectedDistribution.reduce((sum, val) => sum + val, 0);
    const normalizedDist = expectedDistribution.map(val => 
      totalExpected > 0 ? (val / totalExpected) * numPoints : numPoints / numBins
    );
    
    // Generiere Punkte für jeden Bin
    const points = [];
    normalizedDist.forEach((count, binIndex) => {
      const numPointsInBin = Math.round(count);
      const binStartDist = binIndex * binSize;
      const binEndDist = (binIndex + 1) * binSize;
      
      for (let i = 0; i < numPointsInBin && points.length < numPoints; i++) {
        // Zufällige Distanz innerhalb des Bins
        const randomDist = binStartDist + Math.random() * (binEndDist - binStartDist);
        // Zufälliger Winkel
        const randomAngle = Math.random() * 2 * Math.PI;
        
        const point = this.pointAtDistance(targetLat, targetLon, randomDist, randomAngle);
        points.push(point);
      }
    });
    
    // Falls noch nicht genug Punkte, fülle mit zufälligen auf
    while (points.length < numPoints) {
      points.push(this.randomPointInRadius(targetLat, targetLon, radiusM));
    }
    
    // Mische die Punkte, damit sie nicht nach Bins sortiert sind
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
    
    return points.slice(0, numPoints);
  }
};

