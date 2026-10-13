"""Penjaga Klaim: klaim "Sumber" dan "Tinggi" zat gizi (PRD V2 bagian 8, FR-30 s.d. FR-33).

Kandungan produk per 100 g dibagi acuan label gizi (ALG), lalu dibandingkan
dengan ambang yang dibaca dari tabel acuan_label, bukan dari kode (FR-34).
"""
from app.database import ZAT_GIZI

# Energi tidak diklaim sebagai "sumber" pada versi 1.
ZAT_KLAIM = ["zat_besi", "folat", "kalsium", "seng", "vitamin_c", "protein"]
# Klaim "Tinggi" hanya ditampilkan bila produk sudah cukup dekat (dua pertiga syarat).
PROPORSI_TAMPIL_TINGGI = 2 / 3


def _fmt(v, d=1):
    return f"{v:,.{d}f}".replace(",", "_").replace(".", ",").replace("_", ".")


def evaluasi_klaim(hasil: dict, acuan: dict) -> list:
    """hasil: keluaran solve_racik yang berhasil. acuan: {zat: baris acuan_label aktif}."""
    gizi = hasil["gizi"]
    komposisi = {k["bahan_id"]: k for k in hasil["komposisi"]}
    out = []
    for zat in ZAT_KLAIM:
        if zat not in acuan or zat not in gizi:
            continue
        a = acuan[zat]
        per100 = gizi[zat]["per_100g"]
        pct = per100 / a["nilai_alg"] * 100
        pct_sajian = gizi[zat]["per_sajian"] / a["nilai_alg"] * 100
        nama = ZAT_GIZI[zat]["nama_kecil"]
        jenis_list = ["Sumber"]
        if pct >= a["ambang_tinggi"] * PROPORSI_TAMPIL_TINGGI:
            jenis_list.append("Tinggi")
        for jenis in jenis_list:
            syarat = a["ambang_sumber"] if jenis == "Sumber" else a["ambang_tinggi"]
            lolos = pct >= syarat - 1e-9
            selisih = round(pct - syarat, 1)
            saran = "" if lolos else _saran(jenis, zat, nama, pct, syarat, a, hasil, komposisi)
            out.append({
                "zat_gizi": zat,
                "jenis": jenis,
                "label": f"{jenis} {nama}",
                "nilai_pct": round(pct, 1),
                "nilai_pct_sajian": round(pct_sajian, 1),
                "syarat_pct": syarat,
                "lolos": lolos,
                "selisih": selisih,
                "saran": saran,
                "rujukan": a["dokumen_rujukan"],
            })
    # Yang boleh dipakai dulu, lalu yang belum.
    out.sort(key=lambda k: (not k["lolos"], k["zat_gizi"], k["jenis"] != "Sumber"))
    return out


def _saran(jenis, zat, nama, pct, syarat, acuan, hasil, komposisi):
    """FR-32: satu saran perbaikan yang bisa dikerjakan."""
    kurang = syarat - pct
    sumber_klaim = f", atau pakai klaim Sumber {nama} saja" if jenis == "Tinggi" and pct >= acuan["ambang_sumber"] else \
        ", atau jangan pakai klaim ini"
    utama = hasil.get("penyumbang", {}).get(zat, [])
    if utama and utama[0] in komposisi:
        b = komposisi[utama[0]]
        if b["di_batas_atas"] or b["dikunci"]:
            return (f"{_fmt(pct)}% dari acuan label per 100 g. Syarat {_fmt(syarat, 0)}%. "
                    f"{b['nama']} sudah di batas {_fmt(b['batas_atas'])}%. Naikkan batasnya{sumber_klaim}.")
        return (f"{_fmt(pct)}% dari acuan label per 100 g. Syarat {_fmt(syarat, 0)}%. Kurang {_fmt(kurang)} poin. "
                f"Naikkan {b['nama'].lower()} sedikit{sumber_klaim}.")
    return (f"{_fmt(pct)}% dari acuan label per 100 g. Syarat {_fmt(syarat, 0)}%. Kurang {_fmt(kurang)} poin. "
            f"Tambahkan bahan yang kaya {nama}{sumber_klaim}.")


def tandai_penyumbang(hasil: dict, bahan: list):
    """Urutkan bahan menurut kandungan tiap zat gizi per 100 g (untuk saran klaim)."""
    peta = {}
    for zat in ZAT_GIZI:
        urut = sorted((b for b in bahan if (b["gizi"].get(zat) or 0) > 0),
                      key=lambda b: -(b["gizi"].get(zat) or 0))
        peta[zat] = [b["id"] for b in urut[:1]]
    hasil["penyumbang"] = peta
    return hasil
