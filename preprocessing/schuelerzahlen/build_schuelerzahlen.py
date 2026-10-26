"""Schülerzahlen je Schule für die Gebietsanalyse aufbereiten.

Erzeugt public/data/schuelerzahlen/index.json und je Land <LAND>.json. Die
Gebietsanalyse lädt die Datei der Länder im gezeichneten Bereich und belegt
die Wege je Schule (= Hinwege je Schultag) mit der Schülerzahl vor.

Quellen:
- OSM Schulabgleich (osmberlin): amtliche Schulen (Kennung, Name, Lage,
  Schulart) und das OSM-Objekt, das ihnen zugeordnet ist.
- Berlin: Bildungsstatistik der Senatsverwaltung, Tabelle SVZ_Fakt5
  (Schüler je Schule, Berliner Schulnummer BSN) — als Webseite oder als
  gesicherte CSV. Die Seite ist seit Oktober 2026 nicht erreichbar; dann nimmt
  das Skript den Stand vom 14.07.2026 aus dem Webarchiv (alle 12 Bezirke).
- Brandenburg, Hamburg, Bayern: Schülerzahl aus den Rohdaten der
  Landesquellen, abgerufen über die JedeSchule-API.
- Nur auf Wunsch: Nordrhein-Westfalen (Open Data des Schulministeriums,
  Gesamtzahl je Schulnummer; Download-Server zuletzt nicht erreichbar, Datei
  von Hand übergeben) sowie Mecklenburg-Vorpommern (JedeSchule-API) und
  Sachsen-Anhalt (Kartendienst des Statistischen Landesamts), deren
  Landesquellen Vervielfältigung/Verbreitung einschränken.

Das Skript beachtet robots.txt: Schließt eine Seite automatische Abrufe aus,
die Datei im Browser speichern und als Pfad übergeben. Scheitert ein Land,
bleibt dessen vorhandene Datei stehen; die übrigen Länder laufen weiter.

Veröffentlicht werden nur Länder, deren Quelle das erlaubt (PUBLIC_LAENDER):
<LAND>.json und index.json gehören ins Repo und landen auf GitHub Pages. Die
übrigen schreibt das Skript als <LAND>.local.json, aufgeführt in
index.local.json (beides in .gitignore); die App liest sie nur beim
Entwickeln (npm run dev).

Nur Standardbibliothek. Aufruf aus der Repo-Wurzel:

    python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py
    python3 preprocessing/schuelerzahlen/build_schuelerzahlen.py --laender NW --nw-anzahlen anzahlen.csv
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import math
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path

MATCHES_CSV_URL = "https://schulabgleich.osm-verkehrswende.org/datasets/schools_matches.csv"
BE_SVZ_URL = "https://www.bildungsstatistik.berlin.de/statistik/ListGen/SVZ_Fakt5.aspx"
# SVZ_Fakt5 ist seit Oktober 2026 nicht erreichbar; Stand 14.07.2026 im Webarchiv
# (Schuljahr 2024/25, alle 12 Bezirke, 909 Schulen) — „id_“ liefert die Seite ohne Archiv-Rahmen
BE_SVZ_ARCHIVE_URL = f"https://web.archive.org/web/20260714154715id_/{BE_SVZ_URL}"
BE_SVZ_ARCHIVE_VIEW_URL = f"https://web.archive.org/web/20260714154715/{BE_SVZ_URL}"  # zum Verlinken
NW_ANZAHLEN_URL = "https://www.schulministerium.nrw.de/BiPo/OpenData/Schuldaten/SchuelerGesamtZahl/anzahlen.csv"
# Der Dienst heißt je Schuljahr anders (…_2025_26_…); neuere Fassung mit --st-dienst
ST_DIENST_URL = ("https://services-eu1.arcgis.com/3jNCHSftk0N4t7dd/arcgis/rest/services/"
                 "SchulstandorteESPG25832_2025_26_Sicht/FeatureServer/45")
JEDESCHULE_API = "https://jedeschule.codefor.de"
DEFAULT_LAENDER = ["BE", "BB", "HH", "BY"]
# Nur mit --laender ausdrücklich anfordern:
# - NW: der Download-Server des Schulministeriums war am 25.10.2026 nicht erreichbar;
#   anzahlen.csv im Browser laden und mit --nw-anzahlen übergeben
# - MV, ST: Landesquelle schränkt Vervielfältigung/Verbreitung ein
OPT_IN_LAENDER = ["NW", "MV", "ST"]
# Veröffentlicht (Repo, GitHub Pages) werden nur Länder, deren Quelle das erlaubt
# (CC BY bzw. dl-de/by-2-0): <LAND>.json, aufgeführt in index.json. Alle anderen
# bleiben lokal: <LAND>.local.json und index.local.json (.gitignore). Bayern:
# laut Nutzungsbedingungen von km.bayern.de nur eigener Gebrauch.
PUBLIC_LAENDER = ["BE", "BB", "HH", "NW"]
JEDESCHULE_LAENDER = ["BB", "HH", "MV", "BY"]
DL_DE_BY_URL = "https://www.govdata.de/dl-de/by-2-0"
USER_AGENT = "routing_bulk-schuelerzahlen/1.1 (+https://github.com/vizsim/routing_bulk)"

# Wo ein Land die Datei von Hand bekommt, wenn der Abruf nicht geht
MANUAL_HINT = {
    "BE": "--be-svz DATEI (gespeicherte Seite SVZ_Fakt5 oder gesicherte CSV)",
    "NW": "--nw-anzahlen DATEI (anzahlen.csv von schulministerium.nrw/open-data)",
}

SOURCES = {
    "osm-schulabgleich": {
        "label": "OSM Schulabgleich",
        "title": "Abgleich amtlicher Schulstammdaten (JedeSchule) mit OpenStreetMap",
        "url": "https://schulabgleich.osm-verkehrswende.org/",
        "license": "Zuordnung zu OSM: © OpenStreetMap-Mitwirkende, ODbL; amtliche Angaben unter der Lizenz des Landes",
        "licenseUrl": "https://www.openstreetmap.org/copyright",
        "note": "Zuordnung amtliche Schule ↔ OSM-Objekt sowie amtliche Lage und Schulart.",
    },
    "be-svz": {
        "label": "Bildungsstatistik Berlin",
        "title": "Schüler- und Lehrkräftezahlen je Schule (SVZ_Fakt5)",
        "url": BE_SVZ_URL,
        "license": "CC BY, Senatsverwaltung für Bildung, Jugend und Familie (laut Datensatz auf daten.berlin.de)",
        "licenseUrl": "https://daten.berlin.de/datensaetze/c3f96c4b-e891-41a7-aa13-39db8bc97008",
        "note": "Schüler:innen insgesamt je Berliner Schulnummer (BSN); nur Hauptstandorte.",
    },
    "nw-msb": {
        "label": "Schulministerium NRW",
        "title": "Gesamtanzahl der Schülerinnen und Schüler je Schule (Open Data)",
        "url": "https://www.schulministerium.nrw/open-data",
        "license": "dl-de/by-2-0, Ministerium für Schule und Bildung NRW",
        "licenseUrl": DL_DE_BY_URL,
        "note": ("Amtliche Schuldaten, Stichtag 15.10. des Vorjahres (Veröffentlichung jeweils zum 1.3.); "
                 "Lage über Schulnummer aus den Schulgrunddaten (Abgleich bzw. JedeSchule)."),
    },
    "jedeschule-bb": {
        "label": "Schulverzeichnis Brandenburg",
        "title": "WFS Schul_Standorte des MBJS, Feld schueler (über die JedeSchule-API)",
        "url": "https://schullandschaft.brandenburg.de/edugis/wfs/schulen",
        # Bereitsteller wie in den Nutzungsbedingungen des WFS verlangt
        "license": "dl-de/by-2-0, © Ministerium für Bildung, Jugend und Sport",
        "licenseUrl": DL_DE_BY_URL,
        "note": "Stand je Schule angegeben (meist 2022).",
    },
    "jedeschule-hh": {
        "label": "Schulstammdaten Hamburg",
        "title": "Schulstammdaten und Schülerzahlen der Hamburger Schulen (über die JedeSchule-API)",
        "url": "https://api.hamburg.de/datasets/v1/schulen",
        # Quellenvermerk laut Metadaten (metaver.de, D3DDBBA3-7329-475C-BB07-14D539ED6B1E)
        "license": "dl-de/by-2-0, Freie und Hansestadt Hamburg, Behörde für Schule und Berufsausbildung",
        "licenseUrl": DL_DE_BY_URL,
        "note": "Schüler:innen je Standort.",
    },
    "jedeschule-by": {
        "label": "Schulsuche Bayern",
        "title": "Eckdaten je Schule des Kultusministeriums (über die JedeSchule-API)",
        "url": "https://www.km.bayern.de/schule-und-mehr/schulsuche",
        "license": ("nur eigener Gebrauch: Veröffentlichung nur mit Einwilligung des Kultusministeriums "
                    "(Nutzungsbedingungen km.bayern.de)"),
        "licenseUrl": "https://www.km.bayern.de/impressum",
        "note": "Schüler:innen gesamt im angegebenen Schuljahr; öffentliche und private Schulen.",
    },
    "jedeschule-mv": {
        "label": "Schulverzeichnis Mecklenburg-Vorpommern",
        "title": "WFS Schulstandorte, Feld anzahl_schueler (über die JedeSchule-API)",
        "url": "https://www.geodaten-mv.de/dienste/schulstandorte_wfs",
        "license": "unklar (Metadaten: nur auszugsweise Vervielfältigung mit Quellenangabe)",
        "note": "Bezugsschuljahr nicht angegeben.",
    },
    "st-stala": {
        "label": "Statistisches Landesamt Sachsen-Anhalt",
        "title": "Schulstandorte allgemeinbildender Schulen, Feld „Anzahl der Schüler/-innen“ (ArcGIS-Dienst)",
        "url": "https://stala-sa.maps.arcgis.com/apps/instant/nearby/index.html?appid=2472e79115b04fd38f9c6e7d362d6efa",
        "license": ("unklar: die Web-Anwendung nennt dl-de/by-2-0, der Dienst nur „© Statistisches Landesamt "
                    "Sachsen-Anhalt“, der Vorjahresdienst untersagte Vervielfältigung und Verbreitung "
                    "(vor einer Veröffentlichung klären)"),
        "note": "Nur allgemeinbildende Schulen, ohne Schulnummer; Zuordnung über Lage und Name.",
    },
}

SOURCE_ID = {"BE": "be-svz", "NW": "nw-msb", "ST": "st-stala",
             **{land: f"jedeschule-{land.lower()}" for land in JEDESCHULE_LAENDER}}


# ---------------------------------------------------------------- Laden


class FetchRefused(RuntimeError):
    """Abruf laut robots.txt nicht erwünscht (oder robots.txt nicht abrufbar)."""


_ROBOTS: dict[str, urllib.robotparser.RobotFileParser] = {}


def robots_parser(lines: list[str] | None = None, status: int | None = None) -> urllib.robotparser.RobotFileParser:
    """Regeln aus robots.txt nach RFC 9309: Datei fehlt (4xx) → alles erlaubt; Serverfehler → nichts erlaubt."""
    rp = urllib.robotparser.RobotFileParser()
    if status is not None:
        if 400 <= status < 500:
            rp.allow_all = True
        else:
            rp.disallow_all = True
    else:
        rp.parse(lines or [])
    return rp


def robots_allows(url: str) -> bool:
    """Darf dieses Skript die URL abrufen? robots.txt je Host wird einmal gelesen."""
    parts = urllib.parse.urlsplit(url)
    root = f"{parts.scheme}://{parts.netloc}"
    rp = _ROBOTS.get(root)
    if rp is None:
        req = urllib.request.Request(f"{root}/robots.txt", headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                rp = robots_parser(resp.read().decode("utf-8", "replace").splitlines())
        except urllib.error.HTTPError as err:
            rp = robots_parser(status=err.code)
        _ROBOTS[root] = rp
    return rp.can_fetch(USER_AGENT, url)


def decode_bytes(raw: bytes, charset: str = "utf-8") -> str:
    """Text aus Bytes: angegebener Zeichensatz, sonst Windows-1252, sonst Latin-1.

    Ohne BOM — die Abgleichs-CSV beginnt mit einem, sonst hieße ihre erste
    Spalte „\\ufeffbundesland“ und keine Zeile fände ihr Land.
    """
    for enc in (charset, "cp1252"):
        try:
            return raw.decode(enc).lstrip("\ufeff")
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("latin-1").lstrip("\ufeff")


def is_url(path_or_url: str) -> bool:
    return bool(re.match(r"^https?://", str(path_or_url)))


def read_text(path_or_url: str) -> str:
    """Datei oder URL als Text. URLs nur, wenn robots.txt den Abruf erlaubt."""
    if is_url(path_or_url):
        if not robots_allows(path_or_url):
            raise FetchRefused(f"{path_or_url}: robots.txt erlaubt keinen automatischen Abruf (oder ist nicht abrufbar)")
        req = urllib.request.Request(path_or_url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            return decode_bytes(resp.read(), resp.headers.get_content_charset() or "utf-8")
    return decode_bytes(Path(path_or_url).read_bytes())


def first_int(value) -> int | None:
    """Erste ganze Zahl aus Wert oder Text ('288 (Stand: 2022)' → 288, '1.603' → 1603)."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value >= 0 else None
    m = re.search(r"\d[\d.]*", str(value))
    return int(m.group(0).replace(".", "")) if m else None


