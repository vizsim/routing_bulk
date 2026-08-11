# Ideensammlung: Weiterentwicklung der Gebietsanalyse

Stand: 2026-08-11 · Basis: Gebietsanalyse v1 (Beta) aus `docs/ANALYSE_MODUS_KONZEPT.md`

## Wichtigste Erkenntnis vorweg: die Zensus-Kacheln geben mehr her als genutzt

Jede 100×100-m-Zelle im Zensus-PMTiles trägt neben `Einwohner`/`Unter18`
u. a. diese Felder (geprüft am 2026-08-11 an einer Berliner Zelle):

| Feld | Beispiel | Bedeutung |
| --- | --- | --- |
| `RegioStaR7` | `"71"` | Regionalstatistische Raumtypologie (71 = Metropole … 77 = ländlich) |
| `ags` / `gem_23_str` | `"11000000"` | Amtlicher Gemeindeschlüssel: 2 Stellen Land · 5 Stellen Kreis · 8 Stellen Gemeinde |
| `name_23` | `"Berlin, Stadt"` | Gemeindename |
| `plz` | `"12053"` | Postleitzahl |
| `a18bis29` … `a65undaelter` | | Altersgruppen (leider keine Aufteilung innerhalb U18) |

Damit sind die beiden ersten Ideen **ohne neue Datenquelle** umsetzbar —
kein Verwaltungsgrenzen-Layer nötig, die Zugehörigkeit steht in jeder Zelle.

---

## 1. Einzugsgrenze nach Verwaltungsebene je Einrichtungstyp ✅ (umgesetzt 2026-08-11)

**Idee (Simon):** Gerade im ländlichen Raum ist der reine Radius unplausibel —
eine Kita in Gemeinde A zieht keine Kinder aus der Nachbargemeinde, auch wenn
die im 1-km-Radius liegt.

**Umgesetzt** über den AGS der Zensus-Zellen (Gemeinde = 8 Stellen,
Kreis = 5, Land = 2; `boundary` je Typ in `FACILITY_TYPES`,
Anwendung in `_applyBoundary`):

- **Kindergarten, Grundschule** → **hart**: Startpunkte nur aus der eigenen
  Gemeinde (Zellen außerhalb werden verworfen)
- **Weiterführende Schule** → **weich**: außerhalb des eigenen Landkreises
  wird die Personenzahl der Zelle mit ×0,3 abgewertet (Zieh-Wahrscheinlichkeit
  UND Kapazität), in einem anderen Bundesland mit ×0,1 — Einzug über die
  Kreisgrenze bleibt möglich, ist aber selten
- **„Schule“ (Typ unbekannt)** → weich an der Gemeindegrenze (könnte auch
  weiterführend sein — hart wäre riskant)
- Ohne AGS-Treffer (Einrichtung in unbewohntem Gebiet) greift keine Grenze;
  Stadtstaaten sind automatisch ein No-op. Faktoren stehen im Export unter
  `metadata.boundaryPenalties`, die Grenzen je Typ in `metadata.typeSettings`.
- Verifiziert: Wriezen hart 513 → 363 Zellen (nur noch Gemeinde 12064512);
  Kreisgrenze MOL/Barnim weich: Barnim-Zellen unter18 200 → 60 (exakt ×0,3),
  keine Zelle verworfen.

## 2. RegioStaR7-basierte Modal-Split-Vorschläge ✅ (umgesetzt 2026-08-11)

**Idee (Simon, schon im Konzept):** „Je ruraler, desto mehr Auto.“ Die Zelle
unter der Einrichtung liefert `RegioStaR7`; daraus Split-Defaults je Typ ×
Raumtyp vorschlagen (Quelle: MiD 2017, Wege von Schüler:innen nach RegioStaR7).

- Umgesetzt als Variante (a): Raumtyp per Mehrheit über die Zensus-Zellen im
  Polygon, Splits werden beim Laden automatisch vorbelegt — Zeile
  „Gebiet: Berlin, Stadt · Metropole — Split-Vorschlag angewendet“ über der
  Tabelle. Hat der Nutzer Splits schon angefasst, wird nichts überschrieben;
  stattdessen erscheint ein Knopf „Split-Vorschlag anwenden“.
- Vorschlagstabelle (`SPLIT_SUGGESTIONS` in `analysis-service.js`): die 7
  RegioStaR7-Typen sind zu 4 Gruppen zusammengefasst (71 Metropole ·
  72 Regiopole/Großstadt · 73/75/76 städtisch · 74/77 ländlich); Zahlen sind
  an die MiD 2017 angelehnte, dokumentierte Setzungen — z. B. Grundschule
  Metropole 55/20/10/15, ländlich 30/15/25/30 (Schulbus). In der UI bleibt
  alles editierbar; der Raumtyp steht im Export unter `metadata.areaContext`.

## 3. Distanzverhalten je Modus ✅ (umgesetzt 2026-08-11)

Vorher zogen alle Modi ihre Startpunkte aus **derselben** Längenverteilung im
**selben** Radius. Real: Fußwege kurz, Rad mittel, Auto/ÖPNV lang.

