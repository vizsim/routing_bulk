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
   weiterhin an den zielnächsten Haltestellen.

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
| Radius-Vorschlag | 90 %-Quantil der Fuß-, Rad- und Autowege, 1–8 km | Rechenaufwand begrenzen; der Rest startet am Rand |
| Ein Hinweg je Schüler:in und Schultag | — | Anwesenheit (Krankheit u. Ä.) vernachlässigt |

## Ableitung je Einrichtungstyp und Raumtyp

Mit Split s_m (Vorschlag), Abb.-100-Mittel A_m und Tab.-43-Mittel L:

- k = L ÷ Σ s_m·A_m
- k_aktiv = min(k, 1) für Fuß und Rad
- k_mot = (L − k_aktiv·Σ_{Fuß,Rad} s_m·A_m) ÷ Σ_{ÖPNV,Auto} s_m·A_m
- Ø_m = A_m · k_(aktiv|mot), Median_m = Ø_m ÷ e^(σ²/2), Luftlinien-Median = Median_m ÷ 1,3

Damit trifft der Mittelwert über alle Verkehrsmittel genau Tab. 43. Ändert man
den Split in der Oberfläche, bleiben die Verteilungen je Verkehrsmittel gleich
(mehr Auto → längere Wege insgesamt).

## Ergebnis (Netzlänge in km)

Erzeugt aus dem Code (`tripModel`); „Radius“ ist der Vorschlag in Luftlinie.

#### Grundschule

| Raumtyp | Split Fuß/Rad/ÖPNV/Auto (%) | Quelle Split | Ø Weg | Ø Fuß | Ø Rad | Ø ÖPNV | Ø Auto | Radius |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 71 Metropole | 54/16/16/14 | forsa 2022 | 2,0 | 0,83 | 1,52 | 3,59 | 5,25 | 3,0 km |
| 72 Regiopole/Großstadt | 54/16/16/14 | forsa 2022 | 2,0 | 0,83 | 1,52 | 3,59 | 5,25 | 3,0 km |
| 73 Mittelstadt (Stadtregion) | 55/15/16/14 | forsa 2022 | 3,0 | 1,20 | 2,20 | 5,51 | 8,06 | 4,0 km |
| 74 Kleinstädtisch/dörflich (Stadtregion) | 39/13/29/19 | forsa 2022 | 5,0 | 1,20 | 2,20 | 7,48 | 10,93 | 8,0 km |
| 75 Zentrale Stadt (ländlich) | 55/15/16/14 | forsa 2022 | 2,0 | 0,83 | 1,52 | 3,60 | 5,27 | 3,0 km |
| 76 Mittelstadt (ländliche Region) | 55/15/16/14 | forsa 2022 | 4,0 | 1,20 | 2,20 | 8,26 | 12,07 | 5,5 km |
| 77 Kleinstädtisch/dörflich (ländlich) | 39/13/29/19 | forsa 2022 | 5,0 | 1,20 | 2,20 | 7,48 | 10,93 | 8,0 km |
| ohne Raumtyp (bundesweit) | 48/14/21/17 | forsa 2022 | 2,8 | 1,03 | 1,88 | 4,46 | 6,51 | 4,0 km |

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
| 71 Metropole | 60/10/5/25 | Setzung | 2,0 | 0,77 | 1,42 | 3,35 | 4,90 | 3,5 km |
| 72 Regiopole/Großstadt | 55/10/5/30 | Setzung | 2,0 | 0,70 | 1,29 | 3,04 | 4,44 | 4,0 km |
| 73 Mittelstadt (Stadtregion) | 45/10/5/40 | Setzung | 3,0 | 0,89 | 1,63 | 3,84 | 5,62 | 5,5 km |
| 74 Kleinstädtisch/dörflich (Stadtregion) | 30/5/5/60 | Setzung | 3,0 | 0,68 | 1,25 | 2,95 | 4,31 | 5,5 km |
| 75 Zentrale Stadt (ländlich) | 45/10/5/40 | Setzung | 3,0 | 0,89 | 1,63 | 3,84 | 5,62 | 5,5 km |
| 76 Mittelstadt (ländliche Region) | 45/10/5/40 | Setzung | 3,0 | 0,89 | 1,63 | 3,84 | 5,62 | 5,5 km |
| 77 Kleinstädtisch/dörflich (ländlich) | 30/5/5/60 | Setzung | 3,0 | 0,68 | 1,25 | 2,95 | 4,31 | 5,5 km |
| ohne Raumtyp (bundesweit) | 37/15/14/34 | MiD 2023, Abb. 98 | 2,8 | 0,82 | 1,51 | 3,56 | 5,21 | 5,0 km |

