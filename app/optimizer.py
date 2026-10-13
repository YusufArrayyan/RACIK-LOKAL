"""Mesin Racik: pemrograman linear sesuai PRD V2 bagian 7.

Variabel x_i adalah bagian bahan i dalam satu sajian (persen berat).
  N_j = r_j * S * sum_i(x_i * a_ij / 100) / 100      kandungan zat gizi j per sajian
  C   = S * sum_i(x_i * h_i / 100 / 1000)            biaya bahan per sajian
  sum_i x_i = 100,  L_i <= x_i <= U_i
  zat gizi wajib:  N_j >= T_j
  zat gizi lunak:  N_j + s_j >= T_j,  s_j >= 0
  minimalkan C + sum_j(w * s_j / T_j),  dengan C <= biaya maksimal
Bila beberapa komposisi sama murah, tahap kedua memilih yang paling dekat
dengan versi sebelumnya (PRD 7.3).
"""
import math
import time
from typing import Optional

import numpy as np
from scipy.optimize import linprog

from app.database import ZAT_GIZI

# Bobot hukuman kekurangan zat gizi lunak, dalam rupiah per 100% kekurangan.
# Jauh di atas biaya bahan per sajian, sehingga kekurangan hanya muncul bila tidak terhindarkan.
BOBOT_KEKURANGAN = 1_000_000.0
TOL = 1e-6


def _fmt(v: float, d: int = 1) -> str:
    s = f"{v:,.{d}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def _rp(v: float) -> str:
    return "Rp" + f"{round(v):,}".replace(",", ".")


class _Model:
    """Menyusun matriks LP dari daftar bahan dan sasaran."""

    def __init__(self, bahan, sasaran, berat, biaya_maks, retensi, jenis):
        self.bahan = bahan
        self.n = len(bahan)
        self.S = berat
        self.biaya_maks = biaya_maks
        self.sasaran = {k: v for k, v in sasaran.items() if v and v > 0}
        self.retensi = retensi
        self.wajib = [k for k in self.sasaran if jenis.get(k, "wajib") == "wajib"]
        self.lunak = [k for k in self.sasaran if jenis.get(k, "wajib") == "lunak"]
        self.biaya_per_pct = np.array([self.S * b["harga_per_kg"] / 100 / 1000 for b in bahan])

    def koef(self, zat):
        """Kontribusi 1% bahan i terhadap zat gizi per sajian."""
        r = self.retensi.get(zat, 1.0)
        return np.array([r * self.S * (b["gizi"].get(zat) or 0.0) / 100 / 100 for b in self.bahan])

    def bounds(self, override=None):
        out = []
        for i, b in enumerate(self.bahan):
            lo, hi = float(b["batas_bawah"]), float(b["batas_atas"])
            if b.get("dikunci"):
                hi = lo
            if override and i in override:
                lo, hi = override[i]
            out.append((lo, hi))
        return out

    def solve(self, *, drop_wajib=None, drop_budget=False, bounds_override=None, prev=None):
        n, m = self.n, len(self.lunak)
        c = np.concatenate([self.biaya_per_pct, [BOBOT_KEKURANGAN / self.sasaran[k] for k in self.lunak]])
        A_ub, b_ub = [], []
        for k in self.wajib:
            if k == drop_wajib:
                continue
            A_ub.append(np.concatenate([-self.koef(k), np.zeros(m)]))
            b_ub.append(-self.sasaran[k])
        for j, k in enumerate(self.lunak):
            row = np.concatenate([-self.koef(k), np.zeros(m)])
            row[n + j] = -1.0
            A_ub.append(row)
            b_ub.append(-self.sasaran[k])
        if self.biaya_maks and not drop_budget:
            A_ub.append(np.concatenate([self.biaya_per_pct, np.zeros(m)]))
            b_ub.append(self.biaya_maks)
        A_eq = np.concatenate([np.ones(n), np.zeros(m)]).reshape(1, -1)
        bnds = self.bounds(bounds_override) + [(0, None)] * m
        res = linprog(c, A_ub=np.array(A_ub) if A_ub else None, b_ub=np.array(b_ub) if b_ub else None,
                      A_eq=A_eq, b_eq=[100.0], bounds=bnds, method="highs")
        if not res.success or prev is None:
            return res
        # Tahap kedua: pertahankan biaya optimal, dekatkan ke versi sebelumnya.
        p = np.array([prev.get(b["id"], 0.0) for b in self.bahan])
        nv = n + m
        c2 = np.concatenate([np.zeros(nv), np.ones(n)])
        A2 = [np.concatenate([r, np.zeros(n)]) for r in A_ub]
        b2 = list(b_ub)
        A2.append(np.concatenate([c, np.zeros(n)]))
        b2.append(res.fun + max(1e-7 * abs(res.fun), 1e-6))
        for i in range(n):
            r1 = np.zeros(nv + n); r1[i] = 1; r1[nv + i] = -1       # x_i - d_i <= p_i
            r2 = np.zeros(nv + n); r2[i] = -1; r2[nv + i] = -1      # -x_i - d_i <= -p_i
            A2 += [r1, r2]
            b2 += [p[i], -p[i]]
        A_eq2 = np.concatenate([A_eq, np.zeros((1, n))], axis=1)
        res2 = linprog(c2, A_ub=np.array(A2), b_ub=np.array(b2), A_eq=A_eq2, b_eq=[100.0],
                       bounds=bnds + [(0, None)] * n, method="highs")
        if res2.success:
            res2.x = res2.x[:nv]
            res2.fun = res.fun
            return res2
        return res

    def max_achievable(self, zat, drop_budget=True):
        """Kandungan tertinggi zat gizi yang bisa dicapai dalam batas bahan."""
        A_ub, b_ub = None, None
        if self.biaya_maks and not drop_budget:
            A_ub, b_ub = [self.biaya_per_pct], [self.biaya_maks]
        res = linprog(-self.koef(zat), A_ub=A_ub, b_ub=b_ub, A_eq=np.ones((1, self.n)), b_eq=[100.0],
                      bounds=self.bounds(), method="highs")
        return -res.fun if res.success else 0.0


