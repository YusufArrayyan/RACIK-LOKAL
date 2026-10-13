"""Skema basis data RACIK-LOKAL sesuai PRD V2 bagian 9 (model data).

SQLite dipakai untuk prototipe; struktur tabel sengaja dibuat sederhana agar
mudah dipindah ke PostgreSQL (PRD bagian 12).
"""
import os
import sqlite3
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.environ.get("RACIK_DB_PATH", os.path.join(DATA_DIR, "racik_lokal_v2.db"))

# Zat gizi yang dikelola sistem (FR-10). Urutan ini dipakai di seluruh antarmuka.
ZAT_GIZI = {
    "energi":    {"nama": "Energi",    "satuan": "kkal", "jenis": "wajib", "retensi": 1.00},
    "protein":   {"nama": "Protein",   "satuan": "g",    "jenis": "wajib", "retensi": 0.95},
    "zat_besi":  {"nama": "Zat besi",  "satuan": "mg",   "jenis": "wajib", "retensi": 1.00},
    "folat":     {"nama": "Folat",     "satuan": "µg",   "jenis": "wajib", "retensi": 0.70},
    "vitamin_c": {"nama": "Vitamin C", "satuan": "mg",   "jenis": "lunak", "retensi": 0.50},
    "kalsium":   {"nama": "Kalsium",   "satuan": "mg",   "jenis": "wajib", "retensi": 1.00},
    "seng":      {"nama": "Seng",      "satuan": "mg",   "jenis": "lunak", "retensi": 1.00},
}

STATUS_FORMULA = ("Draf", "Ditinjau", "Perlu revisi", "Disetujui", "Ditolak")
PERAN = ("Formulator", "Peninjau", "Koordinator", "Admin")

