# Schülerzahlen je Schule für die Gebietsanalyse

Die Gebietsanalyse rechnet je Schule mit **Wegen = Schüler:innen = Hinwegen je
Schultag**. Dieses Skript bereitet amtliche Schülerzahlen so auf, dass die
Analyse sie den OSM-Schulen aus `schools.pmtiles` zuordnen kann.

```bash
# aus der Repo-Wurzel, nur Standardbibliothek (Python ≥ 3.10)
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py            # BE, BB, HH
python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --laender BE,BB,HH,MV
python3 -m unittest discover -s preprocessing/schuelerzahlen            # Tests ohne Netz
```

Ausgabe: `public/data/schuelerzahlen/index.json` und je Land `<LAND>.json`.
Vite kopiert `public/` in den Build, die App lädt die Dateien unter
`CONFIG.SCHOOL_STATS_BASE_URL` (Standard `data/schuelerzahlen/`). Alternativ die
Dateien woanders ablegen (z. B. tiles.vizsim.de) und die URL in
`src/core/config.js` anpassen. Fehlen die Dateien, bleiben Platzhalter stehen.

## Quellen

| Land | Schülerzahl | Stand | Lizenz |
| --- | --- | --- | --- |
| BE | [Bildungsstatistik Berlin, SVZ_Fakt5](https://www.bildungsstatistik.berlin.de/statistik/ListGen/SVZ_Fakt5.aspx) — Schüler:innen je Schulnummer (BSN) | Schuljahr 2024/25 | laut daten.berlin.de CC BY (prüfen) |
| BB | WFS `Schul_Standorte` des MBJS, Feld `schueler` (über JedeSchule) | meist 2022 | dl-de/by-2-0 |
| HH | Schulstammdaten Hamburg, `anzahl_schueler` je Standort (über JedeSchule) | 2024 | dl-de/by-2-0 |
| MV | WFS Schulverzeichnis, `anzahl_schueler` (über JedeSchule) — nur mit `--laender` | unklar | unklar |
| BY | Schulsuche des Kultusministeriums (über JedeSchule) — nur mit `--laender` | 2024/25–2025/26 | keine Angabe |

**Zuordnung zu OSM:** [OSM Schulabgleich](https://schulabgleich.osm-verkehrswende.org/)
(osmberlin, [Code](https://github.com/osmberlin/osm-schulabgleich)) gleicht die
amtlichen Schulen (JedeSchule) nächtlich mit OSM ab. Das Skript übernimmt daraus
Kennung, Name, Lage, Schulart und das zugeordnete OSM-Objekt (`way/123`). In der
App wird zuerst über diese OSM-ID zugeordnet, sonst räumlich (amtlicher Punkt
im Umkreis von 150 m, bei mehreren nur mit gleichem Namen). Jede amtliche Schule
zählt höchstens einmal.

**Lizenzen:** Die kombinierte CSV des Schulabgleichs hat laut Projekt keine
saubere Lizenz und ist zum Prüfen gedacht. Hier wird daraus nur die Zuordnung
(OSM-ID ↔ Schulkennung) verwendet; die Schülerzahlen kommen direkt aus den
Landesquellen. Der Code des Schulabgleichs hat keine Lizenzdatei — vor einer
Veröffentlichung der erzeugten Dateien kurz bei osmberlin nachfragen. Keine
Rechtsberatung.

## Bekannte Grenzen

- Berlin: nur Hauptstandorte. Filialen bleiben Platzhalter (oder werden von Hand
  angepasst); die Schülerzahl einer Schule mit mehreren Standorten landet am
  Hauptstandort.
- Schuljahre unterscheiden sich je Land und Quelle; das Schuljahr steht je
  Schule in der Datei und in der App am Eintrag.
- Kitas: keine Daten, Platzhalter.
- Weitere Länder mit Schülerzahl je Schule (NRW-CSV des Schulministeriums,
  Sachsen-Anhalt, Sachsen, Bremen, Thüringen) sind noch nicht angebunden.

## Dateiformat

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
