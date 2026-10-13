"""Admin: kelola akun dan lihat log audit (PRD bagian 4, peran Admin)."""
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import PERAN, get_connection, log_audit, now
from app.security import hash_password, require_role, validate_new_password

router = APIRouter(prefix="/api/admin", tags=["Admin"])
admin = require_role("Admin")


class PenggunaReq(BaseModel):
    nama: str
    surel: str
    peran: str
    wilayah: str
    kata_sandi: Optional[str] = None


class PenggunaUbahReq(BaseModel):
    peran: str
    wilayah: str
    aktif: bool


@router.get("/pengguna")
def daftar(user: dict = Depends(admin)):
    conn = get_connection()
    rows = [dict(r) for r in conn.execute("SELECT id, nama, surel, peran, wilayah, aktif, dibuat FROM pengguna ORDER BY nama")]
    conn.close()
    return {"pengguna": rows, "peran": PERAN}


@router.post("/pengguna")
def tambah(req: PenggunaReq, user: dict = Depends(admin)):
    surel = req.surel.strip().lower()
    if "@" not in surel or "." not in surel.split("@")[-1]:
        raise HTTPException(422, "Alamat surel belum lengkap, misalnya nama@contoh.id.")
    if req.peran not in PERAN:
        raise HTTPException(422, "Pilih peran dari daftar.")
    if len(req.nama.strip()) < 2:
        raise HTTPException(422, "Isi nama lengkap pengguna.")
    sandi = req.kata_sandi or secrets.token_urlsafe(9)
    validate_new_password(sandi)
    conn = get_connection()
    if conn.execute("SELECT 1 FROM pengguna WHERE surel = ?", (surel,)).fetchone():
        conn.close()
        raise HTTPException(409, "Surel ini sudah terdaftar. Pakai surel lain atau ubah akun yang ada.")
    conn.execute("INSERT INTO pengguna (nama, surel, peran, wilayah, sandi_hash, dibuat) VALUES (?, ?, ?, ?, ?, ?)",
                 (req.nama.strip(), surel, req.peran, req.wilayah.strip(), hash_password(sandi), now()))
    log_audit(conn, user["surel"], "pengguna", "tambah", f"{surel} sebagai {req.peran}")
    conn.commit()
    conn.close()
    # Kata sandi sementara ditampilkan sekali agar Admin bisa menyerahkannya; pengguna diminta menggantinya.
    return {"ok": True, "kata_sandi_sementara": None if req.kata_sandi else sandi}


@router.put("/pengguna/{uid}")
def ubah(uid: int, req: PenggunaUbahReq, user: dict = Depends(admin)):
    if req.peran not in PERAN:
        raise HTTPException(422, "Pilih peran dari daftar.")
    if uid == user["id"] and (not req.aktif or req.peran != "Admin"):
        raise HTTPException(422, "Anda tidak bisa menonaktifkan atau menurunkan peran akun Anda sendiri.")
    conn = get_connection()
    conn.execute("UPDATE pengguna SET peran = ?, wilayah = ?, aktif = ? WHERE id = ?",
                 (req.peran, req.wilayah.strip(), int(req.aktif), uid))
    if not req.aktif:
        conn.execute("DELETE FROM sesi WHERE pengguna_id = ?", (uid,))
    log_audit(conn, user["surel"], f"pengguna:{uid}", "ubah", f"{req.peran}, aktif={req.aktif}")
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/log")
def log(limit: int = 100, user: dict = Depends(admin)):
    conn = get_connection()
    rows = [dict(r) for r in conn.execute("SELECT * FROM log_audit ORDER BY id DESC LIMIT ?", (min(limit, 500),))]
    conn.close()
    return {"log": rows}
