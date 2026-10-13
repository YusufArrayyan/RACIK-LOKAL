"""FR-02, FR-03: masuk, keluar, dan atur ulang kata sandi."""
import os

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.database import get_connection, log_audit
from app.security import (SESSION_COOKIE, SESSION_HOURS, consume_reset_token, create_reset_token, create_session,
                          current_user, delete_session, hash_password, validate_new_password, verify_password)

router = APIRouter(prefix="/api/auth", tags=["Akun"])


class MasukReq(BaseModel):
    surel: str
    kata_sandi: str


class LupaReq(BaseModel):
    surel: str


class AturUlangReq(BaseModel):
    token: str
    kata_sandi: str


@router.post("/login")
def masuk(req: MasukReq, response: Response, request: Request):
    conn = get_connection()
    row = conn.execute("SELECT * FROM pengguna WHERE surel = ? AND aktif = 1", (req.surel.strip().lower(),)).fetchone()
    if not row or not verify_password(req.kata_sandi, row["sandi_hash"]):
        conn.close()
        raise HTTPException(401, "Surel atau kata sandi salah. Periksa lagi, atau atur ulang lewat \"Lupa kata sandi\".")
    token = create_session(conn, row["id"])
    log_audit(conn, row["surel"], "akun", "masuk")
    conn.commit()
    conn.close()
    # RACIK_COOKIE_SAMESITE=none dipakai bila aplikasi tampil di dalam iframe situs lain (misalnya Hugging Face Spaces);
    # cookie seperti itu wajib Secure, jadi hanya berlaku lewat https.
    samesite = os.environ.get("RACIK_COOKIE_SAMESITE", "lax")
    https = request.url.scheme == "https"
    if samesite == "none" and not https:
        samesite = "lax"
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_HOURS * 3600, httponly=True, samesite=samesite,
                        secure=https, path="/")
    return {"nama": row["nama"], "peran": row["peran"]}


@router.post("/keluar")
def keluar(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        conn = get_connection()
        delete_session(conn, token)
        conn.commit()
        conn.close()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/saya")
def saya(request: Request):
    """Pengguna yang sedang masuk, atau null bila belum masuk (tanpa galat 401 di halaman publik)."""
    try:
        return current_user(request)
    except HTTPException:
        return None


@router.post("/lupa-sandi")
def lupa_sandi(req: LupaReq, request: Request):
    """Selalu menjawab sama agar tidak membocorkan surel mana yang terdaftar.

    Prototipe belum terhubung ke layanan surel; tautan dicatat di konsol server.
    """
    conn = get_connection()
    row = conn.execute("SELECT * FROM pengguna WHERE surel = ? AND aktif = 1", (req.surel.strip().lower(),)).fetchone()
    if row:
        token = create_reset_token(conn, row["id"])
        conn.commit()
        tautan = f"{request.base_url}#/atur-ulang?token={token}"
        print(f"[RACIK-LOKAL] Tautan atur ulang kata sandi untuk {row['surel']}: {tautan}")
    conn.close()
    return {"pesan": "Bila surel itu terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim. Tautan berlaku 30 menit."}


@router.post("/atur-ulang")
def atur_ulang(req: AturUlangReq):
    validate_new_password(req.kata_sandi)
    conn = get_connection()
    uid = consume_reset_token(conn, req.token)
    if not uid:
        conn.close()
        raise HTTPException(400, "Tautan ini sudah dipakai atau kedaluwarsa. Minta tautan baru lewat \"Lupa kata sandi\".")
    conn.execute("UPDATE pengguna SET sandi_hash = ? WHERE id = ?", (hash_password(req.kata_sandi), uid))
    conn.execute("DELETE FROM sesi WHERE pengguna_id = ?", (uid,))
    row = conn.execute("SELECT surel FROM pengguna WHERE id = ?", (uid,)).fetchone()
    log_audit(conn, row["surel"], "akun", "atur ulang kata sandi")
    conn.commit()
    conn.close()
    return {"pesan": "Kata sandi sudah diganti. Silakan masuk dengan kata sandi baru."}
