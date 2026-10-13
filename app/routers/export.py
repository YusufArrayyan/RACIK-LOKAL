"""Ekspor formula ke CSV (PRD bagian 10: data dapat diekspor)."""
import csv
import io
import json
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app import services
from app.database import get_connection
from app.security import current_user
from app.services import Galat

router = APIRouter(prefix="/api/ekspor", tags=["Ekspor"])


def _angka(v, d=2):
    return "" if v is None else f"{v:.{d}f}".replace(".", ",")


@router.get("/formula/{formula_id}.csv")
def formula_csv(formula_id: int, versi: int | None = None, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        f = services.ambil_formula(conn, formula_id)
        if not services.boleh_lihat(user, f):
            raise Galat(403, "Formula ini milik pengguna lain.")
        if versi:
            v = conn.execute("SELECT * FROM versi_formula WHERE formula_id = ? AND nomor = ?", (formula_id, versi)).fetchone()
        else:
            v = services.versi_terbaru(conn, formula_id)
        if not v or not v["berhasil"]:
            raise Galat(409, "Belum ada hasil racik yang bisa diekspor.")
        hasil = services.lampirkan_takaran(conn, json.loads(v["hasil_json"]))
        sasaran = json.loads(v["sasaran_json"])
        klaim = services.klaim_versi(conn, v["id"])
    finally:
        conn.close()

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Formula", f["nama"]])
    w.writerow(["Versi", v["nomor"], "Dibuat", v["dibuat"]])
    w.writerow(["Kelompok sasaran", sasaran["kelompok"], "Berat sajian (g)", _angka(sasaran["berat_sajian"], 1)])
    w.writerow(["Acuan label berlaku sejak", v["acuan_tanggal"]])
    w.writerow(["Catatan", "Hasil hitungan dari data bahan, bukan hasil uji laboratorium."])
    w.writerow(["Catatan takaran", "Takaran rumah tangga hanya bantuan menakar. Timbang dalam gram untuk produksi."])
    w.writerow([])
    w.writerow(["Bahan", "Bagian (%)", "Gram per sajian", "Biaya (Rp)", "Batas atas (%)", "Takaran rumah tangga (perkiraan)"])
    for k in hasil["komposisi"]:
        if k["gram"] > 0.005:
            w.writerow([k["nama"], _angka(k["persen"]), _angka(k["gram"]), _angka(k["biaya"], 0), _angka(k["batas_atas"], 1),
                        k["takaran"]["teks"] if k.get("takaran") else ""])
    w.writerow(["Biaya bahan per sajian", "", "", _angka(hasil["biaya"], 0)])
    w.writerow([])
    w.writerow(["Zat gizi", "Per sajian", "Sasaran", "Satuan", "Terpenuhi (%)", "Per 100 g", "Retensi"])
    for k, g in hasil["gizi"].items():
        w.writerow([g["nama"], _angka(g["per_sajian"]), _angka(g["target"]), g["satuan"], _angka(g["persen_target"], 0),
                    _angka(g["per_100g"]), _angka(g["retensi"])])
    w.writerow([])
    w.writerow(["Klaim", "% acuan label per 100 g", "Syarat (%)", "Status", "Saran"])
    for k in klaim:
        w.writerow([k["label"], _angka(k["nilai_pct"], 1), _angka(k["syarat_pct"], 0),
                    "Boleh dipakai" if k["lolos"] else "Belum boleh", k["saran"]])
    nama = f"formula-{formula_id}-v{v['nomor']}-{date.today().isoformat()}.csv"
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{nama}"'})
