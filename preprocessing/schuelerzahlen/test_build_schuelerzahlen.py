"""Tests mit kleinen Beispieldaten (ohne Netz):

    python3 -m unittest discover -s preprocessing/schuelerzahlen
"""

import contextlib
import datetime as dt
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_schuelerzahlen as b  # noqa: E402

SVZ_HTML = """
<html><body><table id="GridView1">
<tr><th>Schuljahr</th><th>BSN</th><th>NAME</th><th>Schüler (m/w/d)</th><th>Schüler (w)</th><th>Schüler (m)</th>
<th>Lehrkräfte (m,w,d)</th><th>Lehrkräfte (w)</th><th>Lehrkräfte (m)</th></tr>
<tr><td>2024/25</td><td>01B01</td><td>OSZ Banken, Immobilien und Versicherungen</td><td>1.603</td><td>642</td><td>961</td><td></td><td></td><td></td></tr>
<tr><td>2024/25</td><td>01G01</td><td>Grundschule am Arkonaplatz</td><td>426</td><td>191</td><td>235</td><td></td><td></td><td></td></tr>
<tr><td>2024/25</td><td>08G12</td><td>Jenaplanschule Neukölln (Grundschule)</td><td>296</td><td>128</td><td>168</td></tr>
<tr><td colspan="9">Summe</td></tr>
</table></body></html>
"""

# Format der gesicherten Liste (berlin_schuelerzahlen_2024-25.csv)
SVZ_CSV = (
    "\ufeffSchuljahr;BSN;Bezirk_Nr;Name;Schueler_gesamt;Schueler_w;Schueler_m;"
    "Lehrkraefte_gesamt;Lehrkraefte_w;Lehrkraefte_m\r\n"
    "2024/25;01B01;01;OSZ Banken, Immobilien und Versicherungen;1603;642;961;76;41;35\r\n"
    "2024/25;01G01;01;Grundschule am Arkonaplatz;426;191;235;34;30;4\r\n"
    "2024/25;08G12;08;Jenaplanschule Neukölln (Grundschule);296;128;168;;;\r\n"
)

MATCHES_CSV = """bundesland,category,official_id,official_name,official_lat,official_lon,official_school_type,osm_type,osm_id
BE,matched,BE-01G01,Grundschule am Arkonaplatz,52.5373,13.4011,Grundschule,way,1001
BE,official_only,BE-08G12,Jenaplanschule Neukölln (Grundschule),52.47,13.44,Grundschule,,
BE,match_ambiguous,,,,,,way,1002
BE,osm_only,,,,,,node,1003
BB,matched,BB-111430,Grundschule Beispiel,52.4,13.06,Grundschule,node,2001
NW,matched,NW-100015,Gem. Grundschule Beispielstadt,51.5,7.4,Grundschule,way,3001
NW,official_only,NW-100027,Städt. Gymnasium Beispielstadt,51.51,7.41,Gymnasium,,
ST,matched,ST-ARC00001,Albert-Schweitzer-Grundschule Stapelburg,51.899268,10.658022,Grundschule,way,4001
ST,matched,ST-ARC00002,Ev. Grundschule,51.866596,10.678451,Grundschule,way,4002
BY,matched,BY-SCHUL_SCHULSTANDORTEGYMNASIEN_abc,Rudolf-Diesel-Gymnasium Augsburg,48.3801,10.8702,Gymnasien,way,5001
"""

# JedeSchule Bayern: Kennung aus der Schulsuche (BY-0950), der Abgleich kennt noch die ältere
BY_RECORDS = [
    {"id": "BY-0950", "name": "Rudolf-Diesel-Gymnasium Augsburg", "school_type": "Gymnasien",
     "latitude": 48.38015, "longitude": 10.87025, "raw": {"schueler": 1012, "schuljahr": "2025/26"}},
    {"id": "BY-SCHUL_SCHULSTANDORTEGYMNASIEN_abc", "name": "Rudolf-Diesel-Gymnasium Augsburg",
     "school_type": "Gymnasien", "latitude": 48.3801, "longitude": 10.8702, "raw": {"schulname": "…"}},
]

