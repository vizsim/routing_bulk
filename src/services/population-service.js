// ==== Population-Service: Einwohnergewichtung via PMTiles ====
// Lädt 100×100 m Polygone aus PMTiles, filtert nach Radius, gewichtet Startpunkte nach Einwohnerzahl.

(function () {
  "use strict";

  const DEFAULT_EXTENT = 4096;

  /**
   * Minimaler MVT-Parser (Tile → Layer → Feature mit Polygon + properties).
   * Nutzt globales Pbf (pbf.js). Liefert für jeden Layer: { name, extent, features: [{ type, properties, loadGeometry }] }.
   */
  function parseMVT(buffer) {
    const Pbf = typeof window !== "undefined" && window.Pbf;
    if (!Pbf) {
      throw new Error("Population-Service: Pbf nicht geladen. Bitte pbf.js vor population-service.js einbinden.");
    }
    const pbf = new Pbf(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer);
    const layers = {};
    pbf.readFields(readTile, layers, undefined);
    return layers;
  }

  function readTile(tag, layers, pbf) {
    if (tag === 3) {
      const end = pbf.readVarint() + pbf.pos;
      const layer = readLayer(pbf, end);
      if (layer.features.length) layers[layer.name] = layer;
    }
  }

  function readLayer(pbf, end) {
    const layer = { name: null, extent: DEFAULT_EXTENT, keys: [], values: [], _featurePositions: [] };
    pbf.readFields(readLayerField, layer, end);
    layer.features = (layer._featurePositions || []).map(function (pos) {
      pbf.pos = pos;
      const featEnd = pbf.readVarint() + pbf.pos;
      return readFeature(pbf, featEnd, layer.extent, layer.keys, layer.values);
    });
    return layer;
  }

  function readLayerField(tag, layer, pbf) {
    if (tag === 15) layer.version = pbf.readVarint();
    else if (tag === 1) layer.name = pbf.readString();
    else if (tag === 5) layer.extent = pbf.readVarint();
    else if (tag === 2) (layer._featurePositions = layer._featurePositions || []).push(pbf.pos);
    else if (tag === 3) layer.keys.push(pbf.readString());
    else if (tag === 4) layer.values.push(readValueMessage(pbf));
  }

  function readValueMessage(pbf) {
    const end = pbf.readVarint() + pbf.pos;
    let value = null;
    while (pbf.pos < end) {
      const val = pbf.readVarint();
      const tag = val >> 3;
      if (tag === 1) value = pbf.readString();
      else if (tag === 2) value = pbf.readFloat();
      else if (tag === 3) value = pbf.readDouble();
      else if (tag === 4) value = (typeof pbf.readVarint64 === 'function' ? pbf.readVarint64() : pbf.readVarint());
      else if (tag === 5) value = pbf.readVarint();
      else if (tag === 6) value = pbf.readSVarint();
      else if (tag === 7) value = pbf.readBoolean();
      else pbf.skip(val);
    }
    return value;
  }

  function readFeature(pbf, end, extent, keys, values) {
    const feature = {
      type: 0,
      properties: {},
      _geometryPos: -1,
      _keys: keys,
      _values: values,
      _extent: extent
    };
    pbf.readFields(readFeatureField, feature, end);
    feature.loadGeometry = function () {
      return loadGeometry(pbf, feature._geometryPos);
    };
    return feature;
  }

  function readFeatureField(tag, feature, pbf) {
    if (tag === 1) feature.id = pbf.readVarint();
    else if (tag === 2) readTag(pbf, feature);
    else if (tag === 3) feature.type = pbf.readVarint();
    else if (tag === 4) feature._geometryPos = pbf.pos;
  }

  function readTag(pbf, feature) {
    const end = pbf.readVarint() + pbf.pos;
    while (pbf.pos < end) {
      const key = feature._keys[pbf.readVarint()];
      const value = feature._values[pbf.readVarint()];
      feature.properties[key] = value;
    }
  }

  function loadGeometry(pbf, geometryPos) {
    pbf.pos = geometryPos;
    const end = pbf.readVarint() + pbf.pos;
    let cmd = 1, length = 0, x = 0, y = 0, lines = [], line;
    while (pbf.pos < end) {
      if (length <= 0) {
        const cmdLen = pbf.readVarint();
        cmd = cmdLen & 0x7;
        length = cmdLen >> 3;
      }
      length--;
      if (cmd === 1 || cmd === 2) {
        x += pbf.readSVarint();
        y += pbf.readSVarint();
        if (cmd === 1) {
          if (line) lines.push(line);
          line = [];
        }
        line.push({ x: x, y: y });
      } else if (cmd === 7) {
        if (line && line.length) line.push({ x: line[0].x, y: line[0].y });
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * Tile-Koordinaten (extent 4096) → WGS84 [lat, lon].
   * Web-Mercator-konform (wie OSM/PMTiles), damit Tile-Indizes und Koordinaten zusammenpassen.
   */
  function tileCoordToWgs84(px, py, z, tileX, tileY, extent) {
    const n = Math.pow(2, z);
    const lon = (tileX + px / extent) * 360 / n - 180;
    const yMerc = (tileY + py / extent) / n;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yMerc)));
    const lat = latRad * 180 / Math.PI;
    return [lat, lon];
  }

  /** WGS84 [lat, lon] → Tile-Pixel (px, py) für ein Tile (z, tileX, tileY, extent). */
  function wgs84ToTileCoord(lat, lon, z, tileX, tileY, extent) {
    const n = Math.pow(2, z);
    const px = ((lon + 180) / 360 * n - tileX) * extent;
    const latRad = lat * Math.PI / 180;
    const yMerc = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    const py = (yMerc - tileY) * extent;
    return [px, py];
  }

  /**
   * Prüft ob ein Punkt [lat, lon] innerhalb des Kreises (centerLat, centerLon, radiusM) liegt.
   */
  function pointInCircle(lat, lon, centerLat, centerLon, radiusM) {
    const R = 6371000;
    const dLat = (lat - centerLat) * Math.PI / 180;
    const dLon = (lon - centerLon) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c <= radiusM;
  }

  /**
   * Bounding-Box um Kreis (lat, lon, radiusM) in WGS84 [minLon, minLat, maxLon, maxLat].
   */
  function circleToBBox(lat, lon, radiusM) {
    const R = 6371000;
    const dLat = (radiusM / R) * 180 / Math.PI;
    const dLon = (radiusM / (R * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;
    return [
      lon - dLon,
      lat - dLat,
      lon + dLon,
      lat + dLat
    ];
  }

  /**
   * Lat → Tile-Y (Web Mercator / OSM XYZ).
   */
  function latToTileY(lat, z) {
    const latRad = lat * Math.PI / 180;
    const n = Math.pow(2, z);
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return Math.max(0, Math.min(n - 1, Math.floor(y)));
  }

  /**
   * Tile-Indizes (z,x,y) die eine BBox [minLon, minLat, maxLon, maxLat] schneiden.
   * Y-Berechnung Web-Mercator-konform (wie PMTiles/OSM).
   */
  function bboxToTileRange(bbox, z) {
    const n = Math.pow(2, z);
    const minLon = bbox[0], minLat = bbox[1], maxLon = bbox[2], maxLat = bbox[3];
    const minX = Math.max(0, Math.floor((minLon + 180) / 360 * n));
    const maxX = Math.min(n - 1, Math.floor((maxLon + 180) / 360 * n));
    const minY = latToTileY(maxLat, z);
    const maxY = latToTileY(minLat, z);
    const tiles = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push([z, x, y]);
      }
    }
    return tiles;
  }

  /**
   * Polygon-Ringe (tile coords) → WGS84 und prüfen ob Zentroid im Kreis liegt.
   */
  function polygonRingsToWgs84AndTest(rings, z, tileX, tileY, extent, centerLat, centerLon, radiusM) {
    if (!rings || !rings.length) return null;
    const firstRing = rings[0];
    if (!firstRing || firstRing.length < 3) return null;
    let sumX = 0, sumY = 0, count = 0;
    for (let i = 0; i < firstRing.length; i++) {
      sumX += firstRing[i].x;
      sumY += firstRing[i].y;
      count++;
    }
    const cx = sumX / count;
    const cy = sumY / count;
    const [lat, lon] = tileCoordToWgs84(cx, cy, z, tileX, tileY, extent);
    if (!pointInCircle(lat, lon, centerLat, centerLon, radiusM)) return null;
    return { lat, lon, rings, z, tileX, tileY, extent };
  }

  /**
   * Zufallspunkt in einem Polygon (erster Ring als konvexes Polygon vereinfacht: BBox + Punkt-in-Polygon).
   */
  function randomPointInPolygon(wgs84Feature) {
    const rings = wgs84Feature.rings;
    if (!rings || !rings[0] || rings[0].length < 3) return [wgs84Feature.lat, wgs84Feature.lon];
    const pts = rings[0];
    const z = wgs84Feature.z;
    const tileX = wgs84Feature.tileX;
    const tileY = wgs84Feature.tileY;
    const extent = wgs84Feature.extent;
    let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      minX = Math.min(minX, pts[i].x);
      maxX = Math.max(maxX, pts[i].x);
      minY = Math.min(minY, pts[i].y);
      maxY = Math.max(maxY, pts[i].y);
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      const px = minX + Math.random() * (maxX - minX);
      const py = minY + Math.random() * (maxY - minY);
      if (pointInPolygonTile(px, py, pts)) {
        const [lat, lon] = tileCoordToWgs84(px, py, z, tileX, tileY, extent);
        return [lat, lon];
      }
    }
    return [wgs84Feature.lat, wgs84Feature.lon];
  }

  function pointInPolygonTile(x, y, ring) {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i].x, yi = ring[i].y;
      const xj = ring[j].x, yj = ring[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  let _pmtilesInstance = null;
  let _pmtilesUrl = null;

  function getPMTiles() {
    const url = (typeof CONFIG !== "undefined" && CONFIG.POPULATION_PMTILES_URL) || "";
    if (!url) return null;
    if (_pmtilesInstance && _pmtilesUrl === url) return _pmtilesInstance;
    const PMTiles = typeof window !== "undefined" && window.pmtiles && window.pmtiles.PMTiles;
    if (!PMTiles) {
      Utils && Utils.logError && Utils.logError("PopulationService", "pmtiles nicht geladen.");
      return null;
    }
    _pmtilesUrl = url;
    _pmtilesInstance = new PMTiles(url);
    return _pmtilesInstance;
  }

  /**
   * Liest Einwohnerzahl aus Feature-Properties. Versucht konfigurierten Namen, dann Kleinbuchstaben, dann passende Keys.
   * @param {Object} properties - MVT-Feature properties
   * @param {string} propName - Konfigurierter Attributname (z. B. "Einwohner")
   * @returns {number} - Einwohnerzahl (0 wenn nicht gefunden)
   */
  function getPopulationFromFeature(properties, propName) {
    if (!properties || typeof properties !== "object") return 0;
    const tryVal = function (v) {
      if (v == null) return null;
      if (typeof v === "number" && !isNaN(v)) return Math.max(0, v);
      if (typeof v === "string") return Math.max(0, parseFloat(v) || 0);
      return null;
    };
    let val = tryVal(properties[propName]);
    if (val != null) return val;
    if (propName !== propName.toLowerCase()) {
      val = tryVal(properties[propName.toLowerCase()]);
      if (val != null) return val;
    }
    val = tryVal(properties["Einwohnerzahl"]) ?? tryVal(properties["einwohnerzahl"]);
    if (val != null) return val;
    const match = /einwohner|population|pop|bewohner/i;
    for (const key in properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key) && match.test(key)) {
        val = tryVal(properties[key]);
        if (val != null) return val;
      }
    }
    return 0;
  }

  /**
   * Lädt alle Polygone mit Einwohner-Attribut im Radius.
   * @returns {Promise<Array<{ geometry: { rings, z, tileX, tileY, extent }, population: number }>>}
   */
  /** Layer-Namen für ein Tile: konfigurierter Layer, falls vorhanden, sonst alle. Bindestrich/Unterstrich-Varianten werden probiert. */
  function getLayerKeysForTile(layers, layerName) {
    if (!layerName) return Object.keys(layers);
    if (layers[layerName]) return [layerName];
    const alt = layerName.replace(/-/g, "_");
    if (layers[alt]) return [alt];
    const alt2 = layerName.replace(/_/g, "-");
    if (layers[alt2]) return [alt2];
    return Object.keys(layers);
  }

  async function getPopulationFeaturesInRadius(lat, lon, radiusM) {
    const propName = (typeof CONFIG !== "undefined" && CONFIG.POPULATION_PROPERTY) || "einwohner";
    const layerName = (typeof CONFIG !== "undefined" && CONFIG.POPULATION_LAYER_NAME) || "";
    const configZoom = (typeof CONFIG !== "undefined" && CONFIG.POPULATION_ZOOM) != null ? CONFIG.POPULATION_ZOOM : 14;

    const pm = getPMTiles();
    if (!pm) {
      if (typeof Utils !== "undefined" && Utils.logError) Utils.logError("PopulationService", "PMTiles nicht geladen (getPMTiles null)");
      return [];
    }

    let header = null;
    if (typeof pm.getHeader === "function") {
      try {
        header = await pm.getHeader();
      } catch (e) {
        if (typeof Utils !== "undefined" && Utils.logError) Utils.logError("PopulationService", "getHeader fehlgeschlagen: " + e);
        return [];
      }
    }
    const maxZoom = (header && typeof header.maxZoom === "number") ? header.maxZoom : configZoom;
    const zoom = Math.min(configZoom, maxZoom);

    const bbox = circleToBBox(lat, lon, radiusM);
    const tiles = bboxToTileRange(bbox, zoom);
    const results = [];

    for (const [z, tileX, tileY] of tiles) {
      try {
        const resp = await pm.getZxy(z, tileX, tileY);
        const data = resp && (resp.data != null ? resp.data : (resp instanceof ArrayBuffer ? resp : null));
        if (!data) continue;
        const layers = parseMVT(data);
        const layerKeys = getLayerKeysForTile(layers, layerName);
        for (const lname of layerKeys) {
          const layer = layers[lname];
          if (!layer) continue;
          const extent = layer.extent || DEFAULT_EXTENT;
          for (let i = 0; i < layer.features.length; i++) {
            const f = layer.features[i];
            if (f.type !== 3) continue; // 3 = Polygon
            const rings = f.loadGeometry();
            const wgs84 = polygonRingsToWgs84AndTest(rings, z, tileX, tileY, extent, lat, lon, radiusM);
            if (!wgs84) continue;
            const pop = getPopulationFromFeature(f.properties, propName);
            results.push({
              geometry: { rings, z, tileX, tileY, extent },
              center: [wgs84.lat, wgs84.lon],
              population: Math.max(0, pop)
            });
          }
        }
      } catch (e) {
        if (typeof Utils !== "undefined" && Utils.logError) Utils.logError("PopulationService", e);
      }
    }

    return results;
  }

  /**
   * Wählt ein Polygon per gewichteter Zufallsauswahl (Mit Zurücklegen).
   * @param {Array} features - Liste { center, population, geometry }
   * @param {number} totalWeight - Summe der population
   * @returns {Object} - gewähltes Feature
   */
  function sampleOneByPopulation(features, totalWeight) {
    let r = Math.random() * totalWeight;
    for (let j = 0; j < features.length; j++) {
      r -= features[j].population;
      if (r <= 0) return features[j];
    }
    return features[features.length - 1];
  }

  /**
   * Startpunkte: Zuerst Längenverteilung (stark), dann innerhalb jedes Distanz-Bereichs nach Einwohner gewichten.
   * 1. Verteilung legt fest, wie viele Startpunkte in welchem Distanz-Bin liegen.
   * 2. Pro Bin werden die Polygone nur nach Einwohnerzahl gewichtet ausgewählt.
   * @param {number} lat - Ziel-Lat
   * @param {number} lon - Ziel-Lon
   * @param {number} radiusM - Radius in m
   * @param {number} numPoints - Anzahl Startpunkte
   * @param {string} [distType] - 'lognormal' | 'uniform' | 'near' | 'far' | 'normal'
   * @returns {Promise<Array<[number, number]>>} [lat, lon][]
   */
  async function getWeightedStartPoints(lat, lon, radiusM, numPoints, distType) {
    const allFeatures = await getPopulationFeaturesInRadius(lat, lon, radiusM);
    const features = allFeatures.filter(f => f.population > 0);
    if (features.length === 0) return [];

    const type = (distType && typeof distType === "string") ? distType : "lognormal";
    const numBins = Math.min(15, Math.max(1, numPoints));
    const binSize = radiusM / numBins;
    const distanceMeters = (typeof Geo !== "undefined" && Geo.distanceMeters)
      ? function (lat1, lon1, lat2, lon2) { return Geo.distanceMeters.call(Geo, lat1, lon1, lat2, lon2); }
      : function () { return 0; };

    const featuresByBin = Array.from({ length: numBins }, function () { return []; });
    for (let i = 0; i < features.length; i++) {
      const d = distanceMeters(features[i].center[0], features[i].center[1], lat, lon);
      const binIndex = Math.min(Math.floor(d / binSize), numBins - 1);
      if (binIndex >= 0) featuresByBin[binIndex].push(features[i]);
    }

    const targetCount = [];
    if (typeof Distribution !== "undefined" && Distribution.calculateDistribution) {
      const expectedBins = Distribution.calculateDistribution(type, numBins, radiusM, numPoints);
      let sum = 0;
      for (let b = 0; b < numBins; b++) {
        targetCount[b] = Math.max(0, Math.round(expectedBins[b] || 0));
        sum += targetCount[b];
      }
      let diff = numPoints - sum;
      let idx = 0;
      while (diff !== 0 && idx < numBins * 2) {
        const binIdx = idx % numBins;
        if (diff > 0 && (expectedBins[binIdx] || 0) > 0) {
          targetCount[binIdx]++;
          diff--;
        } else if (diff < 0 && targetCount[binIdx] > 0) {
          targetCount[binIdx]--;
          diff++;
        }
        idx++;
      }
    } else {
      for (let b = 0; b < numBins; b++) targetCount[b] = Math.floor(numPoints / numBins);
      targetCount[0] += numPoints - targetCount.reduce(function (s, c) { return s + c; }, 0);
    }

    // Bins ohne Polygone: Soll-Anzahl umverteilen auf Bins mit Polygonen
    let pool = 0;
    for (let b = 0; b < numBins; b++) {
      if (targetCount[b] > 0 && featuresByBin[b].length === 0) {
        pool += targetCount[b];
        targetCount[b] = 0;
      }
    }
    while (pool > 0) {
      let moved = false;
      for (let b = 0; b < numBins && pool > 0; b++) {
        if (featuresByBin[b].length > 0) {
          targetCount[b]++;
          pool--;
          moved = true;
        }
      }
      if (!moved) break;
    }

    const points = [];
    for (let b = 0; b < numBins; b++) {
      const list = featuresByBin[b];
      const n = targetCount[b] || 0;
      if (n <= 0 || list.length === 0) continue;
      const totalPop = list.reduce(function (s, f) { return s + f.population; }, 0);
      if (totalPop <= 0) continue;
      for (let i = 0; i < n; i++) {
        const chosen = sampleOneByPopulation(list, totalPop);
        points.push(randomPointInPolygon(toWgs84Feature(chosen)));
      }
    }
    if (points.length < numPoints && features.length > 0) {
      const totalPop = features.reduce(function (s, f) { return s + f.population; }, 0);
      for (let i = points.length; i < numPoints && totalPop > 0; i++) {
        const chosen = sampleOneByPopulation(features, totalPop);
        points.push(randomPointInPolygon(toWgs84Feature(chosen)));
      }
    }
    return points;
  }

  function toWgs84Feature(chosen) {
    return {
      lat: chosen.center[0],
      lon: chosen.center[1],
      rings: chosen.geometry.rings,
      z: chosen.geometry.z,
      tileX: chosen.geometry.tileX,
      tileY: chosen.geometry.tileY,
      extent: chosen.geometry.extent
    };
  }

  /**
   * Liefert den maxZoom aus dem PMTiles-Header (für Overzoom im Karten-Layer).
   * @returns {Promise<number>} - maxZoom aus Archiv, oder Fallback (z. B. 14)
   */
  async function getPopulationPMTilesMaxZoom() {
    const pm = getPMTiles();
    if (!pm || typeof pm.getHeader !== 'function') return (typeof CONFIG !== 'undefined' && CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM != null) ? CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM : 14;
    try {
      const header = await pm.getHeader();
      return header != null && typeof header.maxZoom === 'number' ? header.maxZoom : (typeof CONFIG !== 'undefined' && CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM != null ? CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM : 14);
    } catch (e) {
      return (typeof CONFIG !== 'undefined' && CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM != null) ? CONFIG.POPULATION_LAYER_MAX_NATIVE_ZOOM : 14;
    }
  }

  /**
   * Liefert die Einwohnerzahl des Polygons, das den Punkt (lat, lon) enthält, oder null.
   * Für Hover-Tooltip auf dem Einwohner-Layer.
   * @param {number} lat
   * @param {number} lon
   * @returns {Promise<{ population: number }|null>}
   */
  async function getPopulationAtPoint(lat, lon) {
    const features = await getPopulationFeaturesInRadius(lat, lon, 120);
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const g = f.geometry;
      if (!g || !g.rings || !g.rings[0]) continue;
      const [px, py] = wgs84ToTileCoord(lat, lon, g.z, g.tileX, g.tileY, g.extent || DEFAULT_EXTENT);
      if (pointInPolygonTile(px, py, g.rings[0])) return { population: f.population };
    }
    return null;
  }

  window.PopulationService = {
    getPopulationFeaturesInRadius,
    getWeightedStartPoints,
    getPopulationAtPoint,
    getPMTiles,
    getPopulationPMTilesMaxZoom,
    parseMVT
  };
})();
