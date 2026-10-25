"""Tests mit kleinen Beispieldaten (ohne Netz):

    python3 -m unittest discover -s preprocessing/schuelerzahlen
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

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

MATCHES_CSV = """bundesland,category,official_id,official_name,official_lat,official_lon,official_school_type,osm_type,osm_id
BE,matched,BE-01G01,Grundschule am Arkonaplatz,52.5373,13.4011,Grundschule,way,1001
BE,official_only,BE-08G12,Jenaplanschule Neukölln (Grundschule),52.47,13.44,Grundschule,,
BE,match_ambiguous,,,,,,way,1002
BE,osm_only,,,,,,node,1003
BB,matched,BB-111430,Grundschule Beispiel,52.4,13.06,Grundschule,node,2001
"""

# Gespeicherter Abruf von SVZ_Fakt5 (wie berlin_schuelerzahlen_2024-25.csv)
BE_CSV = """Schuljahr;BSN;Bezirk_Nr;Name;Schueler_gesamt;Schueler_w;Schueler_m;Lehrkraefte_gesamt;Lehrkraefte_w;Lehrkraefte_m
2024/25;01B01;01;OSZ Banken, Immobilien und Versicherungen;1603;642;961;76;41;35
2024/25;01G01;01;Grundschule am Arkonaplatz;426;191;235;;;
2024/25;08G12;08;Jenaplanschule Neukölln (Grundschule);296;128;168;;;
"""


class TestParse(unittest.TestCase):
    def test_be_svz(self):
        rows = b.parse_be_svz(SVZ_HTML)
        self.assertEqual(rows["01G01"], {"pupils": 426, "year": "2024/25"})
        self.assertEqual(rows["01B01"]["pupils"], 1603)  # Tausenderpunkt
        self.assertEqual(rows["08G12"]["pupils"], 296)
        self.assertEqual(len(rows), 3)

    def test_be_svz_without_header_fails(self):
        with self.assertRaises(ValueError):
            b.parse_be_svz("<table><tr><td>x</td></tr></table>")

    def test_be_csv(self):
        rows = b.parse_be_csv(BE_CSV)
        self.assertEqual(rows["01G01"], {"pupils": 426, "year": "2024/25"})
        self.assertEqual(rows["01B01"]["pupils"], 1603)
        self.assertEqual(set(rows), {"01B01", "01G01", "08G12"})

    def test_be_csv_without_columns_fails(self):
        with self.assertRaises(ValueError):
            b.parse_be_csv("Schuljahr;Schule;Anzahl\n2024/25;x;1\n")

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
        self.assertEqual(b.pupils_from_raw("BY", {"schueler": 259, "schuljahr": "2025/26"}), (259, "2025/26"))
        self.assertEqual(b.pupils_from_raw("BB", {}), (None, None))


class TestJedeSchule(unittest.TestCase):
    def test_fetch_ignores_repeated_pages(self):
        # Die API wiederholte bei skip > 0 die erste Seite: keine Doppelten, kein Endlosloop
        page = [{"id": "BB-1"}, {"id": "BB-2"}]
        calls = []

        def fake_read_text(url):
            calls.append(url)
            return json.dumps(page)

        original = b.read_text
        b.read_text = fake_read_text
        try:
            schools = b.fetch_jedeschule("BB", page=2)
        finally:
            b.read_text = original
        self.assertEqual([s["id"] for s in schools], ["BB-1", "BB-2"])
        self.assertEqual(len(calls), 2)


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

    def test_main_with_local_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            svz = Path(tmp, "svz.html")
            svz.write_text(SVZ_HTML, encoding="utf-8")
            csv_path = Path(tmp, "matches.csv")
            csv_path.write_text(MATCHES_CSV, encoding="utf-8")
            out = Path(tmp, "out")
            code = b.main(["--laender", "BE", "--be-svz", str(svz), "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            index = json.loads((out / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(index["laender"]["BE"]["schools"], 2)
            self.assertIn("be-svz", index["sources"])
            data = json.loads((out / "BE.json").read_text(encoding="utf-8"))
            self.assertEqual(data["land"], "BE")
            self.assertEqual({s["id"] for s in data["schools"]}, {"BE-01G01", "BE-08G12"})

    def test_main_with_be_csv_and_bom(self):
        with tempfile.TemporaryDirectory() as tmp:
            be_csv = Path(tmp, "berlin.csv")
            be_csv.write_text(BE_CSV, encoding="utf-8")
            csv_path = Path(tmp, "matches.csv")
            csv_path.write_text("﻿" + MATCHES_CSV, encoding="utf-8")
            out = Path(tmp, "out")
            code = b.main(["--laender", "BE", "--be-csv", str(be_csv), "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            data = json.loads((out / "BE.json").read_text(encoding="utf-8"))
            by_id = {s["id"]: s for s in data["schools"]}
            self.assertEqual(by_id["BE-01G01"]["pupils"], 426)
            self.assertEqual(by_id["BE-01G01"]["osm"], ["way/1001"])
            self.assertIn("gespeicherten Abruf", data["sources"]["be-svz"]["note"])

    def test_main_skips_unavailable_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp, "matches.csv")
            csv_path.write_text(MATCHES_CSV, encoding="utf-8")
            out = Path(tmp, "out")
            code = b.main(["--laender", "BE", "--be-svz", str(Path(tmp, "fehlt.html")),
                           "--matches-csv", str(csv_path), "--out", str(out)])
            self.assertEqual(code, 0)
            index = json.loads((out / "index.json").read_text(encoding="utf-8"))
            self.assertNotIn("BE", index["laender"])


if __name__ == "__main__":
    unittest.main()
