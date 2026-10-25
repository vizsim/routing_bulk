"""Schülerzahlen je Schule für die Gebietsanalyse aufbereiten.

Erzeugt public/data/schuelerzahlen/index.json und je Land <LAND>.json. Die
Gebietsanalyse lädt die Datei der Länder im gezeichneten Bereich und belegt
die Wege je Schule (= Hinwege je Schultag) mit der Schülerzahl vor.

Quellen:
- OSM Schulabgleich (osmberlin): amtliche Schulen (Kennung, Name, Lage,
  Schulart) und das OSM-Objekt, das ihnen zugeordnet ist.
- Berlin: Bildungsstatistik der Senatsverwaltung, Tabelle SVZ_Fakt5
  (Schüler je Schule, Berliner Schulnummer BSN). Die Seite ist seit
  Oktober 2026 nicht mehr erreichbar — dann einen gespeicherten Abruf als
  CSV angeben (--be-csv, Spalten Schuljahr;BSN;…;Schueler_gesamt;…).
- Brandenburg, Hamburg (Standard) sowie Mecklenburg-Vorpommern, Bayern
  (nur auf Wunsch, Lizenz unklar): Schülerzahl aus den Rohdaten der
  Landesquellen, abgerufen über die JedeSchule-API.

Nur Standardbibliothek. Aufruf aus der Repo-Wurzel:

    python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --be-csv berlin_schuelerzahlen_2024-25.csv
    python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --laender BE --be-svz svz.html --matches-csv matches.csv
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

MATCHES_CSV_URL = "https://schulabgleich.osm-verkehrswende.org/datasets/schools_matches.csv"
BE_SVZ_URL = "https://www.bildungsstatistik.berlin.de/statistik/ListGen/SVZ_Fakt5.aspx"
JEDESCHULE_API = "https://jedeschule.codefor.de"
DEFAULT_LAENDER = ["BE", "BB", "HH"]
# Lizenz der Landesquelle unklar: nur mit --laender ausdrücklich anfordern
OPT_IN_LAENDER = ["MV", "BY"]
USER_AGENT = "routing_bulk-schuelerzahlen/1.0 (+https://github.com/vizsim/routing_bulk)"

SOURCES = {
    "osm-schulabgleich": {
        "label": "OSM Schulabgleich",
        "title": "Abgleich amtlicher Schulstammdaten (JedeSchule) mit OpenStreetMap",
        "url": "https://schulabgleich.osm-verkehrswende.org/",
        "license": "OSM-Daten © OpenStreetMap-Mitwirkende (ODbL); amtliche Daten je Land",
        "note": "Zuordnung amtliche Schule ↔ OSM-Objekt sowie amtliche Lage und Schulart.",
    },
    "be-svz": {
        "label": "Bildungsstatistik Berlin",
        "title": "Schüler- und Lehrkräftezahlen je Schule (SVZ_Fakt5)",
        "url": BE_SVZ_URL,
        "license": "laut daten.berlin.de CC BY, Senatsverwaltung für Bildung, Jugend und Familie (bitte prüfen)",
        "note": "Schüler:innen insgesamt je Berliner Schulnummer (BSN); nur Hauptstandorte.",
    },
    "jedeschule-bb": {
        "label": "Schulverzeichnis Brandenburg",
        "title": "WFS Schul_Standorte des MBJS, Feld schueler (über die JedeSchule-API)",
        "url": "https://schullandschaft.brandenburg.de/edugis/wfs/schulen",
        "license": "dl-de/by-2-0",
        "note": "Stand je Schule angegeben (meist 2022).",
    },
    "jedeschule-hh": {
        "label": "Schulstammdaten Hamburg",
        "title": "Schulstammdaten und Schülerzahlen der Hamburger Schulen (über die JedeSchule-API)",
        "url": "https://api.hamburg.de/datasets/v1/schulen",
        "license": "dl-de/by-2-0",
        "note": "Schüler:innen je Standort.",
    },
    "jedeschule-mv": {
        "label": "Schulverzeichnis Mecklenburg-Vorpommern",
        "title": "WFS Schulstandorte, Feld anzahl_schueler (über die JedeSchule-API)",
        "url": "https://www.geodaten-mv.de/dienste/schulstandorte_wfs",
        "license": "unklar (Metadaten: nur auszugsweise Vervielfältigung mit Quellenangabe)",
        "note": "Bezugsschuljahr nicht angegeben.",
    },
    "jedeschule-by": {
        "label": "Schulsuche Bayern",
        "title": "Eckdaten je Schule des Kultusministeriums (über die JedeSchule-API)",
        "url": "https://www.km.bayern.de/",
        "license": "keine Angabe",
        "note": "Schüler:innen gesamt im angegebenen Schuljahr.",
    },
}


# ---------------------------------------------------------------- Laden


def read_text(path_or_url: str) -> str:
    """Datei oder URL als Text (UTF-8, sonst Latin-1)."""
    if re.match(r"^https?://", path_or_url):
        req = urllib.request.Request(path_or_url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
    else:
        raw = Path(path_or_url).read_bytes()
        charset = "utf-8"
    try:
        text = raw.decode(charset)
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    # Die Abgleichs-CSV beginnt mit einem BOM — sonst hieße die erste Spalte
    # "﻿bundesland", und keine Zeile fände ihr Land
    return text.lstrip("﻿")


def first_int(value) -> int | None:
    """Erste ganze Zahl aus Wert oder Text ('288 (Stand: 2022)' → 288, '1.603' → 1603)."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value >= 0 else None
    m = re.search(r"\d[\d.]*", str(value))
    return int(m.group(0).replace(".", "")) if m else None


