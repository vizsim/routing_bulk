// ==== Statistik-Helfer (ohne Abhängigkeiten, auch in Node-Tests nutzbar) ====

/**
 * Verteilungsfunktion der Standardnormalverteilung.
 * Näherung nach Abramowitz/Stegun 7.1.26 (absoluter Fehler < 1,5e-7).
 */
export function normCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/**
 * Verteilungsfunktion der Lognormalverteilung, parametrisiert über den
 * Median (gleiche Einheit wie x) und σ (Streuung des Logarithmus).
 */
export function lognormalCdf(x, median, sigma) {
  if (!(x > 0) || !(median > 0) || !(sigma > 0)) return 0;
  return normCdf(Math.log(x / median) / sigma);
}

/** Median einer Lognormalverteilung aus ihrem Mittelwert: μ = Median · e^(σ²/2). */
export function lognormalMedianFromMean(mean, sigma) {
  return mean / Math.exp((sigma * sigma) / 2);
}

/**
 * Mittelwert einer bei `cap` abgeschnittenen Lognormalverteilung (nur Werte
 * ≤ cap, neu normiert): E[X | X ≤ c] = Mittel · Φ((ln c − ln m)/σ − σ) / Φ((ln c − ln m)/σ).
 */
export function truncatedLognormalMean(mean, sigma, cap) {
  if (!(cap > 0) || !Number.isFinite(cap)) return mean;
  const median = lognormalMedianFromMean(mean, sigma);
  const z = Math.log(cap / median) / sigma;
  const below = normCdf(z);
  return below > 0 ? (mean * normCdf(z - sigma)) / below : 0;
}