def school_year(value) -> str | None:
    """Schuljahr vereinheitlichen: '2025/2026' → '2025/26', Stichtag '15.10.2025' → '2025/26', '2025_26' → '2025/26'."""
    s = str(value or "")
    m = re.search(r"(?<!\d)(20\d{2})\s*[/_-]\s*(\d{4}|\d{2})(?!\d)", s)
    if m:
        return f"{m.group(1)}/{m.group(2)[-2:]}"
    m = re.search(r"(?<!\d)(\d{1,2})\.(\d{1,2})\.(20\d{2})(?!\d)", s)
    if m:
        year = int(m.group(3)) if int(m.group(2)) >= 8 else int(m.group(3)) - 1
        return f"{year}/{(year + 1) % 100:02d}"
    m = re.search(r"(?<!\d)(20\d{2})(?!\d)", s)
    return m.group(1) if m else None


def _csv_rows(text: str) -> list[list[str]]:
    """CSV-Zeilen; Trennzeichen aus der Zeile 'sep=;' oder geschätzt (; , Tab)."""
    lines = text.lstrip("\ufeff").splitlines()
    delimiter = None
    if lines and lines[0].strip().lower().startswith("sep="):
        delimiter = lines[0].strip()[4:5] or ";"
        lines = lines[1:]
    if delimiter is None:
        sample = "\n".join(lines[:20])
        delimiter = max([";", ",", "\t"], key=sample.count)
    return [[c.strip() for c in row] for row in csv.reader(lines, delimiter=delimiter) if any(c.strip() for c in row)]


