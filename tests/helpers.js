// Test-Helfer: GraphHopper-förmige Responses bauen.
//
// route([[lon, lat], ...], { edge_id: [...], sidewalk: [...], ... })
// erzeugt { paths: [{ points: { coordinates }, details, distance }] }.

export function route(coordinates, details, distance = 100) {
  return { paths: [{ points: { type: 'LineString', coordinates }, details, distance }] };
}

/** Ein Eintrag wie in routeResponses (Routing-Tab) bzw. AnalysisService.run. */
export function entry(response, profile, extra = {}) {
  return { response, profile, startSource: 'residential', ...extra };
}

// Drei Punkte auf einer Ost-West-Linie (je ~68 m auseinander)
export const A = [13.000, 52.000];
export const B = [13.001, 52.000];
export const C = [13.002, 52.000];