# NRW: Aufbau nicht dokumentiert — typische Varianten der BiPo-Dateien
NW_CSV_SEP = "sep=;\nSchulnummer;Schülerzahl gesamt\n100015;312\n100027;1.045\n100039;0\n"
NW_CSV_VARIANT = (
    "\ufeffSchulNr;Schulform;Schüler weiblich;Schüler männlich;Anzahl Schüler insgesamt\n"
    "100015;02;150;162;312\n"
    "100027;20;500;545;1045\n"
)
NW_CSV_YEARS = (
    "Schulnummer;Schuljahr;Anzahl\n"
    "100015;2024/25;300\n"
    "100015;2025/26;312\n"
    "100027;2025/26;600\n"
    "100027;2025/26;445\n"  # zwei Zeilen im selben Schuljahr: addieren
)

ST_FEATURES = [
    {"attributes": {"OBJECTID": 1, "Name1": "Albert-Schweitzer-Grundschule", "Name2": "Stapelburg",
                    "Ort": "Nordharz", "Schulform": "Grundschule", "Schulträger": "öffentlich (Kommune)",
                    "Name": "Albert-Schweitzer-Grundschule Stapelburg", "Kategorie": "Grundschulen",
                    "Anzahl_der_Schüler__innen": 57, "Text_Schuelerzahl": "57"},
     "geometry": {"x": 10.658021682252526, "y": 51.899267876132775}},
    {"attributes": {"OBJECTID": 3, "Name1": "Ev. Grundschule", "Name2": "", "Ort": "Ilsenburg (Harz)",
                    "Schulform": "Grundschule", "Schulträger": "frei", "Name": "Ev. Grundschule ",
                    "Anzahl_der_Schüler__innen": 84, "Text_Schuelerzahl": "84"},
     "geometry": {"x": 10.678451320953204, "y": 51.866595648192842}},
    {"attributes": {"OBJECTID": 4, "Name1": "Goethe-Sekundarschule Ilsenburg", "Name2": "",
                    "Ort": "Ilsenburg (Harz)", "Schulform": "Sekundarschule", "Name": "Goethe-Sekundarschule Ilsenburg ",
                    "Anzahl_der_Schüler__innen": None, "Text_Schuelerzahl": "414"},
     "geometry": {"x": 10.689104794317169, "y": 51.860276695675843}},
    {"attributes": {"OBJECTID": 5, "Name": "Schule ohne Zahl", "Anzahl_der_Schüler__innen": None,
                    "Text_Schuelerzahl": ""}, "geometry": {"x": 10.7, "y": 51.87}},
]


def quiet():
    """Ausgaben des Skripts in den Tests unterdrücken."""
    return contextlib.redirect_stdout(io.StringIO())


