"""Kata sandi, sesi, hak akses per peran, dan enkripsi data peserta."""
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request

from app.database import DATA_DIR, get_connection

SESSION_COOKIE = "racik_sesi"
SESSION_HOURS = 12
RESET_MINUTES = 30
PBKDF2_ROUNDS = 240_000


# ---------- Kata sandi ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt_b64, digest_b64 = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(rounds))
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except (ValueError, TypeError):
        return False


def validate_new_password(password: str):
    if len(password) < 8:
        raise HTTPException(422, "Kata sandi minimal 8 karakter. Tambah beberapa huruf atau angka.")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------- Sesi ----------

def create_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now() + timedelta(hours=SESSION_HOURS)).isoformat(timespec="seconds")
    conn.execute("DELETE FROM sesi WHERE kedaluwarsa < ?", (datetime.now().isoformat(timespec="seconds"),))
    conn.execute("INSERT INTO sesi (token_hash, pengguna_id, kedaluwarsa) VALUES (?, ?, ?)",
                 (_hash_token(token), user_id, expires))
    return token


def delete_session(conn, token: str):
    conn.execute("DELETE FROM sesi WHERE token_hash = ?", (_hash_token(token),))


def create_reset_token(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(24)
    expires = (datetime.now() + timedelta(minutes=RESET_MINUTES)).isoformat(timespec="seconds")
    conn.execute("INSERT INTO atur_ulang_sandi (token_hash, pengguna_id, kedaluwarsa) VALUES (?, ?, ?)",
                 (_hash_token(token), user_id, expires))
    return token


def consume_reset_token(conn, token: str):
    row = conn.execute(
        "SELECT * FROM atur_ulang_sandi WHERE token_hash = ? AND dipakai = 0 AND kedaluwarsa > ?",
        (_hash_token(token), datetime.now().isoformat(timespec="seconds")),
    ).fetchone()
    if not row:
        return None
    conn.execute("UPDATE atur_ulang_sandi SET dipakai = 1 WHERE token_hash = ?", (row["token_hash"],))
    return row["pengguna_id"]


def current_user(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Sesi Anda belum ada atau sudah berakhir. Silakan masuk lagi.")
    conn = get_connection()
    row = conn.execute(
        """SELECT p.id, p.nama, p.surel, p.peran, p.wilayah FROM sesi s
           JOIN pengguna p ON p.id = s.pengguna_id
           WHERE s.token_hash = ? AND s.kedaluwarsa > ? AND p.aktif = 1""",
        (_hash_token(token), datetime.now().isoformat(timespec="seconds")),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(401, "Sesi Anda sudah berakhir. Silakan masuk lagi.")
    return dict(row)


def require_role(*roles):
    """Dependensi FastAPI: hanya peran tertentu yang boleh memakai titik API ini (FR-03)."""
    def checker(user: dict = Depends(current_user)) -> dict:
        if user["peran"] not in roles:
            daftar = ", ".join(roles)
            raise HTTPException(403, f"Halaman ini hanya untuk peran {daftar}. Hubungi Admin bila Anda perlu akses.")
        return user
    return checker


# ---------- Enkripsi data peserta ----------

_fernet = None


def _cipher() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.environ.get("RACIK_KUNCI_DATA")
        if not key:
            path = os.path.join(DATA_DIR, "kunci_data.key")
            os.makedirs(DATA_DIR, exist_ok=True)
            if not os.path.exists(path):
                with open(path, "wb") as f:
                    f.write(Fernet.generate_key())
            with open(path, "rb") as f:
                key = f.read().strip()
        try:
            _fernet = Fernet(key)
        except ValueError:
            # Kunci dari layanan hosting (misalnya nilai acak Render) belum tentu berformat Fernet;
            # turunkan menjadi kunci 32 byte yang sah.
            raw = key.encode() if isinstance(key, str) else key
            _fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw).digest()))
    return _fernet


def encrypt_value(value) -> str | None:
    if value is None or value == "":
        return None
    return _cipher().encrypt(str(value).encode()).decode()


def decrypt_float(token: str | None) -> float | None:
    if not token:
        return None
    try:
        return float(_cipher().decrypt(token.encode()).decode())
    except (InvalidToken, ValueError):
        return None
