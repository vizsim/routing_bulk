// ==== Histogram-Renderer: Distanz-Histogramm ====
const HistogramRenderer = {
  /**
   * Aktualisiert das Distanz-Histogramm
   * @param {Array<Array<number>>} starts - Array von [lat, lng] Startpunkten
   * @param {Array<number>} target - [lat, lng] Zielpunkt
   */
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
    
    // Berechne erwartete Verteilung basierend auf ausgewählter Verteilung (nur bei Längenverteilung, nicht bei Einwohner-Gewichtung)
    const usePopulationWeight = !!(document.getElementById('config-population-weight-starts') && document.getElementById('config-population-weight-starts').checked);
    const activeDistBtn = document.querySelector('.dist-btn.active');
    const distType = activeDistBtn ? activeDistBtn.dataset.dist : 'lognormal';
    const totalPoints = distances.length;
    let expectedBins;

    if (usePopulationWeight) {
      expectedBins = new Array(numBins).fill(0); // Keine erwartete Kurve bei Einwohner-Gewichtung
    } else {
      expectedBins = State.getExpectedDistribution();
      if (!expectedBins || expectedBins.length !== numBins) {
        expectedBins = Distribution.calculateDistribution(
          distType,
          numBins,
          maxDist,
          totalPoints
        );
        State.setExpectedDistribution(expectedBins);
      }
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
  }
};

