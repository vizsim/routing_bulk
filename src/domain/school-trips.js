// ==== Schulweg-Modell der Gebietsanalyse: Weglängen & Modal Split mit Quellen ====
//
// Alle Zahlen, mit denen die Gebietsanalyse Startpunkte zieht, stehen hier —
// jeweils mit Quelle (SOURCES). Herleitung und Plausibilitätsprüfung:
// docs/SCHULWEG_PARAMETER.md.
//
// Modell je Einrichtungstyp × Raumtyp (RegioStaR7):
// 1. Modal Split: Vorschlag je Raumtyp-Gruppe (splitSuggestion), in der
//    Oberfläche editierbar.
// 2. Jedes Verkehrsmittel hat eine eigene Weglängenverteilung (lognormal).
//    Die Mittelwerte stammen aus MiD 2023 Abb. 100 (Kinder bis 10 bzw. 11–17
//    Jahre, alle Wegezwecke) und werden so skaliert, dass der Mittelwert über
//    alle Verkehrsmittel (mit dem vorgeschlagenen Split) dem Kita-/Schulweg
//    des Raumtyps aus MiD 2023 Tab. 43 entspricht. Fuß und Rad werden dabei
//    höchstens auf den bundesweiten Wert verlängert — längere Wege auf dem
//    Land tragen ÖPNV und Auto.
//    Damit hängt die Verkehrsmittelwahl von der Entfernung ab (kurz = Fuß,
//    mittel = Rad, lang = ÖPNV/Auto) — ohne festen Radiusfaktor je Modus.
//    Ändert man den Split, bleiben die Verteilungen je Verkehrsmittel gleich.
// 3. Startpunkte werden nach Luftlinie gezogen: Netzlänge ÷ Umwegfaktor.
// 4. Der Radius ist nur noch die Kappung: Wege von weiter her starten im
//    äußersten Ring (sie erreichen das Gebiet über dessen Rand).
import { lognormalCdf, lognormalMedianFromMean } from './stats.js';

export const MODE_KEYS = ['foot', 'bike', 'transit', 'car'];
const ACTIVE_MODES = ['foot', 'bike'];
const MOTOR_MODES = ['transit', 'car'];

// ---- Quellen ----

const MID2023_URL = 'https://www.mobilitaet-in-deutschland.de/pdf/MiD2023_Ergebnisbericht.pdf';
const MID2023_CITATION = 'infas, DLR, IVT Research, infas 360: Mobilität in Deutschland – MiD 2023. '
  + 'Ergebnisbericht, im Auftrag des Bundesministeriums für Verkehr, November 2025';

export const SOURCES = {
  'mid2023-tab43': {
    label: 'MiD 2023, Tab. 43',
    title: 'Kita- und Schulweglängen nach Raumtyp und Altersgruppe',
    citation: `${MID2023_CITATION}, S. 179`,
    url: MID2023_URL,
    note: 'Personen 0–17 Jahre; Werte in km, auf ganze km gerundet; als Mittelwerte verwendet.'
  },
  'mid2023-abb98': {
    label: 'MiD 2023, Abb. 98',
    title: 'Verkehrsmittelnutzung für unterschiedliche Wegezwecke von Kindern und Jugendlichen',
    citation: `${MID2023_CITATION}, S. 177`,
    url: MID2023_URL,
    note: 'Wegezweck Schule (inkl. Kita, Vorschule), bundesweit; „bis 10 Jahre“ enthält Kita-Wege. Auf 100 % normiert.'
  },
  'mid2023-abb100': {
    label: 'MiD 2023, Abb. 100',
    title: 'Wie weit sind die Wege im Nahbereich (bis 50 Kilometer)?',
    citation: `${MID2023_CITATION}, S. 179`,
    url: MID2023_URL,
    note: 'Durchschnittliche Weglänge je Verkehrsmittel über alle Zwecke sowie für Ausbildungswege; '
      + 'aus der Grafik abgelesen (Pixelmessung, ±0,05 km).'
  },
  forsa2022: {
    label: 'forsa 2022',
    title: 'Sicherer Schulweg – Befragung von Eltern 6- bis 10-jähriger Kinder',
    citation: 'forsa im Auftrag von Deutschem Kinderhilfswerk, VBE und VCD, Juli/August 2022, n = 500 Eltern, S. 14',
    url: 'https://www.dkhw.de/fileadmin/Redaktion/1_Unsere_Arbeit/2_Aktuelle_Projekte/6_Zu_Fuss_zur_Schule/Umfrage_Sicherer_Schulweg/forsa-Umfrage_2022_Sicherer_Schulweg_Ergebnischarts.pdf',
    note: 'Hauptverkehrsmittel laut Eltern nach Ortsgröße; ÖPNV inkl. Schulbus, Auto inkl. Fahrgemeinschaft; '
      + 'auf 100 % normiert. Zuordnung Raumtyp → Ortsgröße ist eine Annahme.'
  },
  setzung: {
    label: 'Setzung',
    title: 'Bisherige Setzung, an MiD 2017 (Wege von Schüler:innen nach RegioStaR7) angelehnt',
    citation: 'routing_bulk, docs/GEBIETSANALYSE_IDEEN.md',
    url: null,
    note: 'Kein direkter Tabellenwert — nur dort verwendet, wo keine neuere Quelle vorliegt.'
  },
  annahme: {
    label: 'Annahme',
    title: 'Modellannahme',
    citation: 'routing_bulk, docs/SCHULWEG_PARAMETER.md',
    url: null,
    note: 'Streuung der Weglängen, Umwegfaktor und Kappungsradius; gegen Literaturwerte geprüft.'
  }
};