class TestParse(unittest.TestCase):
    def test_be_svz(self):
        rows = b.parse_be_svz(SVZ_HTML)
        self.assertEqual(rows["01G01"], {"pupils": 426, "year": "2024/25"})
        self.assertEqual(rows["01B01"]["pupils"], 1603)  # Tausenderpunkt
        self.assertEqual(rows["08G12"]["pupils"], 296)
        self.assertEqual(len(rows), 3)

    def test_be_svz_from_saved_csv(self):
        self.assertEqual(b.parse_be_svz(SVZ_CSV), b.parse_be_svz(SVZ_HTML))

    def test_be_svz_without_header_fails(self):
        with self.assertRaises(ValueError):
            b.parse_be_svz("<table><tr><td>x</td></tr></table>")

    def test_be_csv_without_columns_fails(self):
        with self.assertRaises(ValueError):
            b.parse_be_svz("Schuljahr;Schule;Anzahl\n2024/25;x;1\n")  # keine BSN
        with self.assertRaises(ValueError):
            b.parse_be_svz("Schuljahr;BSN;Name\n2024/25;01G01;x\n")  # keine Schülerzahl

    def test_read_text_strips_bom(self):
        # Die echte Abgleichs-CSV beginnt mit einem BOM
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp, "matches.csv")
            path.write_text("﻿" + MATCHES_CSV, encoding="utf-8")
            text = b.read_text(str(path))
        self.assertFalse(text.startswith("﻿"))
        self.assertEqual(b.parse_matches_csv(text)["BE"]["BE-01G01"]["osm"], ["way/1001"])

    def test_matches_csv(self):
        officials = b.parse_matches_csv(MATCHES_CSV)
        be = officials["BE"]
        self.assertEqual(be["BE-01G01"]["osm"], ["way/1001"])
        self.assertEqual(be["BE-08G12"]["osm"], [])
        self.assertAlmostEqual(be["BE-08G12"]["lat"], 52.47)
        self.assertEqual(set(be), {"BE-01G01", "BE-08G12"})  # ambiguous/osm_only ohne amtliche Kennung
        self.assertEqual(officials["BB"]["BB-111430"]["osm"], ["node/2001"])

    def test_raw_fields(self):
        self.assertEqual(b.pupils_from_raw("BB", {"schueler": "288 (Stand: 2022)"}), (288, "2022"))
        self.assertEqual(b.pupils_from_raw("HH", {"anzahl_schueler": 996, "schueleranzahl_schuljahr": "2024"}), (996, "2024"))
        self.assertEqual(b.pupils_from_raw("MV", {"anzahl_schueler": 247}), (247, None))
        self.assertEqual(b.pupils_from_raw("BY", {"schueler": 584, "schuljahr": "2025/26"}), (584, "2025/26"))
        self.assertEqual(b.pupils_from_raw("BB", {}), (None, None))

    def test_school_year(self):
        self.assertEqual(b.school_year("2025/2026"), "2025/26")
        self.assertEqual(b.school_year("15.10.2025"), "2025/26")  # Stichtag im Herbst
        self.assertEqual(b.school_year(b.ST_DIENST_URL), "2025/26")  # …_2025_26_Sicht
        self.assertEqual(b.school_year("Stand: 2022"), "2022")
        self.assertIsNone(b.school_year(None))

    def test_nw_year_from_rule(self):
        # ab 1.3. gilt der Stichtag 15.10. des Vorjahres
        self.assertEqual(b.nw_year_from_rule(dt.date(2026, 10, 25)), "2025/26")
        self.assertEqual(b.nw_year_from_rule(dt.date(2026, 3, 1)), "2025/26")
        self.assertEqual(b.nw_year_from_rule(dt.date(2026, 2, 28)), "2024/25")

    def test_nw_anzahlen_with_sep_line(self):
        counts, columns = b.parse_nw_anzahlen(NW_CSV_SEP)
        self.assertEqual(counts["NW-100015"], {"pupils": 312, "year": None})
        self.assertEqual(counts["NW-100027"]["pupils"], 1045)
        self.assertEqual(counts["NW-100039"]["pupils"], 0)
        self.assertEqual(columns["anzahl"], "Schülerzahl gesamt")

    def test_nw_anzahlen_prefers_total_over_gender(self):
        counts, columns = b.parse_nw_anzahlen(NW_CSV_VARIANT)
        self.assertEqual(columns["schulnummer"], "SchulNr")
        self.assertEqual(columns["anzahl"], "Anzahl Schüler insgesamt")
        self.assertEqual(counts["NW-100015"]["pupils"], 312)
        self.assertEqual(counts["NW-100027"]["pupils"], 1045)

    def test_nw_anzahlen_latest_year_and_sum(self):
        counts, _ = b.parse_nw_anzahlen(NW_CSV_YEARS)
        self.assertEqual(counts["NW-100015"], {"pupils": 312, "year": "2025/26"})
        self.assertEqual(counts["NW-100027"], {"pupils": 1045, "year": "2025/26"})

    def test_nw_anzahlen_other_headers(self):
        counts, columns = b.parse_nw_anzahlen("SNR;SuS\n100015;312\n")
        self.assertEqual((columns["schulnummer"], columns["anzahl"]), ("SNR", "SuS"))
        self.assertEqual(counts["NW-100015"]["pupils"], 312)
        # Zahlspalte ohne sprechenden Namen: größter Median, nicht der Schulform-Schlüssel
        counts, columns = b.parse_nw_anzahlen("Schulnummer;Schulform;Wert\n100015;02;312\n100027;20;1045\n")
        self.assertEqual(columns["anzahl"], "Wert")
        self.assertEqual(counts["NW-100027"]["pupils"], 1045)

    def test_nw_anzahlen_without_header_fails(self):
        with self.assertRaises(ValueError):
            b.parse_nw_anzahlen("a;b\n1;2\n")

    def test_st_features(self):
        pupils = b.pupils_from_st_features(ST_FEATURES, "2025/26")
        self.assertEqual(set(pupils), {"ST-STALA-1", "ST-STALA-3", "ST-STALA-4"})  # ohne Zahl: weg
        self.assertEqual(pupils["ST-STALA-1"]["pupils"], 57)
        self.assertEqual(pupils["ST-STALA-3"]["name"], "Ev. Grundschule")  # Leerzeichen am Ende
        self.assertEqual(pupils["ST-STALA-4"]["pupils"], 414)  # aus Text_Schuelerzahl
        self.assertAlmostEqual(pupils["ST-STALA-1"]["lat"], 51.8992679, places=6)
        self.assertEqual(pupils["ST-STALA-1"]["year"], "2025/26")

    def test_link_to_officials(self):
        officials = b.parse_matches_csv(MATCHES_CSV)["ST"]
        pupils = b.pupils_from_st_features(ST_FEATURES, "2025/26")
        # ST-STALA-4: kein gleichnamiger Eintrag im Abgleich
        self.assertEqual(b.link_to_officials(pupils, officials),
                         {"ST-STALA-1": "ST-ARC00001", "ST-STALA-3": "ST-ARC00002"})

    def test_link_needs_same_name(self):
        officials = {"ST-ARC00009": {"name": "Andere Schule", "lat": 51.8992679, "lon": 10.6580217}}
        pupils = b.pupils_from_st_features(ST_FEATURES[:1], None)
        self.assertEqual(b.link_to_officials(pupils, officials), {})

    def test_link_skips_officials_already_matched_by_id(self):
        officials = {"BY-0950": {"name": "Gymnasium Beispiel", "lat": 48.0, "lon": 11.0}}
        pupils = {"BY-0950": {"name": "Gymnasium Beispiel", "lat": 48.0, "lon": 11.0},
                  "BY-0951": {"name": "Gymnasium Beispiel", "lat": 48.0001, "lon": 11.0}}
        self.assertEqual(b.link_to_officials(pupils, officials), {})


