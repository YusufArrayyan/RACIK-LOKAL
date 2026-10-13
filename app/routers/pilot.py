"""Pantauan pilot: peserta, persetujuan wali, batch, uji lab, asupan, Hb (FR-50 s.d. FR-54)."""
import csv
import io
import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app import services
from app.database import get_connection, log_audit
from app.security import decrypt_float, encrypt_value, require_role

router = APIRouter(prefix="/api/pilot", tags=["Pilot"])
akses_pilot = require_role("Koordinator", "Admin")

# FR-53: peringatan bila hasil lab berbeda lebih dari 10% dari hitungan formula.
AMBANG_SELISIH_LAB = 0.10


class PesertaReq(BaseModel):
    kode: str
    kelompok: str
    persetujuan_wali: bool = False
    hb_minggu_0: Optional[float] = Field(None, ge=4, le=20)
    hb_minggu_8: Optional[float] = Field(None, ge=4, le=20)


class PesertaUbahReq(BaseModel):
    persetujuan_wali: bool
    hb_minggu_0: Optional[float] = Field(None, ge=4, le=20)
    hb_minggu_8: Optional[float] = Field(None, ge=4, le=20)


class BatchReq(BaseModel):
    kode: str
    tanggal: str
    umkm: str
    jumlah_sajian: int = Field(gt=0)
    biaya_bahan_total: Optional[float] = Field(None, ge=0)
    uji_mikroba: str = "Belum diuji"
    fe_lab_mg: Optional[float] = Field(None, ge=0)


class AsupanReq(BaseModel):
    minggu: int = Field(ge=0, le=52)
    kelompok: str
    fe_mg_per_hari: float = Field(ge=0, le=50)


def _pilot(conn, pilot_id):
    p = conn.execute("SELECT * FROM pilot WHERE id = ?", (pilot_id,)).fetchone()
    if not p:
        raise HTTPException(404, "Pilot tidak ditemukan.")
    return p


