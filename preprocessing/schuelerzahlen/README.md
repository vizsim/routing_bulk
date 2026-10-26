# Schülerzahlen je Schule für die Gebietsanalyse

Die Gebietsanalyse rechnet je Schule mit **Wegen = Schüler:innen = Hinwegen je
Schultag**. Dieses Skript bereitet amtliche Schülerzahlen so auf, dass die
Analyse sie den OSM-Schulen aus `schools.pmtiles` zuordnen kann.

```bash
# aus der Repo-Wurzel, nur Standardbibliothek (Python ≥ 3.10)
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py            # BE, BB, HH, BY
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --laender NW --nw-anzahlen ~/Downloads/anzahlen.csv   # Datei von Hand
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --laender MV,ST   # Lizenz eingeschränkt, siehe unten
python3 -m unittest discover -s preprocessing/schuelerzahlen            # Tests ohne Netz
```

Ausgabe in `public/data/schuelerzahlen/`, getrennt danach, ob die Quelle eine
Veröffentlichung erlaubt (`PUBLIC_LAENDER` im Skript):

- **Veröffentlicht** (BE, BB, HH, NW): `<LAND>.json`, aufgeführt in
  `index.json`. Diese Dateien gehören ins Repo; Vite kopiert `public/` in den
  Build, so stehen sie auf GitHub Pages.
- **Nur lokal** (BY, MV, ST): `<LAND>.local.json`, aufgeführt in
  `index.local.json`, der alle Länder führt. Beides steht in `.gitignore`. Die
  App liest `index.local.json` nur beim Entwickeln (`npm run dev`), sonst
  `index.json`; `npm run build` lässt die `.local.json`-Dateien weg
  (`vite.config.js`).

Ändert sich bei einem neuen Lauf an einer Datei nur das Datum, bleibt sie
stehen — kein Diff im Repo. Die App lädt die Dateien unter
`CONFIG.SCHOOL_STATS_BASE_URL` (Standard `data/schuelerzahlen/`); fehlen sie,
bleiben Platzhalter stehen.

## Abruf, robots.txt und Fehler

