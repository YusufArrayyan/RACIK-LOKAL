"""Data awal RACIK-LOKAL.

Seluruh angka gizi, harga, dan hasil di sini adalah DATA CONTOH untuk
menggambarkan perilaku sistem (PRD V2, catatan penting). Nilai ini bukan data
TKPI dan bukan hasil uji laboratorium. Acuan label dan syarat klaim harus
dicocokkan dengan teks resmi Peraturan BPOM Nomor 1 Tahun 2022 sebelum dipakai.

Akun demo (kata sandi sama untuk semua akun, hanya untuk prototipe lokal):
  dewi@contoh.id     Formulator
  rina@contoh.id     Peninjau (ahli gizi)
  rian@contoh.id     Koordinator pilot
  admin@contoh.id    Admin
"""
import json
import random
from datetime import date, timedelta

from app.database import get_connection, now
from app.security import encrypt_value, hash_password
from app import services

SANDI_DEMO = "racik-lokal-2026"

PENGGUNA = [
    ("Dewi Anggraini", "dewi@contoh.id", "Formulator", "Rejang Lebong"),
    ("Rina Mardiani", "rina@contoh.id", "Peninjau", "Rejang Lebong"),
    ("Hendra Saputra", "hendra@contoh.id", "Peninjau", "Kota Bengkulu"),
    ("Rian Setiawan", "rian@contoh.id", "Koordinator", "Rejang Lebong"),
    ("Muhammad Yusuf Arrayyan", "admin@contoh.id", "Admin", "Kota Bengkulu"),
]

# Sasaran per sajian, kira-kira 10% kebutuhan harian (perlu dikonfirmasi ahli gizi, PRD 15).
KELOMPOK = [
    ("Remaja putri, 13 sampai 18 tahun",
     {"energi": 140, "protein": 6.5, "zat_besi": 2.5, "folat": 28, "vitamin_c": 6.5, "kalsium": 100, "seng": 0.9}),
    ("Remaja putri, 10 sampai 12 tahun",
     {"energi": 130, "protein": 5.5, "zat_besi": 0.8, "folat": 25, "vitamin_c": 5.0, "kalsium": 120, "seng": 0.8}),
    ("Perempuan, 19 sampai 29 tahun",
     {"energi": 150, "protein": 6.0, "zat_besi": 1.8, "folat": 40, "vitamin_c": 7.5, "kalsium": 100, "seng": 0.8}),
]

# Acuan label gizi contoh. Ambang 15% dan 30% per 100 g mengikuti PRD bagian 8.
ACUAN = [
    ("energi", 2150, 15, 30), ("protein", 60, 15, 30), ("zat_besi", 22, 15, 30), ("folat", 400, 15, 30),
    ("vitamin_c", 90, 15, 30), ("kalsium", 1100, 15, 30), ("seng", 13, 15, 30),
]

