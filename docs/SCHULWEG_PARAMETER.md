# Schulweg-Modell der Gebietsanalyse: Parameter und Quellen

Stand: 25.10.2026. Alle Werte stehen mit Quelle in
[`src/domain/school-trips.js`](../src/domain/school-trips.js); die Gebietsanalyse
zeigt sie unter „Annahmen & Quellen“ und schreibt sie in den GeoJSON-Export
(`metadata.typeSettings`, `metadata.sources`, `metadata.pupilSources`).
Tests: [`tests/school-trips.test.js`](../tests/school-trips.test.js).

## Modell in fünf Sätzen

1. **Wege je Einrichtung = Schüler:innen = Hinwege je Schultag.** Die Rückwege
   sind etwa gleich viele auf denselben Kanten in Gegenrichtung (MiD 2008:
   knapp die Hälfte der Schulwege sind Rückwege — 49,6 % in der Gesamtstichprobe,
   48,6 % in der Teilstichprobe des Begleitmodells, Scheiner 2016). Vorbelegt aus amtlichen
   Schülerzahlen, sonst Platzhalter — siehe
   [`preprocessing/schuelerzahlen`](../preprocessing/schuelerzahlen/README.md).
2. **Modal Split** je Einrichtungstyp und Raumtyp (RegioStaR7) als Vorschlag,
   in der Oberfläche editierbar.
3. **Weglänge je Verkehrsmittel** (lognormal): Mittelwerte aus MiD 2023 Abb. 100,
   so skaliert, dass der Mittelwert über alle Verkehrsmittel der Kita-/Schulweglänge
   des Raumtyps aus MiD 2023 Tab. 43 entspricht. Dadurch hängt die
   Verkehrsmittelwahl von der Entfernung ab: kurze Wege zu Fuß, mittlere mit dem
   Rad, lange mit ÖPNV und Auto. Der frühere feste Radiusfaktor je Modus entfällt.
4. **Luftlinie:** Startpunkte werden nach Luftlinie um die Schule gezogen;
   Netzlänge ÷ Umwegfaktor 1,3.
5. **Radius = Kappung:** Vorschlag = 90 % der Fuß-, Rad- und Autowege
   (Luftlinie, auf 500 m aufgerundet, 1–8 km). Wege von weiter her starten im
   äußersten Ring — sie erreichen das Gebiet über dessen Rand. ÖPNV startet
   an einer Haltestelle nahe der Einrichtung — siehe Abschnitt
   „ÖPNV: Ausstiegshaltestelle“.

