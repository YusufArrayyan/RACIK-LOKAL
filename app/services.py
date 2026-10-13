"""Logika formula yang dipakai bersama oleh API dan data awal.

Alur: Sasaran (1) -> Racik (2) -> Cek klaim (3) -> Ajukan (4), lalu tinjauan
dan REVISI BATAS yang mengembalikan formula ke langkah Racik (FR-40 s.d. FR-44).
`formula.langkah_terakhir` menyimpan langkah terakhir yang sudah selesai.
"""
import json
import math
from datetime import date

from fastapi import HTTPException

from app.claim_engine import evaluasi_klaim, tandai_penyumbang
from app.database import ZAT_GIZI, log_audit, now
from app.optimizer import solve_racik

UMUR_DATA_HARI = 365  # FR-12: data lebih dari 12 bulan ditandai


class Galat(HTTPException):
    def __init__(self, status: int, pesan: str):
        super().__init__(status, pesan)


# ---------- Bahan ----------

def perlu_diperbarui(tanggal: str, hari_ini: date | None = None) -> bool:
    hari_ini = hari_ini or date.today()
    try:
        return (hari_ini - date.fromisoformat(tanggal)).days > UMUR_DATA_HARI
    except (TypeError, ValueError):
        return True


def gizi_bahan(conn, bahan_id: int) -> dict:
    rows = conn.execute("SELECT * FROM nilai_gizi WHERE bahan_id = ?", (bahan_id,)).fetchall()
    return {r["zat_gizi"]: dict(r) for r in rows}


def ringkas_bahan(conn, row) -> dict:
    gizi = gizi_bahan(conn, row["id"])
    tanggal = [g["tanggal_data"] for g in gizi.values()] or [row["tanggal_harga"]]
    tertua = min(tanggal)
    sumber = sorted({g["sumber"] for g in gizi.values()})
    return {
        **dict(row),
        "sumber_utama": sumber[0] if len(sumber) == 1 else (", ".join(sumber) if sumber else "Belum ada"),
        "tanggal_data_tertua": tertua,
        "perlu_diperbarui": perlu_diperbarui(tertua) or perlu_diperbarui(row["tanggal_harga"]),
        "gizi_lengkap": len(gizi) == len(ZAT_GIZI),
    }


# ---------- Takaran rumah tangga (URT) ----------
# Bantuan tampilan bagi UMKM yang menakar dengan sendok atau gelas. Gram tetap angka
# utama: takaran tidak pernah dipakai untuk menghitung gizi, biaya, atau klaim.

# Jumlah takaran yang mudah ditakar: per seperempat sampai 2, per setengah sampai 5, lalu bulat.
PECAHAN_TAKARAN = [x / 4 for x in range(1, 9)] + [x / 2 for x in range(5, 11)] + [float(x) for x in range(6, 21)]
_GLIF = {0.25: "¼", 0.5: "½", 0.75: "¾"}


def daftar_takaran(conn, bahan_id: int) -> list:
    rows = conn.execute("SELECT * FROM takaran_bahan WHERE bahan_id = ? ORDER BY berat_gram", (bahan_id,)).fetchall()
    return [dict(r) for r in rows]


def teks_pecahan(jumlah: float) -> str:
    """1.5 -> "1½", 0.25 -> "¼", 3.0 -> "3"."""
    utuh = int(jumlah)
    sisa = round(jumlah - utuh, 2)
    return f"{utuh if utuh or not sisa else ''}{_GLIF.get(sisa, '')}"


