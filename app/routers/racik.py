"""Formula: Sasaran, Racik, Cek klaim, Ajukan, Tinjau, dan versi (FR-20 s.d. FR-44)."""
import json
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import services
from app.database import get_connection
from app.security import current_user, require_role
from app.services import Galat

router = APIRouter(prefix="/api", tags=["Formula"])


class FormulaBaruReq(BaseModel):
    nama: str
    kelompok: Optional[str] = None


class SasaranReq(BaseModel):
    kelompok: Optional[str] = None
    berat_sajian: Optional[float] = None
    biaya_maks: Optional[float] = None
    wilayah: Optional[str] = None
    target: Optional[dict[str, float]] = None
    jenis: Optional[dict[str, str]] = None
    retensi: Optional[dict[str, float]] = None
    pakai_bawaan_kelompok: bool = False


class BatasItem(BaseModel):
    bahan_id: int
    dipakai: Optional[int] = None
    batas_bawah: float = 0
    batas_atas: float = 100
    dikunci: bool = False
    alasan: Optional[str] = None


class BatasReq(BaseModel):
    batas: list[BatasItem]


class AjukanReq(BaseModel):
    peninjau_id: int
    catatan: Optional[str] = None
    klaim: list[str] = []


class TinjauReq(BaseModel):
    keputusan: str
    catatan: Optional[str] = None
    batas: list[BatasItem] = []


def _ringkas_daftar(conn, rows):
    return [services.ringkas_formula(conn, r) for r in rows]


