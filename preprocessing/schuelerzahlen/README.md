# Schülerzahlen je Schule für die Gebietsanalyse

Die Gebietsanalyse rechnet je Schule mit **Wegen = Schüler:innen = Hinwegen je
Schultag**. Dieses Skript bereitet amtliche Schülerzahlen so auf, dass die
Analyse sie den OSM-Schulen aus `schools.pmtiles` zuordnen kann.

```bash
# aus der Repo-Wurzel, nur Standardbibliothek (Python ≥ 3.10)
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --be-svz berlin_schuelerzahlen_2024-25.csv   # BE, BB, HH, BY
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --laender NW --nw-anzahlen ~/Downloads/anzahlen.csv   # Datei von Hand
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --laender MV,ST   # Lizenz eingeschränkt, siehe unten
python3 -m unittest discover -s preprocessing/schuelerzahlen            # Tests ohne Netz
```

Ausgabe: `public/data/schuelerzahlen/index.json` und je Land `<LAND>.json`.
Vite kopiert `public/` in den Build, die App lädt die Dateien unter
`CONFIG.SCHOOL_STATS_BASE_URL` (Standard `data/schuelerzahlen/`). Alternativ die
Dateien woanders ablegen (z. B. tiles.vizsim.de) und die URL in
`src/core/config.js` anpassen. Fehlen die Dateien, bleiben Platzhalter stehen.

Die erzeugten Dateien stehen in `.gitignore`, bis die Lizenzfragen unten geklärt
sind: lokal (`npm run dev`, `npm run build`) werden sie genutzt, auf GitHub Pages
noch nicht.

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

| Land | Schülerzahl | Stand | Lizenz | Standard |
| --- | --- | --- | --- | --- |
| BE | [Bildungsstatistik Berlin, SVZ_Fakt5](https://www.bildungsstatistik.berlin.de/statistik/ListGen/SVZ_Fakt5.aspx) — Schüler:innen je Schulnummer (BSN). Seit Oktober 2026 nicht erreichbar (404); gesicherter Abruf vom 24./25.10.2026 als CSV über `--be-svz` (Bezirke 01–08) | Schuljahr 2024/25 | CC BY, Senatsverwaltung für Bildung, Jugend und Familie (laut [daten.berlin.de](https://daten.berlin.de/datensaetze/schulen-in-berlin-1096779); vor einer Veröffentlichung prüfen) | ja |
| BB | WFS `Schul_Standorte` des MBJS, Feld `schueler` (über JedeSchule) | meist 2022 | dl-de/by-2-0 | ja |
| HH | Schulstammdaten Hamburg, `anzahl_schueler` je Standort (über JedeSchule) | 2024 | dl-de/by-2-0 | ja |
| NW | [Open Data des Schulministeriums](https://www.schulministerium.nrw/open-data): „Gesamtanzahl der Schülerinnen und Schüler je Schule“ (`anzahlen.csv`), Lage über die Schulnummer aus dem Abgleich bzw. den Schulgrunddaten (JedeSchule). Der Download-Server (`www.schulministerium.nrw.de/BiPo/…`) war am 25.10.2026 nicht erreichbar — Datei im Browser laden und mit `--nw-anzahlen` übergeben; ungetestet mit der echten Datei | Stichtag 15.10. des Vorjahres, derzeit 2025/26 | dl-de/by-2-0 | nein |
| BY | [Schulsuche des Kultusministeriums](https://www.km.bayern.de/schule-und-mehr/schulsuche), Schüler:innen und Schuljahr je Schule (über JedeSchule) | 2025/26, vereinzelt 2024/25 | keine Angabe | ja |
| MV | WFS Schulverzeichnis des Statistischen Amts, `anzahl_schueler` (über JedeSchule) | ohne Angabe | eingeschränkt: „nur auszugsweise Vervielfältigung mit Quellenangabe“ | nein |
| ST | Kartendienst des Statistischen Landesamts, „Anzahl der Schüler/-innen“; nur allgemeinbildende Schulen, ohne Schulnummer ([Web-Anwendung](https://stala-sa.maps.arcgis.com/apps/instant/nearby/index.html?appid=2472e79115b04fd38f9c6e7d362d6efa)) | 2025/26 | unklar: Web-Anwendung dl-de/by-2-0, Dienst nur „© Statistisches Landesamt“, Vorjahresdienst „Vervielfältigung und Verbreitung grundsätzlich untersagt“ | nein |

**Regel für den Standard:** Länder, deren Quelle Vervielfältigung oder
Verbreitung ausdrücklich einschränkt (MV, ST), laufen nur mit `--laender`;
ebenso NW, solange der Download-Server nicht erreichbar ist.
Vor einer Veröffentlichung ihrer Dateien (etwa auf vizsim.de) die Freigabe
beim jeweiligen Statistischen Amt klären. Bayern nennt keine Lizenz. Keine
Rechtsberatung.

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

**Lizenzen:** Die kombinierte CSV des Schulabgleichs hat laut Projekt keine
saubere Lizenz und ist zum Prüfen gedacht. Hier wird daraus nur die Zuordnung
(OSM-ID ↔ Schulkennung) verwendet; die Schülerzahlen kommen direkt aus den
Landesquellen. Der Code des Schulabgleichs hat keine Lizenzdatei — vor einer
Veröffentlichung der erzeugten Dateien kurz bei osmberlin nachfragen.

## Bekannte Grenzen

- Berlin: SVZ_Fakt5 ist derzeit nicht erreichbar (Stand Oktober 2026); bis
  dahin eine gesicherte Liste per `--be-svz` übergeben. Der gesicherte Abruf
  deckt nur die Bezirke 01–08 ab (Neukölln bis 08G12); Treptow-Köpenick,
  Marzahn-Hellersdorf, Lichtenberg und Reinickendorf fehlen — dort bleiben
  Platzhalter. Nur Hauptstandorte: Filialen bleiben Platzhalter, die
  Schülerzahl einer Schule mit mehreren Standorten landet am Hauptstandort.
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

`index.json` führt je Land Datei, Anzahl Schulen, davon mit OSM-Zuordnung,
Quelle und Erstellungsdatum sowie alle Quellen. Je Land:

```json
{
  "format": 1, "land": "BE", "generated": "2026-10-25",
  "sources": { "be-svz": { "label": "…", "title": "…", "url": "…", "license": "…", "note": "…" } },
  "schools": [
    { "id": "BE-01G01", "name": "Grundschule am Arkonaplatz", "type": "Grundschule",
      "lat": 52.5…, "lon": 13.4…, "pupils": 426, "year": "2024/25", "src": "be-svz",
      "osm": ["way/…"] }
  ]
}
```