Berufliche Schulen (Oberstufenzentren, Berufs-, Fachschulen) sind ein eigener
Typ mit Werten für Auszubildende und anteiliger Anwesenheit — siehe
[Berufliche Schulen](#berufliche-schulen).

## Eingangsdaten

### MiD 2023, Tab. 43 — Kita- und Schulweglängen nach Raumtyp und Altersgruppe (km)

Ergebnisbericht S. 179; Personen 0–17 Jahre; auf ganze km gerundet, als
Mittelwerte verwendet.

| RegioStaR7 | 0–6 J. | 7–10 J. | 11–13 J. | 14–17 J. |
| --- | ---: | ---: | ---: | ---: |
| 71 Stadtregion – Metropole | 2 | 2 | 4 | 4 |
| 72 Stadtregion – Regiopole und Großstadt | 2 | 2 | 4 | 4 |
| 73 Stadtregion – Mittelstadt, städtischer Raum | 3 | 3 | 6 | 7 |
| 74 Stadtregion – kleinstädtischer, dörflicher Raum | 3 | 5 | 9 | 9 |
| 75 ländliche Region – zentrale Stadt | 3 | 2 | 4 | 5 |
| 76 ländliche Region – Mittelstadt, städtischer Raum | 3 | 4 | 6 | 7 |
| 77 ländliche Region – kleinstädtischer, dörflicher Raum | 3 | 5 | 9 | 10 |

Zuordnung: Kindergarten → 0–6, Grundschule und „Schule“ (Art unbekannt) → 7–10,
weiterführende Schule → Mittel aus 11–13 und 14–17.

### MiD 2023, Abb. 98 — Verkehrsmittel auf Schulwegen (inkl. Kita), bundesweit (%)

Ergebnisbericht S. 177.

| | Fuß | Rad | ÖPNV | MIV (Mit-/Selbstfahrt) |
| --- | ---: | ---: | ---: | ---: |
| bis 10 Jahre | 37 | 15 | 14 | 34 |
| 11 bis 17 Jahre | 19 | 21 | 47 | 12 (Summe 99, normiert: 19/21/48/12) |

### MiD 2023, Abb. 100 — durchschnittliche Weglänge im Nahbereich (km)

Ergebnisbericht S. 179; alle Wegezwecke je Verkehrsmittel, dazu der Zweck
Ausbildung über alle Verkehrsmittel. Aus der Grafik per Pixelmessung abgelesen
(Achse 77,5 px je km, ±0,05 km); verwendet auf 0,1 km gerundet.

| | Fuß | Rad | ÖPNV | Auto | Ausbildung |
| --- | ---: | ---: | ---: | ---: | ---: |
| bis 10 Jahre (gemessen) | 1,20 | 2,21 | 5,23 | 7,62 | 2,82 |
| 11–17 Jahre (gemessen) | 1,51 | 2,92 | 8,53 | 9,95 | 6,01 |
| verwendet bis 10 / 11–17 | 1,2 / 1,5 | 2,2 / 2,9 | 5,2 / 8,5 | 7,6 / 9,9 | 2,8 / 6,0 |

Plausibel: Mit dem Split aus Abb. 98 ergibt sich für 11–17 Jahre ein
Mittel von 6,1 km — fast genau der Wert für Ausbildungswege (6,0 km). Für bis 10
Jahre ergäben sich 4,1 km statt 2,8 km: Autowege zu Kita und Schule sind kürzer
als Autowege von Kindern insgesamt. Deshalb wird skaliert (siehe unten).

### forsa 2022 — Wie kommt das Kind (6–10 J.) zur Schule? (Eltern, %)

forsa im Auftrag von Deutschem Kinderhilfswerk, VBE und VCD, 20.07.–16.08.2022,
n = 500 Eltern, S. 14. ÖPNV = ÖPNV + Schulbus, Auto = Pkw + Fahrgemeinschaft,
auf 100 % normiert (größter Rest).

| Ortsgröße | Fuß | ÖPNV | Schulbus | Rad/Roller | Pkw | Fahrgem. | → Split Fuß/Rad/ÖPNV/Auto | Raumtyp-Gruppe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| gesamt | 47 | 13 | 8 | 14 | 15 | 2 | 48/14/21/17 | ohne Raumtyp |
| unter 20.000 | 38 | 15 | 13 | 13 | 17 | 2 | 39/13/29/19 | 74, 77 |
| 20.000–100.000 | 55 | 11 | 5 | 15 | 13 | 1 | 55/15/16/14 | 73, 75, 76 |
| ab 100.000 | 52 | 13 | 2 | 15 | 13 | 1 | 54/16/16/14 | 71, 72 |

Die Zuordnung Raumtyp → Ortsgröße ist eine Annahme.

### Setzungen (bisherige Werte, an MiD 2017 angelehnt)

Nur wo keine neuere Quelle vorliegt: Kindergarten in allen Raumtypen, „Schule“
(Art unbekannt), weiterführende Schulen außerhalb von Metropolen und Großstädten.
In der Oberfläche als „Setzung“ gekennzeichnet.

### Annahmen

| Annahme | Wert | Begründung |
| --- | --- | --- |
| Streuung σ der Weglänge (lognormal) | Fuß 0,6 · Rad 0,6 · ÖPNV 0,7 · Auto 0,9 | Stuttgart 2005 ergibt für alle Wege zur Grundschule σ ≈ 0,6 (Median 0,9 km, knapp 90 % unter 2 km), für Realschule/Gymnasium 0,8–0,9; Autowege streuen am stärksten (kurze Elterntaxi-Fahrten und lange Wege zu Wahlschulen). Die Ergebnisse unten ändern sich mit σ ± 0,1 kaum. |
| Umwegfaktor Netz/Luftlinie | 1,3 | übliche Größenordnung 1,2–1,4 |
| Fuß und Rad höchstens so lang wie bundesweit | k_aktiv = min(k, 1) | Kinder gehen auch auf dem Land nicht weiter zu Fuß; längere Wege tragen ÖPNV und Auto |
| Fußwege von Kita- und Grundschulkindern | Ø höchstens 0,9 km, nie über 2 km (Netzlänge) | Abb. 100 gilt für alle Wegezwecke inkl. Spaziergänge (1,2 km). Kinder der Klassen 1–2, die aktiv zur Schule kommen: Ø 0,9 km, Median 0,7 km (Kobel et al. 2019). Ab 2 km Schulweg haben Grundschulkinder Anspruch auf Schülerbeförderung (Bayern § 2 SchBefV, NRW SchfkVO). Gilt für Kita, Grundschule und „Schule“ (Art unbekannt). Ohne Grenze gingen auf dem Land 25 % der laufenden Grundschulkinder über 1,5 km, jetzt rund 8 %. |
| Radius-Vorschlag | 90 %-Quantil der Fuß-, Rad- und Autowege, 1–8 km | Rechenaufwand begrenzen; der Rest startet am Rand |
| Ein Hinweg je Schüler:in und Schultag | — | Anwesenheit (Krankheit u. Ä.) vernachlässigt; berufliche Schulen anteilig (siehe [Berufliche Schulen](#berufliche-schulen)) |

## Ableitung je Einrichtungstyp und Raumtyp

Mit Split s_m (Vorschlag), Abb.-100-Mittel A_m und Tab.-43-Mittel L:

- k = L ÷ Σ s_m·A_m
- k_aktiv = min(k, 1) für Fuß und Rad
- Verteilungsmittel Fuß = min(A_Fuß · k_aktiv, 0,9 km) bei Kita und Grundschule, Rad = A_Rad · k_aktiv
- Fußwege von Kita- und Grundschulkindern enden bei 2 km Netzlänge (1.538 m
  Luftlinie): Die Masse darüber fällt weg, der Rest wird hochgerechnet; Zellen
  jenseits davon starten keine Fußwege. Der tatsächliche Mittelwert Ø_Fuß ist
  der der abgeschnittenen Lognormalverteilung (Metropole 0,76 statt 0,83 km,
  übrige Raumtypen 0,81 statt 0,90 km).
- k_mot = (L − s_Fuß·Ø_Fuß − s_Rad·Ø_Rad) ÷ Σ_{ÖPNV,Auto} s_m·A_m
- Ø_m = A_m · k_mot für ÖPNV und Auto, Median_m = Verteilungsmittel ÷ e^(σ²/2), Luftlinien-Median = Median_m ÷ 1,3

Damit trifft der Mittelwert über alle Verkehrsmittel genau Tab. 43. Ändert man
den Split in der Oberfläche, bleiben die Verteilungen je Verkehrsmittel gleich
(mehr Auto → längere Wege insgesamt).

## Ergebnis (Netzlänge in km)

Erzeugt aus dem Code (`tripModel`); „Radius“ ist der Vorschlag in Luftlinie.

#### Grundschule

| Raumtyp | Split Fuß/Rad/ÖPNV/Auto (%) | Quelle Split | Ø Weg | Ø Fuß | Ø Rad | Ø ÖPNV | Ø Auto | Radius |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 71 Metropole | 54/16/16/14 | forsa 2022 | 2,0 | 0,76 | 1,52 | 3,70 | 5,40 | 3,0 km |
| 72 Regiopole/Großstadt | 54/16/16/14 | forsa 2022 | 2,0 | 0,76 | 1,52 | 3,70 | 5,40 | 3,0 km |
| 73 Mittelstadt (Stadtregion) | 55/15/16/14 | forsa 2022 | 3,0 | 0,81 | 2,20 | 6,11 | 8,93 | 4,5 km |
| 74 Kleinstädtisch/dörflich (Stadtregion) | 39/13/29/19 | forsa 2022 | 5,0 | 0,81 | 2,20 | 7,75 | 11,33 | 8,0 km |
| 75 Zentrale Stadt (ländlich) | 55/15/16/14 | forsa 2022 | 2,0 | 0,76 | 1,52 | 3,71 | 5,43 | 3,0 km |
| 76 Mittelstadt (ländliche Region) | 55/15/16/14 | forsa 2022 | 4,0 | 0,81 | 2,20 | 8,85 | 12,94 | 5,5 km |
| 77 Kleinstädtisch/dörflich (ländlich) | 39/13/29/19 | forsa 2022 | 5,0 | 0,81 | 2,20 | 7,75 | 11,33 | 8,0 km |
| ohne Raumtyp (bundesweit) | 48/14/21/17 | forsa 2022 | 2,8 | 0,81 | 1,88 | 4,69 | 6,85 | 4,0 km |

#### Weiterführende Schule

| Raumtyp | Split Fuß/Rad/ÖPNV/Auto (%) | Quelle Split | Ø Weg | Ø Fuß | Ø Rad | Ø ÖPNV | Ø Auto | Radius |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 71 Metropole | 19/21/48/12 | MiD 2023, Abb. 98 | 4,0 | 0,97 | 1,88 | 5,52 | 6,43 | 4,5 km |
| 72 Regiopole/Großstadt | 19/21/48/12 | MiD 2023, Abb. 98 | 4,0 | 0,97 | 1,88 | 5,52 | 6,43 | 4,5 km |
| 73 Mittelstadt (Stadtregion) | 20/30/35/15 | Setzung | 6,5 | 1,50 | 2,90 | 10,16 | 11,83 | 7,5 km |
| 74 Kleinstädtisch/dörflich (Stadtregion) | 10/20/50/20 | Setzung | 9,0 | 1,50 | 2,90 | 11,28 | 13,14 | 8,0 km |
| 75 Zentrale Stadt (ländlich) | 20/30/35/15 | Setzung | 4,5 | 1,20 | 2,32 | 6,79 | 7,91 | 5,5 km |
| 76 Mittelstadt (ländliche Region) | 20/30/35/15 | Setzung | 6,5 | 1,50 | 2,90 | 10,16 | 11,83 | 7,5 km |
| 77 Kleinstädtisch/dörflich (ländlich) | 10/20/50/20 | Setzung | 9,5 | 1,50 | 2,90 | 11,97 | 13,94 | 8,0 km |
| ohne Raumtyp (bundesweit) | 19/21/48/12 | MiD 2023, Abb. 98 | 6,0 | 1,46 | 2,82 | 8,28 | 9,64 | 6,5 km |

#### Kindergarten

| Raumtyp | Split Fuß/Rad/ÖPNV/Auto (%) | Quelle Split | Ø Weg | Ø Fuß | Ø Rad | Ø ÖPNV | Ø Auto | Radius |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 71 Metropole | 60/10/5/25 | Setzung | 2,0 | 0,72 | 1,42 | 3,44 | 5,02 | 3,5 km |
| 72 Regiopole/Großstadt | 55/10/5/30 | Setzung | 2,0 | 0,66 | 1,29 | 3,08 | 4,51 | 4,0 km |
| 73 Mittelstadt (Stadtregion) | 45/10/5/40 | Setzung | 3,0 | 0,80 | 1,63 | 3,91 | 5,71 | 6,0 km |
| 74 Kleinstädtisch/dörflich (Stadtregion) | 30/5/5/60 | Setzung | 3,0 | 0,65 | 1,25 | 2,96 | 4,33 | 5,5 km |
| 75 Zentrale Stadt (ländlich) | 45/10/5/40 | Setzung | 3,0 | 0,80 | 1,63 | 3,91 | 5,71 | 6,0 km |
| 76 Mittelstadt (ländliche Region) | 45/10/5/40 | Setzung | 3,0 | 0,80 | 1,63 | 3,91 | 5,71 | 6,0 km |
| 77 Kleinstädtisch/dörflich (ländlich) | 30/5/5/60 | Setzung | 3,0 | 0,65 | 1,25 | 2,96 | 4,33 | 5,5 km |
| ohne Raumtyp (bundesweit) | 37/15/14/34 | MiD 2023, Abb. 98 | 2,8 | 0,75 | 1,51 | 3,60 | 5,27 | 5,0 km |

„Schule“ (Art unbekannt) verwendet die Längen der Grundschule mit den
bisherigen Setzungen für den Split (siehe Code).

## Berufliche Schulen

Oberstufenzentren, Berufs-, Berufsfach-, Fachober- und Fachschulen, berufliche
Gymnasien, Berufskollegs: erkannt an der amtlichen Schulart oder, ohne amtliche
Daten, am Namen. Mehrere Schularten (Hamburg) zählen als beruflich, wenn keine
allgemeinbildende dabei ist; berufliche Bildungsgänge an allgemeinbildenden
Schulen („Berufsfachschule (allg. bild.)“, „Förderschwerpunkt einschl.
beruflichem Teil“) bleiben allgemeinbildend.

Die Schüler:innen sind meist volljährig (Auszubildende), Tab. 43 endet mit
17 Jahren. Deshalb eigene Werte:

| Baustein | Wert | Quelle |
| --- | --- | --- |
| Modal Split bundesweit | Fuß 18,5 · Rad 6,5 · ÖPNV 28 · Auto 47 (Männer 21/7/22/37+12, Frauen 16/6/34/35+10) → 19/6/28/47 | MiD 2023, Abb. 78 (S. 156): Auszubildende 18–29 Jahre, alle Wegezwecke; aus der Grafik abgelesen |
| Raumtyp-Faktor | Anteil im Raumtyp ÷ bundesweit, je Verkehrsmittel; danach neu normiert | MiD 2023, Tab. 8 (S. 47): alle Wege nach RegioStaR7 — Annahme: der Raumtyp wirkt bei Auszubildenden wie bei allen Wegen |
| mittlere Weglänge | 15,15 km (Männer 18,1, Frauen 12,2) | MiD 2023, Tab. 38 (S. 154): Auszubildende 18–29 Jahre, alle Wegezwecke |
| Weglänge je Verkehrsmittel | Verhältnis wie bei 11- bis 17-Jährigen, auf 15,15 km skaliert (Fuß und Rad höchstens ×1) | MiD 2023, Abb. 100 |
| Startpunkte | ganze Bevölkerung der Zensus-Zellen statt unter 18-Jährige | Annahme |
| Einzugsgrenze | eigener Kreis bevorzugt (wie weiterführende Schulen), in Berlin die ganze Stadt | Annahme |
| Platzhalter ohne amtliche Zahl | 800 Schüler:innen | Annahme (Berlin: Median aller beruflichen Schulen 392, große OSZ 2.000–4.000) |

MiD 2023 Tab. 8, Hauptverkehrsmittel aller Wege (%):

| | Fuß | Rad | ÖV | MIV-Fahrt | MIV-Mitfahrt |
| --- | ---: | ---: | ---: | ---: | ---: |
| gesamt | 26 | 11 | 11 | 40 | 13 |
| 71 Metropole | 31 | 15 | 21 | 25 | 8 |
| 72 Regiopole und Großstadt | 29 | 15 | 14 | 32 | 11 |
| 73 Mittelstadt, städtischer Raum (Stadtregion) | 25 | 11 | 9 | 42 | 14 |
| 74 kleinstädtischer, dörflicher Raum (Stadtregion) | 21 | 9 | 8 | 47 | 15 |
| 75 zentrale Stadt (ländliche Region) | 28 | 13 | 8 | 38 | 12 |
| 76 Mittelstadt, städtischer Raum (ländliche Region) | 25 | 10 | 6 | 45 | 15 |
| 77 kleinstädtischer, dörflicher Raum (ländliche Region) | 22 | 6 | 7 | 51 | 14 |
| zum Vergleich: Berlin | 35 | 14 | 27 | 18 | 6 |

Beispiel Metropole: Fuß 18,5 · 31/26, Rad 6,5 · 15/11, ÖPNV 28 · 21/11,
Auto 47 · 33/53 → normiert 19/8/47/26.

### Ergebnis berufliche Schule (Netzlänge in km)

| Raumtyp | Split Fuß/Rad/ÖPNV/Auto (%) | Quelle Split | Ø Weg | Ø Fuß | Ø Rad | Ø ÖPNV | Ø Auto | Radius (90 %-Quantil) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 71 Metropole | 19/8/47/26 | Abb. 78 × Tab. 8 | 15,2 | 1,50 | 2,90 | 18,93 | 22,05 | 8,0 km (23,8) |
| 72 Regiopole/Großstadt | 20/9/34/37 | Abb. 78 × Tab. 8 | 15,2 | 1,50 | 2,90 | 18,92 | 22,04 | 8,0 km (25,9) |
| 73 Mittelstadt (Stadtregion) | 18/7/24/51 | Abb. 78 × Tab. 8 | 15,2 | 1,50 | 2,90 | 17,60 | 20,50 | 8,0 km (26,8) |
| 74 Kleinstädtisch/dörflich (Stadtregion) | 16/6/21/57 | Abb. 78 × Tab. 8 | 15,2 | 1,50 | 2,90 | 16,86 | 19,64 | 8,0 km (26,8) |
| 75 Zentrale Stadt (ländlich) | 22/8/22/48 | Abb. 78 × Tab. 8 | 15,2 | 1,50 | 2,90 | 18,73 | 21,81 | 8,0 km (27,1) |
| 76 Mittelstadt (ländliche Region) | 19/6/17/58 | Abb. 78 × Tab. 8 | 15,2 | 1,50 | 2,90 | 17,37 | 20,24 | 8,0 km (27,1) |
| 77 Kleinstädtisch/dörflich (ländlich) | 16/4/19/61 | Abb. 78 × Tab. 8 | 15,2 | 1,50 | 2,90 | 16,43 | 19,14 | 8,0 km (26,7) |
| ohne Raumtyp (bundesweit) | 19/6/28/47 | MiD 2023, Abb. 78 | 15,2 | 1,50 | 2,90 | 17,76 | 20,68 | 8,0 km (26,6) |

Der Radius greift hier immer als Obergrenze: Rund zwei Drittel der Autowege
starten im äußersten Ring (Browser-Test OSZ Gesundheit I, Berlin: 39 von 60
Auto-Startpunkten jenseits von 7,5 km). Für die Belastung im Gebiet zählt nur,
von welcher Seite sie hereinkommen.

### Anwesenheit: Wege je Schultag

Wege je Schultag = Schüler:innen × Anteil, der an einem Schultag da ist. Die
Berufsschule der dualen Ausbildung ist Teilzeitunterricht: mindestens
12 Wochenstunden, „als Teilzeitunterricht, der auch als Blockunterricht erteilt
werden kann“ (KMK-Rahmenvereinbarung Nr. 3.2 und 4.1), „in der Regel … an zwei
Tagen in der Woche oder als Blockunterricht in zusammenhängenden Abschnitten in
Vollzeitform“ (Destatis-Qualitätsbericht, S. 13). Blockunterricht ergibt im
Jahresmittel ähnlich viel: rund 480 Stunden je Jahr bei 30–35 Stunden je Woche
sind 14–16 von etwa 39 Schulwochen (35–40 %).

| Schuljahr 2024/25 (Destatis, Tab. 21121-02) | Schüler:innen | davon Teilzeit | Anteil Teilzeit | an einem Schultag da |
| --- | ---: | ---: | ---: | ---: |
| Deutschland | 2.261.831 | 1.414.134 | 62,5 % | **62 %** (verwendet) |
| Berlin | 77.854 | 49.654 | 63,8 % | 62 % |
| Brandenburg | 42.962 | 28.482 | 66,3 % | 60 % |

Anteil da = Vollzeit + Teilzeit × 2/5. Teilzeit sind fast nur Berufsschulen der
dualen Ausbildung (Deutschland 1.295.323), dazu Fachschulen in Teilzeit (52.450,
meist berufsbegleitend). Schulen des Gesundheitswesens zählt Destatis getrennt;
sie sind fast alle Vollzeit. Fehlzeiten (Krankheit u. Ä.) bleiben wie bei allen
Typen außen vor. Berlin und Brandenburg liegen nah am Bundeswert, deshalb gilt
ein Wert für alle Länder.

Beispiel OSZ Gesundheit I (Berlin, 2.902 Schüler:innen 2024/25): 1.813 Hinwege je
Schultag. Ohne amtliche Zahl: Platzhalter 800 Schüler:innen → 500 Hinwege.

## ÖPNV: Ausstiegshaltestelle

Die Gebietsanalyse routet bei ÖPNV nur den Fußweg von der Haltestelle zur
Einrichtung (kein Fahrplan-Routing). Welche Haltestelle, entscheidet
[`src/domain/transit-stops.js`](../src/domain/transit-stops.js) in drei Schritten:

1. **Typ** aus den Attributen der Haltestellen-Kacheln: Straßenbahn
   (`tram=yes`), Schiene = S-, U- und Eisenbahn (`railway=platform` ohne
   `tram`, `train=yes`), sonst Bus. Der Name hilft nicht — in Berlin heißen
   gerade die Bushaltestellen am U-Bahnhof „U Schönleinstraße“, der Bahnsteig
   nur „Schönleinstraße“. Liegen Bahnsteig und Bushaltestelle an einem Ort
   (unter 30 m oder gleicher Name bis 250 m), zählt der höhere Typ.
2. **Einzugsbereich je Typ** (Luftlinie), Grenzwerte der Leitlinie zur
   Nahverkehrsplanung in Bayern (Anhang C, Tab. 1, Ober-/Mittelzentren);
   Metropolen und Großstädte als hohe Nutzungsdichte (Annahme):

   | Gebiet | Bus/Straßenbahn | Schiene |
   | --- | ---: | ---: |
   | Metropole, Großstadt (hohe Nutzungsdichte) | 500 m | 800 m |
   | übrige Raumtypen (niedrige Nutzungsdichte) | 800 m | 1.200 m |

   Liegt keine Haltestelle im Einzugsbereich, gelten wie bisher die drei
   nächsten, nach Nähe gewichtet.
3. **Anteil je Typ nach Länge der ÖPNV-Wege.** MiD 2023: Anteil an allen
   Wegen Bus 4 %, U-/Stadtbahn 2 %, S-Bahn/Nahverkehrszug 2 %, Straßenbahn 1 %
   (Abb. 7, S. 49); mittlere Weglänge im Straßenpersonenverkehr (Bus,
   Straßenbahn, U-Bahn) 9 km, im SPNV (S-Bahn, Regionalzug) 26 km (Tab. 24,
   S. 103). Mit beiden Längen als Lognormalverteilung (Streuung wie die
   ÖPNV-Wege, σ = 0,7 — Annahme) ergibt sich P(SPNV | Länge); gemittelt über
   die Längenverteilung der ÖPNV-Wege des Einrichtungstyps. Schiene = U-Bahn +
   SPNV (in OSM nicht zu trennen); im Straßenpersonenverkehr bleibt das
   Verhältnis Bus 4 : U-Bahn 2 : Straßenbahn 1.

   | Einrichtung (Raumtyp) | Ø ÖPNV-Weg | Schiene | Straßenbahn | Bus | nur Schiene + Bus im Einzugsbereich: Schiene |
   | --- | ---: | ---: | ---: | ---: | ---: |
   | Grundschule (Metropole) | 3,7 km | 31 % | 14 % | 55 % | 36 % |
   | Weiterführende Schule (Metropole) | 5,5 km | 33 % | 13 % | 53 % | 39 % |
   | Berufliche Schule (Metropole) | 18,9 km | 55 % | 9 % | 36 % | 60 % |
   | Grundschule (dörflich, ländlich) | 7,8 km | 37 % | 13 % | 50 % | 42 % |
   | Weiterführende Schule (dörflich, ländlich) | 12,0 km | 44 % | 11 % | 45 % | 50 % |

Die Anteile werden auf die Typen verteilt, die im Einzugsbereich vorkommen;
innerhalb eines Typs zählt die Nähe (1/(d + 100 m)). Beispiel: Bushaltestelle
in 110 m, U-Bahnhof in 700 m, keine Straßenbahn → Grundschule 36 % U-Bahn,
berufliche Schule 60 %. Vorher (die drei nächsten Haltestellen, nur nach
Nähe) bekam der U-Bahnhof hier ein Fünftel, eine U-Bahn hinter drei näheren
Bushaltestellen nichts. Das Ergebnis der Analyse zeigt, wo die ÖPNV-Wege
enden (Anteil je Typ).

Grenzen: Die Anteile sind bundesweit; wie stark eine Linie fährt, kennen die
Kacheln nicht. Genauer wären Abfahrten je Haltestelle aus dem bundesweiten
Fahrplan (GTFS). Straßenbahnsteige ohne `tram=yes` gelten als Schiene.
Der Weg vom Wohnort zur Einstiegshaltestelle ist nicht enthalten.

## Plausibilitätsprüfung

**Fußanteil nach Entfernung** (Anteil der Wege im Entfernungsband, die zu Fuß
gehen; folgt aus Split und Längenverteilungen):

| Netzlänge | Modell Metropole | Modell bundesweit | Scheiner et al. 2019 (MiD, bundesweit) |
| --- | ---: | ---: | ---: |
| unter 0,6 km | 91 % | 94 % | 85 % |
| 0,6–1,2 km | 73 % | 79 % | rund 60 % |
| 1,2–2,0 km | 44 % | 47 % | 34 % (Scheiner: „ab 1,2 km“, ohne Obergrenze) |

Verlauf passt, das Modell fällt aber langsamer ab: Bei mittleren Entfernungen
(0,6–2 km) legt es Wege eher zu Fuß als die MiD-Auswertung. Vermutliche
Ursache: Abb. 100 gilt für alle Zwecke, Elterntaxi-Fahrten zur Grundschule sind
kürzer (Kobel et al. 2019, Klassen 1–2: gefahrene Kinder Ø 2,9 km). Die
Grenze für Fußwege von Grundschulkindern (Ø höchstens 0,9 km, nie über 2 km)
senkt den Fußanteil bei 1,2–2 km bundesweit von 51 auf 47 %. Der
Radanteil ist im Modell zwischen 1,2 und 2 km am höchsten, wie bei Scheiner.

**Weglängen** gegen Stuttgart 2005 (Gieck 2006, Netzdistanz): Grundschule
Median 0,9 km, knapp 90 % unter 2 km — Modell Metropole 1,03 km und 75 %.
Realschule/Gymnasium Median 2,0–2,2 km, 20–26 % ab 4 km — Modell weiterführend
Metropole 2,6 km und 34 %. Das Modell folgt der neueren MiD 2023 (Ø 2 bzw. 4 km);
die Werte liegen höher als in Stuttgart vor 20 Jahren. Tab. 43 ist auf ganze km
gerundet — 2 km kann auch 1,5 km bedeuten.

**Nächste Grundschule:** in Berlin im Mittel 477 m Luftlinie (BBSR 2021,
einwohnergewichtet). Modell Metropole: Fußwege Ø 583 m, Median 517 m Luftlinie —
etwas länger, weil nicht alle Kinder die nächste Schule besuchen.

**Effektive Ziehung** (echter Code `DemandService._drawFromCells`, synthetisches
Raster aus 100-m-Zellen, 300 × 100 Startpunkte; Luftlinie; Stand mit 2-km-Grenze
für Fußwege und Rundung je Ring nach dem größten Rest):

| Grundschule Metropole | Soll-Median | Ist-Median | unter 250 m | vorher (R/4, σ = 2) |
| --- | ---: | ---: | ---: | --- |
| Fuß | 517 m (bis 1.538 m) | 534 m | 10 % | Median ~320 m, 42 % unter 250 m |
| Rad | 976 m | 993 m | 1 % | Median ~300 m |
| Auto | 2.772 m | 2.770 m (Kappung bei 3 km) | 0 % | gleichverteilt im Radius |

Die Ist-Mediane liegen 2–3 % über dem Soll: Innerhalb eines 200-m-Rings
verteilen sich die Startpunkte nach Fläche, also etwas nach außen. Bis Oktober
2026 wurde die Zielzahl je Ring einzeln gerundet und die Differenz von innen her
ausgeglichen — das schob Startpunkte zusätzlich nach außen (Fußwege mit Grenze
Median 541 statt 517 m).

## Grenzen

- MiD-Werte sind bundesweit (Abb. 98, 100) bzw. nur nach Raumtyp (Tab. 43) —
  keine Berlin-eigenen Schulweglängen. MiD ordnet einen Rückweg dem Zweck des
  vorherigen Weges zu; die Schulweg-Werte enthalten also Hin- und Rückwege.
- Berufliche Schulen: Split und Weglänge der Auszubildenden gelten für alle
  Wegezwecke, nicht nur für den Weg zur Berufsschule — dorthin dürften Fußwege
  seltener und Wege länger sein. Die Anwesenheit ist ein Mittelwert über alle
  beruflichen Schüler:innen; eine reine Berufsfachschule (Vollzeit) ist jeden Tag
  voll da, eine reine Berufsschule (dual) seltener. Die Schülerzahl je Schule
  enthält keine Aufteilung nach Voll- und Teilzeit.
- forsa: Hauptverkehrsmittel laut Eltern, n = 500, Befragung im Sommer
  (mehr Rad, weniger Auto als im Winter).
- Setzungen für Kindergarten, „Schule“ und weiterführende Schulen außerhalb der
  Großstädte.
- Wahl- und Privatschulen sowie Einschulbereiche (Ideen-Liste Nr. 4) und die
  Kalibrierung mit Zähldaten (Nr. 5) sind noch nicht umgesetzt.

## Quellen

- MiD 2023: infas, DLR, IVT Research, infas 360: *Mobilität in Deutschland –
  MiD 2023. Ergebnisbericht*, im Auftrag des Bundesministeriums für Verkehr,
  November 2025, Abb. 7 (S. 49), Tab. 8 (S. 47), Tab. 24 (S. 103),
  Tab. 38 (S. 154), Abb. 78 (S. 156), Tab. 43 (S. 179), Abb. 98 (S. 177),
  Abb. 100 (S. 179).
  <https://www.mobilitaet-in-deutschland.de/pdf/MiD2023_Ergebnisbericht.pdf>
- Destatis: *Berufliche Schulen und Schulen des Gesundheitswesens – Grunddaten,
  Schuljahr 2024/25*, Statistischer Bericht, Tab. 21121-02 (Schüler:innen nach
  Zeitform des Unterrichts).
  <https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bildung-Forschung-Kultur/Schulen/Publikationen/Downloads-Schulen/statistischer-bericht-berufliche-schulen-2110200257005.xlsx?__blob=publicationFile&v=2>
- Destatis: *Qualitätsbericht Statistik der beruflichen Schulen*, erschienen am
  21.10.2025, S. 13.
  <https://www.destatis.de/DE/Methoden/Qualitaet/Qualitaetsberichte/Bildung/berufliche-schulen.pdf?__blob=publicationFile>
- Bayern: *Schülerbeförderungsverordnung* (SchBefV), § 2 Abs. 2 Satz 1 Nr. 1:
  Beförderungspflicht, wenn der Schulweg für die Jahrgangsstufen 1 mit 4 länger
  als zwei Kilometer ist.
  <https://www.gesetze-bayern.de/Content/Document/BaySchBefV-2>
- NRW: *Schülerfahrkostenverordnung* (SchfkVO): Fahrkosten notwendig, wenn der
  Schulweg (kürzester Fußweg) in der Primarstufe mehr als 2 km beträgt.
  <https://www.schulministerium.nrw/fragen-und-antworten-zu-schuelerfahrkosten-und-schuelerticket>
- Bayerisches Staatsministerium für Wirtschaft, Verkehr und Technologie:
  *Leitlinie zur Nahverkehrsplanung in Bayern*, Anhang C, Tab. 1 (Grenz- und
  Richtwerte: Einzugsbereiche), wiedergegeben vom Bayerischen Landkreistag am
  10.06.2025.
  <https://www.bay-landkreistag.de/media/106196/vwi-10062025-weiterentwicklung-der-leitlinie-zur-nahverkehrs.pdf>
- KMK: *Rahmenvereinbarung über die Berufsschule*, Beschluss vom 12.03.2015
  i. d. F. vom 21.03.2024, Nr. 3.2 und 4.1.
  <https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2015/2015_03_12-RV-Berufsschule.pdf>
- forsa 2022: *Sicherer Schulweg*, Ergebnischarts, im Auftrag von Deutschem
  Kinderhilfswerk, VBE und VCD, S. 14.
  <https://www.dkhw.de/fileadmin/Redaktion/1_Unsere_Arbeit/2_Aktuelle_Projekte/6_Zu_Fuss_zur_Schule/Umfrage_Sicherer_Schulweg/forsa-Umfrage_2022_Sicherer_Schulweg_Ergebnischarts.pdf>
- Scheiner, J., Huber, O., Lohmüller, S. (2019): Children's mode choice for
  trips to primary school: a case study in German suburbia. *Travel Behaviour &
  Society* 15, 15–27 (Fußanteil nach Entfernung aus eigener MiD-Auswertung).
  <https://ste.raumplanung.tu-dortmund.de/storages/ste-raumplanung/r/Dokumente/Publikation_Scheiner/Scheiner_et_al_Childrens_mode_choice_for_trips_to_primary_school_author_Version.pdf>
- Scheiner, J. (2016): School trips in Germany: gendered escorting practices.
  *Transportation Research Part A* 94, 76–92 (Rückwege: 49,6 % der Gesamtstichprobe,
  Tab. 3; 48,6 % in der Teilstichprobe des Begleitmodells, Tab. 2).
  <https://ste.raumplanung.tu-dortmund.de/storages/ste-raumplanung/r/Dokumente/Publikation_Scheiner/Scheiner_School_trips_in_Germany__author_version_.pdf>
- Gieck, J. (2006): Probleme auf dem Schulweg – Räumliche Analyse der
  georeferenzierten Daten. Ergebnisse der Schülerbefragung an Stuttgarter
  Schulen 2005. *Statistik und Informationsmanagement*, Monatsheft 11/2006, Tab. 1.
  <https://www.domino1.stuttgart.de/web/komunis/komunissde.nsf/49ec24bbdf344054c1257ca900367f10/79f87a27cd8a3256c12584d30047c433/$FILE/6cm01_.PDF>
- BBSR, über Wegweiser Kommune: Entfernung zur nächsten Grundschule, Berlin 2021.
  <https://www.wegweiser-kommune.de/data-api/rest/export/wohnungsnahe-grundversorgung-grundschule+berlin+2014-2021+tabelle.pdf>
- Kobel, S., Wartha, O., Steinacker, J. M. (2019): Correlates of active
  transport to school in German primary school children. *Deutsche Zeitschrift
  für Sportmedizin* 70(3), 67–74 (1.690 Kinder der Klassen 1–2; gefahrene Kinder
  2,9 km, Median 2 km; aktive 0,9 km, Median 0,7 km).
  <https://www.germanjournalsportsmedicine.com/archive/archive-2019/issue-3/correlates-of-active-transport-to-school-in-german-primary-school-children/>