@router.get("/beranda")
def beranda(user: dict = Depends(current_user)):
    """FR-04: pekerjaan terakhir pengguna."""
    conn = get_connection()
    if user["peran"] == "Formulator":
        rows = conn.execute("SELECT * FROM formula WHERE pemilik_id = ? ORDER BY diubah DESC", (user["id"],)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM formula ORDER BY diubah DESC").fetchall()
    semua = _ringkas_daftar(conn, rows)
    menunggu = [f for f in semua if f["status"] == "Ditinjau" and f["peninjau_id"] == user["id"]]
    lanjutkan = None
    if user["peran"] == "Peninjau" and menunggu:
        lanjutkan = menunggu[0]
    elif user["peran"] in ("Formulator", "Admin"):
        aktif = [f for f in semua if f["status"] in ("Draf", "Perlu revisi")]
        lanjutkan = aktif[0] if aktif else (semua[0] if semua else None)
    pilot = None
    if user["peran"] in ("Koordinator", "Admin"):
        p = conn.execute("SELECT id, nama FROM pilot ORDER BY id DESC LIMIT 1").fetchone()
        pilot = dict(p) if p else None
    conn.close()
    lainnya = [f for f in semua if not lanjutkan or f["id"] != lanjutkan["id"]][:5]
    return {"lanjutkan": lanjutkan, "lainnya": lainnya, "menunggu_tinjauan": menunggu, "pilot": pilot,
            "jumlah_formula": len(semua)}


@router.get("/formula")
def daftar_formula(status: str = "", user: dict = Depends(current_user)):
    conn = get_connection()
    sql, args = "SELECT * FROM formula WHERE 1=1", []
    if user["peran"] == "Formulator":
        sql += " AND pemilik_id = ?"
        args.append(user["id"])
    if status:
        sql += " AND status = ?"
        args.append(status)
    out = _ringkas_daftar(conn, conn.execute(sql + " ORDER BY diubah DESC", args).fetchall())
    conn.close()
    return {"formula": out}


@router.post("/formula")
def formula_baru(req: FormulaBaruReq, user: dict = Depends(require_role("Formulator", "Admin"))):
    conn = get_connection()
    sasaran = services.sasaran_bawaan(conn, req.kelompok)
    sasaran["wilayah"] = user["wilayah"] if user["wilayah"] in _wilayah(conn) else "Semua wilayah"
    fid = services.buat_formula(conn, user, req.nama, sasaran)
    conn.commit()
    conn.close()
    return {"id": fid}


def _wilayah(conn):
    return {r[0] for r in conn.execute("SELECT DISTINCT wilayah FROM bahan")}


def _detail(conn, user, formula_id: int) -> dict:
    f = services.ambil_formula(conn, formula_id)
    if not services.boleh_lihat(user, f):
        raise Galat(403, "Formula ini milik pengguna lain.")
    ringkas = services.ringkas_formula(conn, f)
    versi_rows = conn.execute(
        "SELECT nomor, berhasil, biaya, dibuat, hasil_json, dibuat_oleh FROM versi_formula WHERE formula_id = ? ORDER BY nomor DESC",
        (formula_id,)).fetchall()
    versi = [{"nomor": r["nomor"], "berhasil": bool(r["berhasil"]), "biaya": r["biaya"], "dibuat": r["dibuat"],
              "ringkasan": json.loads(r["hasil_json"]).get("ringkasan")} for r in versi_rows]
    v = services.versi_terbaru(conn, formula_id)
    hasil = services.lampirkan_takaran(conn, json.loads(v["hasil_json"])) if v else None
    klaim = services.klaim_versi(conn, v["id"]) if v else []
    pengajuan = conn.execute(
        """SELECT p.*, u.nama AS peninjau_nama, s.nama AS pengirim_nama, vf.nomor AS versi_nomor
           FROM pengajuan p JOIN pengguna u ON u.id = p.peninjau_id JOIN pengguna s ON s.id = p.pengirim_id
           JOIN versi_formula vf ON vf.id = p.versi_id
           WHERE p.formula_id = ? ORDER BY p.id DESC LIMIT 1""", (formula_id,)).fetchone()
    tinjauan = [dict(r) | {"batas_baru": json.loads(r["batas_baru_json"])} for r in conn.execute(
        """SELECT t.*, u.nama AS peninjau_nama, vf.nomor AS versi_nomor FROM tinjauan t
           JOIN pengguna u ON u.id = t.peninjau_id JOIN versi_formula vf ON vf.id = t.versi_id
           WHERE t.formula_id = ? ORDER BY t.id DESC""", (formula_id,))]
    batas = services.daftar_batas(conn, formula_id)
    return {
        **ringkas,
        "sasaran": json.loads(f["sasaran_json"]),
        "koreksi": json.loads(f["koreksi_json"] or "{}"),
        "batas": batas,
        "versi_daftar": versi,
        "hasil": hasil,
        "versi_dibuat": v["dibuat"] if v else None,
        "acuan_tanggal": v["acuan_tanggal"] if v else None,
        "klaim": klaim,
        "pengajuan": (dict(pengajuan) | {"klaim": json.loads(pengajuan["klaim_json"])}) if pengajuan else None,
        "tinjauan": tinjauan,
        "izin": {
            "ubah": services.boleh_ubah(user, f),
            "tinjau": f["status"] == "Ditinjau" and (user["peran"] == "Admin" or f["peninjau_id"] == user["id"]),
        },
    }


@router.get("/formula/{formula_id}")
def detail_formula(formula_id: int, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        return _detail(conn, user, formula_id)
    finally:
        conn.close()


@router.put("/formula/{formula_id}/sasaran")
def simpan_sasaran(formula_id: int, req: SasaranReq, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        data = {k: v for k, v in req.model_dump().items() if v is not None and k != "pakai_bawaan_kelompok"}
        if req.pakai_bawaan_kelompok and req.kelompok:
            data["target"] = services.sasaran_bawaan(conn, req.kelompok)["target"]
        services.simpan_sasaran(conn, user, formula_id, data)
        conn.commit()
        return _detail(conn, user, formula_id)
    finally:
        conn.close()


@router.put("/formula/{formula_id}/batas")
def simpan_batas(formula_id: int, req: BatasReq, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        services.simpan_batas(conn, user, formula_id, [b.model_dump() for b in req.batas])
        conn.commit()
        return _detail(conn, user, formula_id)
    finally:
        conn.close()


@router.post("/formula/{formula_id}/racik")
def racik(formula_id: int, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        services.racik(conn, user, formula_id)
        conn.commit()
        return _detail(conn, user, formula_id)
    finally:
        conn.close()


@router.get("/formula/{formula_id}/versi/{nomor}")
def versi(formula_id: int, nomor: int, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        f = services.ambil_formula(conn, formula_id)
        if not services.boleh_lihat(user, f):
            raise Galat(403, "Formula ini milik pengguna lain.")
        r = conn.execute("SELECT * FROM versi_formula WHERE formula_id = ? AND nomor = ?", (formula_id, nomor)).fetchone()
        if not r:
            raise Galat(404, "Versi tidak ditemukan.")
        return {"nomor": r["nomor"], "dibuat": r["dibuat"], "sasaran": json.loads(r["sasaran_json"]),
                "kendala": json.loads(r["kendala_json"]), "data_bahan": json.loads(r["data_bahan_json"]),
                "hasil": services.lampirkan_takaran(conn, json.loads(r["hasil_json"])), "acuan_tanggal": r["acuan_tanggal"],
                "klaim": services.klaim_versi(conn, r["id"])}
    finally:
        conn.close()


@router.get("/formula/{formula_id}/banding")
def banding(formula_id: int, a: int, b: int, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        f = services.ambil_formula(conn, formula_id)
        if not services.boleh_lihat(user, f):
            raise Galat(403, "Formula ini milik pengguna lain.")
        return services.bandingkan(conn, formula_id, a, b)
    finally:
        conn.close()


@router.get("/formula/{formula_id}/klaim")
def klaim(formula_id: int, user: dict = Depends(current_user)):
    """Hasil Penjaga Klaim untuk versi terbaru."""
    conn = get_connection()
    try:
        f = services.ambil_formula(conn, formula_id)
        if not services.boleh_lihat(user, f):
            raise Galat(403, "Formula ini milik pengguna lain.")
        v = services.versi_terbaru(conn, formula_id)
        if not v or not v["berhasil"]:
            raise Galat(409, "Belum ada hasil racik yang berhasil. Jalankan Racik dulu.")
        if services.boleh_ubah(user, f) and f["langkah_terakhir"] >= 2:
            services.tandai_langkah(conn, formula_id, 3)
            conn.commit()
        acuan = services.acuan_aktif(conn)
        return {"versi": v["nomor"], "klaim": services.klaim_versi(conn, v["id"]),
                "acuan": acuan, "acuan_tanggal": v["acuan_tanggal"]}
    finally:
        conn.close()


@router.post("/formula/{formula_id}/ajukan")
def ajukan(formula_id: int, req: AjukanReq, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        services.ajukan(conn, user, formula_id, req.peninjau_id, req.catatan, req.klaim)
        conn.commit()
        return _detail(conn, user, formula_id)
    finally:
        conn.close()


@router.post("/formula/{formula_id}/tinjau")
def tinjau(formula_id: int, req: TinjauReq, user: dict = Depends(require_role("Peninjau", "Admin"))):
    conn = get_connection()
    try:
        services.tinjau(conn, user, formula_id, req.keputusan, req.catatan, [b.model_dump() for b in req.batas])
        conn.commit()
        return _detail(conn, user, formula_id)
    finally:
        conn.close()
