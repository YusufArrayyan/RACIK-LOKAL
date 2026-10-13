"""FR-34: acuan label dan syarat klaim sebagai data bertanggal yang dikelola Admin."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import ZAT_GIZI, get_connection, log_audit
from app.security import current_user, require_role
from app.services import acuan_aktif

router = APIRouter(prefix="/api/acuan-label", tags=["Acuan label"])


class AcuanReq(BaseModel):
    zat_gizi: str
    nilai_alg: float = Field(gt=0)
    ambang_sumber: float = Field(gt=0, le=100)
    ambang_tinggi: float = Field(gt=0, le=100)
    tanggal_berlaku: str
    dokumen_rujukan: str


@router.get("")
def daftar(user: dict = Depends(current_user)):
    conn = get_connection()
    semua = [dict(r) for r in conn.execute("SELECT * FROM acuan_label ORDER BY zat_gizi, tanggal_berlaku DESC")]
    aktif = {k: v["id"] for k, v in acuan_aktif(conn).items()}
    conn.close()
    for r in semua:
        r["aktif"] = aktif.get(r["zat_gizi"]) == r["id"]
        r["nama"] = ZAT_GIZI.get(r["zat_gizi"], {}).get("nama", r["zat_gizi"])
        r["satuan"] = ZAT_GIZI.get(r["zat_gizi"], {}).get("satuan", "")
    return {"acuan": semua}


@router.post("")
def tambah(req: AcuanReq, user: dict = Depends(require_role("Admin"))):
    if req.zat_gizi not in ZAT_GIZI:
        raise HTTPException(422, "Pilih zat gizi dari daftar.")
    if req.ambang_tinggi < req.ambang_sumber:
        raise HTTPException(422, "Ambang klaim Tinggi tidak boleh lebih rendah dari ambang klaim Sumber.")
    try:
        date.fromisoformat(req.tanggal_berlaku)
    except ValueError:
        raise HTTPException(422, "Tanggal berlaku belum benar. Pakai format tahun-bulan-tanggal.")
    if not req.dokumen_rujukan.strip():
        raise HTTPException(422, "Tulis dokumen rujukan, misalnya nomor peraturan dan lampirannya.")
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO acuan_label (zat_gizi, nilai_alg, ambang_sumber, ambang_tinggi, tanggal_berlaku, dokumen_rujukan)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (req.zat_gizi, req.nilai_alg, req.ambang_sumber, req.ambang_tinggi, req.tanggal_berlaku, req.dokumen_rujukan.strip()))
    except Exception:
        conn.close()
        raise HTTPException(409, "Acuan untuk zat gizi ini pada tanggal yang sama sudah ada. Pilih tanggal berlaku lain.")
    log_audit(conn, user["surel"], "acuan_label", "tambah", f"{req.zat_gizi} berlaku {req.tanggal_berlaku}")
    conn.commit()
    conn.close()
    return {"ok": True}