# ---------------------------------------------------------------- OSM Schulabgleich


def parse_matches_csv(text: str) -> dict[str, dict[str, dict]]:
    """Amtliche Schulen je Land aus der Abgleichs-CSV: {land: {official_id: info}}."""
    out: dict[str, dict[str, dict]] = {}
    for row in csv.DictReader(io.StringIO(text)):
        official_id = (row.get("official_id") or "").strip()
        land = (row.get("bundesland") or "").strip()
        if not official_id or not land:
            continue
        school = out.setdefault(land, {}).setdefault(official_id, {
            "id": official_id,
            "name": (row.get("official_name") or "").strip(),
            "type": (row.get("official_school_type") or "").strip() or None,
            "lat": _float(row.get("official_lat")),
            "lon": _float(row.get("official_lon")),
            "osm": [],
        })
        osm_type = (row.get("osm_type") or "").strip()
        osm_id = (row.get("osm_id") or "").strip()
        if row.get("category") == "matched" and osm_type and osm_id:
            ref = f"{osm_type}/{osm_id}"
            if ref not in school["osm"]:
                school["osm"].append(ref)
    return out


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- Berlin


class _TableRows(HTMLParser):
    """Sammelt alle Tabellenzeilen als Listen von Zelltexten."""

    def __init__(self):
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._row is not None and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def parse_be_svz(html: str) -> dict[str, dict]:
    """Berliner Tabelle SVZ_Fakt5 → {BSN: {pupils, year}}."""
    parser = _TableRows()
    parser.feed(html)
    header_index = next((i for i, r in enumerate(parser.rows)
                         if any(c.strip().upper() == "BSN" for c in r)), None)
    if header_index is None:
        raise ValueError("SVZ_Fakt5: keine Kopfzeile mit 'BSN' gefunden")
    header = [c.lower() for c in parser.rows[header_index]]
    col_bsn = next(i for i, c in enumerate(header) if c.strip() == "bsn")
    col_pupils = next(i for i, c in enumerate(header) if c.startswith("schüler") and "m/w/d" in c)
    col_year = next((i for i, c in enumerate(header) if "schuljahr" in c), None)
    out = {}
    for row in parser.rows[header_index + 1:]:
        if len(row) <= max(col_bsn, col_pupils):
            continue
        bsn = row[col_bsn].strip()
        pupils = first_int(row[col_pupils])
        if not re.match(r"^\d{2}[A-Z]\d{2}$", bsn) or pupils is None:
            continue
        out[bsn] = {"pupils": pupils, "year": row[col_year].strip() if col_year is not None else None}
    return out


