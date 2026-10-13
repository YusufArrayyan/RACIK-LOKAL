"""Uji otomatis RACIK-LOKAL V2.

Jalankan dari folder proyek:  python -m unittest tests/test_system.py
Setiap uji memakai basis data sementara agar data contoh tidak berubah.
"""
import json
import os
import sqlite3
import tempfile
import unittest
import warnings

warnings.filterwarnings("ignore")
_tmp = tempfile.mkdtemp()
os.environ["RACIK_DB_PATH"] = os.path.join(_tmp, "uji.db")
os.environ.setdefault("RACIK_KUNCI_DATA", "a2V5LXVqaS1yYWNpay1sb2thbC0zMi1ieXRlcy1hYmM=")

from fastapi.testclient import TestClient  # noqa: E402

from app import services  # noqa: E402
from app.claim_engine import evaluasi_klaim, tandai_penyumbang  # noqa: E402
from app.database import DB_PATH, get_connection  # noqa: E402
from app.main import app  # noqa: E402
from app.optimizer import solve_racik  # noqa: E402
from app.seed_data import SANDI_DEMO  # noqa: E402

TARGET = {"energi": 140, "protein": 6.5, "zat_besi": 2.5, "folat": 28, "vitamin_c": 6.5, "kalsium": 100, "seng": 0.9}


def bahan(i, nama, harga, atas, **gizi):
    return {"id": i, "nama": nama, "harga_per_kg": harga, "batas_bawah": 0, "batas_atas": atas, "dikunci": False,
            "gizi": {k: gizi.get(k) for k in TARGET}}


DASAR = [
    bahan(1, "Tempe", 38000, 60, energi=431, protein=46.5, zat_besi=9, folat=160, vitamin_c=0, kalsium=347, seng=4.2),
    bahan(2, "Kelor", 90000, 9, energi=205, protein=27, zat_besi=28, folat=300, vitamin_c=17, kalsium=2003, seng=3.3),
    bahan(3, "Mokaf", 15000, 60, energi=363, protein=1.2, zat_besi=1.1, folat=10, vitamin_c=0, kalsium=33, seng=0.4),
    bahan(4, "Jeruk nipis", 160000, 3.5, energi=300, protein=3, zat_besi=1.5, folat=30, vitamin_c=160, kalsium=120, seng=0.6),
]


class TestMesinRacik(unittest.TestCase):
    def test_solusi_memenuhi_kendala(self):
        h = solve_racik(DASAR, TARGET, 40, 2500)
        self.assertTrue(h["berhasil"], h.get("ringkasan"))
        self.assertAlmostEqual(sum(k["persen"] for k in h["komposisi"]), 100, places=1)
        for k in h["komposisi"]:
            self.assertLessEqual(k["persen"], k["batas_atas"] + 1e-6)
        for z in ("energi", "protein", "zat_besi", "folat", "kalsium"):  # zat gizi wajib
            self.assertGreaterEqual(h["gizi"][z]["per_sajian"], TARGET[z] - 1e-6, z)
        self.assertLessEqual(h["biaya"], 2500 + 1e-6)
        self.assertLess(h["waktu_ms"], 2000)  # PRD bagian 10

    def test_zat_lunak_kurang_dijelaskan_sebabnya(self):
        h = solve_racik(DASAR, TARGET, 40, 2500)
        self.assertFalse(h["gizi"]["vitamin_c"]["cukup"])
        sebab = h["sebab_kurang"][0]
        self.assertIn("jeruk nipis", sebab["teks"])
        self.assertEqual(sebab["aksi"]["bahan_id"], 4)

    def test_tanpa_solusi_menampilkan_kendala_dan_saran(self):
        h = solve_racik(DASAR, TARGET, 40, 500)  # biaya terlalu rendah
        self.assertFalse(h["berhasil"])
        self.assertTrue(any(s["jenis"] == "biaya" for s in h["saran"]))

    def test_batas_bawah_lebih_dari_100(self):
        b = [dict(x, batas_bawah=40) for x in DASAR[:3]]
        h = solve_racik(b, TARGET, 40, None)
        self.assertFalse(h["berhasil"])
        self.assertIn("batas bawah", h["ringkasan"])

    def test_bahan_dikunci(self):
        b = [dict(x) for x in DASAR]
        b[2] = dict(b[2], batas_bawah=30, dikunci=True)
        h = solve_racik(b, TARGET, 40, 3000)
        mokaf = next(k for k in h["komposisi"] if k["bahan_id"] == 3)
        self.assertAlmostEqual(mokaf["persen"], 30, places=3)

    def test_nilai_tidak_diketahui_bukan_nol_diam_diam(self):
        b = [dict(x) for x in DASAR]
        b[2] = dict(b[2], gizi=dict(b[2]["gizi"], folat=None))
        h = solve_racik(b, TARGET, 40, 3000)
        if any(k["bahan_id"] == 3 and k["persen"] > 0.01 for k in h["komposisi"]):
            self.assertIn("Mokaf", h["gizi"]["folat"]["tanpa_data"])

    def test_faktor_koreksi_menurunkan_kandungan(self):
        a = solve_racik(DASAR, TARGET, 40, 4000)
        b = solve_racik(DASAR, TARGET, 40, 4000, koreksi={"zat_besi": 0.85})
        self.assertGreaterEqual(b["gizi"]["zat_besi"]["per_sajian"], TARGET["zat_besi"] - 1e-6)
        self.assertGreaterEqual(b["biaya"], a["biaya"] - 1e-6)


