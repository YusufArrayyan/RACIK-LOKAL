"""Pustaka data pangan: bahan, nilai gizi bersumber, umur data, riwayat (FR-10 s.d. FR-14)."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import ZAT_GIZI, get_connection, log_audit, now
from app.security import current_user, require_role
from app.services import UMUR_DATA_HARI, daftar_takaran, gizi_bahan, perlu_diperbarui, ringkas_bahan

router = APIRouter(prefix="/api", tags=["Bahan"])

SUMBER_DATA = ["TKPI 2017", "Uji lab", "Label produsen"]
STATUS_PASOKAN = ["Tersedia", "Musiman", "Terbatas", "Tidak tersedia"]
NAMA_TAKARAN = ["sdt peres", "sdm peres", "sdm munjung", "gelas belimbing"]
SUMBER_TAKARAN = ["Data contoh, perlu verifikasi ahli gizi", "Hasil timbang", "Daftar URT"]


class NilaiGiziIn(BaseModel):
    nilai: float = Field(ge=0)
    sumber: str
    tanggal_data: str


class TakaranIn(BaseModel):
    nama_takaran: str
    berat_gram: float = Field(gt=0, le=5000)
    sumber: str
    tanggal_data: str


class BahanIn(BaseModel):
    nama: str
    kelompok: str
    harga_per_kg: float = Field(gt=0)
    wilayah: str
    status_pasokan: str = "Tersedia"
    batas_bawah: float = Field(0, ge=0, le=100)
    batas_atas: float = Field(100, ge=0, le=100)
    alasan_batas: Optional[str] = None
    tanggal_harga: str
    gizi: dict[str, NilaiGiziIn] = {}
    # None berarti takaran tidak diubah; daftar (boleh kosong) menggantikan seluruh takaran bahan.
    takaran: Optional[list[TakaranIn]] = None


@router.get("/referensi")
def referensi(user: dict = Depends(current_user)):
    conn = get_connection()
    kelompok = [dict(r) for r in conn.execute("SELECT id, nama, sasaran_json, sumber FROM kelompok_sasaran ORDER BY id")]
    wilayah = [r[0] for r in conn.execute("SELECT DISTINCT wilayah FROM bahan ORDER BY wilayah")]
    peninjau = [dict(r) for r in conn.execute(
        "SELECT id, nama, wilayah FROM pengguna WHERE peran = 'Peninjau' AND aktif = 1 ORDER BY nama")]
    kel_bahan = [r[0] for r in conn.execute("SELECT DISTINCT kelompok FROM bahan ORDER BY kelompok")]
    conn.close()
    return {
        "zat_gizi": ZAT_GIZI, "kelompok_sasaran": kelompok, "wilayah": wilayah + ["Semua wilayah"],
        "peninjau": peninjau, "sumber_data": SUMBER_DATA, "status_pasokan": STATUS_PASOKAN,
        "kelompok_bahan": kel_bahan,
        "nama_takaran": NAMA_TAKARAN, "sumber_takaran": SUMBER_TAKARAN, "umur_data_hari": UMUR_DATA_HARI, "hari_ini": date.today().isoformat(),
    }


@router.get("/bahan")
def daftar_bahan(q: str = "", wilayah: str = "", user: dict = Depends(current_user)):
    conn = get_connection()
    sql, args = "SELECT * FROM bahan WHERE 1=1", []
    if q.strip():
        sql += " AND (nama LIKE ? OR kelompok LIKE ?)"
        args += [f"%{q.strip()}%"] * 2
    if wilayah and wilayah != "Semua wilayah":
        sql += " AND wilayah = ?"
        args.append(wilayah)
    rows = conn.execute(sql + " ORDER BY nama", args).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM bahan").fetchone()[0]
    out = [ringkas_bahan(conn, r) for r in rows]
    conn.close()
    return {"bahan": out, "total": total}


@router.get("/bahan/{bahan_id}")
def detail_bahan(bahan_id: int, user: dict = Depends(current_user)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM bahan WHERE id = ?", (bahan_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Bahan tidak ditemukan. Kembali ke daftar bahan dan cari lagi.")
    gizi = gizi_bahan(conn, bahan_id)
    for g in gizi.values():
        g["perlu_diperbarui"] = perlu_diperbarui(g["tanggal_data"])
    riwayat = [dict(r) for r in conn.execute(
        "SELECT * FROM riwayat_bahan WHERE bahan_id = ? ORDER BY waktu DESC LIMIT 50", (bahan_id,))]
    out = {**ringkas_bahan(conn, row), "gizi": gizi, "takaran": daftar_takaran(conn, bahan_id), "riwayat": riwayat}
    conn.close()
    return out


def _validasi(req: BahanIn):
    if len(req.nama.strip()) < 2:
        raise HTTPException(422, "Nama bahan minimal 2 huruf.")
    if req.batas_bawah > req.batas_atas:
        raise HTTPException(422, "Batas bawah tidak boleh lebih besar dari batas atas.")
    if req.status_pasokan not in STATUS_PASOKAN:
        raise HTTPException(422, "Pilih status pasokan dari daftar.")
    for zat, g in req.gizi.items():
        if zat not in ZAT_GIZI:
            raise HTTPException(422, f"Zat gizi \"{zat}\" tidak dikenal.")
        if not g.sumber.strip():
            raise HTTPException(422, f"Tulis sumber nilai {ZAT_GIZI[zat]['nama_kecil']}, misalnya TKPI 2017 atau uji lab.")
        try:
            date.fromisoformat(g.tanggal_data)
        except ValueError:
            raise HTTPException(422, f"Tanggal data {ZAT_GIZI[zat]['nama_kecil']} belum benar. Pakai format tahun-bulan-tanggal.")
    _validasi_takaran(req.takaran or [])


def _validasi_takaran(daftar: list[TakaranIn]):
    nama_takaran = set()
    for t in daftar:
        nama = " ".join(t.nama_takaran.split()).lower()
        if len(nama) < 2:
            raise HTTPException(422, "Tulis nama takaran, misalnya sdm peres atau gelas belimbing.")
        if nama in nama_takaran:
            raise HTTPException(422, f"Takaran \"{nama}\" tertulis dua kali. Hapus salah satunya.")
        nama_takaran.add(nama)
        if not t.sumber.strip():
            raise HTTPException(422, f"Tulis sumber berat takaran {nama}, misalnya hasil timbang atau daftar URT.")
        try:
            date.fromisoformat(t.tanggal_data)
        except ValueError:
            raise HTTPException(422, f"Tanggal data takaran {nama} belum benar. Pakai format tahun-bulan-tanggal.")


def _fmt_takaran(t) -> str:
    return f"{float(t['berat_gram']):g} g ({t['sumber']})".replace(".", ",")


def _simpan_takaran(conn, bahan_id: int, daftar: list[TakaranIn]) -> list:
    """Ganti seluruh takaran bahan; kembalikan riwayat (kolom, lama, baru) untuk yang berubah."""
    lama = {t["nama_takaran"]: t for t in daftar_takaran(conn, bahan_id)}
    baru = {" ".join(t.nama_takaran.split()).lower(): t for t in daftar}
    riwayat = []
    for nama, t in baru.items():
        tb = {"berat_gram": t.berat_gram, "sumber": t.sumber.strip(), "tanggal_data": t.tanggal_data}
        tl = lama.get(nama)
        if tl and (float(tl["berat_gram"]), tl["sumber"], tl["tanggal_data"]) == (tb["berat_gram"], tb["sumber"], tb["tanggal_data"]):
            continue
        riwayat.append((f"takaran:{nama}", _fmt_takaran(tl) if tl else None, _fmt_takaran(tb)))
        conn.execute(
            """INSERT INTO takaran_bahan (bahan_id, nama_takaran, berat_gram, sumber, tanggal_data) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (bahan_id, nama_takaran) DO UPDATE SET berat_gram = excluded.berat_gram,
               sumber = excluded.sumber, tanggal_data = excluded.tanggal_data""",
            (bahan_id, nama, tb["berat_gram"], tb["sumber"], tb["tanggal_data"]))
    for nama, tl in lama.items():
        if nama not in baru:
            riwayat.append((f"takaran:{nama}", _fmt_takaran(tl), "dihapus"))
            conn.execute("DELETE FROM takaran_bahan WHERE id = ?", (tl["id"],))
    return riwayat


@router.post("/bahan")
def tambah_bahan(req: BahanIn, user: dict = Depends(require_role("Admin", "Peninjau"))):
    _validasi(req)
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO bahan (nama, kelompok, harga_per_kg, wilayah, status_pasokan, batas_bawah, batas_atas,
                              alasan_batas, tanggal_harga, diubah) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (req.nama.strip(), req.kelompok.strip(), req.harga_per_kg, req.wilayah.strip(), req.status_pasokan,
         req.batas_bawah, req.batas_atas, req.alasan_batas, req.tanggal_harga, now()))
    bid = cur.lastrowid
    for zat, g in req.gizi.items():
        conn.execute("INSERT INTO nilai_gizi (bahan_id, zat_gizi, nilai, sumber, tanggal_data) VALUES (?, ?, ?, ?, ?)",
                     (bid, zat, g.nilai, g.sumber.strip(), g.tanggal_data))
    if req.takaran:
        _simpan_takaran(conn, bid, req.takaran)
    log_audit(conn, user["surel"], f"bahan:{bid}", "tambah", req.nama)
    conn.commit()
    conn.close()
    return {"id": bid}


@router.put("/bahan/{bahan_id}")
def ubah_bahan(bahan_id: int, req: BahanIn, user: dict = Depends(require_role("Admin", "Peninjau"))):
    _validasi(req)
    conn = get_connection()
    lama = conn.execute("SELECT * FROM bahan WHERE id = ?", (bahan_id,)).fetchone()
    if not lama:
        conn.close()
        raise HTTPException(404, "Bahan tidak ditemukan.")
    t = now()
    riwayat = []
    for kolom in ("nama", "kelompok", "harga_per_kg", "wilayah", "status_pasokan", "batas_bawah", "batas_atas"):
        baru = getattr(req, kolom)
        if str(lama[kolom]) != str(baru) and not (isinstance(baru, float) and float(lama[kolom]) == baru):
            riwayat.append((kolom, lama[kolom], baru))
    conn.execute(
        """UPDATE bahan SET nama = ?, kelompok = ?, harga_per_kg = ?, wilayah = ?, status_pasokan = ?, batas_bawah = ?,
           batas_atas = ?, alasan_batas = ?, tanggal_harga = ?, diubah = ? WHERE id = ?""",
        (req.nama.strip(), req.kelompok.strip(), req.harga_per_kg, req.wilayah.strip(), req.status_pasokan,
         req.batas_bawah, req.batas_atas, req.alasan_batas, req.tanggal_harga, t, bahan_id))
    gizi_lama = gizi_bahan(conn, bahan_id)
    for zat, g in req.gizi.items():
        gl = gizi_lama.get(zat)
        if gl and (gl["nilai"], gl["sumber"], gl["tanggal_data"]) == (g.nilai, g.sumber.strip(), g.tanggal_data):
            continue
        riwayat.append((f"gizi:{zat}", f"{gl['nilai']} ({gl['sumber']})" if gl else None, f"{g.nilai} ({g.sumber.strip()})"))
        conn.execute("INSERT OR REPLACE INTO nilai_gizi (bahan_id, zat_gizi, nilai, sumber, tanggal_data) VALUES (?, ?, ?, ?, ?)",
                     (bahan_id, zat, g.nilai, g.sumber.strip(), g.tanggal_data))
    if req.takaran is not None:
        riwayat += _simpan_takaran(conn, bahan_id, req.takaran)
    for kolom, a, b in riwayat:
        conn.execute("INSERT INTO riwayat_bahan (bahan_id, kolom, nilai_lama, nilai_baru, oleh, waktu) VALUES (?, ?, ?, ?, ?, ?)",
                     (bahan_id, kolom, None if a is None else str(a), str(b), user["surel"], t))
    log_audit(conn, user["surel"], f"bahan:{bahan_id}", "ubah", f"{len(riwayat)} perubahan")
    conn.commit()
    conn.close()
    return {"id": bahan_id, "perubahan": len(riwayat)}


class TakaranDaftarIn(BaseModel):
    takaran: list[TakaranIn]


@router.put("/bahan/{bahan_id}/takaran")
def ubah_takaran(bahan_id: int, req: TakaranDaftarIn, user: dict = Depends(require_role("Admin", "Peninjau"))):
    """Ganti daftar takaran rumah tangga satu bahan tanpa mengirim ulang data gizinya."""
    _validasi_takaran(req.takaran)
    conn = get_connection()
    if not conn.execute("SELECT 1 FROM bahan WHERE id = ?", (bahan_id,)).fetchone():
        conn.close()
        raise HTTPException(404, "Bahan tidak ditemukan.")
    t = now()
    riwayat = _simpan_takaran(conn, bahan_id, req.takaran)
    for kolom, a, b in riwayat:
        conn.execute("INSERT INTO riwayat_bahan (bahan_id, kolom, nilai_lama, nilai_baru, oleh, waktu) VALUES (?, ?, ?, ?, ?, ?)",
                     (bahan_id, kolom, a, b, user["surel"], t))
    if riwayat:
        conn.execute("UPDATE bahan SET diubah = ? WHERE id = ?", (t, bahan_id))
    log_audit(conn, user["surel"], f"bahan:{bahan_id}", "ubah takaran", f"{len(riwayat)} perubahan")
    out = daftar_takaran(conn, bahan_id)
    conn.commit()
    conn.close()
    return {"id": bahan_id, "perubahan": len(riwayat), "takaran": out}