def solve_racik(bahan: list, sasaran: dict, berat_sajian: float, biaya_maks: Optional[float] = None,
                retensi: Optional[dict] = None, koreksi: Optional[dict] = None,
                jenis: Optional[dict] = None, sebelumnya: Optional[dict] = None) -> dict:
    """Jalankan Mesin Racik.

    bahan: [{id, nama, harga_per_kg, gizi: {zat: nilai per 100 g atau None}, batas_bawah, batas_atas, dikunci}]
    sasaran: {zat: target per sajian}
    koreksi: faktor dari uji lab yang dikalikan ke retensi (PRD 7.3); data sumber tidak diubah.
    sebelumnya: {bahan_id: persen} dari versi sebelumnya untuk memecah hasil yang sama murah.
    """
    t0 = time.perf_counter()
    jenis = jenis or {k: v["jenis"] for k, v in ZAT_GIZI.items()}
    r_eff = {}
    for k, meta in ZAT_GIZI.items():
        r_eff[k] = (retensi or {}).get(k, meta["retensi"]) * (koreksi or {}).get(k, 1.0)

    if not bahan:
        return _gagal(t0, "Belum ada bahan yang dipilih.", [], [
            {"jenis": "bahan", "teks": "Pilih minimal dua bahan di Pengaturan lanjutan pada langkah Sasaran."}])

    model = _Model(bahan, sasaran, berat_sajian, biaya_maks, r_eff, jenis)

    total_bawah = sum(lo for lo, _ in model.bounds())
    total_atas = sum(hi for _, hi in model.bounds())
    if total_bawah > 100 + TOL:
        return _gagal(t0, f"Jumlah batas bawah bahan {_fmt(total_bawah)}%, lebih dari 100%.",
                      [{"kendala": "Jumlah batas bawah", "rincian": f"{_fmt(total_bawah)}% dari maksimal 100%"}],
                      [{"jenis": "batas", "teks": "Turunkan batas bawah atau buka kunci beberapa bahan."}])
    if total_atas < 100 - TOL:
        return _gagal(t0, f"Jumlah batas atas bahan hanya {_fmt(total_atas)}%, kurang dari 100%.",
                      [{"kendala": "Jumlah batas atas", "rincian": f"{_fmt(total_atas)}% dari minimal 100%"}],
                      [{"jenis": "batas", "teks": "Naikkan batas atas beberapa bahan, atau tambahkan bahan lain."}])

    res = model.solve(prev=sebelumnya)
    if not res.success:
        return _diagnosa(t0, model)

    x = np.clip(res.x[:model.n], 0, 100)
    return _hasil(t0, model, x)


