// ==== Visualisierung ====
const Visualization = {
  drawRoute(ghResponse, color) {
    const latlngs = API.extractRouteCoordinates(ghResponse);
    if (!latlngs) {
      return null;
    }

    const layerGroup = State.getLayerGroup();
    const polyline = L.polyline(latlngs, { 
      weight: 4, 
      opacity: 0.8, 
      color: color
    }).addTo(layerGroup);
    
    return polyline; // Referenz zurückgeben
  },
  
  drawTargetPoint(latlng) {
    const layerGroup = State.getLayerGroup();
    
    // SVG-Icon für Zielpunkt
    const targetIcon = L.divIcon({
      className: 'target-point-icon',
      html: `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <g transform="translate(12, 10) scale(0.4) translate(-16, -16)">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" stroke-miterlimit="10">
              <line x1="6" y1="28" x2="6" y2="5" stroke="white" stroke-width="3" stroke-linecap="round"></line>
              <polyline points="6,5 26,5 26,19 6,19" stroke="white" stroke-width="1.5"></polyline>
              <rect x="6" y="5" width="10" height="7" fill="white"></rect>
              <rect x="16" y="12" width="10" height="7" fill="white"></rect>
            </svg>
          </g>
        </svg>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    
    L.marker(latlng, { icon: targetIcon }).addTo(layerGroup);
  },
  
  updateDistanceHistogram(starts, target) {
    const canvas = document.getElementById('distance-histogram');
    if (!canvas) return;
    
    // Retina-Display Support
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Verwende die ursprüngliche Canvas-Größe aus dem HTML (250x120)
    const baseWidth = 250;
    const baseHeight = 120;
    
    // Setze Canvas-Größe für Retina
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const width = baseWidth;
    const height = baseHeight;
    
    // Berechne Distanzen
    const distances = starts.map(start => 
      Geo.distanceMeters(start[0], start[1], target[0], target[1])
    );
    
    // Finde Min/Max für Skalierung (X-Achse beginnt bei 0, endet beim Radius)
    const minDist = 0; // Immer bei 0 starten
    const maxDist = CONFIG.RADIUS_M; // Radius in Metern (nicht max. Distanz)
    const range = maxDist || 1; // Vermeide Division durch 0
    
    // Anzahl der Bins (Histogramm-Spalten)
    const numBins = Math.min(15, distances.length);
    const binSize = range / numBins;
    
    // Zähle Distanzen in Bins (relativ zu 0)
    const bins = new Array(numBins).fill(0);
    distances.forEach(dist => {
      const binIndex = Math.min(
        Math.floor(dist / binSize),
        numBins - 1
      );
      bins[binIndex]++;
    });
    
    const maxCount = Math.max(...bins);
    
    // Berechne erwartete Verteilung basierend auf ausgewählter Verteilung
    let expectedBins = State.getExpectedDistribution();
    const totalPoints = distances.length;
    
    // Bestimme aktiven Verteilungstyp
    const activeDistBtn = document.querySelector('.dist-btn.active');
    const distType = activeDistBtn ? activeDistBtn.dataset.dist : 'lognormal';
    
    // Wenn keine Verteilung vorhanden oder falsche Größe, berechne neue
    if (!expectedBins || expectedBins.length !== numBins) {
      expectedBins = Distribution.calculateDistribution(
        distType,
        numBins,
        maxDist,
        totalPoints
      );
      State.setExpectedDistribution(expectedBins);
    }
    
    const maxExpected = Math.max(...expectedBins, maxCount);
    
    // Canvas leeren
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, width, height);
    
    // Zeichne Histogramm
    const barWidth = (width - 40) / numBins;
    const padding = 20;
    const chartHeight = height - 40;
    
    bins.forEach((count, i) => {
      const barHeight = maxCount > 0 ? (count / maxCount) * chartHeight : 0;
      // X-Position basierend auf Distanz (0 bis maxDist)
      const binStartDist = i * binSize;
      const binEndDist = (i + 1) * binSize;
      const xRatioStart = maxDist > 0 ? binStartDist / maxDist : 0;
      const xRatioEnd = maxDist > 0 ? binEndDist / maxDist : 0;
      const xStart = padding + xRatioStart * (width - 2 * padding);
      const xEnd = padding + xRatioEnd * (width - 2 * padding);
      const actualBarWidth = xEnd - xStart - 2;
      const y = height - padding - barHeight;
      
      // Balken zeichnen
      ctx.fillStyle = 'rgba(0, 102, 255, 0.5)'; // #0066ff mit 0.7 Opacity
      ctx.fillRect(xStart, y, actualBarWidth, barHeight);
      
      // Rahmen
      ctx.strokeStyle = 'rgba(0, 82, 204, 0.6)'; // #0052cc mit 0.7 Opacity
      ctx.lineWidth = 1;
      ctx.strokeRect(xStart, y, actualBarWidth, barHeight);
    });
    
    // Zeichne erwartete Verteilung als Linienplot
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#666';
    ctx.beginPath();
    
    const expectedPoints = [];
    bins.forEach((_, i) => {
      const binStartDist = i * binSize;
      const binEndDist = (i + 1) * binSize;
      const binCenterDist = (binStartDist + binEndDist) / 2;
      const xRatio = maxDist > 0 ? binCenterDist / maxDist : 0;
      const x = padding + xRatio * (width - 2 * padding);
      
      const expectedHeight = maxExpected > 0 ? (expectedBins[i] / maxExpected) * chartHeight : 0;
      const y = height - padding - expectedHeight;
      
      expectedPoints.push({ x, y });
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Zeichne kleine Punkte bei jedem Bin
    expectedPoints.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    
    // Achsen-Beschriftungen
    ctx.fillStyle = '#666';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // X-Achse: Natürliche Schritte (mind. 0.5km, max. 6 Werte, startet bei 0)
    // Maximalwert ist immer der gewählte Radius
    const minKm = 0; // Immer bei 0 starten
    const maxKm = CONFIG.RADIUS_M / 1000; // Radius in km
    const rangeKm = maxKm - minKm;
    
    // Bestimme Schrittweite: maximal 6 Ticks, mindestens 0.5km Schritte
    const maxTicks = 6;
    let stepKm = Math.max(0.5, rangeKm / maxTicks);
    
    // Runde auf passende natürliche Werte (0.5, 1, 2, 5, 10, etc.)
    if (stepKm <= 0.5) stepKm = 0.5;
    else if (stepKm <= 1) stepKm = 1;
    else if (stepKm <= 2) stepKm = 2;
    else if (stepKm <= 5) stepKm = 5;
    else stepKm = Math.ceil(stepKm / 5) * 5;
    
    // Starte bei 0
    let startKm = 0;
    
    // Sammle alle Ticks (max. 6, beginnend bei 0)
    const ticks = [];
    for (let tickKm = startKm; tickKm <= maxKm && ticks.length < maxTicks; tickKm += stepKm) {
      ticks.push(tickKm);
    }
    
    // Zeichne Ticks
    ticks.forEach(tickKm => {
      // Berechne Position auf X-Achse (0 ist links, maxKm ist rechts)
      const ratio = rangeKm > 0 ? tickKm / rangeKm : 0;
      const x = padding + ratio * (width - 2 * padding);
      
      // Nur zeichnen wenn innerhalb des Canvas
      if (x >= padding && x <= width - padding) {
        const label = tickKm % 1 === 0 ? tickKm.toFixed(0) : tickKm.toFixed(1);
        ctx.fillText(
          label + 'km',
          x,
          height - padding + 5
        );
        
        // Kleine Tick-Markierung
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, height - padding);
        ctx.lineTo(x, height - padding + 3);
        ctx.stroke();
      }
    });
    
    // Y-Achse: Anzahl (ohne Dopplungen)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTickCount = 5;
    const seenValues = new Set();
    for (let i = 0; i <= yTickCount; i++) {
      const count = Math.round((i / yTickCount) * maxCount);
      // Überspringe doppelte Werte
      if (seenValues.has(count)) continue;
      seenValues.add(count);
      
      const y = height - padding - (i / yTickCount) * chartHeight;
      ctx.fillText(count.toString(), padding - 5, y);
    }
  },
  
  toggleStartPointsVisibility() {
    const startMarkers = State.getStartMarkers();
    const isHidden = CONFIG.HIDE_START_POINTS;
    
    startMarkers.forEach(marker => {
      if (marker) {
        if (isHidden) {
          marker.setOpacity(0);
        } else {
          marker.setOpacity(1);
        }
      }
    });
  },
  
  drawStartPoints(starts, colors) {
    const layerGroup = State.getLayerGroup();
    const startMarkers = State.getStartMarkers();
    
    // Alte Marker entfernen
    startMarkers.forEach(marker => layerGroup.removeLayer(marker));
    State.setStartMarkers([]);
    
    // Größe basierend auf Modus
    const size = CONFIG.AGGREGATED ? 6 : 12;
    const borderWidth = CONFIG.AGGREGATED ? 1 : 2;
    const shadowWidth = CONFIG.AGGREGATED ? 1 : 2;
    
    const newMarkers = [];
    
    starts.forEach((s, index) => {
      const color = colors[index] || '#0066ff'; // Fallback falls keine Farbe vorhanden
      
      // Erstelle ein Circle-Icon für den Marker
      const icon = L.divIcon({
        className: 'start-point-marker',
        html: `<div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background-color: ${color};
          border: ${borderWidth}px solid white;
          box-shadow: 0 0 0 ${shadowWidth}px ${color};
          cursor: move;
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
      
      // Erstelle einen draggable Marker
      const marker = L.marker(s, {
        icon: icon,
        draggable: true
      }).addTo(layerGroup);
      
      // Opacity basierend auf CONFIG.HIDE_START_POINTS setzen
      if (CONFIG.HIDE_START_POINTS) {
        marker.setOpacity(0);
      }
      
      // Event Listener für Drag-Ende
      marker.on('dragend', async (e) => {
        const newPosition = e.target.getLatLng();
        const newStart = [newPosition.lat, newPosition.lng];
        
        // Startpunkt in lastStarts aktualisieren
        const lastStarts = State.getLastStarts();
        lastStarts[index] = newStart;
        State.setLastStarts(lastStarts);
        
        // Alte Route entfernen
        const routePolylines = State.getRoutePolylines();
        if (routePolylines[index]) {
          layerGroup.removeLayer(routePolylines[index]);
          routePolylines[index] = null;
          State.setRoutePolylines(routePolylines);
        }
        
        // Alle Polylines entfernen (falls aggregierte Darstellung aktiv)
        if (CONFIG.AGGREGATED) {
          const polylinesToRemove = [];
          layerGroup.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
              polylinesToRemove.push(layer);
            }
          });
          polylinesToRemove.forEach(layer => layerGroup.removeLayer(layer));
        }
        
        // Neue Route berechnen
        try {
          const result = await API.fetchRoute(newStart, State.getLastTarget());
          if (result.paths?.[0]) {
            // Route-Daten extrahieren und im State aktualisieren
            const coords = API.extractRouteCoordinates(result);
            if (coords) {
              const allRouteData = State.getAllRouteData();
              const allRouteResponses = State.getAllRouteResponses();
              
              // Alte Route-Daten ersetzen
              if (allRouteData[index]) {
                allRouteData[index] = coords;
              }
              if (allRouteResponses[index]) {
                allRouteResponses[index] = { response: result, color: colors[index], index: index };
              }
              
              State.setAllRouteData(allRouteData);
              State.setAllRouteResponses(allRouteResponses);
              
              // Visualisierung basierend auf Modus
              if (CONFIG.AGGREGATED) {
                // Aggregierte Darstellung neu berechnen
                const aggregatedSegments = Aggregation.aggregateRoutes(allRouteData);
                if (aggregatedSegments.length > 0) {
                  const maxCount = Math.max(...aggregatedSegments.map(s => s.count));
                  Visualization.drawAggregatedRoutes(aggregatedSegments, maxCount);
                }
              } else {
                // Einzelne Route zeichnen
                const newRoute = Visualization.drawRoute(result, colors[index]);
                if (newRoute) {
                  routePolylines[index] = newRoute;
                  State.setRoutePolylines(routePolylines);
                }
              }
            }
          }
          
          // Histogramm aktualisieren
          const lastTarget = State.getLastTarget();
          if (lastTarget) {
            const updatedStarts = State.getLastStarts();
            Visualization.updateDistanceHistogram(updatedStarts, lastTarget);
          }
        } catch (err) {
          console.error(`Route-Fehler für Startpunkt ${index}:`, err);
        }
      });
      
      newMarkers.push(marker);
    });
    
    State.setStartMarkers(newMarkers);
  },
  
  // Gewichtete Verteilung: Mischung aus linearer und quantil-basierter Verteilung
  // weight = 0.0: rein linear, weight = 1.0: rein quantil-basiert
  calculateWeightedLevel(count, minCount, maxCount, counts, weight = 0.3) {
    // Lineare Verteilung
    const linearLevel = (count - minCount) / (maxCount - minCount || 1);
    
    // Quantil-basierte Verteilung (vereinfacht)
    const sortedCounts = [...counts].sort((a, b) => a - b);
    const quantileIndex = sortedCounts.findIndex(c => c >= count);
    const quantileLevel = quantileIndex >= 0 ? quantileIndex / sortedCounts.length : 1.0;
    
    // Gewichtete Kombination
    return linearLevel * (1 - weight) + quantileLevel * weight;
  },
  
  // Colormap-Funktionen
  getColormapColor(t, colormapName) {
    t = Math.max(0, Math.min(1, t));
    
    let colors;
    switch (colormapName) {
      case 'plasma_r':
        colors = [
          [253, 231, 37],   // Gelb (t=0)
          [240, 201, 95],   // Gelb-Orange
          [220, 170, 141],  // Orange
          [188, 128, 189],  // Rosa
          [153, 87, 204],   // Lila
          [123, 50, 148],   // Dunkel-Lila
          [93, 15, 109],    // Sehr dunkel-Lila
          [72, 1, 101]      // Dunkelst (t=1)
        ];
        break;
      case 'inferno_r':
        colors = [
          [252, 255, 164],  // Gelb (t=0)
          [251, 191, 95],   // Orange
          [240, 125, 58],   // Rot-Orange
          [202, 71, 1],     // Rot
          [133, 20, 75],    // Dunkel-Rot
          [66, 9, 59],      // Sehr dunkel
          [25, 7, 26],      // Fast schwarz
          [0, 0, 4]         // Schwarz (t=1)
        ];
        break;
      case 'magma_r':
        colors = [
          [252, 253, 191],  // Gelb-Weiß (t=0)
          [247, 210, 130],  // Gelb
          [231, 138, 195],  // Rosa
          [221, 90, 161],   // Magenta
          [185, 37, 122],   // Lila
          [124, 29, 111],   // Dunkel-Lila
          [68, 1, 84],      // Sehr dunkel
          [0, 0, 4]         // Schwarz (t=1)
        ];
        break;
      case 'viridis_r':
      default:
        colors = [
          [253, 231, 37],   // Gelb (t=0)
          [181, 222, 43],   // Gelb-Grün
          [110, 206, 88],   // Grün
          [53, 183, 121],   // Grün-Türkis
          [31, 158, 137],   // Türkis
          [38, 130, 142],   // Türkis-Blau
          [49, 104, 142],   // Blau
          [62, 73, 137],    // Blau-Lila
          [72, 40, 120],    // Lila
          [68, 1, 84]       // Dunkel-Lila (t=1)
        ];
        break;
    }
    
    // Interpolation zwischen den Farben
    const numColors = colors.length;
    const scaledT = t * (numColors - 1);
    const index = Math.floor(scaledT);
    const fraction = scaledT - index;
    
    const color1 = colors[Math.min(index, numColors - 1)];
    const color2 = colors[Math.min(index + 1, numColors - 1)];
    
    const r = Math.round(color1[0] + (color2[0] - color1[0]) * fraction);
    const g = Math.round(color1[1] + (color2[1] - color1[1]) * fraction);
    const b = Math.round(color1[2] + (color2[2] - color1[2]) * fraction);
    
    return `rgb(${r}, ${g}, ${b})`;
  },
  
  // Aktualisiert die Legende mit der aktuellen Colormap
  updateLegendGradient() {
    const gradientBar = Utils.getElement('#legend-gradient-bar');
    if (!gradientBar) return;
    
    const colormap = CONFIG.COLORMAP || 'viridis_r';
    const numSteps = 10;
    let gradientStops = [];
    
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const color = this.getColormapColor(t, colormap);
      const percent = (i / numSteps) * 100;
      gradientStops.push(`${color} ${percent}%`);
    }
    
    gradientBar.style.background = `linear-gradient(to right, ${gradientStops.join(', ')})`;
  },
  
  getColorForCount(count, weightedLevel) {
    // Verwende ausgewählte Colormap
    return this.getColormapColor(weightedLevel, CONFIG.COLORMAP || 'viridis_r');
  },
  
  drawAggregatedRoutes(aggregatedSegments, maxCount) {
    const layerGroup = State.getLayerGroup();
    
    // Berechne Min/Max und alle Counts für gewichtete Verteilung
    const counts = aggregatedSegments.map(seg => seg.count);
    const minCount = Math.min(...counts);
    const maxCountValue = Math.max(...counts);
    
    aggregatedSegments.forEach(seg => {
      // Gewichtete Verteilung: 15% Quantil, 85% linear (Zwischenlösung)
      const weightedLevel = this.calculateWeightedLevel(
        seg.count, 
        minCount, 
        maxCountValue, 
        counts, 
        0.15 // 15% Quantil-Gewichtung
      );
      
      // Gewicht und Opacity basierend auf gewichtetem Level
      const weight = 2 + (weightedLevel * 10); // 2-12px
      const opacity = 0.7 + (weightedLevel * 0.7); // 0.3-1.0
      
      // Farbe basierend auf gewichtetem Level mit viridis_r
      const color = this.getColorForCount(seg.count, weightedLevel);
      
      const polyline = L.polyline([seg.start, seg.end], {
        weight: weight,
        opacity: opacity,
        color: color
      });
      
      // Tooltip mit Anzahl hinzufügen
      polyline.bindTooltip(`${seg.count} Route${seg.count !== 1 ? 'n' : ''}`, {
        permanent: false,
        direction: 'top',
        className: 'aggregated-route-tooltip'
      });
      
      polyline.addTo(layerGroup);
    });
  }
};

