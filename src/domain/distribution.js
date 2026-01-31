// ==== Verteilungsfunktionen ====
const Distribution = {
  /**
   * Gibt das Distanz-Gewicht für einen einzelnen Abstand r (in m) zurück.
   * Wird z. B. mit Einwohner-Gewichtung kombiniert: weight = population * getDistanceWeight(...).
   * @param {string} type - 'lognormal' | 'uniform' | 'near' | 'far' | 'normal'
   * @param {number} distanceM - Abstand in Metern
   * @param {number} radiusM - Radius in Metern
   * @returns {number} - nicht-negatives Gewicht (≥ 0)
   */
  getDistanceWeight(type, distanceM, radiusM) {
    if (radiusM <= 0 || distanceM < 0) return 0;
    const r = Math.min(distanceM, radiusM);
    switch (type) {
      case 'uniform':
        return 1;
      case 'near':
        return Math.max(0.01, (radiusM - r) / radiusM);
      case 'far':
        return Math.max(0.01, r / radiusM);
      case 'normal': {
        const sigma = radiusM / 3;
        const center = radiusM / 2;
        const diff = r - center;
        return Math.max(0.01, Math.exp(-(diff * diff) / (2 * sigma * sigma)));
      }
      case 'lognormal':
      default: {
        const mu = radiusM / 4;
        const sigma = 2;
        if (r <= 0.1) return 0.01;
        const ratio = r / mu;
        if (ratio <= 0) return 0.01;
        const logX = Math.log(ratio);
        const w = (1 / (r * sigma * Math.sqrt(2 * Math.PI))) *
          Math.exp(-(logX * logX) / (2 * sigma * sigma));
        return isFinite(w) && w > 0 ? Math.max(0.01, w) : 0.01;
      }
    }
  },

  // Berechnet eine Verteilung für die gegebenen Parameter
  calculateDistribution(type, numBins, radiusM, totalPoints) {
    const binSize = radiusM / numBins;
    const expectedBins = new Array(numBins).fill(0);
    
    switch (type) {
      case 'uniform':
        // Gleichmäßig: gleich viele Punkte in jedem Bin
        const pointsPerBin = totalPoints / numBins;
        for (let i = 0; i < numBins; i++) {
          expectedBins[i] = pointsPerBin;
        }
        break;
        
      case 'near':
        // Mehr nah: exponentiell abnehmend (mehr Punkte nahe am Ziel)
        // f(r) = (R - r) / R, normalisiert
        let sumNear = 0;
        for (let i = 0; i < numBins; i++) {
          const binCenterDist = (i + 0.5) * binSize;
          const weight = (radiusM - binCenterDist) / radiusM;
          expectedBins[i] = weight;
          sumNear += weight;
        }
        // Normalisiere auf totalPoints
        for (let i = 0; i < numBins; i++) {
          expectedBins[i] = (expectedBins[i] / sumNear) * totalPoints;
        }
        break;
        
      case 'far':
        // Mehr fern: exponentiell zunehmend (mehr Punkte weit vom Ziel)
        // f(r) = r / R, normalisiert
        let sumFar = 0;
        for (let i = 0; i < numBins; i++) {
          const binCenterDist = (i + 0.5) * binSize;
          const weight = binCenterDist / radiusM;
          expectedBins[i] = weight;
          sumFar += weight;
        }
        // Normalisiere auf totalPoints
        for (let i = 0; i < numBins; i++) {
          expectedBins[i] = (expectedBins[i] / sumFar) * totalPoints;
        }
        break;
        
      case 'normal':
        // Normalverteilung (Glockenkurve): mehr Punkte in der Mitte
        // f(r) = exp(-((r - R/2)² / (2σ²))), mit σ = R/3
        const sigmaNormal = radiusM / 3;
        const center = radiusM / 2;
        let sumNormal = 0;
        for (let i = 0; i < numBins; i++) {
          const binCenterDist = (i + 0.5) * binSize;
          const diff = binCenterDist - center;
          const weight = Math.exp(-(diff * diff) / (2 * sigmaNormal * sigmaNormal));
          expectedBins[i] = weight;
          sumNormal += weight;
        }
        // Normalisiere auf totalPoints
        for (let i = 0; i < numBins; i++) {
          expectedBins[i] = (expectedBins[i] / sumNormal) * totalPoints;
        }
        break;
        
      case 'lognormal':
      default:
        // Lognormalverteilung: f(r) = (1/(r*σ*√(2π))) * exp(-(ln(r/μ))²/(2σ²))
        // Für praktische Anwendung: μ = R/4, σ = 2 (breite, schiefe Verteilung)
        const mu = radiusM / 4; // Median
        const sigmaLognormal = 2; // Standardabweichung (breite Verteilung)
        let sumLognormal = 0;
        
        for (let i = 0; i < numBins; i++) {
          const binCenterDist = (i + 0.5) * binSize;
          // Vermeide Division durch 0 und sehr kleine Werte
          if (binCenterDist <= 0.1) {
            expectedBins[i] = 0;
            continue;
          }
          // Lognormal PDF: f(x) = (1/(x*σ*√(2π))) * exp(-(ln(x/μ))²/(2σ²))
          // Normalisiert für [0, R]
          const ratio = binCenterDist / mu;
          if (ratio <= 0) {
            expectedBins[i] = 0;
            continue;
          }
          const logX = Math.log(ratio);
          const weight = (1 / (binCenterDist * sigmaLognormal * Math.sqrt(2 * Math.PI))) * 
                        Math.exp(-(logX * logX) / (2 * sigmaLognormal * sigmaLognormal));
          
          // Vermeide NaN oder Infinity
          if (isFinite(weight) && weight > 0) {
            expectedBins[i] = weight;
            sumLognormal += weight;
          } else {
            expectedBins[i] = 0;
          }
        }
        
        // Normalisiere auf totalPoints
        if (sumLognormal > 0) {
          for (let i = 0; i < numBins; i++) {
            expectedBins[i] = (expectedBins[i] / sumLognormal) * totalPoints;
          }
        } else {
          // Fallback: gleichmäßige Verteilung
          const pointsPerBin = totalPoints / numBins;
          for (let i = 0; i < numBins; i++) {
            expectedBins[i] = pointsPerBin;
          }
        }
        break;
    }
    
    return expectedBins;
  },
  
  // Setzt die aktive Verteilung im State
  setDistribution(type, numBins, radiusM, totalPoints) {
    const expectedBins = this.calculateDistribution(type, numBins, radiusM, totalPoints);
    State.setExpectedDistribution(expectedBins);
    return expectedBins;
  }
};