def _gagal(t0, pesan, konflik, saran):
    return {
        "berhasil": False,
        "ringkasan": pesan,
        "konflik": konflik,
        "saran": saran,
        "waktu_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


def _diagnosa(t0, model: _Model) -> dict:
    """FR-26: cari kendala yang berkonflik dan uji pelonggaran satu per satu."""
    konflik, saran = [], []
    for k in model.wajib:
        meta = ZAT_GIZI[k]
        maks_batas = model.max_achievable(k, drop_budget=True)
        maks_biaya = model.max_achievable(k, drop_budget=False) if model.biaya_maks else maks_batas
        if maks_batas + TOL < model.sasaran[k]:
            konflik.append({"kendala": f"Sasaran {meta['nama_kecil']}",
                            "rincian": f"butuh {_fmt(model.sasaran[k])} {meta['satuan']}, batas bahan hanya memungkinkan "
                                       f"{_fmt(maks_batas)} {meta['satuan']}"})
        elif maks_biaya + TOL < model.sasaran[k]:
            konflik.append({"kendala": f"Sasaran {meta['nama_kecil']} dan batas biaya",
                            "rincian": f"dengan biaya maksimal {_rp(model.biaya_maks)}, paling tinggi "
                                       f"{_fmt(maks_biaya)} {meta['satuan']}"})

    # Uji pelonggaran satu per satu.
    if model.biaya_maks:
        r = model.solve(drop_budget=True)
        if r.success:
            biaya = float(np.dot(model.biaya_per_pct, r.x[:model.n]))
            saran.append({"jenis": "biaya", "nilai": math.ceil(biaya / 50) * 50,
                          "teks": f"Naikkan biaya maksimal menjadi {_rp(math.ceil(biaya / 50) * 50)} per sajian."})
    for k in model.wajib:
        r = model.solve(drop_wajib=k)
        if r.success:
            saran.append({"jenis": "sasaran", "zat_gizi": k,
                          "teks": f"Turunkan sasaran {ZAT_GIZI[k]['nama_kecil']}, atau jadikan sasaran ini lunak."})
    for i, b in enumerate(model.bahan):
        lo, hi = model.bounds()[i]
        if hi < 100 - TOL:
            r = model.solve(bounds_override={i: (0.0 if b.get("dikunci") else lo, 100.0)})
            if r.success:
                perlu = math.ceil(r.x[i] * 2) / 2
                kata = "Buka kunci" if b.get("dikunci") else "Naikkan batas atas"
                saran.append({"jenis": "batas", "bahan_id": b["id"], "nilai": perlu,
                              "teks": f"{kata} {b['nama'].lower()} menjadi {_fmt(perlu)}%."})

    if not saran:
        saran.append({"jenis": "bahan",
                      "teks": "Tidak ada satu kendala yang cukup dilonggarkan sendirian. Tambahkan bahan yang lebih kaya "
                              "zat gizi yang kurang, atau longgarkan dua kendala sekaligus."})
    nama = konflik[0]["kendala"].lower() if konflik else "kombinasi batas bahan dan biaya"
    return {
        "berhasil": False,
        "ringkasan": f"Belum ada komposisi yang memenuhi semua syarat. Penghambat utama: {nama}.",
        "konflik": konflik,
        "saran": saran,
        "waktu_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


def _hasil(t0, model: _Model, x: np.ndarray) -> dict:
    S = model.S
    biaya = float(np.dot(model.biaya_per_pct, x))
    komposisi, di_batas = [], []
    for i, b in enumerate(model.bahan):
        lo, hi = model.bounds()[i]
        pct = float(x[i])
        item = {
            "bahan_id": b["id"], "nama": b["nama"],
            "persen": round(pct, 2), "gram": round(pct * S / 100, 2),
            "biaya": round(pct * model.biaya_per_pct[i], 1),
            "batas_bawah": lo, "batas_atas": hi, "dikunci": bool(b.get("dikunci")),
            "di_batas_atas": hi < 100 - TOL and pct >= hi - 0.01 and pct > TOL,
        }
        komposisi.append(item)
        if item["di_batas_atas"]:
            di_batas.append(b["id"])
    komposisi.sort(key=lambda k: -k["persen"])

    gizi, kurang = {}, []
    for k, meta in ZAT_GIZI.items():
        nilai = float(np.dot(model.koef(k), x))
        target = model.sasaran.get(k)
        tanpa_data = [b["nama"] for i, b in enumerate(model.bahan) if x[i] > 0.01 and b["gizi"].get(k) is None]
        pct = nilai / target * 100 if target else None
        cukup = pct is None or pct >= 99.5
        gizi[k] = {
            "nama": meta["nama"], "satuan": meta["satuan"], "jenis": "lunak" if k in model.lunak else "wajib",
            "per_sajian": round(nilai, 3), "per_100g": round(nilai / S * 100, 3),
            "target": target, "persen_target": round(pct, 1) if pct is not None else None,
            "cukup": cukup, "retensi": round(model.retensi.get(k, 1.0), 3), "tanpa_data": tanpa_data,
        }
        if not cukup:
            kurang.append(k)

    sebab = [_sebab_kurang(model, x, k, biaya) for k in kurang]

    jumlah = len(model.sasaran)
    cukup_n = sum(1 for k in model.sasaran if gizi[k]["cukup"])
    if kurang:
        nama_kurang = _gabung([ZAT_GIZI[k]["nama"] for k in kurang])
        ringkasan = f"{cukup_n} dari {jumlah} zat gizi sudah cukup. {nama_kurang} masih kurang."
    else:
        ringkasan = f"Semua {jumlah} zat gizi sudah cukup, biaya bahan {_rp(biaya)} per sajian."

    return {
        "berhasil": True,
        "ringkasan": ringkasan,
        "jumlah_cukup": cukup_n,
        "jumlah_sasaran": jumlah,
        "biaya": round(biaya, 1),
        "biaya_maks": model.biaya_maks,
        "berat_sajian": S,
        "komposisi": komposisi,
        "gizi": gizi,
        "bahan_di_batas": di_batas,
        "sebab_kurang": sebab,
        "waktu_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


def _sebab_kurang(model: _Model, x, zat, biaya):
    """FR-25: jelaskan sebab sasaran lunak tidak tercapai dan tawarkan perbaikan."""
    meta = ZAT_GIZI[zat]
    koef = model.koef(zat)
    bnds = model.bounds()
    calon = [i for i in np.argsort(-koef) if koef[i] > 0 and bnds[i][1] < 100 - TOL and x[i] >= bnds[i][1] - 0.01]
    if calon:
        i = int(calon[0])
        b = model.bahan[i]
        r = model.solve(bounds_override={i: (bnds[i][0], 100.0)})
        usulan, cukup = None, False
        if r.success:
            usulan = max(bnds[i][1] + 0.5, math.ceil(float(r.x[i]) * 2) / 2)
            sisa = float(r.x[model.n + model.lunak.index(zat)])
            cukup = sisa <= model.sasaran[zat] * 0.005
        kata = "dikunci pada" if b.get("dikunci") else "sudah mencapai batas"
        teks = f"{meta['nama']} kurang karena {b['nama'].lower()} {kata} {_fmt(bnds[i][1])}%."
        if usulan and not cukup and model.biaya_maks:
            teks += " Menaikkan batas ini saja belum cukup karena biaya juga sudah di batas."
        return {
            "zat_gizi": zat,
            "teks": teks,
            "aksi": {"jenis": "batas", "bahan_id": b["id"], "nama": b["nama"],
                     "batas_sekarang": bnds[i][1], "usulan": usulan, "cukup": cukup},
        }
    if model.biaya_maks and biaya >= model.biaya_maks - 0.5:
        return {"zat_gizi": zat,
                "teks": f"{meta['nama']} kurang karena biaya bahan sudah menyentuh batas {_rp(model.biaya_maks)}.",
                "aksi": {"jenis": "biaya"}}
    return {"zat_gizi": zat,
            "teks": f"{meta['nama']} kurang karena tidak ada bahan terpilih yang cukup kaya {meta['nama_kecil']}.",
            "aksi": {"jenis": "bahan"}}


def _gabung(items):
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " dan " + items[-1]