- Umgesetzt als Radius-Faktor + Verteilung je Modus (in `MODES`,
  `analysis-service.js`): Fuß 0,5 × R lognormal, Rad 1 × R lognormal,
  Auto 1 × R **gleichverteilt** statt nah-lastig; ÖPNV unverändert
  Haltestellen-Modell. Werte stehen im Export unter `metadata.modeBehavior`.
- Kombiniert sich gut mit Idee 1 (AGS-Grenze schneidet den Auto-Radius
  plausibel ab).

## 4. Darstellung & Auswertung

- **Modus-Filter für die Belastungskarte** ✅ (umgesetzt 2026-08-11):
  Checkboxen „Angezeigte Wege: Fuß/Rad/ÖPNV/Auto“ unter dem Ergebnis —
  nur Fuß+Rad zeigt das Schulwegsicherheits-Bild, nur Auto die
  Elterntaxi-Hotspots; Neuzeichnen aus den Kanten-Summen ohne Neuberechnung.
- **Unfall-Overlay**: Unfalldaten aus der unfallkarte (PMTiles vorhanden) über
  die Belastungskarte legen → Kanten mit hoher Schulweg-Belastung **und**
  Unfallhäufung als priorisierte Konfliktstellen. Aufwand: **mittel**,
  vermutlich der größte inhaltliche Mehrwert des ganzen Projekts.
- **Querungs-/Knotenbelastung**: Aggregation zusätzlich an Kanten-Endpunkten
  (Kreuzungen) → „meistbelastete Querungen“. Aufwand: **mittel**.
- **Belastung je Einrichtung ein-/ausblenden**: Ergebnisse je Einrichtung im
  Speicher halten und Karte ohne Neuberechnung filtern (Hover-Kopplung gibt es
  schon, das wäre die konsequente Fortsetzung). Aufwand: **mittel** (Speicher!).
- **Szenario-Vergleich**: zwei Läufe (z. B. Split heute vs. Ziel-Split) als
  Differenzkarte. Aufwand: **mittel–groß**.

## 5. Nachfrage-Daten verbessern

- **Echte Schülerzahlen statt Typ-Pauschalen**: Schulverzeichnisse der Länder
  (teils Open Data) → `trips` je Schule vorbelegen. Matching über Name/Adresse
  ist Fleißarbeit; ggf. erst mal nur für ein Bundesland. Aufwand: **mittel–groß**.
- **Altersschärfe**: Kita braucht 1–6-Jährige, Grundschule 6–10 — der Zensus
  liefert nur `Unter18` gesamt. Pragmatisch: fester Faktor je Typ
  (z. B. Kita ≈ ⅓ der U18) — ändert die Gewichte kaum, aber die
  Kapazitätsgrenze wird realistischer. Aufwand: **klein**.
- **Weitere Zieltypen**: Spielplätze, Sportstätten, Jugendeinrichtungen als
  zusätzliche PMTiles-Layer aus der unfallkarte-Pipeline (gleicher Workflow
  wie schools/platforms). Aufwand: **mittel** (v. a. Pipeline).

## 6. Bedienung & Reproduzierbarkeit

- **Polygon aus Verwaltungsgrenze übernehmen**: „Gemeinde anklicken statt
  zeichnen“ — braucht ein VG250-PMTiles (BKG, Open Data) in der Pipeline.
  Passt gut zu Idee 1. Aufwand: **mittel**.
- **Polygon editieren**: Eckpunkte verschieben statt neu zeichnen. Aufwand: **klein–mittel**.
- **Analyse speichern/laden**: das Setup (Polygon, Fahrten, Splits) steckt
  schon in den Export-Metadaten — ein Import dazu und Analysen sind
  reproduzierbar teilbar. Dazu passt ein fester Zufalls-Seed je Lauf, damit
  derselbe Lauf dieselben Startpunkte zieht. Aufwand: **klein–mittel**.

## Priorisierung (Vorschlag)

| # | Idee | Aufwand | Nutzen |
| --- | --- | --- | --- |
| 1 | AGS-Einzugsgrenze je Typ ✅ | klein | hoch (ländlicher Raum) |
| 2 | RegioStaR7-Split-Vorschlag ✅ | klein | hoch |
| 4a | Modus-Filter Karte ✅ | klein | hoch |
| 3 | Distanzverhalten je Modus ✅ | klein | mittel |
| 5b | Altersfaktor je Typ | klein | klein–mittel |
| 4b | Unfall-Overlay | mittel | sehr hoch |
| 6c | Analyse speichern/laden + Seed | klein–mittel | mittel |
| 4c | Querungsbelastung | mittel | mittel |
| übrige | | mittel–groß | je nach Anwendungsfall |

Das Startpaket (1 + 2 + 4a) und Idee 3 sind komplett umgesetzt — als nächste
„kleine“ Idee bietet sich **5b (Altersfaktor je Typ)** an, als nächster großer
Mehrwert **4b (Unfall-Overlay)**.