def _norm_header(cell: str) -> str:
    s = cell.lower().replace("ü", "ue").replace("ä", "ae").replace("ö", "oe").replace("ß", "ss")
    return re.sub(r"[^a-z0-9/]+", " ", s).strip()


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def normalize_school_name(name) -> str:
    """Wie in der App: klein, Umlaute aufgelöst, ohne Klammerzusätze und Satzzeichen."""
    s = re.sub(r"\([^)]*\)", " ", str(name or "").lower())
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def names_match(a, b) -> bool:
    x, y = normalize_school_name(a), normalize_school_name(b)
    return bool(x and y) and (x == y or x.startswith(f"{y} ") or y.startswith(f"{x} "))


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


def parse_be_svz(text: str) -> dict[str, dict]:
    """Berliner Tabelle SVZ_Fakt5 (gespeicherte Seite oder CSV) → {BSN: {pupils, year}}."""
    if re.search(r"<table", text, re.I):
        parser = _TableRows()
        parser.feed(text)
        rows = parser.rows
    else:
        rows = _csv_rows(text)
    header_index = next((i for i, r in enumerate(rows)
                         if any(c.strip().upper() == "BSN" for c in r)), None)
    if header_index is None:
        raise ValueError("SVZ_Fakt5: keine Kopfzeile mit 'BSN' gefunden")
    header = [_norm_header(c) for c in rows[header_index]]
    col_bsn = header.index("bsn")
    col_pupils = next((i for i, c in enumerate(header)
                       if c.startswith("schueler") and ("m/w/d" in c or "gesamt" in c)), None)
    if col_pupils is None:
        raise ValueError("SVZ_Fakt5: keine Spalte 'Schüler (m/w/d)' bzw. 'Schueler_gesamt'")
    col_year = next((i for i, c in enumerate(header) if "schuljahr" in c), None)
    out = {}
    for row in rows[header_index + 1:]:
        if len(row) <= max(col_bsn, col_pupils):
            continue
        bsn = row[col_bsn].strip()
        pupils = first_int(row[col_pupils])
        if not re.match(r"^\d{2}[A-Z]\d{2}$", bsn) or pupils is None:
            continue
        out[bsn] = {"pupils": pupils, "year": row[col_year].strip() if col_year is not None else None}
    return out