# nama, kelompok, harga/kg, wilayah, batas atas, alasan batas, sumber, tanggal data, gizi per 100 g
BAHAN = [
    ("Tepung tempe kedelai", "Kacang-kacangan", 38000, "Rejang Lebong", 40, "Tekstur adonan menjadi padat di atas 40%",
     "TKPI 2017", "2026-02-15",
     {"energi": 431, "protein": 46.5, "zat_besi": 9.0, "folat": 160, "vitamin_c": 0, "kalsium": 347, "seng": 4.2}),
    ("Bubuk daun kelor", "Sayuran daun", 90000, "Rejang Lebong", 9, "Rasa getir terasa di atas 9%",
     "TKPI 2017", "2026-03-01",
     {"energi": 205, "protein": 27.1, "zat_besi": 28.2, "folat": 300, "vitamin_c": 17.3, "kalsium": 2003, "seng": 3.3}),
    ("Hati ayam kering", "Hewani", 120000, "Rejang Lebong", 3.5, "Aroma amis tercium di atas 3,5%",
     "Uji lab", "2026-05-20",
     {"energi": 412, "protein": 62.0, "zat_besi": 33.0, "folat": 590, "vitamin_c": 15, "kalsium": 40, "seng": 11.0}),
    ("Tepung ubi jalar ungu", "Umbi", 42000, "Rejang Lebong", 35, "Warna ungu terlalu pekat di atas 35%",
     "TKPI 2017", "2026-01-20",
     {"energi": 350, "protein": 2.8, "zat_besi": 1.4, "folat": 18, "vitamin_c": 6.0, "kalsium": 70, "seng": 0.5}),
    ("Pasta pisang kepok", "Buah", 18000, "Rejang Lebong", 25, "Adonan terlalu basah di atas 25%",
     "TKPI 2017", "2026-02-10",
     {"energi": 116, "protein": 1.2, "zat_besi": 0.5, "folat": 20, "vitamin_c": 9.0, "kalsium": 10, "seng": 0.2}),
    ("Kelapa parut sangrai", "Kacang-kacangan", 30000, "Rejang Lebong", 12, "Rasa minyak dominan di atas 12%",
     "Label produsen", "2025-06-12",
     {"energi": 600, "protein": 6.0, "zat_besi": 2.0, "folat": 26, "vitamin_c": 1.5, "kalsium": 20, "seng": 1.6}),
    ("Gula aren", "Pemanis", 28000, "Rejang Lebong", 8, "Terlalu manis di atas 8%",
     "TKPI 2017", "2026-04-08",
     {"energi": 368, "protein": 0, "zat_besi": 2.6, "folat": 0, "vitamin_c": 0, "kalsium": 75, "seng": 0.2}),
    ("Bubuk sari jeruk nipis", "Buah", 160000, "Rejang Lebong", 3.5, "Rasa asam terlalu tajam di atas 3,5%",
     "Label produsen", "2025-07-01",
     {"energi": 300, "protein": 3.0, "zat_besi": 1.5, "folat": 30, "vitamin_c": 160, "kalsium": 120, "seng": 0.6}),
    ("Kacang hijau kupas", "Kacang-kacangan", 26000, "Rejang Lebong", 45, None,
     "TKPI 2017", "2026-02-12",
     {"energi": 323, "protein": 22.9, "zat_besi": 7.5, "folat": 160, "vitamin_c": 6.0, "kalsium": 223, "seng": 2.7}),
    ("Tepung mokaf", "Umbi", 15000, "Rejang Lebong", 50, None,
     "TKPI 2017", "2026-01-08",
     {"energi": 363, "protein": 1.2, "zat_besi": 1.1, "folat": 10, "vitamin_c": 0, "kalsium": 33, "seng": 0.4}),
    ("Pisang raja", "Buah", 15000, "Rejang Lebong", 30, None,
     "TKPI 2017", "2026-03-18",
     {"energi": 120, "protein": 1.2, "zat_besi": 0.8, "folat": 22, "vitamin_c": 10, "kalsium": 10, "seng": 0.2}),
    ("Ikan teri kering", "Hewani", 110000, "Kota Bengkulu", 6, "Rasa asin dan amis di atas 6%",
     "TKPI 2017", "2026-02-02",
     {"energi": 331, "protein": 68.7, "zat_besi": 3.6, "folat": 20, "vitamin_c": 0, "kalsium": 2381, "seng": 3.2}),
    ("Jambu biji merah bubuk", "Buah", 85000, "Kota Bengkulu", 5, "Rasa sepat di atas 5%",
     "Label produsen", "2026-06-11",
     {"energi": 310, "protein": 4.0, "zat_besi": 1.2, "folat": 80, "vitamin_c": 120, "kalsium": 70, "seng": 0.9}),
    ("Biji labu kuning sangrai", "Kacang-kacangan", 95000, "Kota Bengkulu", 10, None,
     "Uji lab", "2026-05-05",
     {"energi": 559, "protein": 30.2, "zat_besi": 8.8, "folat": 58, "vitamin_c": 1.9, "kalsium": 46, "seng": 7.8}),
]