def takaran_terdekat(gram: float, takaran: list) -> dict | None:
    """Pilih takaran yang padanannya paling dekat dengan gram, dalam pecahan sederhana.

    Jumlah sampai 4 takaran diutamakan. Bila sama dekat, utamakan jumlah bulat, lalu setengah,
    lalu seperempat, lalu jumlah yang paling dekat dengan 1.
    Mengembalikan None bila bahan tidak punya data takaran.
    """
    if not takaran or gram is None or gram <= 0:
        return None
    calon = []
    for t in takaran:
        jumlah = gram / t["berat_gram"]
        if jumlah < 0.125 or jumlah > 20.5:
            continue
        p = min(PECAHAN_TAKARAN, key=lambda x: abs(x - jumlah))
        galat = abs(p * t["berat_gram"] - gram) / gram
        rumit = 0 if p.is_integer() else (1 if (p * 2).is_integer() else 2)
        calon.append((round(galat, 2), rumit, p, t))
    if not calon:
        kecil = min(takaran, key=lambda t: t["berat_gram"])
        if gram >= kecil["berat_gram"]:
            return None  # terlalu banyak untuk ditakar dengan takaran mana pun
        return {"nama_takaran": kecil["nama_takaran"], "berat_gram": kecil["berat_gram"], "jumlah": 0.25,
                "gram_takaran": round(kecil["berat_gram"] / 4, 2), "kurang_dari": True,
                "teks": f"kurang dari ¼ {kecil['nama_takaran']}"}
    # Lebih dari 4 sendok kecil tidak praktis bila takaran yang lebih besar sama dekatnya.
    nyaman = [c for c in calon if c[2] <= 4] or calon
    galat, _, p, t = min(nyaman, key=lambda c: (c[0], c[1], abs(math.log(c[2]))))
    return {"nama_takaran": t["nama_takaran"], "berat_gram": t["berat_gram"], "jumlah": p,
            "gram_takaran": round(p * t["berat_gram"], 2), "kurang_dari": False,
            "teks": f"{teks_pecahan(p)} {t['nama_takaran']}"}


def lampirkan_takaran(conn, hasil: dict | None) -> dict | None:
    """Tambahkan padanan takaran terdekat dan foto bahan ke setiap bahan di komposisi (hanya untuk tampilan)."""
    if not hasil or not hasil.get("komposisi"):
        return hasil
    foto = dict(conn.execute("SELECT id, foto FROM bahan WHERE foto IS NOT NULL").fetchall())
    for k in hasil["komposisi"]:
        k["takaran"] = takaran_terdekat(k.get("gram"), daftar_takaran(conn, k["bahan_id"]))
        k["foto"] = foto.get(k["bahan_id"])
    return hasil


# ---------- Acuan label ----------

def acuan_aktif(conn, pada: str | None = None) -> dict:
    """Acuan label terbaru yang sudah berlaku pada tanggal tertentu (FR-34)."""
    pada = pada or date.today().isoformat()
    rows = conn.execute(
        """SELECT a.* FROM acuan_label a
           WHERE a.tanggal_berlaku = (SELECT MAX(b.tanggal_berlaku) FROM acuan_label b
                                      WHERE b.zat_gizi = a.zat_gizi AND b.tanggal_berlaku <= ?)""",
        (pada,),
    ).fetchall()
    return {r["zat_gizi"]: dict(r) for r in rows}


# ---------- Formula ----------

def sasaran_bawaan(conn, kelompok_nama: str | None = None) -> dict:
    row = None
    if kelompok_nama:
        row = conn.execute("SELECT * FROM kelompok_sasaran WHERE nama = ?", (kelompok_nama,)).fetchone()
    if not row:
        row = conn.execute("SELECT * FROM kelompok_sasaran ORDER BY id LIMIT 1").fetchone()
    return {
        "kelompok": row["nama"],
        "berat_sajian": 40.0,
        "biaya_maks": 2000.0,
        "wilayah": "Rejang Lebong",
        "target": json.loads(row["sasaran_json"]),
        "jenis": {k: v["jenis"] for k, v in ZAT_GIZI.items()},
        "retensi": {k: v["retensi"] for k, v in ZAT_GIZI.items()},
        "zat_utama": "zat_besi",
    }


def ambil_formula(conn, formula_id: int):
    row = conn.execute("SELECT * FROM formula WHERE id = ?", (formula_id,)).fetchone()
    if not row:
        raise Galat(404, "Formula tidak ditemukan. Mungkin sudah dihapus; kembali ke daftar formula.")
    return row


def boleh_lihat(user: dict, formula) -> bool:
    if user["peran"] in ("Admin", "Peninjau", "Koordinator"):
        return True
    return formula["pemilik_id"] == user["id"]


def boleh_ubah(user: dict, formula) -> bool:
    return user["peran"] == "Admin" or (user["peran"] == "Formulator" and formula["pemilik_id"] == user["id"])


