// ==== Histogram-Renderer: Distanz-Histogramm ====
const HistogramRenderer = {
  /**
   * Zeigt Platzhalter-Text, wenn noch keine Routen vorhanden sind.
   * @param {HTMLCanvasElement} canvas
   */
  _drawPlaceholder(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const baseWidth = 250;
    const baseHeight = 120;
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, baseWidth, baseHeight);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, baseWidth - 1, baseHeight - 1);
    ctx.fillStyle = '#888';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = ['Keine Routen.', 'Zuerst Ziel setzen und Karte anklicken.'];
    const lineHeight = 16;
    const startY = (baseHeight - (lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, baseWidth / 2, startY + i * lineHeight);
    });
  },

  /**
   * Aktualisiert das Distanz-Histogramm (Beeline oder echte Routenlänge).
   * @param {Array<Array<number>>} starts - Array von [lat, lng] Startpunkten
   * @param {Array<number>} target - [lat, lng] Zielpunkt
   * @param {{ routeData?: Array<Array<Array<number>>>, routeDistances?: Array<number> }} [options] - routeDistances aus GraphHopper (RouteService.getRouteDistances); routeData nur Fallback wenn keine API-Distanzen (z. B. Legacy)
   */
  updateDistanceHistogram(starts, target, options = {}) {
    const canvas = document.getElementById('distance-histogram');
    if (!canvas) return;

    if (!starts || starts.length === 0) {
      this._drawPlaceholder(canvas);
      return;
    }

    const modeBtn = document.querySelector('.histogram-mode-btn.active');
    const isRouteMode = modeBtn && modeBtn.dataset.mode === 'route';
    const routeData = options.routeData || [];
    const routeDistances = options.routeDistances || [];

    // Distanzen: Beeline (Geo) oder echte Routenlänge (nur GraphHopper; Fallback aus Koordinaten nur bei fehlenden API-Werten)
    let distances;
    let maxDistM;
    let barFillStyle;
    let barStrokeStyle;
    let showExpectedCurve;

    if (isRouteMode && (routeDistances.length > 0 || routeData.length > 0)) {
      if (routeDistances.length > 0 && routeDistances.some(d => d > 0)) {
        distances = routeDistances.filter(d => d > 0);
      } else {
        // Fallback: aus Koordinaten nur wenn API-Distanzen fehlen (z. B. alte gespeicherte Zielpunkte)
        distances = routeData.map(coords => (coords && coords.length >= 2 ? Geo.routeLengthMeters(coords) : 0)).filter(d => d > 0);
      }
      if (distances.length === 0) {
        distances = starts.map(s => Geo.distanceMeters(s[0], s[1], target[0], target[1]));
        maxDistM = CONFIG.RADIUS_M;
        barFillStyle = 'rgba(0, 102, 255, 0.5)';
        barStrokeStyle = 'rgba(0, 82, 204, 0.6)';
        showExpectedCurve = true;
      } else {
        maxDistM = Math.max(CONFIG.RADIUS_M, Math.max(...distances));
        barFillStyle = 'rgba(10, 125, 58, 0.55)';   // Grün
        barStrokeStyle = 'rgba(8, 100, 46, 0.65)';
        showExpectedCurve = false;
      }
    } else {
      distances = starts.map(start =>
        Geo.distanceMeters(start[0], start[1], target[0], target[1])
      );
      maxDistM = CONFIG.RADIUS_M;
      barFillStyle = 'rgba(0, 102, 255, 0.5)';
      barStrokeStyle = 'rgba(0, 82, 204, 0.6)';
      showExpectedCurve = true;
    }

    // Retina-Display Support
    const dpr = window.devicePixelRatio || 1;
    const baseWidth = 250;
    const baseHeight = 120;

    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const width = baseWidth;
    const height = baseHeight;
    const minDist = 0;
    const range = maxDistM || 1;

    const numBins = Math.min(15, Math.max(1, distances.length));
    const binSize = range / numBins;

    const bins = new Array(numBins).fill(0);
    distances.forEach(dist => {
      const binIndex = Math.min(Math.floor(dist / binSize), numBins - 1);
      bins[binIndex]++;
    });

    const maxCount = Math.max(...bins, 1);

    const avgM = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
    const formatDist = (m) => m >= 1000
      ? (m / 1000) % 1 === 0 ? `${(m / 1000).toFixed(0)} km` : `${(m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
      : `${Math.round(m)} m`;

    let expectedBins = null;
    if (showExpectedCurve) {
      const activeDistBtn = document.querySelector('.dist-btn.active');
      const distType = activeDistBtn ? activeDistBtn.dataset.dist : 'lognormal';
      const totalPoints = distances.length;
      const usePopulationWeight = !!(document.getElementById('config-population-weight-starts') && document.getElementById('config-population-weight-starts').checked);
      if (usePopulationWeight) {
        expectedBins = Distribution.calculateDistribution(distType, numBins, maxDistM, totalPoints);
      } else {
        expectedBins = State.getExpectedDistribution();
        if (!expectedBins || expectedBins.length !== numBins) {
          expectedBins = Distribution.calculateDistribution(distType, numBins, maxDistM, totalPoints);
          State.setExpectedDistribution(expectedBins);
        }
      }
    }

    const maxExpected = expectedBins ? Math.max(...expectedBins, maxCount) : maxCount;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, width, height);

    const padding = 20;
    const chartHeight = height - 40;

    bins.forEach((count, i) => {
      const barHeight = (count / maxCount) * chartHeight;
      const binStartDist = i * binSize;
      const binEndDist = (i + 1) * binSize;
      const xRatioStart = maxDistM > 0 ? binStartDist / maxDistM : 0;
      const xRatioEnd = maxDistM > 0 ? binEndDist / maxDistM : 0;
      const xStart = padding + xRatioStart * (width - 2 * padding);
      const xEnd = padding + xRatioEnd * (width - 2 * padding);
      const actualBarWidth = Math.max(0, xEnd - xStart - 2);
      const y = height - padding - barHeight;

      ctx.fillStyle = barFillStyle;
      ctx.fillRect(xStart, y, actualBarWidth, barHeight);
      ctx.strokeStyle = barStrokeStyle;
      ctx.lineWidth = 1;
      ctx.strokeRect(xStart, y, actualBarWidth, barHeight);
    });

    if (showExpectedCurve && expectedBins) {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#666';
      ctx.beginPath();
      const expectedPoints = [];
      bins.forEach((_, i) => {
        const binStartDist = i * binSize;
        const binEndDist = (i + 1) * binSize;
        const binCenterDist = (binStartDist + binEndDist) / 2;
        const xRatio = maxDistM > 0 ? binCenterDist / maxDistM : 0;
        const x = padding + xRatio * (width - 2 * padding);
        const expectedHeight = (expectedBins[i] / maxExpected) * chartHeight;
        const y = height - padding - expectedHeight;
        expectedPoints.push({ x, y });
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      expectedPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // Achsen
    ctx.fillStyle = '#666';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const minKm = 0;
    const maxKm = maxDistM / 1000;
    const rangeKm = maxKm - minKm;
    let stepKm = Math.max(0.5, rangeKm / 6);
    if (stepKm <= 0.5) stepKm = 0.5;
    else if (stepKm <= 1) stepKm = 1;
    else if (stepKm <= 2) stepKm = 2;
    else if (stepKm <= 5) stepKm = 5;
    else stepKm = Math.ceil(stepKm / 5) * 5;

    const ticks = [];
    for (let tickKm = 0; tickKm <= maxKm && ticks.length < 6; tickKm += stepKm) {
      ticks.push(tickKm);
    }

    ticks.forEach(tickKm => {
      const ratio = rangeKm > 0 ? tickKm / rangeKm : 0;
      const x = padding + ratio * (width - 2 * padding);
      if (x >= padding && x <= width - padding) {
        const label = tickKm % 1 === 0 ? tickKm.toFixed(0) : tickKm.toFixed(1);
        ctx.fillText(label + 'km', x, height - padding + 5);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, height - padding);
        ctx.lineTo(x, height - padding + 3);
        ctx.stroke();
      }
    });

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTickCount = 5;
    const seenValues = new Set();
    for (let i = 0; i <= yTickCount; i++) {
      const count = Math.round((i / yTickCount) * maxCount);
      if (seenValues.has(count)) continue;
      seenValues.add(count);
      const y = height - padding - (i / yTickCount) * chartHeight;
      ctx.fillText(count.toString(), padding - 5, y);
    }

    // Durchschnitt oben rechts
    if (distances.length > 0 && avgM > 0) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#444';
      ctx.font = '11px system-ui';
      ctx.fillText('Ø ' + formatDist(avgM), width - padding, 6);
    }
  }
};