# Takaran rumah tangga (URT), gram per takaran: sdt peres, sdm peres, sdm munjung, gelas belimbing.
# DATA CONTOH: perkiraan untuk peragaan, belum ditimbang dan belum diverifikasi ahli gizi.
# Takaran hanya bantuan menakar; gizi dan klaim tetap dihitung dari gram.
SUMBER_TAKARAN = "Data contoh, perlu verifikasi ahli gizi"
TANGGAL_TAKARAN = "2026-10-13"
URT = ("sdt peres", "sdm peres", "sdm munjung", "gelas belimbing")
TAKARAN = {
    "Tepung tempe kedelai":     (2.5, 7.0, 12.0, 100),
    "Bubuk daun kelor":         (1.2, 3.6, 6.0, 50),
    "Hati ayam kering":         (2.0, 6.0, 10.0, None),
    "Tepung ubi jalar ungu":    (2.5, 7.5, 13.0, 110),
    "Pasta pisang kepok":       (5.0, 15.0, 22.0, 220),
    "Kelapa parut sangrai":     (1.5, 5.0, 9.0, 70),
    "Gula aren":                (3.5, 10.0, 16.0, 150),
    "Bubuk sari jeruk nipis":   (2.5, 8.0, 13.0, None),
    "Kacang hijau kupas":       (4.0, 12.0, 18.0, 180),
    "Tepung mokaf":             (2.5, 8.0, 13.0, 115),
    "Pisang raja":              (5.0, 15.0, 22.0, 200),
    "Ikan teri kering":         (1.5, 5.0, 9.0, 60),
    "Jambu biji merah bubuk":   (2.5, 7.0, 12.0, None),
    "Biji labu kuning sangrai": (3.0, 9.0, 14.0, 130),
}

# Foto bentuk asli bahan dari Wikimedia Commons (berlisensi bebas), disimpan di static/assets/bahan/.
# Untuk bahan olahan, fotonya menunjukkan bahan asalnya; keterangan menjelaskan hal itu.
# nama bahan: (berkas, keterangan, pembuat, lisensi, halaman sumber)
_WM = "https://commons.wikimedia.org/wiki/File:"
FOTO = {
    "Tepung tempe kedelai": ("tepung-tempe-kedelai", "Tempe kedelai, bahan asal tepung tempe", "Sakurai Midori", "CC BY-SA 3.0", _WM + "Tempeh_tempe.jpg"),
    "Bubuk daun kelor": ("bubuk-daun-kelor", "Bubuk daun kelor", "Satyalatha", "CC BY-SA 4.0", _WM + "Moringa_leaves_powder.jpg"),
    "Hati ayam kering": ("hati-ayam-kering", "Hati ayam segar, sebelum dikeringkan", "Poupou l'quourouce", "CC BY 4.0", _WM + "Preparing_Chicken_Liver_01.JPG"),
    "Tepung ubi jalar ungu": ("tepung-ubi-jalar-ungu", "Tepung ubi jalar ungu", "Fumikas Sagisavas", "CC0", _WM + "Purple_sweet_potato_powder.jpg"),
    "Pasta pisang kepok": ("pasta-pisang-kepok", "Pisang kepok, bahan asal pasta pisang", "Firzafp", "CC BY-SA 4.0", _WM + "Indonesian_Saba_banana_(Pisang_kepok).jpg"),
    "Kelapa parut sangrai": ("kelapa-parut-sangrai", "Kelapa parut, sebelum disangrai", "Biswarup Ganguly", "CC BY 3.0", _WM + "Grated_Coconut_-_Howrah_2013-10-18_3541.JPG"),
    "Gula aren": ("gula-aren", "Gula aren cetak", "DwiFidratul", "CC0", _WM + "Gula_Aren_Asli_Puncak_Pato.jpg"),
    "Bubuk sari jeruk nipis": ("bubuk-sari-jeruk-nipis", "Jeruk nipis, bahan asal bubuk sari", "Filo gèn'", "CC BY-SA 4.0", _WM + "Lime_01.jpg"),
    "Kacang hijau kupas": ("kacang-hijau-kupas", "Kacang hijau kupas", "Sudeshna Banerjee", "CC BY-SA 3.0", _WM + "Moong_Dal.jpg"),
    "Tepung mokaf": ("tepung-mokaf", "Tepung singkong. Mokaf adalah tepung singkong yang difermentasi", "Hajia Hijjah", "CC BY-SA 4.0", _WM + "Cassava_flour.jpg"),
    "Pisang raja": ("pisang-raja", "Tandan pisang raja di pohon", "Kalakutjet", "CC BY-SA 4.0", _WM + "Pisang_raja_bulu_kuning.jpg"),
    "Ikan teri kering": ("ikan-teri-kering", "Ikan teri kering", "Nafisaacdr", "CC BY 4.0", _WM + "Ikan_teri_yang_suddah_dikeringkan.jpg"),
    "Jambu biji merah bubuk": ("jambu-biji-merah-bubuk", "Jambu biji merah, bahan asal bubuk", "Ivar Leidus", "CC BY-SA 4.0", _WM + "Guava_pink_fruit.jpg"),
    "Biji labu kuning sangrai": ("biji-labu-kuning-sangrai", "Biji labu sangrai", "Veganbaking.net", "CC BY-SA 2.0", _WM + "Roasted_Spiced_Pumpkin_Seeds_(6392360645).jpg"),
}