def wajib_boleh_ubah(user, formula):
    if not boleh_ubah(user, formula):
        raise Galat(403, "Hanya pemilik formula yang bisa mengubahnya. Minta pemilik atau Admin bila perlu.")


def sinkron_bahan_wilayah(conn, formula_id: int, wilayah: str):
    """Pastikan setiap bahan punya baris batas; bahan baru di wilayah ini langsung dipakai."""
    ada = {r["bahan_id"] for r in conn.execute("SELECT bahan_id FROM batas_bahan WHERE formula_id = ?", (formula_id,))}
    for b in conn.execute("SELECT * FROM bahan").fetchall():
        if b["id"] in ada:
            continue
        dipakai = 1 if (wilayah == "Semua wilayah" or b["wilayah"] == wilayah) and b["status_pasokan"] != "Tidak tersedia" else 0
        conn.execute(
            """INSERT INTO batas_bahan (formula_id, bahan_id, dipakai, batas_bawah, batas_atas, alasan, asal)
               VALUES (?, ?, ?, ?, ?, ?, 'bawaan')""",
            (formula_id, b["id"], dipakai, b["batas_bawah"], b["batas_atas"], b["alasan_batas"]),
        )


def buat_formula(conn, user: dict, nama: str, sasaran: dict | None = None, bahan_ids: list | None = None) -> int:
    nama = (nama or "").strip()
    if len(nama) < 3:
        raise Galat(422, "Nama formula minimal 3 huruf, misalnya \"Camilan batang tempe-kelor 40 g\".")
    sasaran = sasaran or sasaran_bawaan(conn)
    t = now()
    cur = conn.execute(
        """INSERT INTO formula (nama, pemilik_id, status, langkah_terakhir, sasaran_json, dibuat, diubah)
           VALUES (?, ?, 'Draf', 0, ?, ?, ?)""",
        (nama, user["id"], json.dumps(sasaran), t, t),
    )
    fid = cur.lastrowid
    sinkron_bahan_wilayah(conn, fid, sasaran["wilayah"])
    if bahan_ids is not None:
        conn.execute("UPDATE batas_bahan SET dipakai = 0 WHERE formula_id = ?", (fid,))
        conn.executemany("UPDATE batas_bahan SET dipakai = 1 WHERE formula_id = ? AND bahan_id = ?",
                         [(fid, b) for b in bahan_ids])
    log_audit(conn, user["surel"], f"formula:{fid}", "buat", nama)
    return fid


def simpan_sasaran(conn, user, formula_id: int, sasaran: dict):
    f = ambil_formula(conn, formula_id)
    wajib_boleh_ubah(user, f)
    lama = json.loads(f["sasaran_json"])
    if sasaran.get("berat_sajian", 0) <= 0:
        raise Galat(422, "Berat satu sajian harus lebih dari 0 g.")
    if sasaran.get("biaya_maks") is not None and sasaran["biaya_maks"] <= 0:
        raise Galat(422, "Biaya maksimal harus lebih dari Rp0, atau kosongkan bila tidak ada batas biaya.")
    for k, v in sasaran.get("target", {}).items():
        if k not in ZAT_GIZI or v is None or v < 0:
            raise Galat(422, f"Sasaran {ZAT_GIZI.get(k, {'nama_kecil': k})['nama_kecil']} tidak boleh negatif.")
    for k, v in sasaran.get("retensi", {}).items():
        if not 0 < v <= 1:
            raise Galat(422, f"Faktor retensi {ZAT_GIZI[k]['nama_kecil']} harus di antara 0 dan 1.")
    baru = {**lama, **sasaran}
    conn.execute("UPDATE formula SET sasaran_json = ?, langkah_terakhir = MAX(langkah_terakhir, 1), diubah = ? WHERE id = ?",
                 (json.dumps(baru), now(), formula_id))
    if baru.get("wilayah") != lama.get("wilayah"):
        conn.execute("UPDATE batas_bahan SET dipakai = 0 WHERE formula_id = ?", (formula_id,))
        for b in conn.execute("SELECT id, wilayah, status_pasokan FROM bahan").fetchall():
            if (baru["wilayah"] == "Semua wilayah" or b["wilayah"] == baru["wilayah"]) and b["status_pasokan"] != "Tidak tersedia":
                conn.execute("UPDATE batas_bahan SET dipakai = 1 WHERE formula_id = ? AND bahan_id = ?", (formula_id, b["id"]))
    return baru