# Bentuk nama di tengah kalimat: hanya huruf pertama yang dikecilkan ("vitamin C", bukan "vitamin c").
for _z in ZAT_GIZI.values():
    _z["nama_kecil"] = _z["nama"][0].lower() + _z["nama"][1:]


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_db():
    conn = get_connection()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS pengguna (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        surel TEXT UNIQUE NOT NULL,
        peran TEXT NOT NULL,
        wilayah TEXT NOT NULL,
        sandi_hash TEXT NOT NULL,
        aktif INTEGER NOT NULL DEFAULT 1,
        dibuat TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sesi (
        token_hash TEXT PRIMARY KEY,
        pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
        kedaluwarsa TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS atur_ulang_sandi (
        token_hash TEXT PRIMARY KEY,
        pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
        kedaluwarsa TEXT NOT NULL,
        dipakai INTEGER NOT NULL DEFAULT 0
    );

    -- Bahan (FR-10): batas pemakaian umum dipakai sebagai batas awal di Racik.
    CREATE TABLE IF NOT EXISTS bahan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        kelompok TEXT NOT NULL,
        harga_per_kg REAL NOT NULL,
        wilayah TEXT NOT NULL,
        status_pasokan TEXT NOT NULL DEFAULT 'Tersedia',
        batas_bawah REAL NOT NULL DEFAULT 0,
        batas_atas REAL NOT NULL DEFAULT 100,
        alasan_batas TEXT,
        tanggal_harga TEXT NOT NULL,
        diubah TEXT NOT NULL,
        foto TEXT,
        foto_keterangan TEXT,
        foto_kredit TEXT,
        foto_sumber TEXT
    );

    -- NilaiGizi (FR-11): satu baris per bahan per zat gizi, masing-masing bersumber.
    -- Zat gizi yang tidak punya baris berarti datanya belum ada, bukan nol.
    CREATE TABLE IF NOT EXISTS nilai_gizi (
        bahan_id INTEGER NOT NULL REFERENCES bahan(id) ON DELETE CASCADE,
        zat_gizi TEXT NOT NULL,
        nilai REAL NOT NULL,
        sumber TEXT NOT NULL,
        tanggal_data TEXT NOT NULL,
        PRIMARY KEY (bahan_id, zat_gizi)
    );

    -- Riwayat perubahan nilai dan harga (FR-14).
    CREATE TABLE IF NOT EXISTS riwayat_bahan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bahan_id INTEGER NOT NULL REFERENCES bahan(id) ON DELETE CASCADE,
        kolom TEXT NOT NULL,
        nilai_lama TEXT,
        nilai_baru TEXT,
        oleh TEXT NOT NULL,
        waktu TEXT NOT NULL
    );

    -- Takaran rumah tangga (URT): padanan gram untuk sendok dan gelas.
    -- Hanya bantuan menakar bagi UMKM; gizi dan klaim selalu dihitung dari gram.
    CREATE TABLE IF NOT EXISTS takaran_bahan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bahan_id INTEGER NOT NULL REFERENCES bahan(id) ON DELETE CASCADE,
        nama_takaran TEXT NOT NULL,
        berat_gram REAL NOT NULL CHECK (berat_gram > 0),
        sumber TEXT NOT NULL,
        tanggal_data TEXT NOT NULL,
        UNIQUE (bahan_id, nama_takaran)
    );

    -- AcuanLabel (FR-34): disimpan bertanggal agar perubahan aturan tidak mengubah kode.
    CREATE TABLE IF NOT EXISTS acuan_label (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zat_gizi TEXT NOT NULL,
        nilai_alg REAL NOT NULL,
        ambang_sumber REAL NOT NULL,
        ambang_tinggi REAL NOT NULL,
        tanggal_berlaku TEXT NOT NULL,
        dokumen_rujukan TEXT NOT NULL,
        UNIQUE (zat_gizi, tanggal_berlaku)
    );

    -- Sasaran per sajian per kelompok (FR-22), kira-kira 10% kebutuhan harian.
    CREATE TABLE IF NOT EXISTS kelompok_sasaran (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT UNIQUE NOT NULL,
        sasaran_json TEXT NOT NULL,
        sumber TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS formula (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        pemilik_id INTEGER NOT NULL REFERENCES pengguna(id),
        status TEXT NOT NULL DEFAULT 'Draf',
        langkah_terakhir INTEGER NOT NULL DEFAULT 1,
        sasaran_json TEXT NOT NULL,
        koreksi_json TEXT NOT NULL DEFAULT '{}',
        peninjau_id INTEGER REFERENCES pengguna(id),
        catatan_revisi TEXT,
        dibuat TEXT NOT NULL,
        diubah TEXT NOT NULL
    );

    -- BatasBahan untuk formula yang sedang dikerjakan (FR-23, FR-41).
    -- Salinannya dibekukan ke versi_formula.kendala_json setiap kali Racik dijalankan.
    CREATE TABLE IF NOT EXISTS batas_bahan (
        formula_id INTEGER NOT NULL REFERENCES formula(id) ON DELETE CASCADE,
        bahan_id INTEGER NOT NULL REFERENCES bahan(id) ON DELETE CASCADE,
        dipakai INTEGER NOT NULL DEFAULT 1,
        batas_bawah REAL NOT NULL DEFAULT 0,
        batas_atas REAL NOT NULL DEFAULT 100,
        dikunci INTEGER NOT NULL DEFAULT 0,
        alasan TEXT,
        asal TEXT NOT NULL DEFAULT 'bawaan',
        PRIMARY KEY (formula_id, bahan_id)
    );

    -- VersiFormula (FR-27): menyimpan semua masukan agar hasil dapat dihitung ulang.
    CREATE TABLE IF NOT EXISTS versi_formula (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        formula_id INTEGER NOT NULL REFERENCES formula(id) ON DELETE CASCADE,
        nomor INTEGER NOT NULL,
        sasaran_json TEXT NOT NULL,
        kendala_json TEXT NOT NULL,
        data_bahan_json TEXT NOT NULL,
        hasil_json TEXT NOT NULL,
        berhasil INTEGER NOT NULL,
        biaya REAL,
        acuan_tanggal TEXT,
        dibuat_oleh INTEGER NOT NULL REFERENCES pengguna(id),
        dibuat TEXT NOT NULL,
        UNIQUE (formula_id, nomor)
    );

    CREATE TABLE IF NOT EXISTS hasil_klaim (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        versi_id INTEGER NOT NULL REFERENCES versi_formula(id) ON DELETE CASCADE,
        zat_gizi TEXT NOT NULL,
        jenis TEXT NOT NULL,
        nilai_pct REAL NOT NULL,
        nilai_pct_sajian REAL NOT NULL,
        syarat_pct REAL NOT NULL,
        lolos INTEGER NOT NULL,
        selisih REAL NOT NULL,
        saran TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pengajuan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        formula_id INTEGER NOT NULL REFERENCES formula(id) ON DELETE CASCADE,
        versi_id INTEGER NOT NULL REFERENCES versi_formula(id) ON DELETE CASCADE,
        pengirim_id INTEGER NOT NULL REFERENCES pengguna(id),
        peninjau_id INTEGER NOT NULL REFERENCES pengguna(id),
        catatan TEXT,
        klaim_json TEXT NOT NULL,
        waktu TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tinjauan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        formula_id INTEGER NOT NULL REFERENCES formula(id) ON DELETE CASCADE,
        versi_id INTEGER NOT NULL REFERENCES versi_formula(id) ON DELETE CASCADE,
        peninjau_id INTEGER NOT NULL REFERENCES pengguna(id),
        keputusan TEXT NOT NULL,
        catatan TEXT,
        batas_baru_json TEXT NOT NULL DEFAULT '[]',
        waktu TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pilot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        wilayah TEXT NOT NULL,
        formula_id INTEGER REFERENCES formula(id),
        versi_nomor INTEGER,
        tanggal_mulai TEXT NOT NULL,
        lama_minggu INTEGER NOT NULL DEFAULT 8,
        target_fe_mg REAL NOT NULL DEFAULT 2.5,
        koordinator_id INTEGER REFERENCES pengguna(id)
    );

    -- Peserta (FR-50). Hb dienkripsi saat disimpan (PRD bagian 10, keamanan).
    CREATE TABLE IF NOT EXISTS peserta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pilot_id INTEGER NOT NULL REFERENCES pilot(id) ON DELETE CASCADE,
        kode TEXT NOT NULL,
        kelompok TEXT NOT NULL,
        persetujuan_wali INTEGER NOT NULL DEFAULT 0,
        tanggal_persetujuan TEXT,
        hb_minggu_0 TEXT,
        hb_minggu_8 TEXT,
        UNIQUE (pilot_id, kode)
    );

    -- Batch produksi dan hasil uji (FR-51, FR-53).
    CREATE TABLE IF NOT EXISTS batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pilot_id INTEGER NOT NULL REFERENCES pilot(id) ON DELETE CASCADE,
        kode TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        umkm TEXT NOT NULL,
        jumlah_sajian INTEGER NOT NULL,
        biaya_bahan_total REAL,
        uji_mikroba TEXT NOT NULL DEFAULT 'Belum diuji',
        fe_lab_mg REAL,
        fe_hitung_mg REAL,
        koreksi_dipakai INTEGER NOT NULL DEFAULT 0,
        UNIQUE (pilot_id, kode)
    );

    -- Asupan zat besi dari produk, rata-rata kelompok per minggu (FR-52).
    CREATE TABLE IF NOT EXISTS asupan (
        pilot_id INTEGER NOT NULL REFERENCES pilot(id) ON DELETE CASCADE,
        minggu INTEGER NOT NULL,
        kelompok TEXT NOT NULL,
        fe_mg_per_hari REAL NOT NULL,
        PRIMARY KEY (pilot_id, minggu, kelompok)
    );

    CREATE TABLE IF NOT EXISTS log_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        waktu TEXT NOT NULL,
        pengguna TEXT NOT NULL,
        objek TEXT NOT NULL,
        aksi TEXT NOT NULL,
        rincian TEXT
    );
    """)
    # Basis data lama: tambahkan kolom foto bahan bila belum ada.
    kolom_bahan = {r[1] for r in conn.execute("PRAGMA table_info(bahan)")}
    for kolom in ("foto", "foto_keterangan", "foto_kredit", "foto_sumber"):
        if kolom not in kolom_bahan:
            conn.execute(f"ALTER TABLE bahan ADD COLUMN {kolom} TEXT")
    conn.commit()
    conn.close()


def log_audit(conn, pengguna: str, objek: str, aksi: str, rincian: str = ""):
    conn.execute(
        "INSERT INTO log_audit (waktu, pengguna, objek, aksi, rincian) VALUES (?, ?, ?, ?, ?)",
        (now(), pengguna, objek, aksi, rincian),
    )