def lengkapi_foto(conn):
    """Isi foto bahan contoh yang belum punya foto (juga untuk basis data yang dibuat sebelum ada foto)."""
    for nama, (berkas, ket, pembuat, lisensi, sumber) in FOTO.items():
        conn.execute("""UPDATE bahan SET foto = ?, foto_keterangan = ?, foto_kredit = ?, foto_sumber = ?
                        WHERE nama = ? AND foto IS NULL""",
                     (f"/static/assets/bahan/{berkas}.jpg", ket, f"Foto: {pembuat}, {lisensi}, Wikimedia Commons",
                      sumber, nama))


def seed_database():
    conn = get_connection()
    if conn.execute("SELECT COUNT(*) FROM pengguna").fetchone()[0] > 0:
        lengkapi_foto(conn)
        conn.commit()
        conn.close()
        return
    print("Mengisi data contoh RACIK-LOKAL...")
    t = now()

    sandi = hash_password(SANDI_DEMO)
    ids = {}
    for nama, surel, peran, wilayah in PENGGUNA:
        cur = conn.execute("INSERT INTO pengguna (nama, surel, peran, wilayah, sandi_hash, dibuat) VALUES (?, ?, ?, ?, ?, ?)",
                           (nama, surel, peran, wilayah, sandi, t))
        ids[surel] = cur.lastrowid
    users = {s: dict(conn.execute("SELECT * FROM pengguna WHERE id = ?", (i,)).fetchone()) for s, i in ids.items()}

    for zat, alg, sumber, tinggi in ACUAN:
        conn.execute("""INSERT INTO acuan_label (zat_gizi, nilai_alg, ambang_sumber, ambang_tinggi, tanggal_berlaku, dokumen_rujukan)
                        VALUES (?, ?, ?, ?, '2022-01-14', 'Peraturan BPOM Nomor 1 Tahun 2022 (nilai contoh, perlu dicocokkan)')""",
                     (zat, alg, sumber, tinggi))
    for nama, sasaran in KELOMPOK:
        conn.execute("INSERT INTO kelompok_sasaran (nama, sasaran_json, sumber) VALUES (?, ?, ?)",
                     (nama, json.dumps(sasaran), "Kira-kira 10% AKG harian (PMK 28/2019), data contoh"))

    bahan_id = {}
    for nama, kel, harga, wil, atas, alasan, sumber, tgl, gizi in BAHAN:
        cur = conn.execute(
            """INSERT INTO bahan (nama, kelompok, harga_per_kg, wilayah, status_pasokan, batas_bawah, batas_atas,
                                  alasan_batas, tanggal_harga, diubah)
               VALUES (?, ?, ?, ?, 'Tersedia', 0, ?, ?, ?, ?)""",
            (nama, kel, harga, wil, atas, alasan, tgl, t))
        bahan_id[nama] = cur.lastrowid
        for zat, nilai in gizi.items():
            conn.execute("INSERT INTO nilai_gizi (bahan_id, zat_gizi, nilai, sumber, tanggal_data) VALUES (?, ?, ?, ?, ?)",
                         (cur.lastrowid, zat, nilai, sumber, tgl))
    lengkapi_foto(conn)
    for nama, berat in TAKARAN.items():
        for urt, gram in zip(URT, berat):
            if gram:
                conn.execute("""INSERT INTO takaran_bahan (bahan_id, nama_takaran, berat_gram, sumber, tanggal_data)
                                VALUES (?, ?, ?, ?, ?)""", (bahan_id[nama], urt, gram, SUMBER_TAKARAN, TANGGAL_TAKARAN))
    # Contoh riwayat harga (FR-14)
    conn.execute("INSERT INTO riwayat_bahan (bahan_id, kolom, nilai_lama, nilai_baru, oleh, waktu) VALUES (?, 'harga_per_kg', '34000', '38000', 'admin@contoh.id', '2026-02-15 09:00:00')",
                 (bahan_id["Tepung tempe kedelai"],))

    dewi, rina, rian = users["dewi@contoh.id"], users["rina@contoh.id"], users["rian@contoh.id"]
    sasaran = services.sasaran_bawaan(conn)

    def formula(nama, bahan, **ubah):
        s = {**sasaran, **ubah}
        return services.buat_formula(conn, dewi, nama, s, [bahan_id[b] for b in bahan])

    # 1. Bar kacang hijau-pisang: tiga versi, disetujui, dipakai di pilot.
    f_bar = formula("Bar kacang hijau-pisang", ["Kacang hijau kupas", "Pisang raja", "Tepung tempe kedelai", "Bubuk daun kelor",
                                                 "Gula aren", "Kelapa parut sangrai", "Bubuk sari jeruk nipis"])
    services.racik(conn, dewi, f_bar)
    _set_batas(conn, dewi, f_bar, bahan_id["Bubuk daun kelor"], 6, "Panelis menilai rasa getir pada versi 1")
    services.racik(conn, dewi, f_bar)
    _set_batas(conn, dewi, f_bar, bahan_id["Kelapa parut sangrai"], 9, "Rasa minyak terlalu kuat pada uji rasa kedua")
    services.racik(conn, dewi, f_bar)
    services.tandai_langkah(conn, f_bar, 3)
    _ajukan_lolos(conn, dewi, f_bar, rina["id"], "Versi 3 setelah uji rasa kedua.")
    services.tinjau(conn, rina, f_bar, "Disetujui", "Siap untuk produksi batch pilot.", [])
    conn.execute("UPDATE formula SET diubah = '2026-10-06 10:12:00' WHERE id = ?", (f_bar,))

    # 2. Bubur instan ubi-kelor: dua versi, sedang ditinjau.
    f_bubur = formula("Bubur instan ubi-kelor", ["Tepung ubi jalar ungu", "Bubuk daun kelor", "Kacang hijau kupas",
                                                  "Tepung mokaf", "Gula aren", "Jambu biji merah bubuk"],
                      wilayah="Semua wilayah", berat_sajian=50.0, biaya_maks=2500.0)
    services.racik(conn, dewi, f_bubur)
    services.racik(conn, dewi, f_bubur)
    services.tandai_langkah(conn, f_bubur, 3)
    _ajukan_lolos(conn, dewi, f_bubur, rina["id"], None)

    # 3. Kue kering kelor-kelapa: draf, baru sasaran.
    f_kue = formula("Kue kering kelor-kelapa", ["Tepung mokaf", "Bubuk daun kelor", "Kelapa parut sangrai", "Gula aren",
                                                 "Kacang hijau kupas"], berat_sajian=30.0, biaya_maks=1500.0)
    services.racik(conn, dewi, f_kue)

    # 4. Camilan batang tempe-kelor 40 g: contoh PRD 7.2, hasil racik sudah jadi, lanjut Cek klaim.
    f_tempe = formula("Camilan batang tempe-kelor 40 g",
                      ["Tepung tempe kedelai", "Bubuk daun kelor", "Hati ayam kering", "Tepung ubi jalar ungu",
                       "Pasta pisang kepok", "Kelapa parut sangrai", "Gula aren", "Bubuk sari jeruk nipis"])
    services.racik(conn, dewi, f_tempe)

    # Urutan "pekerjaan terakhir" di Beranda mengikuti waktu perubahan.
    hari_ini = date.today()
    for fid, mundur in ((f_bubur, 3), (f_kue, 2), (f_tempe, 0)):
        conn.execute("UPDATE formula SET diubah = ? WHERE id = ?",
                     (f"{(hari_ini - timedelta(days=mundur)).isoformat()} 09:{30 + mundur:02d}:00", fid))

    _seed_pilot(conn, rian, f_bar)
    conn.commit()
    conn.close()


