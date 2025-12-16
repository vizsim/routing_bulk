// ==== Colormap-Utilities ====
const ColormapUtils = {
  /**
   * Berechnet gewichtetes Level für Count (Mischung aus linearer und quantil-basierter Verteilung)
   * @param {number} count - Aktueller Count
   * @param {number} minCount - Minimaler Count
   * @param {number} maxCount - Maximaler Count
   * @param {Array<number>} counts - Alle Counts
   * @param {number} weight - Gewicht für Quantil-Verteilung (0.0 = rein linear, 1.0 = rein quantil-basiert)
   * @returns {number} - Gewichtetes Level zwischen 0 und 1
   */
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
  
  /**
   * Gibt eine Farbe aus der Colormap für einen Wert zwischen 0 und 1 zurück
   * @param {number} t - Wert zwischen 0 und 1
   * @param {string} colormapName - Name der Colormap
   * @returns {string} - RGB-Farbe als String
   */
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
  
  /**
   * Generiert einen Gradient-String für eine Colormap
   * @param {string} colormapName - Name der Colormap
   * @param {number} numSteps - Anzahl der Schritte
   * @returns {string} - CSS Gradient-String
   */
  generateGradientForColormap(colormapName, numSteps = 10) {
    let gradientStops = [];
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const color = this.getColormapColor(t, colormapName);
      const percent = (i / numSteps) * 100;
      gradientStops.push(`${color} ${percent}%`);
    }
    return `linear-gradient(to right, ${gradientStops.join(', ')})`;
  },
  
  /**
   * Gibt eine Farbe für einen Count basierend auf gewichtetem Level zurück
   * @param {number} count - Anzahl
   * @param {number} weightedLevel - Gewichtetes Level (0-1)
   * @returns {string} - RGB-Farbe als String
   */
  getColorForCount(count, weightedLevel) {
    // Verwende ausgewählte Colormap
    return this.getColormapColor(weightedLevel, CONFIG.COLORMAP || 'viridis_r');
  }
};