// ---- Raumtypen ----

export const REGIOSTAR_LABELS = {
  71: 'Metropole',
  72: 'Regiopole/Großstadt',
  73: 'Mittelstadt (Stadtregion)',
  74: 'Kleinstädtisch/dörflich (Stadtregion)',
  75: 'Zentrale Stadt (ländlich)',
  76: 'Mittelstadt (ländliche Region)',
  77: 'Kleinstädtisch/dörflich (ländlich)'
};

// Die 7 Typen zu 4 Gruppen zusammengefasst (für den Split-Vorschlag)
export const REGIOSTAR_GROUP = {
  71: 'metro', 72: 'gross',
  73: 'staedtisch', 75: 'staedtisch', 76: 'staedtisch',
  74: 'laendlich', 77: 'laendlich'
};

// ---- Daten ----

/** MiD 2023, Tab. 43: Kita- und Schulweglängen (km) je RegioStaR7 und Altersgruppe. */
export const MID2023_TAB43_KM = {
  71: { '0-6': 2, '7-10': 2, '11-13': 4, '14-17': 4 },  // Stadtregion – Metropole
  72: { '0-6': 2, '7-10': 2, '11-13': 4, '14-17': 4 },  // Stadtregion – Regiopole und Großstadt
  73: { '0-6': 3, '7-10': 3, '11-13': 6, '14-17': 7 },  // Stadtregion – Mittelstadt, städtischer Raum
  74: { '0-6': 3, '7-10': 5, '11-13': 9, '14-17': 9 },  // Stadtregion – kleinstädtischer, dörflicher Raum
  75: { '0-6': 3, '7-10': 2, '11-13': 4, '14-17': 5 },  // ländliche Region – zentrale Stadt
  76: { '0-6': 3, '7-10': 4, '11-13': 6, '14-17': 7 },  // ländliche Region – Mittelstadt, städtischer Raum
  77: { '0-6': 3, '7-10': 5, '11-13': 9, '14-17': 10 }  // ländliche Region – kleinstädtischer, dörflicher Raum
};

/** MiD 2023, Abb. 98: Verkehrsmittel auf Schulwegen (inkl. Kita) in %, bundesweit. */
export const MID2023_ABB98_SCHOOL = {
  bis10: { foot: 37, bike: 15, transit: 14, car: 34 },
  '11-17': { foot: 19, bike: 21, transit: 47, car: 12 } // Summe 99 (Rest: keine Angabe)
};

/**
 * MiD 2023, Abb. 100: durchschnittliche Weglänge (km) je Verkehrsmittel über
 * alle Zwecke (Wege im Nahbereich bis 50 km); „ausbildung“ = alle Verkehrsmittel,
 * Zweck Ausbildung (Kita, Vorschule, Schule). Pixelgenau abgelesen.
 */