def simpan_batas(conn, user, formula_id: int, daftar: list, asal: str = "formulator"):
    """FR-23: batas bawah, batas atas, kunci, dan bahan yang dipakai."""
    f = ambil_formula(conn, formula_id)
    if asal == "formulator":
        wajib_boleh_ubah(user, f)
    sinkron_bahan_wilayah(conn, formula_id, json.loads(f["sasaran_json"]).get("wilayah", "Semua wilayah"))
    for item in daftar:
        lo = float(item.get("batas_bawah", 0))
        hi = float(item.get("batas_atas", 100))
        if not (0 <= lo <= 100 and 0 <= hi <= 100):
            raise Galat(422, "Batas pemakaian harus di antara 0% dan 100%.")
        if lo > hi:
            raise Galat(422, "Batas bawah tidak boleh lebih besar dari batas atas. Periksa lagi angkanya.")
        lama = conn.execute("SELECT * FROM batas_bahan WHERE formula_id = ? AND bahan_id = ?",
                            (formula_id, item["bahan_id"])).fetchone()
        if not lama:
            raise Galat(404, "Bahan tidak ditemukan pada formula ini.")
        berubah = (lama["batas_bawah"], lama["batas_atas"], lama["dikunci"]) != (lo, hi, int(bool(item.get("dikunci"))))
        alasan = (item.get("alasan") or "").strip() or None
        if asal == "peninjau" and berubah and not alasan:
            raise Galat(422, "Tulis alasan untuk setiap batas yang Anda ubah, agar formulator tahu sebabnya.")
        conn.execute(
            """UPDATE batas_bahan SET dipakai = ?, batas_bawah = ?, batas_atas = ?, dikunci = ?,
               alasan = COALESCE(?, alasan), asal = CASE WHEN ? THEN ? ELSE asal END
               WHERE formula_id = ? AND bahan_id = ?""",
            (int(lama["dipakai"] if item.get("dipakai") is None else item["dipakai"]), lo, hi, int(bool(item.get("dikunci"))), alasan,
             berubah, asal, formula_id, item["bahan_id"]),
        )
    conn.execute("UPDATE formula SET diubah = ? WHERE id = ?", (now(), formula_id))