class TestPenjagaKlaim(unittest.TestCase):
    ACUAN = {z: {"nilai_alg": alg, "ambang_sumber": 15, "ambang_tinggi": 30, "dokumen_rujukan": "uji"}
             for z, alg in {"zat_besi": 22, "folat": 400, "kalsium": 1100, "seng": 13, "vitamin_c": 90, "protein": 60}.items()}

    def _hasil(self, fe_per100):
        g = {z: {"per_100g": 0.0, "per_sajian": 0.0} for z in TARGET}
        g["zat_besi"] = {"per_100g": fe_per100, "per_sajian": fe_per100 * 0.4}
        return {"gizi": g, "komposisi": [{"bahan_id": 1, "nama": "Kelor", "di_batas_atas": False, "dikunci": False, "batas_atas": 9}]}

    def test_ambang_sumber_dan_tinggi(self):
        h = tandai_penyumbang(self._hasil(6.5), [DASAR[1]])  # 29,5% ALG
        k = {(x["jenis"], x["zat_gizi"]): x for x in evaluasi_klaim(h, self.ACUAN)}
        self.assertTrue(k[("Sumber", "zat_besi")]["lolos"])
        self.assertFalse(k[("Tinggi", "zat_besi")]["lolos"])
        self.assertIn("klaim Sumber zat besi saja", k[("Tinggi", "zat_besi")]["saran"])

    def test_ambang_dibaca_dari_data(self):
        acuan = {z: dict(v, ambang_sumber=40, ambang_tinggi=60) for z, v in self.ACUAN.items()}
        h = tandai_penyumbang(self._hasil(6.5), [DASAR[1]])
        k = {(x["jenis"], x["zat_gizi"]): x for x in evaluasi_klaim(h, acuan)}
        self.assertFalse(k[("Sumber", "zat_besi")]["lolos"])


class TestTakaranTerdekat(unittest.TestCase):
    TAKARAN = [{"nama_takaran": "sdt peres", "berat_gram": 1.2}, {"nama_takaran": "sdm peres", "berat_gram": 3.6},
               {"nama_takaran": "sdm munjung", "berat_gram": 6.0}, {"nama_takaran": "gelas belimbing", "berat_gram": 50.0}]

    def test_pas_satu_takaran(self):
        t = services.takaran_terdekat(3.6, self.TAKARAN)
        self.assertEqual(t["teks"], "1 sdm peres")
        self.assertFalse(t["kurang_dari"])

    def test_pecahan_sederhana(self):
        self.assertEqual(services.takaran_terdekat(5.4, self.TAKARAN)["teks"], "1½ sdm peres")
        self.assertEqual(services.takaran_terdekat(25, self.TAKARAN)["teks"], "½ gelas belimbing")
        self.assertEqual(services.teks_pecahan(0.25), "¼")
        self.assertEqual(services.teks_pecahan(2.75), "2¾")
        self.assertEqual(services.teks_pecahan(3.0), "3")

    def test_memilih_takaran_paling_dekat(self):
        # 2,4 g: 2 sdt peres tepat, ⅔ sdm peres tidak bisa ditulis sederhana.
        t = services.takaran_terdekat(2.4, self.TAKARAN)
        self.assertEqual(t["nama_takaran"], "sdt peres")
        self.assertAlmostEqual(t["gram_takaran"], 2.4)

    def test_terlalu_sedikit_dan_tanpa_data(self):
        self.assertEqual(services.takaran_terdekat(0.1, self.TAKARAN)["teks"], "kurang dari ¼ sdt peres")
        self.assertIsNone(services.takaran_terdekat(3.6, []))
        self.assertIsNone(services.takaran_terdekat(0, self.TAKARAN))


class TestAlurApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = TestClient(app)
        cls.c.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.c.__exit__(None, None, None)

    def masuk(self, surel):
        self.c.post("/api/auth/keluar")
        r = self.c.post("/api/auth/login", json={"surel": surel, "kata_sandi": SANDI_DEMO})
        self.assertEqual(r.status_code, 200, r.text)

    def test_01_sandi_salah_ditolak(self):
        r = self.c.post("/api/auth/login", json={"surel": "dewi@contoh.id", "kata_sandi": "salah"})
        self.assertEqual(r.status_code, 401)
        self.assertIn("pesan", r.json())

    def test_02_hak_akses_per_peran(self):
        self.masuk("dewi@contoh.id")
        self.assertEqual(self.c.get("/api/pilot").status_code, 403)
        self.assertEqual(self.c.post("/api/bahan", json={}).status_code, 403)
        self.masuk("rian@contoh.id")
        self.assertEqual(self.c.get("/api/pilot").status_code, 200)

    def test_03_alur_formula_lengkap(self):
        self.masuk("dewi@contoh.id")
        fid = self.c.post("/api/formula", json={"nama": "Uji camilan 40 g"}).json()["id"]
        d = self.c.post(f"/api/formula/{fid}/racik").json()
        self.assertTrue(d["hasil"]["berhasil"], d["hasil"]["ringkasan"])
        gagal = [f"{k['jenis']}:{k['zat_gizi']}" for k in d["klaim"] if not k["lolos"]]
        lolos = [f"{k['jenis']}:{k['zat_gizi']}" for k in d["klaim"] if k["lolos"]]
        rina = next(p["id"] for p in self.c.get("/api/referensi").json()["peninjau"] if p["nama"] == "Rina Mardiani")
        if gagal:  # FR-33: klaim yang belum lolos tidak bisa diajukan
            r = self.c.post(f"/api/formula/{fid}/ajukan", json={"peninjau_id": rina, "klaim": gagal[:1]})
            self.assertEqual(r.status_code, 422)
        r = self.c.post(f"/api/formula/{fid}/ajukan", json={"peninjau_id": rina, "klaim": lolos})
        self.assertEqual(r.json()["status"], "Ditinjau")

        self.masuk("rina@contoh.id")
        bid = d["batas"][0]["bahan_id"]
        tanpa_alasan = {"keputusan": "Perlu revisi", "catatan": "Coba batas baru",
                        "batas": [{"bahan_id": bid, "batas_bawah": 0, "batas_atas": 7}]}
        self.assertEqual(self.c.post(f"/api/formula/{fid}/tinjau", json=tanpa_alasan).status_code, 422)
        tanpa_alasan["batas"][0]["alasan"] = "Uji rasa"
        r = self.c.post(f"/api/formula/{fid}/tinjau", json=tanpa_alasan).json()
        self.assertEqual(r["status"], "Perlu revisi")
        self.assertEqual(r["langkah_terakhir"], 1)  # FR-42: kembali ke Racik

        self.masuk("dewi@contoh.id")
        d2 = self.c.post(f"/api/formula/{fid}/racik").json()
        self.assertEqual(d2["versi"], 2)
        self.assertEqual(self.c.get(f"/api/formula/{fid}/banding?a=1&b=2").status_code, 200)

    def test_04_hasil_bisa_dihitung_ulang_dari_versi(self):
        """PRD bagian 10, keterujian."""
        conn = get_connection()
        v = conn.execute("SELECT * FROM versi_formula WHERE berhasil = 1 ORDER BY id LIMIT 1").fetchone()
        conn.close()
        s = json.loads(v["sasaran_json"])
        data = {b["id"]: b for b in json.loads(v["data_bahan_json"])}
        bahan_v = [dict(data[k["id"]], **{x: k[x] for x in ("batas_bawah", "batas_atas", "dikunci")}) for k in json.loads(v["kendala_json"])]
        h = solve_racik(bahan_v, s["target"], s["berat_sajian"], s.get("biaya_maks"), retensi=s.get("retensi"),
                        koreksi={k: x["faktor"] for k, x in s.get("koreksi", {}).items()}, jenis=s.get("jenis"))
        self.assertAlmostEqual(h["biaya"], v["biaya"], places=1)

    def test_05_hb_tersimpan_terenkripsi_dan_butuh_persetujuan_wali(self):
        self.masuk("rian@contoh.id")
        r = self.c.post("/api/pilot/1/peserta", json={"kode": "P-900", "kelompok": "Curup", "persetujuan_wali": False, "hb_minggu_0": 11})
        self.assertEqual(r.status_code, 422)
        r = self.c.post("/api/pilot/1/peserta", json={"kode": "P-901", "kelompok": "Curup", "persetujuan_wali": True, "hb_minggu_0": 11.7})
        self.assertEqual(r.status_code, 200)
        raw = sqlite3.connect(DB_PATH).execute("SELECT hb_minggu_0 FROM peserta WHERE kode = 'P-901'").fetchone()[0]
        self.assertNotIn("11.7", raw)
        ps = next(p for p in self.c.get("/api/pilot/1/ringkasan").json()["peserta"] if p["kode"] == "P-901")
        self.assertEqual(ps["hb_minggu_0"], 11.7)

    def test_06_peringatan_lab_dan_revisi_batas(self):
        self.masuk("rian@contoh.id")
        p = self.c.get("/api/pilot/1/ringkasan").json()
        lab = [w for w in p["peringatan"] if w["jenis"] == "lab"]
        self.assertTrue(lab)
        r = self.c.post(f"/api/pilot/1/batch/{lab[0]['batch_id']}/jadikan-batas")
        self.assertEqual(r.status_code, 200)
        self.assertLess(r.json()["faktor"], 1)
        self.masuk("dewi@contoh.id")
        f = self.c.get(f"/api/formula/{r.json()['formula_id']}").json()
        self.assertEqual(f["status"], "Perlu revisi")
        self.assertIn("zat_besi", f["koreksi"])

    def test_07_data_lebih_dari_12_bulan_ditandai(self):
        self.assertTrue(services.perlu_diperbarui("2020-01-01"))
        self.masuk("dewi@contoh.id")
        daftar = self.c.get("/api/bahan").json()["bahan"]
        self.assertTrue(any(b["perlu_diperbarui"] for b in daftar))

    def test_08_galat_validasi_berbahasa_indonesia(self):
        self.masuk("rian@contoh.id")
        r = self.c.post("/api/pilot/1/batch", json={"kode": "B-99", "tanggal": "2026-10-01", "umkm": "x", "jumlah_sajian": "abc"})
        self.assertEqual(r.status_code, 422)
        self.assertIn("angka", r.json()["pesan"])

    def test_09_takaran_rumah_tangga(self):
        self.masuk("dewi@contoh.id")
        kelor = next(b for b in self.c.get("/api/bahan?q=kelor").json()["bahan"])
        d = self.c.get(f"/api/bahan/{kelor['id']}").json()
        self.assertTrue(any(t["nama_takaran"] == "sdm peres" for t in d["takaran"]))
        baru = [{"nama_takaran": "sdm peres", "berat_gram": 4.0, "sumber": "Hasil timbang", "tanggal_data": "2026-10-01"}]
        self.assertEqual(self.c.put(f"/api/bahan/{kelor['id']}/takaran", json={"takaran": baru}).status_code, 403)

        self.masuk("rina@contoh.id")
        dobel = baru + [{"nama_takaran": "SDM  peres", "berat_gram": 5, "sumber": "x", "tanggal_data": "2026-10-01"}]
        r = self.c.put(f"/api/bahan/{kelor['id']}/takaran", json={"takaran": dobel})
        self.assertEqual(r.status_code, 422)
        self.assertIn("dua kali", r.json()["pesan"])
        r = self.c.put(f"/api/bahan/{kelor['id']}/takaran", json={"takaran": baru}).json()
        self.assertEqual([t["nama_takaran"] for t in r["takaran"]], ["sdm peres"])
        riwayat = {x["kolom"]: x for x in self.c.get(f"/api/bahan/{kelor['id']}").json()["riwayat"]}
        self.assertEqual(riwayat["takaran:sdm peres"]["nilai_baru"], "4 g (Hasil timbang)")
        self.assertEqual(riwayat["takaran:sdt peres"]["nilai_baru"], "dihapus")

        # Formula menampilkan padanan takaran, tetapi gram dan gizi tidak berubah.
        self.masuk("dewi@contoh.id")
        f = next(x for x in self.c.get("/api/formula").json()["formula"] if x["nama"].startswith("Camilan batang"))
        d = self.c.get(f"/api/formula/{f['id']}").json()
        k = next(k for k in d["hasil"]["komposisi"] if k["bahan_id"] == kelor["id"])
        if k["gram"] >= 0.05:
            self.assertIn("sdm peres", k["takaran"]["teks"])
        csv = self.c.get(f"/api/ekspor/formula/{f['id']}.csv").text
        self.assertIn("Takaran rumah tangga (perkiraan)", csv)

    def test_10_foto_bahan_dan_panduan(self):
        self.masuk("dewi@contoh.id")
        daftar = self.c.get("/api/bahan").json()["bahan"]
        self.assertTrue(all(b["foto"] for b in daftar))
        d = self.c.get(f"/api/bahan/{daftar[0]['id']}").json()
        self.assertIn("Wikimedia Commons", d["foto_kredit"])
        self.assertTrue(d["foto_sumber"].startswith("https://commons.wikimedia.org/"))
        self.assertEqual(self.c.get(d["foto"]).status_code, 200)
        self.assertTrue(all(b["foto"] for b in self.c.get("/api/contoh").json()["bahan"]))
        for berkas in ("panduan-racik-lokal.pdf", "video-panduan.webm", "video-poster.jpg"):
            self.assertEqual(self.c.get(f"/static/panduan/{berkas}").status_code, 200, berkas)


if __name__ == "__main__":
    unittest.main()