def _set_batas(conn, user, fid, bid, atas, alasan):
    services.simpan_batas(conn, user, fid, [{"bahan_id": bid, "batas_bawah": 0, "batas_atas": atas, "alasan": alasan,
                                             "dipakai": 1}])


def _ajukan_lolos(conn, user, fid, peninjau_id, catatan):
    v = services.versi_terbaru(conn, fid)
    lolos = [f"{k['jenis']}:{k['zat_gizi']}" for k in services.klaim_versi(conn, v["id"]) if k["lolos"]]
    services.ajukan(conn, user, fid, peninjau_id, catatan, lolos)


def _seed_pilot(conn, koordinator, formula_id):
    v = services.versi_terbaru(conn, formula_id)
    hasil = json.loads(v["hasil_json"])
    fe_hitung = round(hasil["gizi"]["zat_besi"]["per_sajian"], 2)
    biaya_hitung = hasil["biaya"]
    mulai = date.today() - timedelta(weeks=5, days=2)
    cur = conn.execute(
        """INSERT INTO pilot (nama, wilayah, formula_id, versi_nomor, tanggal_mulai, lama_minggu, target_fe_mg, koordinator_id)
           VALUES ('Pilot Rejang Lebong', 'Rejang Lebong', ?, ?, ?, 8, 2.5, ?)""",
        (formula_id, v["nomor"], mulai.isoformat(), koordinator["id"]))
    pid = cur.lastrowid

    rnd = random.Random(2026)
    kelompok = ["Curup", "Padang Ulak Tanding"]
    for i in range(48):
        kel = kelompok[i % 2]
        setuju = 0 if i in (17, 40) else 1
        hb0 = round(rnd.uniform(10.2, 12.4), 1)
        conn.execute(
            """INSERT INTO peserta (pilot_id, kode, kelompok, persetujuan_wali, tanggal_persetujuan, hb_minggu_0)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (pid, f"P-{i + 1:03d}", kel, setuju, mulai.isoformat() if setuju else None,
             encrypt_value(hb0) if setuju else None))

    # Asupan zat besi dari produk, mg per hari, rata-rata kelompok (minggu 0 adalah awal).
    asupan = {"Curup": [0.6, 1.3, 1.8, 2.0, 2.2, 2.3], "Padang Ulak Tanding": [0.5, 1.0, 1.4, 1.6, 1.8, 1.9]}
    for kel, nilai in asupan.items():
        for minggu, fe in enumerate(nilai):
            conn.execute("INSERT INTO asupan (pilot_id, minggu, kelompok, fe_mg_per_hari) VALUES (?, ?, ?, ?)",
                         (pid, minggu, kel, fe))

    umkm = ["UMKM Dapur Kelor Curup", "UMKM Sari Pisang Ulak"]
    for n in range(1, 10):
        tgl = mulai + timedelta(days=4 * (n - 1))
        sajian = 120 + 10 * (n % 3)
        fe_lab = round(fe_hitung * (0.85 if n == 9 else rnd.uniform(0.95, 1.04)), 2)
        biaya = round(biaya_hitung * rnd.uniform(1.02, 1.06) * sajian, -2)
        conn.execute(
            """INSERT INTO batch (pilot_id, kode, tanggal, umkm, jumlah_sajian, biaya_bahan_total, uji_mikroba, fe_lab_mg, fe_hitung_mg)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (pid, f"B-{n:02d}", tgl.isoformat(), umkm[n % 2], sajian, biaya,
             "Memenuhi syarat" if n < 9 else "Belum diuji", fe_lab, fe_hitung))