def daftar_batas(conn, formula_id: int) -> list:
    rows = conn.execute(
        """SELECT bb.*, b.nama, b.kelompok, b.harga_per_kg, b.wilayah, b.batas_atas AS batas_atas_umum,
                  b.batas_bawah AS batas_bawah_umum
           FROM batas_bahan bb JOIN bahan b ON b.id = bb.bahan_id
           WHERE bb.formula_id = ? ORDER BY bb.dipakai DESC, b.nama""",
        (formula_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _bahan_untuk_racik(conn, formula_id: int) -> list:
    out = []
    for r in daftar_batas(conn, formula_id):
        if not r["dipakai"]:
            continue
        gizi = gizi_bahan(conn, r["bahan_id"])
        out.append({
            "id": r["bahan_id"], "nama": r["nama"], "harga_per_kg": r["harga_per_kg"],
            "gizi": {k: (gizi[k]["nilai"] if k in gizi else None) for k in ZAT_GIZI},
            "batas_bawah": r["batas_bawah"], "batas_atas": r["batas_atas"], "dikunci": bool(r["dikunci"]),
            "asal_batas": r["asal"], "alasan_batas": r["alasan"],
            "sumber": {k: gizi[k]["sumber"] for k in gizi},
        })
    return out


def versi_terbaru(conn, formula_id: int):
    return conn.execute("SELECT * FROM versi_formula WHERE formula_id = ? ORDER BY nomor DESC LIMIT 1",
                        (formula_id,)).fetchone()


def racik(conn, user, formula_id: int) -> dict:
    """FR-21, FR-27, FR-28: jalankan Mesin Racik dan simpan hasilnya sebagai versi baru."""
    f = ambil_formula(conn, formula_id)
    wajib_boleh_ubah(user, f)
    sasaran = json.loads(f["sasaran_json"])
    koreksi = json.loads(f["koreksi_json"] or "{}")
    bahan = _bahan_untuk_racik(conn, formula_id)
    lama = versi_terbaru(conn, formula_id)
    sebelumnya = None
    if lama and lama["berhasil"]:
        sebelumnya = {k["bahan_id"]: k["persen"] for k in json.loads(lama["hasil_json"])["komposisi"]}

    hasil = solve_racik(
        bahan, sasaran["target"], sasaran["berat_sajian"], sasaran.get("biaya_maks"),
        retensi=sasaran.get("retensi"), koreksi={k: v["faktor"] for k, v in koreksi.items()},
        jenis=sasaran.get("jenis"), sebelumnya=sebelumnya,
    )
    acuan = acuan_aktif(conn)
    klaim = []
    if hasil["berhasil"]:
        tandai_penyumbang(hasil, bahan)
        klaim = evaluasi_klaim(hasil, acuan)
        hasil["klaim_ringkas"] = {"boleh": sum(1 for k in klaim if k["lolos"]), "jumlah": len(klaim)}

    nomor = (lama["nomor"] + 1) if lama else 1
    kendala = [{k: b[k] for k in ("id", "nama", "batas_bawah", "batas_atas", "dikunci", "asal_batas", "alasan_batas")}
               for b in bahan]
    data_bahan = [{k: b[k] for k in ("id", "nama", "harga_per_kg", "gizi", "sumber")} for b in bahan]
    sasaran_simpan = {**sasaran, "koreksi": koreksi}
    acuan_tgl = max((a["tanggal_berlaku"] for a in acuan.values()), default=None)
    cur = conn.execute(
        """INSERT INTO versi_formula (formula_id, nomor, sasaran_json, kendala_json, data_bahan_json, hasil_json,
                                      berhasil, biaya, acuan_tanggal, dibuat_oleh, dibuat)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (formula_id, nomor, json.dumps(sasaran_simpan), json.dumps(kendala), json.dumps(data_bahan),
         json.dumps(hasil), int(hasil["berhasil"]), hasil.get("biaya"), acuan_tgl, user["id"], now()),
    )
    vid = cur.lastrowid
    for k in klaim:
        conn.execute(
            """INSERT INTO hasil_klaim (versi_id, zat_gizi, jenis, nilai_pct, nilai_pct_sajian, syarat_pct, lolos, selisih, saran)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (vid, k["zat_gizi"], k["jenis"], k["nilai_pct"], k["nilai_pct_sajian"], k["syarat_pct"],
             int(k["lolos"]), k["selisih"], k["saran"]),
        )
    # Racik ulang membatalkan pengajuan atau persetujuan atas versi lama.
    status = f["status"]
    if status in ("Ditinjau", "Disetujui", "Ditolak"):
        status = "Draf"
    conn.execute("UPDATE formula SET langkah_terakhir = ?, status = ?, diubah = ? WHERE id = ?",
                 (2 if hasil["berhasil"] else 1, status, now(), formula_id))
    log_audit(conn, user["surel"], f"formula:{formula_id}", "racik",
              f"versi {nomor}, {'berhasil' if hasil['berhasil'] else 'tanpa solusi'}, {hasil['waktu_ms']} ms")
    return {"versi": nomor, "hasil": hasil, "klaim": klaim, "status": status}


def klaim_versi(conn, versi_id: int) -> list:
    rows = conn.execute("SELECT * FROM hasil_klaim WHERE versi_id = ? ORDER BY lolos DESC, id", (versi_id,)).fetchall()
    out = []
    for r in rows:
        nama = ZAT_GIZI[r["zat_gizi"]]["nama_kecil"]
        out.append({**dict(r), "lolos": bool(r["lolos"]), "label": f"{r['jenis']} {nama}"})
    return out


def tandai_langkah(conn, formula_id: int, langkah: int):
    conn.execute("UPDATE formula SET langkah_terakhir = MAX(langkah_terakhir, ?) WHERE id = ?", (langkah, formula_id))


def ajukan(conn, user, formula_id: int, peninjau_id: int, catatan: str | None, klaim_dipakai: list):
    """FR-33, FR-40: hanya klaim yang lolos yang boleh disertakan."""
    f = ambil_formula(conn, formula_id)
    wajib_boleh_ubah(user, f)
    v = versi_terbaru(conn, formula_id)
    if not v or not v["berhasil"]:
        raise Galat(409, "Formula belum punya hasil racik yang berhasil. Jalankan Racik dulu.")
    if f["status"] == "Ditinjau":
        raise Galat(409, "Formula ini sedang ditinjau. Tunggu keputusan peninjau, atau racik ulang untuk menarik pengajuan.")
    peninjau = conn.execute("SELECT * FROM pengguna WHERE id = ? AND peran = 'Peninjau' AND aktif = 1",
                            (peninjau_id,)).fetchone()
    if not peninjau:
        raise Galat(422, "Pilih ahli gizi peninjau dari daftar.")
    klaim = {f"{k['jenis']}:{k['zat_gizi']}": k for k in klaim_versi(conn, v["id"])}
    for kunci in klaim_dipakai:
        if kunci not in klaim:
            raise Galat(422, "Ada klaim yang tidak dikenal. Muat ulang halaman Cek klaim.")
        if not klaim[kunci]["lolos"]:
            raise Galat(422, f"Klaim \"{klaim[kunci]['label']}\" belum boleh dipakai, jadi tidak bisa disertakan.")
    conn.execute(
        "INSERT INTO pengajuan (formula_id, versi_id, pengirim_id, peninjau_id, catatan, klaim_json, waktu) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (formula_id, v["id"], user["id"], peninjau_id, (catatan or "").strip() or None, json.dumps(klaim_dipakai), now()),
    )
    conn.execute("UPDATE formula SET status = 'Ditinjau', langkah_terakhir = 4, peninjau_id = ?, diubah = ? WHERE id = ?",
                 (peninjau_id, now(), formula_id))
    log_audit(conn, user["surel"], f"formula:{formula_id}", "ajukan", f"versi {v['nomor']} ke {peninjau['nama']}")


def tinjau(conn, user, formula_id: int, keputusan: str, catatan: str | None, batas_baru: list):
    """FR-41, FR-42: keputusan peninjau; perubahan batas mengembalikan formula ke Racik."""
    f = ambil_formula(conn, formula_id)
    if f["status"] != "Ditinjau":
        raise Galat(409, "Formula ini tidak sedang menunggu tinjauan.")
    if user["peran"] != "Admin" and f["peninjau_id"] != user["id"]:
        raise Galat(403, "Formula ini diajukan ke peninjau lain.")
    if keputusan not in ("Disetujui", "Perlu revisi", "Ditolak"):
        raise Galat(422, "Pilih keputusan: setujui, minta revisi, atau tolak.")
    catatan = (catatan or "").strip()
    if keputusan != "Disetujui" and not catatan:
        raise Galat(422, "Tulis catatan agar formulator tahu apa yang perlu diperbaiki.")
    if batas_baru:
        simpan_batas(conn, user, formula_id, batas_baru, asal="peninjau")
        if keputusan == "Disetujui":
            keputusan = "Perlu revisi"  # batas berubah berarti formula harus diracik ulang
    v = versi_terbaru(conn, formula_id)
    conn.execute(
        "INSERT INTO tinjauan (formula_id, versi_id, peninjau_id, keputusan, catatan, batas_baru_json, waktu) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (formula_id, v["id"], user["id"], keputusan, catatan or None, json.dumps(batas_baru or []), now()),
    )
    langkah = 1 if keputusan == "Perlu revisi" else 4
    conn.execute("UPDATE formula SET status = ?, langkah_terakhir = ?, catatan_revisi = ?, diubah = ? WHERE id = ?",
                 (keputusan, langkah, catatan if keputusan == "Perlu revisi" else None, now(), formula_id))
    log_audit(conn, user["surel"], f"formula:{formula_id}", "tinjau", keputusan)
    return keputusan


def bandingkan(conn, formula_id: int, a: int, b: int) -> dict:
    """FR-27: bandingkan dua versi."""
    va = conn.execute("SELECT * FROM versi_formula WHERE formula_id = ? AND nomor = ?", (formula_id, a)).fetchone()
    vb = conn.execute("SELECT * FROM versi_formula WHERE formula_id = ? AND nomor = ?", (formula_id, b)).fetchone()
    if not va or not vb:
        raise Galat(404, "Versi yang dibandingkan tidak ditemukan.")
    ha, hb = json.loads(va["hasil_json"]), json.loads(vb["hasil_json"])
    ka = {k["bahan_id"]: k for k in ha.get("komposisi", [])}
    kb = {k["bahan_id"]: k for k in hb.get("komposisi", [])}
    bahan = []
    for bid in list(dict.fromkeys(list(kb) + list(ka))):
        x, y = ka.get(bid), kb.get(bid)
        ga, gb = (x or {}).get("gram", 0), (y or {}).get("gram", 0)
        if ga < 0.005 and gb < 0.005:
            continue
        bahan.append({"bahan_id": bid, "nama": (y or x)["nama"], "gram_a": ga, "gram_b": gb, "selisih": round(gb - ga, 2)})
    gizi = []
    for k in ZAT_GIZI:
        if k in ha.get("gizi", {}) and k in hb.get("gizi", {}):
            gizi.append({"zat_gizi": k, "nama": ZAT_GIZI[k]["nama"], "satuan": ZAT_GIZI[k]["satuan"],
                         "a": ha["gizi"][k]["per_sajian"], "b": hb["gizi"][k]["per_sajian"],
                         "target": hb["gizi"][k]["target"]})
    return {"a": a, "b": b, "biaya_a": va["biaya"], "biaya_b": vb["biaya"], "bahan": bahan, "gizi": gizi,
            "ringkasan_a": ha.get("ringkasan"), "ringkasan_b": hb.get("ringkasan")}


def pakai_koreksi_lab(conn, user, formula_id: int, zat: str, lab: float, hitung: float, sumber: str):
    """FR-43, FR-53: hasil uji lab menjadi faktor koreksi, data sumber bahan tidak ditimpa."""
    f = ambil_formula(conn, formula_id)
    if hitung <= 0 or lab <= 0:
        raise Galat(422, "Nilai uji lab dan hitungan harus lebih dari 0.")
    koreksi = json.loads(f["koreksi_json"] or "{}")
    faktor_lama = koreksi.get(zat, {}).get("faktor", 1.0)
    faktor = round(faktor_lama * lab / hitung, 4)
    koreksi[zat] = {"faktor": faktor, "sumber": sumber, "tanggal": date.today().isoformat()}
    nama = ZAT_GIZI[zat]["nama_kecil"]
    catatan = (f"REVISI BATAS dari {sumber}: {nama} hasil lab {str(lab).replace('.', ',')} {ZAT_GIZI[zat]['satuan']}, "
               f"hitungan {str(hitung).replace('.', ',')} {ZAT_GIZI[zat]['satuan']}. Faktor koreksi {nama} sekarang "
               f"{str(round(faktor, 2)).replace('.', ',')}. Racik ulang agar sasaran tetap tercapai.")
    conn.execute(
        "UPDATE formula SET koreksi_json = ?, status = 'Perlu revisi', langkah_terakhir = 1, catatan_revisi = ?, diubah = ? WHERE id = ?",
        (json.dumps(koreksi), catatan, now(), formula_id),
    )
    log_audit(conn, user["surel"], f"formula:{formula_id}", "koreksi lab", catatan)
    return faktor


def ringkas_formula(conn, row) -> dict:
    v = versi_terbaru(conn, row["id"])
    pemilik = conn.execute("SELECT nama FROM pengguna WHERE id = ?", (row["pemilik_id"],)).fetchone()
    peninjau = conn.execute("SELECT nama FROM pengguna WHERE id = ?", (row["peninjau_id"],)).fetchone() if row["peninjau_id"] else None
    hasil = json.loads(v["hasil_json"]) if v else None
    return {
        "id": row["id"], "nama": row["nama"], "status": row["status"],
        "langkah_terakhir": row["langkah_terakhir"], "diubah": row["diubah"],
        "pemilik": pemilik["nama"] if pemilik else "", "pemilik_id": row["pemilik_id"],
        "peninjau": peninjau["nama"] if peninjau else None, "peninjau_id": row["peninjau_id"],
        "versi": v["nomor"] if v else 0,
        "berhasil": bool(v["berhasil"]) if v else None,
        "biaya": v["biaya"] if v else None,
        "ringkasan": hasil.get("ringkasan") if hasil else None,
        "catatan_revisi": row["catatan_revisi"],
    }