class TestRobots(unittest.TestCase):
    def test_rules(self):
        rp = b.robots_parser(["User-agent: *", "Disallow: /BiPo/"])
        self.assertFalse(rp.can_fetch(b.USER_AGENT, "https://example.org/BiPo/OpenData/anzahlen.csv"))
        self.assertTrue(rp.can_fetch(b.USER_AGENT, "https://example.org/open-data"))
        self.assertTrue(b.robots_parser(status=404).can_fetch(b.USER_AGENT, "https://example.org/x"))
        self.assertFalse(b.robots_parser(status=503).can_fetch(b.USER_AGENT, "https://example.org/x"))
        # Sperre nur für bestimmte Crawler betrifft dieses Skript nicht
        rp = b.robots_parser(["User-agent: GPTBot", "Disallow: /", "", "User-agent: *", "Allow: /"])
        self.assertTrue(rp.can_fetch(b.USER_AGENT, "https://example.org/x"))

    def test_read_text_refuses_disallowed_url(self):
        root = "https://gesperrt.example"
        b._ROBOTS[root] = b.robots_parser(["User-agent: *", "Disallow: /"])
        try:
            with self.assertRaises(b.FetchRefused):
                b.read_text(f"{root}/daten.csv")
        finally:
            del b._ROBOTS[root]


class TestJedeSchule(unittest.TestCase):
    def test_fetch_ignores_repeated_pages(self):
        # Die API wiederholte bei skip > 0 zeitweise die erste Seite: keine Doppelten, kein Endlosloop
        page = json.dumps([{"id": "BB-1"}, {"id": "BB-2"}])
        with quiet() as log, mock.patch.object(b, "read_text", return_value=page) as read:
            schools = b.fetch_jedeschule("BB", page=2)
        self.assertEqual([s["id"] for s in schools], ["BB-1", "BB-2"])
        self.assertEqual(read.call_count, 2)
        self.assertIn("unvollständig", log.getvalue())

    def test_fetch_one_page_per_land(self):
        page = json.dumps([{"id": f"BY-{i}"} for i in range(3)])
        with mock.patch.object(b, "read_text", return_value=page) as read:
            schools = b.fetch_jedeschule("BY", include_raw=False)
        self.assertEqual(len(schools), 3)
        self.assertEqual(read.call_count, 1)
        self.assertIn("include_raw=false", read.call_args.args[0])

    def test_fetch_pages_if_needed(self):
        pages = {0: [{"id": "BY-1"}, {"id": "BY-2"}], 2: [{"id": "BY-3"}]}

        def fake(url):
            return json.dumps(pages[int(url.rsplit("skip=", 1)[1])])

        with mock.patch.object(b, "read_text", side_effect=fake) as read:
            schools = b.fetch_jedeschule("BY", page=2)
        self.assertEqual([s["id"] for s in schools], ["BY-1", "BY-2", "BY-3"])
        self.assertEqual(read.call_count, 2)