def _rata(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


@router.get("")
def daftar(user: dict = Depends(akses_pilot)):
    conn = get_connection()
    rows = [dict(r) for r in conn.execute("SELECT id, nama, wilayah FROM pilot ORDER BY id DESC")]
    conn.close()
    return {"pilot": rows}


@router.get("/{pilot_id}/ringkasan")
def ringkasan(pilot_id: int, user: dict = Depends(akses_pilot)):
    conn = get_connection()
    try:
        p = _pilot(conn, pilot_id)
        f = conn.execute("SELECT id, nama FROM formula WHERE id = ?", (p["formula_id"],)).fetchone()
        v = conn.execute("SELECT * FROM versi_formula WHERE formula_id = ? AND nomor = ?",
                         (p["formula_id"], p["versi_nomor"])).fetchone()
        hasil = json.loads(v["hasil_json"]) if v else {}
        minggu_ke = min(p["lama_minggu"], max(0, (date.today() - date.fromisoformat(p["tanggal_mulai"])).days // 7))

        peserta = conn.execute("SELECT * FROM peserta WHERE pilot_id = ? ORDER BY kode", (pilot_id,)).fetchall()
        kelompok = sorted({r["kelompok"] for r in peserta})
        aktif = [r for r in peserta if r["persetujuan_wali"]]

        asupan_rows = conn.execute("SELECT * FROM asupan WHERE pilot_id = ? ORDER BY minggu", (pilot_id,)).fetchall()
        seri = {}
        for r in asupan_rows:
            seri.setdefault(r["kelompok"], []).append({"minggu": r["minggu"], "fe": r["fe_mg_per_hari"]})
        kelompok = sorted(set(kelompok) | set(seri))
        minggu_terakhir = max((r["minggu"] for r in asupan_rows), default=None)
        terakhir = [r["fe_mg_per_hari"] for r in asupan_rows if r["minggu"] == minggu_terakhir]

        batch = [dict(r) for r in conn.execute("SELECT * FROM batch WHERE pilot_id = ? ORDER BY tanggal DESC, kode DESC", (pilot_id,))]
        peringatan = []
        for b in batch:
            b["selisih_pct"] = None
            if b["fe_lab_mg"] and b["fe_hitung_mg"]:
                b["selisih_pct"] = round((b["fe_lab_mg"] - b["fe_hitung_mg"]) / b["fe_hitung_mg"] * 100, 1)
                if abs(b["selisih_pct"]) > AMBANG_SELISIH_LAB * 100 and not b["koreksi_dipakai"]:
                    arah = "lebih rendah" if b["selisih_pct"] < 0 else "lebih tinggi"
                    peringatan.append({"jenis": "lab", "batch_id": b["id"], "kode": b["kode"],
                                       "judul": f"Uji lab batch {b['kode']} {arah} dari hitungan.",
                                       "fe_lab": b["fe_lab_mg"], "fe_hitung": b["fe_hitung_mg"]})
            if b["uji_mikroba"] == "Tidak memenuhi syarat":
                peringatan.append({"jenis": "mikroba", "batch_id": b["id"], "kode": b["kode"],
                                   "judul": f"Batch {b['kode']} tidak memenuhi syarat uji mikroba. Jangan dibagikan."})

        sajian = sum(b["jumlah_sajian"] for b in batch if b["biaya_bahan_total"])
        biaya_nyata = round(sum(b["biaya_bahan_total"] for b in batch if b["biaya_bahan_total"]) / sajian, 1) if sajian else None

        hb = []
        for k in kelompok:
            rows = [r for r in aktif if r["kelompok"] == k]
            h0 = [decrypt_float(r["hb_minggu_0"]) for r in rows]
            h8 = [decrypt_float(r["hb_minggu_8"]) for r in rows]
            hb.append({"kelompok": k, "peserta": len(rows), "hb0": _rata(h0), "hb8": _rata(h8),
                       "n_hb0": sum(1 for x in h0 if x is not None), "n_hb8": sum(1 for x in h8 if x is not None)})

        return {
            "id": p["id"], "nama": p["nama"], "wilayah": p["wilayah"], "tanggal_mulai": p["tanggal_mulai"],
            "lama_minggu": p["lama_minggu"], "minggu_ke": minggu_ke, "target_fe": p["target_fe_mg"],
            "formula": {"id": f["id"], "nama": f["nama"], "versi": p["versi_nomor"]} if f else None,
            "fe_hitung_sajian": round(hasil.get("gizi", {}).get("zat_besi", {}).get("per_sajian", 0), 2) if hasil else None,
            "asupan_terakhir": _rata(terakhir), "minggu_terakhir": minggu_terakhir,
            "peserta_total": len(peserta), "peserta_aktif": len(aktif), "wali_belum": len(peserta) - len(aktif),
            "biaya_nyata": biaya_nyata, "biaya_hitung": v["biaya"] if v else None,
            "kelompok": kelompok, "seri": seri, "peringatan": peringatan, "batch": batch, "hb": hb,
            "peserta": [{"id": r["id"], "kode": r["kode"], "kelompok": r["kelompok"],
                         "persetujuan_wali": bool(r["persetujuan_wali"]),
                         "hb_minggu_0": decrypt_float(r["hb_minggu_0"]), "hb_minggu_8": decrypt_float(r["hb_minggu_8"])}
                        for r in peserta],
        }
    finally:
        conn.close()


def _cek_hb(persetujuan, *nilai):
    if not persetujuan and any(v is not None for v in nilai):
        raise HTTPException(422, "Hb hanya boleh dicatat setelah formulir persetujuan wali masuk.")


@router.post("/{pilot_id}/peserta")
def tambah_peserta(pilot_id: int, req: PesertaReq, user: dict = Depends(akses_pilot)):
    _cek_hb(req.persetujuan_wali, req.hb_minggu_0, req.hb_minggu_8)
    conn = get_connection()
    try:
        _pilot(conn, pilot_id)
        kode = req.kode.strip().upper()
        if not kode:
            raise HTTPException(422, "Isi kode peserta, misalnya P-049. Jangan pakai nama asli.")
        if conn.execute("SELECT 1 FROM peserta WHERE pilot_id = ? AND kode = ?", (pilot_id, kode)).fetchone():
            raise HTTPException(409, f"Kode {kode} sudah dipakai. Pilih kode lain.")
        conn.execute(
            """INSERT INTO peserta (pilot_id, kode, kelompok, persetujuan_wali, tanggal_persetujuan, hb_minggu_0, hb_minggu_8)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (pilot_id, kode, req.kelompok.strip(), int(req.persetujuan_wali),
             date.today().isoformat() if req.persetujuan_wali else None,
             encrypt_value(req.hb_minggu_0), encrypt_value(req.hb_minggu_8)))
        log_audit(conn, user["surel"], f"pilot:{pilot_id}", "tambah peserta", kode)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.put("/{pilot_id}/peserta/{peserta_id}")
def ubah_peserta(pilot_id: int, peserta_id: int, req: PesertaUbahReq, user: dict = Depends(akses_pilot)):
    _cek_hb(req.persetujuan_wali, req.hb_minggu_0, req.hb_minggu_8)
    conn = get_connection()
    try:
        r = conn.execute("SELECT * FROM peserta WHERE id = ? AND pilot_id = ?", (peserta_id, pilot_id)).fetchone()
        if not r:
            raise HTTPException(404, "Peserta tidak ditemukan.")
        tgl = r["tanggal_persetujuan"] or (date.today().isoformat() if req.persetujuan_wali else None)
        conn.execute(
            "UPDATE peserta SET persetujuan_wali = ?, tanggal_persetujuan = ?, hb_minggu_0 = ?, hb_minggu_8 = ? WHERE id = ?",
            (int(req.persetujuan_wali), tgl if req.persetujuan_wali else None,
             encrypt_value(req.hb_minggu_0), encrypt_value(req.hb_minggu_8), peserta_id))
        log_audit(conn, user["surel"], f"pilot:{pilot_id}", "ubah peserta", r["kode"])
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/{pilot_id}/batch")
def tambah_batch(pilot_id: int, req: BatchReq, user: dict = Depends(akses_pilot)):
    conn = get_connection()
    try:
        p = _pilot(conn, pilot_id)
        try:
            date.fromisoformat(req.tanggal)
        except ValueError:
            raise HTTPException(422, "Tanggal batch belum benar. Pakai format tahun-bulan-tanggal.")
        kode = req.kode.strip().upper()
        if conn.execute("SELECT 1 FROM batch WHERE pilot_id = ? AND kode = ?", (pilot_id, kode)).fetchone():
            raise HTTPException(409, f"Kode batch {kode} sudah ada. Pakai kode lain.")
        v = conn.execute("SELECT hasil_json FROM versi_formula WHERE formula_id = ? AND nomor = ?",
                         (p["formula_id"], p["versi_nomor"])).fetchone()
        fe_hitung = round(json.loads(v["hasil_json"])["gizi"]["zat_besi"]["per_sajian"], 2) if v else None
        conn.execute(
            """INSERT INTO batch (pilot_id, kode, tanggal, umkm, jumlah_sajian, biaya_bahan_total, uji_mikroba, fe_lab_mg, fe_hitung_mg)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (pilot_id, kode, req.tanggal, req.umkm.strip(), req.jumlah_sajian, req.biaya_bahan_total,
             req.uji_mikroba, req.fe_lab_mg, fe_hitung))
        log_audit(conn, user["surel"], f"pilot:{pilot_id}", "tambah batch", kode)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.put("/{pilot_id}/asupan")
def simpan_asupan(pilot_id: int, req: AsupanReq, user: dict = Depends(akses_pilot)):
    conn = get_connection()
    try:
        p = _pilot(conn, pilot_id)
        if req.minggu > p["lama_minggu"]:
            raise HTTPException(422, f"Pilot ini hanya {p['lama_minggu']} minggu.")
        conn.execute("INSERT OR REPLACE INTO asupan (pilot_id, minggu, kelompok, fe_mg_per_hari) VALUES (?, ?, ?, ?)",
                     (pilot_id, req.minggu, req.kelompok.strip(), req.fe_mg_per_hari))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/{pilot_id}/batch/{batch_id}/jadikan-batas")
def jadikan_batas(pilot_id: int, batch_id: int, user: dict = Depends(akses_pilot)):
    """FR-53: hasil lab menjadi koreksi pada formula, lalu formula kembali ke Racik."""
    conn = get_connection()
    try:
        p = _pilot(conn, pilot_id)
        b = conn.execute("SELECT * FROM batch WHERE id = ? AND pilot_id = ?", (batch_id, pilot_id)).fetchone()
        if not b or not b["fe_lab_mg"] or not b["fe_hitung_mg"]:
            raise HTTPException(404, "Batch ini belum punya hasil uji zat besi.")
        if b["koreksi_dipakai"]:
            raise HTTPException(409, "Hasil lab batch ini sudah dipakai sebagai koreksi.")
        faktor = services.pakai_koreksi_lab(conn, user, p["formula_id"], "zat_besi", b["fe_lab_mg"], b["fe_hitung_mg"],
                                            f"uji lab batch {b['kode']}")
        conn.execute("UPDATE batch SET koreksi_dipakai = 1 WHERE id = ?", (batch_id,))
        conn.commit()
        return {"formula_id": p["formula_id"], "faktor": faktor}
    finally:
        conn.close()


@router.get("/{pilot_id}/ekspor.csv")
def ekspor(pilot_id: int, user: dict = Depends(akses_pilot)):
    """FR-54: data pilot ke CSV. Peserta hanya muncul dengan kode, tanpa identitas."""
    data = ringkasan(pilot_id, user)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["bagian", "kode", "kelompok", "minggu", "nilai", "satuan", "keterangan"])
    for kel, titik in data["seri"].items():
        for t in titik:
            w.writerow(["asupan", "", kel, t["minggu"], str(t["fe"]).replace(".", ","), "mg zat besi/hari", ""])
    for b in data["batch"]:
        w.writerow(["batch", b["kode"], b["umkm"], "", str(b["fe_lab_mg"] or "").replace(".", ","), "mg zat besi/sajian (lab)",
                    f"{b['tanggal']}; {b['jumlah_sajian']} sajian; mikroba: {b['uji_mikroba']}"])
    for ps in data["peserta"]:
        w.writerow(["peserta", ps["kode"], ps["kelompok"], 0, str(ps["hb_minggu_0"] or "").replace(".", ","), "g/dL Hb",
                    "wali setuju" if ps["persetujuan_wali"] else "formulir wali belum masuk"])
        if ps["hb_minggu_8"] is not None:
            w.writerow(["peserta", ps["kode"], ps["kelompok"], 8, str(ps["hb_minggu_8"]).replace(".", ","), "g/dL Hb", ""])
    nama = f"pilot-{pilot_id}-{date.today().isoformat()}.csv"
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{nama}"'})
