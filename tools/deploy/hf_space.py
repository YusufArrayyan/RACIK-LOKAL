"""Deploy RACIK-LOKAL ke Hugging Face Spaces (gratis, Docker).

Sekali saja, login dulu:   python -m huggingface_hub.cli.hf auth login
Lalu jalankan:             python tools/deploy/hf_space.py [--nama racik-lokal] [--tanpa-tunggu]

Skrip ini membuat Space bila belum ada, memasang kunci enkripsi data peserta sebagai secret,
mengunggah berkas aplikasi saja (tanpa basis data lokal, tes, dan alat panduan), lalu menunggu
sampai Space berjalan dan memeriksa alamatnya.
"""
import argparse
import base64
import os
import shutil
import sys
import tempfile
import time
import urllib.request

from huggingface_hub import HfApi

AKAR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KUNCI_LOKAL = os.path.join(AKAR, "data", "hf_kunci_data.key")  # data/ tidak ikut diunggah
IKUT = ["app", "static", "run.py", "requirements.txt", "Dockerfile", "DESIGN.md"]

README_SPACE = """---
title: RACIK-LOKAL
emoji: 🥣
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Racik camilan bergizi dari bahan lokal Bengkulu
---

# RACIK-LOKAL

Prototipe pendamping esai HIMAGI 2026: meracik formula camilan bergizi dari bahan lokal Bengkulu,
menghitung biaya, dan memeriksa klaim label menurut Peraturan BPOM Nomor 1 Tahun 2022.

Semua angka adalah **data contoh**, bukan data TKPI dan bukan hasil uji laboratorium. Data yang diubah
pengunjung kembali ke data contoh setiap kali Space dijalankan ulang.

Akun contoh (kata sandi `racik-lokal-2026`): dewi@contoh.id (Formulator), rina@contoh.id (Peninjau),
rian@contoh.id (Koordinator), admin@contoh.id (Admin).
"""


def kunci_data():
    if os.path.exists(KUNCI_LOKAL):
        return open(KUNCI_LOKAL, encoding="utf-8").read().strip()
    os.makedirs(os.path.dirname(KUNCI_LOKAL), exist_ok=True)
    k = base64.b64encode(os.urandom(32)).decode()
    with open(KUNCI_LOKAL, "w", encoding="utf-8") as f:
        f.write(k)
    return k


def siapkan_berkas(tujuan):
    abaikan = shutil.ignore_patterns("__pycache__", "*.pyc")
    for nama in IKUT:
        asal = os.path.join(AKAR, nama)
        if os.path.isdir(asal):
            shutil.copytree(asal, os.path.join(tujuan, nama), ignore=abaikan)
        else:
            shutil.copy2(asal, tujuan)
    with open(os.path.join(tujuan, "README.md"), "w", encoding="utf-8") as f:
        f.write(README_SPACE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nama", default="racik-lokal")
    ap.add_argument("--tanpa-tunggu", action="store_true")
    a = ap.parse_args()

    api = HfApi()
    pemilik = api.whoami()["name"]
    repo = f"{pemilik}/{a.nama}"
    print(f"Masuk sebagai {pemilik}. Space: {repo}")

    api.create_repo(repo, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
    api.add_space_secret(repo, "RACIK_KUNCI_DATA", kunci_data())
    api.add_space_variable(repo, "RACIK_COOKIE_SAMESITE", "none")

    with tempfile.TemporaryDirectory() as tmp:
        siapkan_berkas(tmp)
        api.upload_folder(folder_path=tmp, repo_id=repo, repo_type="space",
                          commit_message="Deploy RACIK-LOKAL", delete_patterns=["*"])
    alamat = f"https://{pemilik.lower()}-{a.nama.lower()}.hf.space".replace("_", "-")
    print(f"Berkas terunggah. Halaman Space: https://huggingface.co/spaces/{repo}")
    if a.tanpa_tunggu:
        return

    print("Menunggu Space selesai dibangun (biasanya 3 sampai 6 menit)...")
    terakhir = None
    for _ in range(120):
        tahap = api.get_space_runtime(repo).stage
        if tahap != terakhir:
            print("  tahap:", tahap)
            terakhir = tahap
        if tahap == "RUNNING":
            break
        if tahap in ("BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR"):
            sys.exit(f"Space gagal ({tahap}). Lihat log di https://huggingface.co/spaces/{repo}?logs=build")
        time.sleep(10)
    for _ in range(12):
        try:
            with urllib.request.urlopen(alamat + "/api/contoh", timeout=30) as r:
                if r.status == 200:
                    print("Aplikasi berjalan di", alamat)
                    return
        except Exception:
            time.sleep(10)
    sys.exit(f"Space berjalan, tetapi {alamat} belum menjawab. Coba buka sebentar lagi.")


if __name__ == "__main__":
    main()