„Schule“ (Art unbekannt) verwendet die Längen der Grundschule mit den
bisherigen Setzungen für den Split (siehe Code).

## Plausibilitätsprüfung

**Fußanteil nach Entfernung** (Anteil der Wege im Entfernungsband, die zu Fuß
gehen; folgt aus Split und Längenverteilungen):

| Netzlänge | Modell Metropole | Modell bundesweit | Scheiner et al. 2019 (MiD, bundesweit) |
| --- | ---: | ---: | ---: |
| unter 0,6 km | 91 % | 92 % | 85 % |
| 0,6–1,2 km | 72 % | 78 % | rund 60 % |
| 1,2–2,0 km | 42 % | 51 % | 34 % (Scheiner: „ab 1,2 km“, ohne Obergrenze) |

Verlauf passt, das Modell fällt aber langsamer ab: Bei mittleren Entfernungen
(0,6–2 km) legt es Wege eher zu Fuß als die MiD-Auswertung. Vermutliche
Ursache: Abb. 100 gilt für alle Zwecke, Elterntaxi-Fahrten zur Grundschule sind
kürzer (Kobel et al. 2019, Klassen 1–2: gefahrene Kinder Ø 2,9 km). Der
Radanteil ist im Modell zwischen 1,2 und 2 km am höchsten, wie bei Scheiner.

**Weglängen** gegen Stuttgart 2005 (Gieck 2006, Netzdistanz): Grundschule
Median 0,9 km, knapp 90 % unter 2 km — Modell Metropole 1,06 km und 73 %.
Realschule/Gymnasium Median 2,0–2,2 km, 20–26 % ab 4 km — Modell weiterführend
Metropole 2,6 km und 34 %. Das Modell folgt der neueren MiD 2023 (Ø 2 bzw. 4 km);
die Werte liegen höher als in Stuttgart vor 20 Jahren. Tab. 43 ist auf ganze km
gerundet — 2 km kann auch 1,5 km bedeuten.

**Nächste Grundschule:** in Berlin im Mittel 477 m Luftlinie (BBSR 2021,
einwohnergewichtet). Modell Metropole: Fußwege Ø 637 m, Median 532 m Luftlinie —
etwas länger, weil nicht alle Kinder die nächste Schule besuchen.

**Effektive Ziehung** (echter Code `DemandService._drawFromCells`, synthetisches
Raster, 200 × 100 Startpunkte; Luftlinie):

| Grundschule Metropole | Soll-Median | Ist-Median | unter 250 m | vorher (R/4, σ = 2) |
| --- | ---: | ---: | ---: | --- |
| Fuß | 532 m | 530 m | 11 % | Median ~320 m, 42 % unter 250 m |
| Rad | 976 m | 990 m | 1 % | Median ~300 m |
| Auto | 2.693 m | 2.670 m (Kappung bei 3 km) | 0 % | gleichverteilt im Radius |

## Grenzen

- MiD-Werte sind bundesweit (Abb. 98, 100) bzw. nur nach Raumtyp (Tab. 43) —
  keine Berlin-eigenen Schulweglängen. MiD ordnet einen Rückweg dem Zweck des
  vorherigen Weges zu; die Schulweg-Werte enthalten also Hin- und Rückwege.
- Berufliche Schulen (Oberstufenzentren, Berufs-, Fachschulen, Berufskollegs)
  werden nicht gerechnet: Schüler:innen meist volljährig, Unterricht in der dualen
  Ausbildung oft nur an einzelnen Tagen. Sie bleiben in der Liste („nicht
  gerechnet“, 0 Wege), erkannt an der amtlichen Schulart oder am Namen; wer sie
  doch berücksichtigen will, trägt eine Zahl ein (gerechnet als weiterführend).
- forsa: Hauptverkehrsmittel laut Eltern, n = 500, Befragung im Sommer
  (mehr Rad, weniger Auto als im Winter).
- Setzungen für Kindergarten, „Schule“ und weiterführende Schulen außerhalb der
  Großstädte.
- Wahl- und Privatschulen sowie Einschulbereiche (Ideen-Liste Nr. 4) und die
  Kalibrierung mit Zähldaten (Nr. 5) sind noch nicht umgesetzt.

## Quellen

- MiD 2023: infas, DLR, IVT Research, infas 360: *Mobilität in Deutschland –
  MiD 2023. Ergebnisbericht*, im Auftrag des Bundesministeriums für Verkehr,
  November 2025, Tab. 43 (S. 179), Abb. 98 (S. 177), Abb. 100 (S. 179).
  <https://www.mobilitaet-in-deutschland.de/pdf/MiD2023_Ergebnisbericht.pdf>
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
