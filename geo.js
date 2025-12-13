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
  }
};

