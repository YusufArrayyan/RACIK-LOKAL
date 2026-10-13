import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import ZAT_GIZI, get_connection, init_db
from app.routers import audit, auth, export, klaim, pilot, pustaka, racik
from app.seed_data import seed_database

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_database()
    yield


app = FastAPI(
    title="RACIK-LOKAL API",
    description="Sistem racik formula pangan lokal dan pemeriksa klaim label (PRD V2).",
    version="2.0.0",
    lifespan=lifespan,
)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse({"pesan": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    """Ubah galat validasi menjadi satu kalimat yang bisa dipahami pengguna."""
    err = exc.errors()[0] if exc.errors() else {}
    field = str(err.get("loc", ["", "isian"])[-1]).replace("_", " ")
    jenis = err.get("type", "")
    if jenis == "missing":
        pesan = f"Kolom {field} wajib diisi."
    elif "greater_than" in jenis or "less_than" in jenis:
        pesan = f"Nilai {field} di luar rentang yang boleh. Periksa lagi angkanya."
    elif "float" in jenis or "int" in jenis:
        pesan = f"Kolom {field} harus berisi angka."
    else:
        pesan = f"Isian {field} belum benar. Periksa lagi lalu kirim ulang."
    return JSONResponse({"pesan": pesan}, status_code=422)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif request.url.path.startswith("/static/"):
        # Modul JS diimpor tanpa nomor versi; paksa periksa ulang (ETag) agar perubahan langsung terpakai.
        response.headers["Cache-Control"] = "no-cache"
    return response


for r in (auth, pustaka, racik, klaim, pilot, audit, export):
    app.include_router(r.router)


@app.get("/api/contoh")
def contoh_publik():
    """Contoh hasil untuk halaman awal publik (FR-01). Hanya ringkasan, tanpa data pengguna."""
    conn = get_connection()
    row = conn.execute(
        """SELECT f.nama, v.id, v.hasil_json FROM formula f JOIN versi_formula v ON v.formula_id = f.id
           WHERE f.nama LIKE 'Camilan batang tempe-kelor%' AND v.berhasil = 1 ORDER BY v.nomor LIMIT 1""").fetchone()
    bahan = [dict(r) for r in conn.execute("SELECT nama, kelompok, wilayah, foto FROM bahan ORDER BY wilayah DESC, nama")]
    klaim = [dict(r) for r in conn.execute(
        "SELECT zat_gizi, jenis, nilai_pct, lolos FROM hasil_klaim WHERE versi_id = ? ORDER BY lolos DESC, nilai_pct DESC",
        (row["id"],))] if row else []
    conn.close()
    if not row:
        return {"ada": False, "bahan": bahan}
    h = json.loads(row["hasil_json"])
    urut = ["zat_besi", "folat", "protein", "energi", "kalsium", "seng", "vitamin_c"]
    return {
        "ada": True, "nama": row["nama"], "biaya": h["biaya"], "biaya_maks": h.get("biaya_maks"),
        "berat_sajian": h["berat_sajian"], "jumlah_cukup": h["jumlah_cukup"], "jumlah_sasaran": h["jumlah_sasaran"],
        "waktu_ms": h["waktu_ms"],
        "komposisi": [{k: x[k] for k in ("nama", "persen", "gram", "di_batas_atas")} for x in h["komposisi"] if x["gram"] >= 0.05],
        "gizi": [{"zat_gizi": k, **{x: h["gizi"][k][x] for x in ("nama", "satuan", "per_sajian", "target", "persen_target", "cukup")}}
                 for k in urut],
        "sebab": [s["teks"] for s in h.get("sebab_kurang", [])],
        "klaim": [{**k, "lolos": bool(k["lolos"]), "label": f"{k['jenis']} {ZAT_GIZI[k['zat_gizi']]['nama_kecil']}"} for k in klaim],
        "bahan": bahan,
    }


@app.get("/health")
def health():
    return {"status": "ok", "app": "RACIK-LOKAL", "versi": "2.0.0"}


if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/sw.js")
def service_worker():
    # Disajikan dari akar agar cakupan service worker meliputi seluruh aplikasi.
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript",
                        headers={"Cache-Control": "no-cache"})


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(os.path.join(STATIC_DIR, "manifest.webmanifest"), media_type="application/manifest+json")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"), headers={"Cache-Control": "no-cache"})