def parse_be_csv(text: str) -> dict[str, dict]:
    """Gespeicherter Abruf von SVZ_Fakt5 als CSV (Spalten Schuljahr;BSN;…;Schueler_gesamt;…)
    → {BSN: {pupils, year}} wie parse_be_svz."""
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    if not reader.fieldnames or "BSN" not in reader.fieldnames or "Schueler_gesamt" not in reader.fieldnames:
        raise ValueError("Berliner CSV: Spalten 'BSN' und 'Schueler_gesamt' erwartet")
    out = {}
    for row in reader:
        bsn = (row.get("BSN") or "").strip()
        pupils = first_int(row.get("Schueler_gesamt"))
        if not re.match(r"^\d{2}[A-Z]\d{2}$", bsn) or pupils is None:
            continue
        out[bsn] = {"pupils": pupils, "year": (row.get("Schuljahr") or "").strip() or None}
    return out


# ---------------------------------------------------------------- JedeSchule (raw)


def fetch_jedeschule(land: str, api: str = JEDESCHULE_API, page: int = 10000) -> list[dict]:
    """Alle Schulen eines Landes mit raw-Feldern.

    Die API wertet skip nicht verlässlich aus (Oktober 2026: die zweite Seite
    wiederholte die erste, in Brandenburg fehlte so die Hälfte der Schulen).
    Darum große Seiten (ein Land passt in eine), doppelte Kennungen verwerfen
    und abbrechen, sobald eine Seite nichts Neues bringt.
    """
    schools, seen, skip = [], set(), 0
    while True:
        url = f"{api}/schools/?state={land}&include_raw=true&limit={page}&skip={skip}"
        batch = json.loads(read_text(url))
        new = [s for s in batch if s.get("id") not in seen]
        seen.update(s.get("id") for s in new)
        schools.extend(new)
        if len(batch) < page or not new:
            return schools
        skip += page


def pupils_from_raw(land: str, raw: dict) -> tuple[int | None, str | None]:
    """Schülerzahl und Bezugsjahr aus den raw-Feldern der Landesquelle."""
    raw = raw or {}
    if land == "BB":
        text = raw.get("schueler")
        year = re.search(r"Stand:\s*(\d{4})", str(text or ""))
        return first_int(text), year.group(1) if year else None
    if land == "HH":
        year = raw.get("schueleranzahl_schuljahr")
        return first_int(raw.get("anzahl_schueler")), str(year) if year else None
    if land == "MV":
        return first_int(raw.get("anzahl_schueler")), None
    if land == "BY":
        return first_int(raw.get("schueler")), raw.get("schuljahr")
    return None, None


def pupils_from_jedeschule(land: str, records: list[dict]) -> dict[str, dict]:
    """{official_id: {pupils, year, name, type, lat, lon}} aus API-Datensätzen."""
    out = {}
    for rec in records:
        pupils, year = pupils_from_raw(land, rec.get("raw"))
        if pupils is None:
            continue
        out[rec["id"]] = {
            "pupils": pupils, "year": year, "name": rec.get("name"), "type": rec.get("school_type"),
            "lat": rec.get("latitude"), "lon": rec.get("longitude"),
        }
    return out


# ---------------------------------------------------------------- Zusammenführen