export const MID2023_ABB100_KM = {
  bis10: { foot: 1.2, bike: 2.2, transit: 5.2, car: 7.6, ausbildung: 2.8 },
  '11-17': { foot: 1.5, bike: 2.9, transit: 8.5, car: 9.9, ausbildung: 6.0 }
};

/** forsa 2022, S. 14: Wie kommt das Kind (6–10 J.) zur Schule? Elternangaben in %. */
export const FORSA2022_GS = {
  gesamt: { fuss: 47, oepnv: 13, schulbus: 8, rad: 14, pkw: 15, fahrgemeinschaft: 2 },
  unter20k: { fuss: 38, oepnv: 15, schulbus: 13, rad: 13, pkw: 17, fahrgemeinschaft: 2 },
  von20bis100k: { fuss: 55, oepnv: 11, schulbus: 5, rad: 15, pkw: 13, fahrgemeinschaft: 1 },
  ab100k: { fuss: 52, oepnv: 13, schulbus: 2, rad: 15, pkw: 13, fahrgemeinschaft: 1 }
};
const FORSA_FOR_GROUP = { metro: 'ab100k', gross: 'ab100k', staedtisch: 'von20bis100k', laendlich: 'unter20k' };
const FORSA_NOTES = {
  gesamt: 'Eltern 6- bis 10-Jähriger, bundesweit',
  unter20k: 'Eltern 6- bis 10-Jähriger, Orte unter 20.000 EW',
  von20bis100k: 'Eltern 6- bis 10-Jähriger, Orte mit 20.000–100.000 EW',
  ab100k: 'Eltern 6- bis 10-Jähriger, Städte ab 100.000 EW'
};

/** Bisherige Setzungen — nur dort, wo keine neuere Quelle vorliegt. */
const SETZUNG = {
  kindergarten: {
    metro: { foot: 60, bike: 10, transit: 5, car: 25 },
    gross: { foot: 55, bike: 10, transit: 5, car: 30 },
    staedtisch: { foot: 45, bike: 10, transit: 5, car: 40 },
    laendlich: { foot: 30, bike: 5, transit: 5, car: 60 }
  },
  weiterfuehrend: {
    staedtisch: { foot: 20, bike: 30, transit: 35, car: 15 },
    laendlich: { foot: 10, bike: 20, transit: 50, car: 20 }
  },
  schule: {
    metro: { foot: 45, bike: 20, transit: 20, car: 15 },
    gross: { foot: 40, bike: 20, transit: 20, car: 20 },
    staedtisch: { foot: 35, bike: 25, transit: 20, car: 20 },
    laendlich: { foot: 25, bike: 15, transit: 35, car: 25 },
    national: { foot: 50, bike: 20, transit: 10, car: 20 }
  }
};

// ---- Annahmen (gegen Literatur geprüft, siehe docs/SCHULWEG_PARAMETER.md) ----

/** Streuung σ der Lognormalverteilung je Verkehrsmittel. */
export const SIGMA = { foot: 0.6, bike: 0.6, transit: 0.7, car: 0.9 };
/** Netzlänge ÷ Luftlinie. */
export const DETOUR_FACTOR = 1.3;
/** Kappungsradius-Vorschlag: dieses Quantil der Fuß-/Rad-/Auto-Wege (Luftlinie). */
export const RADIUS_QUANTILE = 0.9;
export const RADIUS_MIN_M = 1000;
export const RADIUS_MAX_M = 8000;
const RADIUS_STEP_M = 500;

/** Welche Altersgruppen die Einrichtungstypen in Tab. 43 / Abb. 98–100 abbilden. */
const TYPE_AGE = {
  kindergarten: { tab43: ['0-6'], mid: 'bis10', label: '0–6 Jahre' },
  grundschule: { tab43: ['7-10'], mid: 'bis10', label: '7–10 Jahre' },
  weiterfuehrend: { tab43: ['11-13', '14-17'], mid: '11-17', label: '11–17 Jahre' },
  // Schulart unbekannt: meist Grundschulen (Annahme)
  schule: { tab43: ['7-10'], mid: 'bis10', label: '7–10 Jahre (Annahme)' }
};

// ---- Funktionen ----

