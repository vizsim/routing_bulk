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

## 1. Einzugsgrenze nach Verwaltungsebene je Einrichtungstyp

**Idee (Simon):** Gerade im ländlichen Raum ist der reine Radius unplausibel —
eine Kita in Gemeinde A zieht keine Kinder aus der Nachbargemeinde, auch wenn
die im 1-km-Radius liegt. Plausibel wäre:

- **Kindergarten, Grundschule** → nur Startpunkte innerhalb der **Gemeinde**
- **Weiterführende Schule** → innerhalb des **Landkreises**, mindestens des
  **Bundeslands**

**Umsetzung:** Zelle unter der Einrichtung liefert deren `ags`; beim Filtern
der Zellen je Einrichtung (heute nur Distanz ≤ Radius in
`analysis-service.run`) zusätzlich AGS-Präfix vergleichen:
Gemeinde = 8 Stellen gleich, Kreis = 5, Land = 2. Der Radius bleibt als
zweite Grenze bestehen.

- UI: Spalte „Einzug“ in der Typ-Tabelle (Gemeinde / Kreis / Land / nur Radius),
  Default je Typ wie oben.
- Randfälle: Stadtstaaten (Berlin/Hamburg = eine Gemeinde → Filter wirkungslos,
  gut so), Einrichtungen direkt an der Gemeindegrenze mit legitim „auswärtigen“
  Kindern → deshalb editierbar lassen, nicht hart erzwingen.
- Aufwand: **klein** (Filter + eine Tabellenspalte). Nutzen: hoch im ländlichen Raum.

## 2. RegioStaR7-basierte Modal-Split-Vorschläge

**Idee (Simon, schon im Konzept):** „Je ruraler, desto mehr Auto.“ Die Zelle
unter der Einrichtung liefert `RegioStaR7`; daraus Split-Defaults je Typ ×
Raumtyp vorschlagen (Quelle: MiD 2017, Wege von Schüler:innen nach RegioStaR7).

- UI-Varianten: (a) Defaults beim Laden automatisch nach Raumtyp vorbelegen
  (mit Hinweis „Vorschlag: Metropole“), oder (b) Knopf „Split aus Raumtyp
  vorschlagen“. Variante (a) ist die bessere UX, weil man nichts wissen muss.
- Zahlenbasis einmalig sauber ableiten und als Tabelle in den Code legen
  (MiD-Auswertung, notfalls plausibel gesetzt und dokumentiert).
- Aufwand: **klein** (Lookup-Tabelle + Zelle lesen). Die Anzeige des Raumtyps
  im Panel („Gebiet: Metropole · Berlin, Stadt“) ist nebenbei guter Kontext.

## 3. Distanzverhalten je Modus

Heute ziehen alle Modi ihre Startpunkte aus **derselben** Längenverteilung im
**selben** Radius. Real: Fußwege kurz, Rad mittel, Auto/ÖPNV lang.

- Einfachste Version: Radius-Faktor je Modus (Fuß 0,5 × R, Rad 1 × R,
  Auto 1 × R aber gleichverteilt statt lognormal).
- Aufwand: **klein**, deutlicher Realismusgewinn. Kombiniert sich gut mit
  Idee 1 (AGS-Grenze schneidet den Auto-Radius plausibel ab).

## 4. Darstellung & Auswertung

- **Modus-Filter für die Belastungskarte**: Checkboxen Fuß/Rad/ÖPNV/Auto —
  nur Fuß+Rad zeigt das Schulwegsicherheits-Bild, nur Auto die
  Elterntaxi-Hotspots. Die Daten (`byProfile` je Kante) sind schon da,
  es fehlt nur Filter + Neuzeichnen. Aufwand: **klein**.
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
| 1 | AGS-Einzugsgrenze je Typ | klein | hoch (ländlicher Raum) |
| 2 | RegioStaR7-Split-Vorschlag | klein | hoch |
| 4a | Modus-Filter Karte | klein | hoch |
| 3 | Distanzverhalten je Modus | klein | mittel |
| 5b | Altersfaktor je Typ | klein | klein–mittel |
| 4b | Unfall-Overlay | mittel | sehr hoch |
| 6c | Analyse speichern/laden + Seed | klein–mittel | mittel |
| 4c | Querungsbelastung | mittel | mittel |
| übrige | | mittel–groß | je nach Anwendungsfall |

Startpaket wäre 1 + 2 + 4a: alle drei klein, alle drei zahlen direkt auf die
Plausibilität bzw. Lesbarkeit ein und brauchen keine neuen Datenquellen.