def build_land(land: str, officials: dict[str, dict], pupils: dict[str, dict], source_id: str) -> list[dict]:
    """Schulen mit Schülerzahl, ergänzt um Lage/Schulart/OSM aus dem Abgleich."""
    schools = []
    for official_id, p in pupils.items():
        o = officials.get(official_id, {})
        lat, lon = o.get("lat", p.get("lat")), o.get("lon", p.get("lon"))
        if lat is None or lon is None:
            lat, lon = p.get("lat"), p.get("lon")
        entry = {
            "id": official_id,
            "name": o.get("name") or p.get("name") or official_id,
            "type": o.get("type") or p.get("type"),
            "lat": round(lat, 6) if lat is not None else None,
            "lon": round(lon, 6) if lon is not None else None,
            "pupils": p["pupils"],
            "year": p.get("year"),
            "src": source_id,
            "osm": o.get("osm", []),
        }
        if entry["lat"] is None and not entry["osm"]:
            continue  # weder Lage noch OSM-Bezug: nicht zuordenbar
        schools.append(entry)
    return sorted(schools, key=lambda s: s["id"])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--laender", default=",".join(DEFAULT_LAENDER),
                    help=f"Länder, Standard {','.join(DEFAULT_LAENDER)}; zusätzlich möglich: {','.join(OPT_IN_LAENDER)}")
    ap.add_argument("--matches-csv", default=MATCHES_CSV_URL, help="Pfad oder URL der Abgleichs-CSV")
    ap.add_argument("--be-svz", default=BE_SVZ_URL, help="Pfad oder URL der Berliner Tabelle SVZ_Fakt5")
    ap.add_argument("--be-csv", help="gespeicherter Abruf von SVZ_Fakt5 als CSV (statt --be-svz)")
    ap.add_argument("--jedeschule-api", default=JEDESCHULE_API)
    ap.add_argument("--out", default="public/data/schuelerzahlen")
    args = ap.parse_args(argv)

    laender = [l.strip().upper() for l in args.laender.split(",") if l.strip()]
    unknown = [l for l in laender if l not in DEFAULT_LAENDER + OPT_IN_LAENDER]
    if unknown:
        ap.error(f"keine Schülerzahl-Quelle für: {', '.join(unknown)}")

    print(f"Abgleichs-CSV: {args.matches_csv}")
    officials = parse_matches_csv(read_text(args.matches_csv))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    today = dt.date.today().isoformat()
    index = {"format": 1, "generated": today, "laender": {}, "sources": {"osm-schulabgleich": SOURCES["osm-schulabgleich"]}}

    for land in laender:
        source = None
        # Fällt eine Quelle aus, laufen die übrigen Länder weiter
        try:
            if land == "BE":
                print(f"BE: {args.be_csv or args.be_svz}")
                svz = parse_be_csv(read_text(args.be_csv)) if args.be_csv else parse_be_svz(read_text(args.be_svz))
                pupils = {f"BE-{bsn}": v for bsn, v in svz.items()}
                districts = sorted({bsn[:2] for bsn in svz})
                if len(districts) < 12:
                    print(f"  Warnung: nur Bezirke {', '.join(districts)} in der Tabelle — vollständig geladen?")
                source_id = "be-svz"
                if args.be_csv:
                    source = {**SOURCES[source_id], "note": SOURCES[source_id]["note"] + " Aus einem gespeicherten Abruf (CSV)."}
            else:
                print(f"{land}: JedeSchule-API")
                pupils = pupils_from_jedeschule(land, fetch_jedeschule(land, args.jedeschule_api))
                source_id = f"jedeschule-{land.lower()}"
        except (OSError, ValueError) as e:
            hint = " Die Tabelle SVZ_Fakt5 ist seit Oktober 2026 nicht mehr erreichbar — gespeicherten Abruf mit --be-csv angeben." \
                if land == "BE" and not args.be_csv else ""
            print(f"  {land} übersprungen: {e}.{hint}")
            continue
        source = source or SOURCES[source_id]
        schools = build_land(land, officials.get(land, {}), pupils, source_id)
        with_osm = sum(1 for s in schools if s["osm"])
        data = {"format": 1, "land": land, "generated": today,
                "sources": {source_id: source, "osm-schulabgleich": SOURCES["osm-schulabgleich"]},
                "schools": schools}
        (out_dir / f"{land}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index["laender"][land] = {"file": f"{land}.json", "schools": len(schools), "withOsm": with_osm}
        index["sources"][source_id] = source
        print(f"  {len(schools)} Schulen mit Schülerzahl, davon {with_osm} mit OSM-Zuordnung")

    (out_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Geschrieben: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