/** Rundet Anteile auf ganze Prozent mit Summe 100 (größter Rest). */
export function normalizeSplit(raw) {
  const total = MODE_KEYS.reduce((s, k) => s + (Number(raw[k]) || 0), 0);
  if (!(total > 0)) return { foot: 0, bike: 0, transit: 0, car: 0 };
  const exact = MODE_KEYS.map(k => ({ k, v: (Number(raw[k]) || 0) * 100 / total }));
  const out = Object.fromEntries(exact.map(e => [e.k, Math.floor(e.v)]));
  let rest = 100 - MODE_KEYS.reduce((s, k) => s + out[k], 0);
  const byRemainder = [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  for (let i = 0; rest > 0; i = (i + 1) % byRemainder.length, rest--) out[byRemainder[i].k]++;
  return out;
}

/** forsa-Zeile → Split (ÖPNV inkl. Schulbus, Auto inkl. Fahrgemeinschaft). */
export function forsaSplit(row) {
  return normalizeSplit({
    foot: row.fuss,
    bike: row.rad,
    transit: row.oepnv + row.schulbus,
    car: row.pkw + row.fahrgemeinschaft
  });
}

/** Raumtyp-Gruppe eines RegioStaR7-Codes (oder null). */
export function regionGroup(regioStaR7) {
  return REGIOSTAR_GROUP[String(regioStaR7 || '').trim()] || null;
}

/**
 * Modal-Split-Vorschlag je Einrichtungstyp und Raumtyp-Gruppe (null = bundesweit).
 * @returns {{split: Object, source: string, note: string}}
 */
export function splitSuggestion(type, group) {
  if (type === 'grundschule') {
    const key = group ? FORSA_FOR_GROUP[group] : 'gesamt';
    return { split: forsaSplit(FORSA2022_GS[key]), source: 'forsa2022', note: FORSA_NOTES[key] };
  }
  if (type === 'weiterfuehrend') {
    if (!group || group === 'metro' || group === 'gross') {
      return { split: normalizeSplit(MID2023_ABB98_SCHOOL['11-17']), source: 'mid2023-abb98', note: '11–17 Jahre, bundesweit' };
    }
    return { split: { ...SETZUNG.weiterfuehrend[group] }, source: 'setzung', note: 'keine regionalen Werte in MiD 2023 Abb. 98' };
  }
  if (type === 'kindergarten') {
    if (!group) {
      return { split: normalizeSplit(MID2023_ABB98_SCHOOL.bis10), source: 'mid2023-abb98', note: 'bis 10 Jahre (Schule inkl. Kita), bundesweit' };
    }
    return { split: { ...SETZUNG.kindergarten[group] }, source: 'setzung', note: 'keine Kita-eigenen Werte in MiD 2023' };
  }
  return { split: { ...SETZUNG.schule[group || 'national'] }, source: 'setzung', note: 'Schulart unbekannt' };
}

/** Mittlere Kita-/Schulweglänge (km) für Typ und Raumtyp, mit Quelle. */
export function meanTripLength(type, regioStaR7) {
  const age = TYPE_AGE[type] || TYPE_AGE.schule;
  const row = MID2023_TAB43_KM[String(regioStaR7 || '').trim()];
  if (row) {
    const km = age.tab43.reduce((s, col) => s + row[col], 0) / age.tab43.length;
    return { km, source: 'mid2023-tab43', note: `${REGIOSTAR_LABELS[String(regioStaR7).trim()]}, ${age.label}` };
  }
  // Ohne Raumtyp: bundesweiter Mittelwert der Ausbildungswege (bis 10 J. inkl. Kita)
  return {
    km: MID2023_ABB100_KM[age.mid].ausbildung,
    source: 'mid2023-abb100',
    note: `Ausbildungswege bundesweit, ${age.mid === 'bis10' ? 'bis 10 Jahre (inkl. Kita)' : '11–17 Jahre'}`
  };
}

/** Quantil q einer Mischung von Lognormalverteilungen (Bisektion im Log-Raum). */
export function mixtureQuantile(q, components) {
  const total = components.reduce((s, c) => s + c.weight, 0);
  if (!(total > 0)) return 0;
  const cdf = (x) => components.reduce((s, c) => s + c.weight * lognormalCdf(x, c.median, c.sigma), 0) / total;
  let lo = 1e-6;
  let hi = 1e6;
  for (let i = 0; i < 100; i++) {
    const mid = Math.sqrt(lo * hi);
    if (cdf(mid) < q) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/**
 * Weglängenmodell je Einrichtungstyp und Raumtyp.
 * @param {string} type - 'kindergarten' | 'grundschule' | 'weiterfuehrend' | 'schule'
 * @param {string|number|null} regioStaR7 - RegioStaR7-Code (71–77) oder null (bundesweit)
 * @returns {Object} split (Vorschlag), mean (Tab. 43), modes (je Verkehrsmittel:
 *   meanKm, medianKm, sigma, beelineMedianM), scale, radiusM, Quellen
 */
export function tripModel(type, regioStaR7) {
  const age = TYPE_AGE[type] || TYPE_AGE.schule;
  const group = regionGroup(regioStaR7);
  const splitEntry = splitSuggestion(type, group);
  const split = splitEntry.split;
  const mean = meanTripLength(type, regioStaR7);
  const perMode = MID2023_ABB100_KM[age.mid];

  // Skalierung: Mittelwert über alle Verkehrsmittel = Tab. 43; Fuß/Rad höchstens ×1
  const share = (m) => (split[m] || 0) / 100;
  const raw = MODE_KEYS.reduce((s, m) => s + share(m) * perMode[m], 0);
  const k = raw > 0 ? mean.km / raw : 1;
  const kActive = Math.min(k, 1);
  const activePart = ACTIVE_MODES.reduce((s, m) => s + share(m) * perMode[m], 0) * kActive;
  const motorRaw = MOTOR_MODES.reduce((s, m) => s + share(m) * perMode[m], 0);
  const kMotor = motorRaw > 0 ? (mean.km - activePart) / motorRaw : kActive;

  const modes = {};
  for (const m of MODE_KEYS) {
    const meanKm = perMode[m] * (ACTIVE_MODES.includes(m) ? kActive : kMotor);
    const medianKm = lognormalMedianFromMean(meanKm, SIGMA[m]);
    modes[m] = {
      meanKm,
      medianKm,
      sigma: SIGMA[m],
      beelineMedianM: (medianKm * 1000) / DETOUR_FACTOR
    };
  }

  // Kappungsradius: Quantil der Fuß-/Rad-/Auto-Wege (ÖPNV startet an Haltestellen)
  const comps = ['foot', 'bike', 'car']
    .filter(m => share(m) > 0)
    .map(m => ({ weight: share(m), median: modes[m].beelineMedianM, sigma: modes[m].sigma }));
  const q = comps.length ? mixtureQuantile(RADIUS_QUANTILE, comps) : RADIUS_MIN_M;
  const radiusM = Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, Math.ceil(q / RADIUS_STEP_M) * RADIUS_STEP_M));

  return {
    type,
    regioStaR7: group ? String(regioStaR7).trim() : null,
    group,
    ageGroup: age.label,
    split,
    splitSource: splitEntry.source,
    splitNote: splitEntry.note,
    meanKm: mean.km,
    meanSource: mean.source,
    meanNote: mean.note,
    modeSource: 'mid2023-abb100',
    scale: { active: kActive, motor: kMotor },
    modes,
    detourFactor: DETOUR_FACTOR,
    radiusM,
    radiusQuantile: RADIUS_QUANTILE
  };
}

/**
 * Längenverteilung eines Verkehrsmittels für die Startpunkt-Ziehung
 * (Format für Distribution.calculateDistribution).
 */
export function drawDistribution(modeParams) {
  return { type: 'lognormal-param', medianM: modeParams.beelineMedianM, sigma: modeParams.sigma };
}

/**
 * Anteil eines Verkehrsmittels an den Wegen im Entfernungsband [fromKm, toKm)
 * (Netzlänge) — folgt aus Split und Längenverteilungen. Für Doku und Tests.
 */
export function modeShareInBand(model, mode, fromKm, toKm, split = model.split) {
  const mass = (m) => {
    const p = model.modes[m];
    return ((split[m] || 0) / 100) * (lognormalCdf(toKm, p.medianKm, p.sigma) - lognormalCdf(fromKm, p.medianKm, p.sigma));
  };
  const total = MODE_KEYS.reduce((s, m) => s + mass(m), 0);
  return total > 0 ? mass(mode) / total : 0;
}

/** Quellen-IDs, die ein Modell verwendet (für Export und Oberfläche). */
export function modelSourceIds(model) {
  return [...new Set([model.splitSource, model.meanSource, model.modeSource, 'annahme'])];
}