- Das Skript beachtet **robots.txt**. Schließt eine Quelle automatische Abrufe
  aus, bricht das Land mit einem Hinweis ab. Dann die Datei im Browser
  speichern und als Pfad übergeben: `--be-svz` (gespeicherte Seite SVZ_Fakt5
  oder eine CSV mit den Spalten `BSN` und `Schueler_gesamt`) bzw.
  `--nw-anzahlen` (`anzahlen.csv` von
  [schulministerium.nrw/open-data](https://www.schulministerium.nrw/open-data)).
- Jedes Land läuft für sich. Scheitert eines, bleibt seine vorhandene Datei
  stehen, die übrigen werden aktualisiert; der Exit-Code ist dann 1.
- Länder, die bei einem Lauf nicht angefordert sind, bleiben im Index. Eine
  Landesdatei entfernt man, indem man sie löscht und das Skript neu laufen lässt.

## Quellen

| Land | Schülerzahl | Stand | Lizenz | Standard | Online |
| --- | --- | --- | --- | --- | --- |
| BE | [Bildungsstatistik Berlin, SVZ_Fakt5](https://www.bildungsstatistik.berlin.de/statistik/ListGen/SVZ_Fakt5.aspx) — Schüler:innen je Schulnummer (BSN). Seit Oktober 2026 nicht erreichbar; das Skript nimmt dann den [Stand vom 14.07.2026 im Webarchiv](https://web.archive.org/web/20260714154715/https://www.bildungsstatistik.berlin.de/statistik/ListGen/SVZ_Fakt5.aspx) (alle 12 Bezirke, 909 Schulen) | Schuljahr 2024/25 | CC BY, Senatsverwaltung für Bildung, Jugend und Familie (laut [Datensatz auf daten.berlin.de](https://daten.berlin.de/datensaetze/c3f96c4b-e891-41a7-aa13-39db8bc97008), der weiter auf SVZ_Fakt5 verweist) | ja | ja |
| BB | WFS `Schul_Standorte` des MBJS, Feld `schueler` (über JedeSchule) | meist 2022 | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0), Bereitsteller laut WFS: „© Ministerium für Bildung, Jugend und Sport“ | ja | ja |
| HH | Schulstammdaten Hamburg, `anzahl_schueler` je Standort (über JedeSchule) | 2024 | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0), Quellenvermerk laut [Metadaten](https://metaver.de/trefferanzeige?docuuid=D3DDBBA3-7329-475C-BB07-14D539ED6B1E): „Freie und Hansestadt Hamburg, Behörde für Schule und Berufsausbildung“ | ja | ja |
| NW | [Open Data des Schulministeriums](https://www.schulministerium.nrw/open-data): „Gesamtanzahl der Schülerinnen und Schüler je Schule“ (`anzahlen.csv`), Lage über die Schulnummer aus dem Abgleich bzw. den Schulgrunddaten (JedeSchule). Der Download-Server (`www.schulministerium.nrw.de/BiPo/…`) war am 25.10.2026 nicht erreichbar — Datei im Browser laden und mit `--nw-anzahlen` übergeben; ungetestet mit der echten Datei | Stichtag 15.10. des Vorjahres, derzeit 2025/26 | dl-de/by-2-0 | nein | ja, wenn erzeugt |
| BY | [Schulsuche des Kultusministeriums](https://www.km.bayern.de/schule-und-mehr/schulsuche), Schüler:innen und Schuljahr je Schule (über JedeSchule) | 2025/26, vereinzelt 2024/25 | nur eigener Gebrauch; Veröffentlichung nur mit Einwilligung des Ministeriums ([Nutzungsbedingungen](https://www.km.bayern.de/impressum)) | ja | nein |
| MV | WFS Schulverzeichnis des Statistischen Amts, `anzahl_schueler` (über JedeSchule) | ohne Angabe | eingeschränkt: „nur auszugsweise Vervielfältigung mit Quellenangabe“ | nein | nein |
| ST | Kartendienst des Statistischen Landesamts, „Anzahl der Schüler/-innen“; nur allgemeinbildende Schulen, ohne Schulnummer ([Web-Anwendung](https://stala-sa.maps.arcgis.com/apps/instant/nearby/index.html?appid=2472e79115b04fd38f9c6e7d362d6efa)) | 2025/26 | unklar: Web-Anwendung dl-de/by-2-0, Dienst nur „© Statistisches Landesamt“, Vorjahresdienst „Vervielfältigung und Verbreitung grundsätzlich untersagt“ | nein | nein |

**Regeln:** Länder, deren Quelle Vervielfältigung oder Verbreitung
ausdrücklich einschränkt (MV, ST), laufen nur mit `--laender`; ebenso NW,
solange der Download-Server nicht erreichbar ist. Veröffentlicht werden nur
Länder mit offener Lizenz (CC BY, dl-de/by-2-0). Bayern läuft standardmäßig
mit, bleibt aber lokal: Die Schulsuche erlaubt laut den Nutzungsbedingungen von
km.bayern.de nur den eigenen Gebrauch (§ 53 UrhG), eine Veröffentlichung nur
mit Einwilligung. Die bayerischen Schulstandorte (WFS, CC BY 4.0) enthalten
keine Schülerzahlen. Keine Rechtsberatung.

**Quellenangabe in der App:** Sobald amtliche Zahlen genutzt werden, nennt die
Gebietsanalyse unter „Annahmen & Quellen“ Quelle, Bereitsteller und Lizenz (mit
Link) sowie den Schulabgleich, und sie vermerkt die Aufbereitung (dl-de/by
verlangt einen Hinweis auf Veränderungen). Der GeoJSON-Export enthält die
Quellen samt Lizenz.

**NRW:** Den Spaltenaufbau von `anzahlen.csv` beschreibt das Ministerium
nicht. Das Skript erkennt die Spalte mit der Schulnummer und die Zahlspalte
(bevorzugt „gesamt“, sonst „Anzahl“/„Schüler“) und gibt aus, welche es
genommen hat — beim ersten Lauf bitte prüfen. Nennt die Datei kein
Schuljahr, gilt der Veröffentlichungsrhythmus (ab 1.3. Stichtag 15.10. des
Vorjahres, bezogen auf das Abrufdatum bzw. das Dateidatum); abweichend mit
`--nw-schuljahr 2025/26`.

**Sachsen-Anhalt:** Der Dienst heißt je Schuljahr anders
(`…_2025_26_Sicht`); eine neuere Fassung mit `--st-dienst URL` angeben, das
Schuljahr liest das Skript aus dem Namen.

## Zuordnung zu OSM

[OSM Schulabgleich](https://schulabgleich.osm-verkehrswende.org/)
(osmberlin, [Code](https://github.com/osmberlin/osm-schulabgleich)) gleicht die
amtlichen Schulen (JedeSchule) nächtlich mit OSM ab. Das Skript übernimmt daraus
Kennung, Name, Lage, Schulart und das zugeordnete OSM-Objekt (`way/123`).

Kennt der Abgleich eine Kennung nicht, ordnet das Skript über den gleichen
Namen im Umkreis von 100 m zu und behält die eigene Kennung. Das betrifft
Sachsen-Anhalt (Dienst ohne Schulnummer) und Bayern im Übergang: JedeSchule
führt bayerische Schulen derzeit unter älteren Kennungen aus dem WFS und unter
neuen aus der Schulsuche; nur die neuen haben eine Schülerzahl.

In der App wird zuerst über die OSM-ID zugeordnet, sonst räumlich (amtlicher
Punkt im Umkreis von 150 m, bei mehreren nur mit gleichem Namen). Jede amtliche
Schule zählt höchstens einmal.

**Lizenzen:** Die kombinierte CSV des Schulabgleichs ist laut Projekt „zum
Prüfen und Verstehen gedacht“: OSM (ODbL) gemischt mit amtlichen Quellen ergibt
keine klare Weiterverwendungslizenz (CHANGELOG des Projekts). Hier wird daraus
nur die Zuordnung (OSM-ID ↔ Schulkennung) mit amtlicher Lage und Schulart
übernommen; die Schülerzahlen kommen direkt aus den Landesquellen. Die Dateien
nennen dafür OSM (© OpenStreetMap-Mitwirkende, ODbL) und für die amtlichen
Angaben die Lizenz des Landes.

## Bekannte Grenzen

- Berlin: SVZ_Fakt5 ist seit Oktober 2026 nicht erreichbar; das Skript liest
  dann den Stand vom 14.07.2026 aus dem Webarchiv (Schuljahr 2024/25, alle 12
  Bezirke). Er stimmt für die 572 Schulen des gesicherten Abrufs vom
  24./25.10.2026 (Bezirke 01–08) genau mit diesem überein. Nur Hauptstandorte:
  Filialen bleiben Platzhalter, die Schülerzahl einer Schule mit mehreren
  Standorten landet am Hauptstandort.
- Berufliche Schulen (OSZ, Berufskollegs, Berufs-, Fachschulen) rechnet die App
  als eigenen Typ: Wege je Schultag = Schüler:innen × Anwesenheitsanteil
  (Teilzeit-Berufsschule nur an einzelnen Tagen), Split und Weglänge der
  Auszubildenden (siehe docs/SCHULWEG_PARAMETER.md, „Berufliche Schulen“). Die
  Dateien enthalten nur die Gesamtzahl je Schule, keine Aufteilung nach Voll-
  und Teilzeit. Abendschulen und Kollegs (Zweiter Bildungsweg) behalten die
  Einordnung aus OSM.
- Schuljahre unterscheiden sich je Land und Quelle; das Schuljahr steht je
  Schule in der Datei und in der App am Eintrag.
- Kitas: keine Daten, Platzhalter.
- Weitere Länder mit Schülerzahl je Schule sind noch nicht angebunden:
  Sachsen (Webseite je Schule), Bremen (PDF), Thüringen (Tabelle des
  Ministeriums, Format ungeprüft). Hessen: ob das Schulverzeichnis des
  Statistischen Landesamts Schülerzahlen enthält, ist offen.

## Dateiformat

`index.json` führt je veröffentlichtem Land Datei, Anzahl Schulen, davon mit
OSM-Zuordnung, Quelle und Erstellungsdatum sowie deren Quellen;
`index.local.json` ebenso für alle Länder. Je Land:

```json
{
  "format": 1, "land": "BE", "generated": "2026-10-25",
  "sources": { "be-svz": { "label": "…", "title": "…", "url": "…", "license": "…", "licenseUrl": "…", "note": "…" } },
  "schools": [
    { "id": "BE-01G01", "name": "Grundschule am Arkonaplatz", "type": "Grundschule",
      "lat": 52.5…, "lon": 13.4…, "pupils": 426, "year": "2024/25", "src": "be-svz",
      "osm": ["way/…"] }
  ]
}
```
