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
  }
};