class TestBuild(unittest.TestCase):
    def test_build_land_berlin(self):
        officials = b.parse_matches_csv(MATCHES_CSV)["BE"]
        pupils = {f"BE-{k}": v for k, v in b.parse_be_svz(SVZ_HTML).items()}
        schools = b.build_land("BE", officials, pupils, "be-svz")
        by_id = {s["id"]: s for s in schools}
        self.assertEqual(by_id["BE-01G01"]["pupils"], 426)
        self.assertEqual(by_id["BE-01G01"]["osm"], ["way/1001"])
        self.assertEqual(by_id["BE-01G01"]["type"], "Grundschule")
        self.assertEqual(by_id["BE-08G12"]["osm"], [])
        # OSZ ohne Eintrag im Abgleich und ohne Lage: nicht zuordenbar
        self.assertNotIn("BE-01B01", by_id)

    def _files(self, tmp):
        csv_path = Path(tmp, "matches.csv")
        csv_path.write_text(MATCHES_CSV, encoding="utf-8")
        return csv_path, Path(tmp, "out")

    def test_main_with_local_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            svz = Path(tmp, "svz.html")
            svz.write_text(SVZ_HTML, encoding="utf-8")
            csv_path, out = self._files(tmp)
            with quiet():
                code = b.main(["--laender", "BE", "--be-svz", str(svz), "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            index = json.loads((out / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(index["laender"]["BE"]["schools"], 2)
            self.assertEqual(index["laender"]["BE"]["source"], "be-svz")
            self.assertIn("be-svz", index["sources"])
            data = json.loads((out / "BE.json").read_text(encoding="utf-8"))
            self.assertEqual(data["land"], "BE")
            self.assertEqual({s["id"] for s in data["schools"]}, {"BE-01G01", "BE-08G12"})

    def test_main_with_saved_csv_and_bom(self):
        with tempfile.TemporaryDirectory() as tmp:
            be_csv = Path(tmp, "berlin.csv")
            be_csv.write_text(SVZ_CSV, encoding="utf-8")
            csv_path = Path(tmp, "matches.csv")
            csv_path.write_text("﻿" + MATCHES_CSV, encoding="utf-8")  # echte Abgleichs-CSV hat ein BOM
            out = Path(tmp, "out")
            # --be-csv: früherer Name von --be-svz
            with quiet():
                code = b.main(["--laender", "BE", "--be-csv", str(be_csv), "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            data = json.loads((out / "BE.json").read_text(encoding="utf-8"))
            by_id = {s["id"]: s for s in data["schools"]}
            self.assertEqual(by_id["BE-01G01"]["pupils"], 426)
            self.assertEqual(by_id["BE-01G01"]["osm"], ["way/1001"])
            self.assertIn("gesicherten Abruf (berlin.csv)", data["sources"]["be-svz"]["note"])

    def test_main_reports_unavailable_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv_path, out = self._files(tmp)
            with quiet() as log:
                code = b.main(["--laender", "BE", "--be-svz", str(Path(tmp, "fehlt.html")),
                               "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 1)
            self.assertIn("--be-svz DATEI", log.getvalue())
            index = json.loads((out / "index.json").read_text(encoding="utf-8"))
            self.assertNotIn("BE", index["laender"])

    def test_main_nw_with_local_file_and_jedeschule_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv_path, out = self._files(tmp)
            anzahlen = Path(tmp, "anzahlen.csv")
            anzahlen.write_text(NW_CSV_SEP, encoding="utf-8")
            # NW-100039 kennt der Abgleich nicht: Lage kommt aus JedeSchule
            fallback = [{"id": "NW-100039", "name": "Förderschule Beispiel", "school_type": "Förderschule",
                         "latitude": 51.52, "longitude": 7.42}]
            with quiet(), mock.patch.object(b, "fetch_jedeschule", return_value=fallback) as fetch:
                code = b.main(["--laender", "NW", "--nw-anzahlen", str(anzahlen), "--nw-schuljahr", "2025/26",
                               "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            fetch.assert_called_once()
            self.assertFalse(fetch.call_args.kwargs["include_raw"])
            data = json.loads((out / "NW.json").read_text(encoding="utf-8"))
            by_id = {s["id"]: s for s in data["schools"]}
            self.assertEqual(by_id["NW-100015"]["pupils"], 312)
            self.assertEqual(by_id["NW-100015"]["osm"], ["way/3001"])
            self.assertEqual(by_id["NW-100015"]["year"], "2025/26")
            self.assertEqual(by_id["NW-100027"]["type"], "Gymnasium")
            self.assertEqual(by_id["NW-100039"]["lat"], 51.52)
            self.assertIn("nw-msb", data["sources"])

    def test_main_st_links_to_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv_path, out = self._files(tmp)
            with quiet(), mock.patch.object(b, "fetch_arcgis_features", return_value=ST_FEATURES):
                code = b.main(["--laender", "ST", "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            data = json.loads((out / "ST.json").read_text(encoding="utf-8"))
            by_id = {s["id"]: s for s in data["schools"]}
            self.assertEqual(by_id["ST-STALA-1"]["osm"], ["way/4001"])
            self.assertEqual(by_id["ST-STALA-1"]["pupils"], 57)
            self.assertEqual(by_id["ST-STALA-1"]["year"], "2025/26")
            self.assertEqual(by_id["ST-STALA-4"]["osm"], [])
            self.assertEqual(by_id["ST-STALA-4"]["type"], "Sekundarschule")

    def test_main_by_borrows_osm_from_older_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv_path, out = self._files(tmp)
            with quiet(), mock.patch.object(b, "fetch_jedeschule", return_value=BY_RECORDS):
                code = b.main(["--laender", "BY", "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            schools = json.loads((out / "BY.json").read_text(encoding="utf-8"))["schools"]
            self.assertEqual(len(schools), 1)  # ältere Kennung ohne Schülerzahl fällt weg
            self.assertEqual(schools[0]["id"], "BY-0950")
            self.assertEqual(schools[0]["osm"], ["way/5001"])
            self.assertEqual((schools[0]["pupils"], schools[0]["year"]), (1012, "2025/26"))

    def test_main_keeps_old_file_when_a_land_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv_path, out = self._files(tmp)
            svz = Path(tmp, "svz.csv")
            svz.write_text(SVZ_CSV, encoding="utf-8")
            with quiet():
                self.assertEqual(b.main(["--laender", "BE", "--be-svz", str(svz),
                                         "--matches-csv", str(csv_path), "--out", str(out)]), 0)
            before = (out / "BE.json").read_text(encoding="utf-8")
            # Quelle gesperrt (robots.txt): BE scheitert, NW läuft trotzdem, BE-Datei bleibt
            anzahlen = Path(tmp, "anzahlen.csv")
            anzahlen.write_text(NW_CSV_SEP, encoding="utf-8")
            refused = b.FetchRefused("https://www.bildungsstatistik.berlin.de/…: robots.txt")
            with quiet() as log, mock.patch.object(b, "parse_be_svz", side_effect=refused), \
                    mock.patch.object(b, "fetch_jedeschule", return_value=[]):
                code = b.main(["--laender", "BE,NW", "--nw-anzahlen", str(anzahlen),
                               "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 1)
            self.assertIn("--be-svz", log.getvalue())
            self.assertEqual((out / "BE.json").read_text(encoding="utf-8"), before)
            index = json.loads((out / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(set(index["laender"]), {"BE", "NW"})
            self.assertIn("be-svz", index["sources"])
            # Läuft später nur NW, bleibt BE im Index
            with quiet(), mock.patch.object(b, "fetch_jedeschule", return_value=[]):
                b.main(["--laender", "NW", "--nw-anzahlen", str(anzahlen),
                        "--matches-csv", str(csv_path), "--out", str(out)])
            index = json.loads((out / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(set(index["laender"]), {"BE", "NW"})

    def test_unknown_land(self):
        with quiet(), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            b.main(["--laender", "BW"])


if __name__ == "__main__":
    unittest.main()