# ---------------------------------------------------------------- Nordrhein-Westfalen


def parse_nw_anzahlen(text: str) -> tuple[dict[str, dict], dict]:
    """NRW 'Gesamtanzahl der Schülerinnen und Schüler je Schule' → ({NW-Schulnummer: {pupils, year}}, Spalten).

    Der Spaltenaufbau ist nicht dokumentiert; erkannt werden eine Spalte mit
    der Schulnummer und eine Zahlspalte (bevorzugt „gesamt“, sonst „Anzahl“
    bzw. „Schüler“). Mehrere Zeilen je Schule werden addiert, bei einer
    Schuljahresspalte zählt das jüngste Schuljahr.
    """
    rows = _csv_rows(text)
    is_nr = re.compile(r"^(schul ?n(ummer|r)|snr)\b")
    header_index = next((i for i, r in enumerate(rows)
                         if any(is_nr.match(_norm_header(c)) for c in r)), None)
    if header_index is None:
        raise ValueError("NRW-Schülerzahlen: keine Kopfzeile mit 'Schulnummer' gefunden")
    header = [_norm_header(c) for c in rows[header_index]]
    col_nr = next(i for i, c in enumerate(header) if is_nr.match(c))
    col_year = next((i for i, c in enumerate(header) if re.search(r"schuljahr|stichtag", c)), None)
    # Spalten nach Geschlecht ('weiblich', 'Schüler (w)') nie als Gesamtzahl nehmen
    candidates = [i for i in range(len(header)) if i not in (col_nr, col_year)
                  and not re.search(r"weibl|maennl|divers|(^|\s)[wmd]$", header[i])]
    col_count = None
    for pattern in (r"gesamt", r"anzahl", r"schueler|\bsus\b"):
        col_count = next((i for i in candidates if re.search(pattern, header[i])), None)
        if col_count is not None:
            break
    if col_count is None:
        # sonst die Zahlspalte mit dem größten Median (Schulform-Schlüssel wie '02' sind klein)
        sample = rows[header_index + 1:header_index + 51]
        numeric = [i for i in candidates if sample and all(
            i < len(r) and re.fullmatch(r"\d[\d.]*", r[i]) for r in sample)]
        if numeric:
            col_count = max(numeric, key=lambda i: sorted(first_int(r[i]) for r in sample)[len(sample) // 2])
    if col_count is None:
        raise ValueError(f"NRW-Schülerzahlen: keine Zahlspalte in {rows[header_index]}")
    columns = {"schulnummer": rows[header_index][col_nr], "anzahl": rows[header_index][col_count],
               "schuljahr": rows[header_index][col_year] if col_year is not None else None}

    out: dict[str, dict] = {}
    for row in rows[header_index + 1:]:
        if len(row) <= max(col_nr, col_count):
            continue
        digits = re.search(r"\d+", row[col_nr])
        pupils = first_int(row[col_count])
        if not digits or pupils is None:
            continue
        sid = f"NW-{digits.group(0).zfill(6)}"
        year = school_year(row[col_year]) if col_year is not None and col_year < len(row) else None
        prev = out.get(sid)
        if prev is None or (year or "") > (prev["year"] or ""):
            out[sid] = {"pupils": pupils, "year": year}
        elif (year or "") == (prev["year"] or ""):
            prev["pupils"] += pupils
    return out, columns


def nw_year_from_rule(reference: dt.date) -> str:
    """Schuljahr der NRW-Datei: ab 1.3. eines Jahres gilt der Stichtag 15.10. des Vorjahres."""
    year = reference.year - 1 if (reference.month, reference.day) >= (3, 1) else reference.year - 2
    return f"{year}/{(year + 1) % 100:02d}"


# ---------------------------------------------------------------- Sachsen-Anhalt (ArcGIS)


def fetch_arcgis_features(layer_url: str, page: int = 1000) -> list[dict]:
    """Alle Objekte eines ArcGIS-FeatureServer-Layers in WGS84 (Paginierung über resultOffset)."""
    features, offset = [], 0
    while True:
        query = urllib.parse.urlencode({
            "where": "1=1", "outFields": "*", "outSR": "4326", "orderByFields": "OBJECTID",
            "resultOffset": offset, "resultRecordCount": page, "f": "json",
        })
        data = json.loads(read_text(f"{layer_url.rstrip('/')}/query?{query}"))
        if "error" in data:
            raise ValueError(f"ArcGIS-Dienst: {data['error'].get('message') or data['error']}")
        batch = data.get("features") or []
        features.extend(batch)
        if not batch or not data.get("exceededTransferLimit"):
            return features
        offset += len(batch)


def pupils_from_st_features(features: list[dict], year: str | None) -> dict[str, dict]:
    """ArcGIS-Objekte → {ST-STALA-<OBJECTID>: {pupils, year, name, type, lat, lon}}."""
    out = {}
    for feature in features:
        attrs = feature.get("attributes") or {}
        geom = feature.get("geometry") or {}
        count = next((v for k, v in attrs.items()
                      if k.lower().startswith("anzahl") and isinstance(v, (int, float))), None)
        pupils = first_int(count if count is not None else attrs.get("Text_Schuelerzahl"))
        if pupils is None or attrs.get("OBJECTID") is None:
            continue
        name = " ".join(str(attrs.get("Name") or "").split()) \
            or " ".join(" ".join(filter(None, [attrs.get("Name1"), attrs.get("Name2")])).split())
        out[f"ST-STALA-{attrs['OBJECTID']}"] = {
            "pupils": pupils, "year": year, "name": name, "type": attrs.get("Schulform"),
            "lat": _float(geom.get("y")), "lon": _float(geom.get("x")),
        }
    return out


def link_to_officials(pupils: dict[str, dict], officials: dict[str, dict], max_m: float = 100.0) -> dict[str, str]:
    """{Kennung: Kennung im Abgleich} für Datensätze, deren Kennung der Abgleich nicht kennt.

    Etwa Sachsen-Anhalt (Dienst ohne Schulnummer) oder Bayern, solange der
    Abgleich noch die älteren JedeSchule-Kennungen führt. Gleicher Name im
    Umkreis von max_m, nächste Paare zuerst; jede amtliche Schule höchstens
    einmal und nicht, wenn sie schon über ihre Kennung belegt ist.
    """
    cell = 0.01  # Grad, größer als max_m
    grid: dict[tuple[int, int], list[str]] = {}
    for oid, o in officials.items():
        if oid not in pupils and o.get("lat") is not None and o.get("lon") is not None:
            grid.setdefault((int(o["lat"] // cell), int(o["lon"] // cell)), []).append(oid)
    pairs = []
    for pid, p in pupils.items():
        if pid in officials or p.get("lat") is None or p.get("lon") is None:
            continue
        gy, gx = int(p["lat"] // cell), int(p["lon"] // cell)
        for oid in (oid for dy in (-1, 0, 1) for dx in (-1, 0, 1) for oid in grid.get((gy + dy, gx + dx), [])):
            o = officials[oid]
            d = _haversine_m(p["lat"], p["lon"], o["lat"], o["lon"])
            if d <= max_m and names_match(p.get("name"), o.get("name")):
                pairs.append((d, pid, oid))
    linked: dict[str, str] = {}
    used: set[str] = set()
    for _, pid, oid in sorted(pairs):
        if pid not in linked and oid not in used:
            linked[pid] = oid
            used.add(oid)
    return linked


# ---------------------------------------------------------------- JedeSchule (raw)


def fetch_jedeschule(land: str, api: str = JEDESCHULE_API, page: int = 50000, include_raw: bool = True) -> list[dict]:
    """Alle Schulen eines Landes, auf Wunsch mit raw-Feldern.

    Ein Land passt in eine Seite (Bayern hat gut 10.500 Einträge): Die API
    sortiert zwischen Anfragen nicht stabil — im Oktober 2026 brachte die
    zweite Seite nur schon Bekanntes, in Brandenburg fehlte so die Hälfte der
    Schulen, in Bayern ein Teil. Falls doch geblättert werden muss, werden
    doppelte Kennungen verworfen und es gibt einen Hinweis.
    """
    schools, seen, skip = [], set(), 0
    raw = "true" if include_raw else "false"
    while True:
        url = f"{api}/schools/?state={land}&include_raw={raw}&limit={page}&skip={skip}"
        batch = json.loads(read_text(url))
        new = [s for s in batch if s.get("id") not in seen]
        seen.update(s.get("id") for s in new)
        schools.extend(new)
        if len(batch) < page:
            return schools
        if not new:
            print(f"  Hinweis: JedeSchule lieferte ab {skip} nur Bekanntes — Liste womöglich unvollständig")
            return schools
        skip += len(batch)


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


def build_land(land: str, officials: dict[str, dict], pupils: dict[str, dict], source_id: str,
               links: dict[str, str] | None = None) -> list[dict]:
    """Schulen mit Schülerzahl, ergänzt um Lage/Schulart/OSM aus dem Abgleich.

    links: Zuordnung über Lage und Name (link_to_officials) für Kennungen,
    die der Abgleich nicht kennt; die eigene Kennung bleibt erhalten.
    """
    links = links or {}
    schools = []
    for official_id, p in pupils.items():
        o = officials.get(official_id) or officials.get(links.get(official_id), {})
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


def collect_pupils(land: str, args, officials: dict[str, dict]) -> dict[str, dict]:
    """Schülerzahlen eines Landes aus seiner Quelle: {official_id: {pupils, year, …}}."""
    if land == "BE":
        source = args.be_svz
        print(f"  Quelle: {source}")
        try:
            svz = parse_be_svz(read_text(source))
        except (OSError, ValueError, FetchRefused) as err:
            if source != BE_SVZ_URL:
                raise
            # Seit Oktober 2026 offline: Stand vom 14.07.2026 im Webarchiv
            print(f"  nicht erreichbar ({err}) — nehme den Stand im Webarchiv: {BE_SVZ_ARCHIVE_URL}")
            source = BE_SVZ_ARCHIVE_URL
            svz = parse_be_svz(read_text(source))
        args.be_svz_used = source
        districts = sorted({bsn[:2] for bsn in svz})
        if len(districts) < 12:
            print(f"  Warnung: nur Bezirke {', '.join(districts)} in der Tabelle — vollständig?")
        return {f"BE-{bsn}": v for bsn, v in svz.items()}

    if land == "NW":
        print(f"  Quelle: {args.nw_anzahlen}")
        counts, columns = parse_nw_anzahlen(read_text(args.nw_anzahlen))
        print(f"  Spalten: Schulnummer = {columns['schulnummer']!r}, Anzahl = {columns['anzahl']!r}"
              + (f", Schuljahr = {columns['schuljahr']!r}" if columns["schuljahr"] else ""))
        if args.nw_schuljahr:
            fallback_year = school_year(args.nw_schuljahr) or args.nw_schuljahr
        else:
            ref = dt.date.today() if is_url(args.nw_anzahlen) \
                else dt.date.fromtimestamp(Path(args.nw_anzahlen).stat().st_mtime)
            fallback_year = nw_year_from_rule(ref)
        pupils = {sid: {"pupils": v["pupils"], "year": v["year"] or fallback_year} for sid, v in counts.items()}
        missing = [sid for sid in pupils if sid not in officials]
        if missing:
            # Lage der Schulen, die der Abgleich nicht kennt, aus den Schulgrunddaten (JedeSchule)
            try:
                records = {r["id"]: r for r in fetch_jedeschule("NW", args.jedeschule_api, include_raw=False)}
            except (OSError, ValueError, FetchRefused) as err:
                print(f"  Hinweis: JedeSchule nicht erreichbar ({err}); {len(missing)} Schulen ohne Lage")
                records = {}
            for sid in missing:
                rec = records.get(sid)
                if rec:
                    pupils[sid].update(name=rec.get("name"), type=rec.get("school_type"),
                                       lat=rec.get("latitude"), lon=rec.get("longitude"))
        return pupils

    if land == "ST":
        print(f"  Quelle: {args.st_dienst}")
        features = fetch_arcgis_features(args.st_dienst)
        return pupils_from_st_features(features, school_year(args.st_dienst))

    print("  Quelle: JedeSchule-API")
    return pupils_from_jedeschule(land, fetch_jedeschule(land, args.jedeschule_api))


def _load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def land_file(land: str) -> str:
    """Dateiname eines Landes: veröffentlicht <LAND>.json, sonst <LAND>.local.json."""
    return f"{land}.json" if land in PUBLIC_LAENDER else f"{land}.local.json"


def _drop_other_name(out_dir: Path, land: str) -> None:
    """Löscht die Datei des Landes unter dem anderen Namen (aus einem Lauf mit anderer Freigabe)."""
    for name in (f"{land}.json", f"{land}.local.json"):
        if name != land_file(land):
            (out_dir / name).unlink(missing_ok=True)


def _previous_file(out_dir: Path, land: str, entry: dict) -> Path | None:
    """Datei eines früheren Laufs, umbenannt auf den Namen, der zur Freigabe passt
    (z. B. BY.json → BY.local.json); None, wenn keine da ist."""
    target = out_dir / land_file(land)
    names = dict.fromkeys(filter(None, [entry.get("file"), target.name, f"{land}.json", f"{land}.local.json"]))
    found = next((out_dir / n for n in names if (out_dir / n).exists()), None)
    if found is None:
        return None
    if found != target:
        found.replace(target)
    _drop_other_name(out_dir, land)
    return target


def _write_if_changed(path: Path, data: dict, **dump_args) -> dict:
    """Schreibt data als JSON. Ist der Inhalt bis auf „generated“ gleich, bleibt die
    vorhandene Datei samt Datum stehen (kein Diff im Repo). Gibt den geltenden Inhalt zurück."""
    def strip(d: dict) -> dict:
        return {k: v for k, v in d.items() if k != "generated"}

    old = _load_json(path)
    if old and strip(old) == strip(data):
        return old
    path.write_text(json.dumps(data, ensure_ascii=False, **dump_args), encoding="utf-8")
    return data


def public_index(index: dict) -> dict:
    """index.json: nur die veröffentlichten Länder und deren Quellen."""
    laender = {land: e for land, e in index["laender"].items() if land in PUBLIC_LAENDER}
    used = {"osm-schulabgleich"} | {e.get("source") for e in laender.values()}
    return {**index, "laender": laender, "sources": {k: v for k, v in index["sources"].items() if k in used}}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--laender", default=",".join(DEFAULT_LAENDER),
                    help=f"Länder, Standard {','.join(DEFAULT_LAENDER)}; zusätzlich möglich: {','.join(OPT_IN_LAENDER)}")
    ap.add_argument("--matches-csv", default=MATCHES_CSV_URL, help="Pfad oder URL der Abgleichs-CSV")
    # --be-csv: früherer Name, als gleichwertige Angabe weiter erlaubt
    ap.add_argument("--be-svz", "--be-csv", dest="be_svz", default=BE_SVZ_URL,
                    help="Berlin: URL oder gespeicherte Seite SVZ_Fakt5 (HTML) bzw. gesicherte CSV")
    ap.add_argument("--nw-anzahlen", default=NW_ANZAHLEN_URL, help="NRW: URL oder Pfad von anzahlen.csv")
    ap.add_argument("--nw-schuljahr", default=None,
                    help="NRW: Schuljahr, falls die Datei keines nennt (Standard: aus dem Veröffentlichungsrhythmus)")
    ap.add_argument("--st-dienst", default=ST_DIENST_URL, help="Sachsen-Anhalt: URL des ArcGIS-Layers")
    ap.add_argument("--jedeschule-api", default=JEDESCHULE_API)
    ap.add_argument("--out", default="public/data/schuelerzahlen")
    args = ap.parse_args(argv)

    laender = [l.strip().upper() for l in args.laender.split(",") if l.strip()]
    unknown = [l for l in laender if l not in DEFAULT_LAENDER + OPT_IN_LAENDER]
    if unknown:
        ap.error(f"keine Schülerzahl-Quelle für: {', '.join(unknown)}")

    print(f"Abgleichs-CSV: {args.matches_csv}")
    try:
        officials = parse_matches_csv(read_text(args.matches_csv))
    except (OSError, ValueError, FetchRefused) as err:
        print(f"  Warnung: Abgleich nicht verfügbar ({err}) — ohne OSM-Zuordnung, Berlin ohne Lage")
        officials = {}

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    # index.local.json führt alle Länder, index.json nur die veröffentlichten
    previous = _load_json(out_dir / "index.local.json") or _load_json(out_dir / "index.json")
    today = dt.date.today().isoformat()
    index = {"format": 1, "generated": today, "laender": {}, "sources": {"osm-schulabgleich": SOURCES["osm-schulabgleich"]}}

    def keep_previous(land: str) -> Path | None:
        """Datei eines früheren Laufs mit ihrem Indexeintrag übernehmen."""
        entry = (previous.get("laender") or {}).get(land)
        path = _previous_file(out_dir, land, entry) if entry else None
        if path:
            index["laender"][land] = {**entry, "file": path.name}
            index["sources"].update(_load_json(path).get("sources") or {})
        return path

    # Länder, die diesmal nicht laufen, bleiben im Index
    for land in previous.get("laender") or {}:
        if land not in laender:
            keep_previous(land)

    failed = []
    for land in laender:
        print(f"{land}:")
        source_id = SOURCE_ID[land]
        try:
            land_officials = officials.get(land, {})
            pupils = collect_pupils(land, args, land_officials)
            links = link_to_officials(pupils, land_officials)
            if links:
                print(f"  {len(links)} Schulen ohne gemeinsame Kennung über Lage und Name dem Abgleich zugeordnet")
            schools = build_land(land, land_officials, pupils, source_id, links)
            if not schools:
                raise ValueError("keine Schule mit Schülerzahl und Lage")
        except (OSError, ValueError, FetchRefused) as err:
            failed.append(land)
            print(f"  Fehler: {err}")
            if land in MANUAL_HINT:
                print(f"  Datei im Browser speichern und übergeben: {MANUAL_HINT[land]}")
            path = keep_previous(land)
            if path:
                print(f"  Vorhandene Datei bleibt: {path} (Stand {index['laender'][land].get('generated', '?')})")
            continue
        source = SOURCES[source_id]
        used = getattr(args, "be_svz_used", args.be_svz) if land == "BE" else None
        if used == BE_SVZ_ARCHIVE_URL:
            source = {**source, "url": BE_SVZ_ARCHIVE_VIEW_URL,
                      "note": f"{source['note']} Stand 14.07.2026 aus dem Webarchiv (web.archive.org); "
                              "die Seite selbst ist seit Oktober 2026 nicht erreichbar."}
        elif used and not is_url(used):
            source = {**source, "note": f"{source['note']} Aus einem gesicherten Abruf ({Path(used).name})."}
        with_osm = sum(1 for s in schools if s["osm"])
        data = {"format": 1, "land": land, "generated": today,
                "sources": {source_id: source, "osm-schulabgleich": SOURCES["osm-schulabgleich"]},
                "schools": schools}
        path = out_dir / land_file(land)
        written = _write_if_changed(path, data, separators=(",", ":"))
        _drop_other_name(out_dir, land)
        index["laender"][land] = {"file": path.name, "schools": len(schools), "withOsm": with_osm,
                                  "source": source_id, "generated": written.get("generated", today)}
        index["sources"][source_id] = source
        years = sorted({s["year"] for s in schools if s["year"]})
        print(f"  {len(schools)} Schulen mit Schülerzahl, davon {with_osm} mit OSM-Zuordnung"
              + (f"; Schuljahr {', '.join(years)}" if years else "")
              + ("" if land in PUBLIC_LAENDER else f" — nur lokal ({path.name})"))

    _write_if_changed(out_dir / "index.local.json", index, indent=1)
    _write_if_changed(out_dir / "index.json", public_index(index), indent=1)
    print(f"Geschrieben: {out_dir}")
    if failed:
        print(f"Nicht aktualisiert: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
