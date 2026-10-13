# RACIK-LOKAL

Sistem racik formula pangan lokal dan pemeriksa klaim label untuk intervensi zat besi remaja putri.
Kode ini mengikuti **PRD RACIK-LOKAL Lengkap V2** (13 Oktober 2026).

Pendamping esai Lomba Esai Nasional HIMAGI 2026 (Universitas Tidar).
Penulis: Muhammad Yusuf Arrayyan (G1A024009), Universitas Bengkulu.

> Semua angka gizi, harga, dan hasil di aplikasi ini adalah **data contoh**. Nilainya bukan data TKPI
> dan bukan hasil uji laboratorium. Acuan label dan syarat klaim wajib dicocokkan dengan teks resmi
> Peraturan BPOM Nomor 1 Tahun 2022 sebelum dipakai untuk produk sungguhan.

## Menjalankan

```bash
python run.py
```

Buka **http://127.0.0.1:8000**. Dokumentasi API: **http://127.0.0.1:8000/docs**.
Bila port 8000 sedang dipakai, pilih port lain: `PORT=8010 python run.py`.

Basis data `data/racik_lokal_v2.db` dan data contohnya dibuat otomatis saat pertama kali dijalankan.
Untuk mengulang dari awal, hentikan server, hapus berkas itu, lalu jalankan lagi.

Kebutuhan: Python 3.11 atau lebih baru dengan `fastapi`, `uvicorn`, `scipy`, `numpy`, `cryptography`.

### Akun contoh

Semua akun memakai kata sandi `racik-lokal-2026` (hanya untuk prototipe lokal). Halaman Masuk juga
menyediakan tombol isi cepat.

| Surel | Peran | Yang bisa dicoba |
|---|---|---|
| dewi@contoh.id | Formulator | Formula baru, Sasaran, Racik, Cek klaim, Ajukan |
| rina@contoh.id | Peninjau (ahli gizi) | Meninjau formula, mengubah batas bahan (REVISI BATAS), mengubah data bahan |
| rian@contoh.id | Koordinator pilot | Pilot: asupan, batch, uji lab, peserta, ekspor CSV |
| admin@contoh.id | Admin | Semua hal di atas, akun, acuan label, log aktivitas |

Fitur "Lupa kata sandi" belum terhubung ke layanan surel. Tautannya dicetak di jendela server.

### Uji otomatis

```bash
python -m unittest tests/test_system.py
```

23 uji: Mesin Racik, Penjaga Klaim, hak akses, alur Ajukan dan Tinjau, hitung ulang dari versi,
enkripsi Hb, peringatan uji lab, umur data, pesan galat, takaran rumah tangga, foto bahan, dan berkas panduan.

## Panduan penggunaan (PDF dan video)

Halaman awal punya bagian **Panduan** berisi video bersuara (sekitar 1,5 menit) dan tombol unduh PDF
bergambar (14 halaman). Setelah masuk, panduan yang sama ada di menu **Panduan** (ponsel: tombol akun).
Berkasnya ada di `static/panduan/`.

Keduanya dibuat ulang dengan skrip di `tools/panduan/` (Node.js dan Chromium dari Playwright; tanpa build):

```bash
# 1. Server dengan basis data contoh yang bersih
RACIK_DB_PATH=/tmp/panduan.db PORT=8012 python run.py
# 2. Tangkapan layar bertanda nomor, PDF, lalu video (perekaman berjalan waktu nyata, sekitar 1,5 menit)
node tools/panduan/tangkap.cjs http://127.0.0.1:8012
node tools/panduan/buat_pdf.cjs
node tools/panduan/rekam_video.cjs
# Versi MP4 (H.264 dan AAC) untuk dibagikan atau diputar di PowerPoint:
node tools/panduan/rekam_video.cjs --mp4 "Video Panduan RACIK-LOKAL.mp4"
```

Teks panduan ada di `tools/panduan/panduan.html`; adegan, teks, dan efek suara video ada di
`tools/panduan/video.html`. Efek suara dan musik latar dibuat dengan Web Audio, tanpa berkas suara dari luar.
Video berformat WebM (VP9 dan Opus), jadi bisa diputar di Chrome, Edge, Firefox, dan Android.

## Deploy gratis ke Hugging Face Spaces

```bash
python -m huggingface_hub.cli.hf auth login   # sekali saja, login lewat peramban
python tools/deploy/hf_space.py               # buat Space, unggah, tunggu sampai berjalan
```

Space memakai `Dockerfile` di proyek ini. Basis data dibuat ulang dari data contoh setiap kali Space
dijalankan ulang (penyimpanan Space gratis tidak permanen). Kunci enkripsi disimpan sebagai secret Space
dan salinannya di `data/hf_kunci_data.key` (tidak ikut diunggah).

## Foto bahan

Setiap bahan contoh punya foto bentuk asli dari Wikimedia Commons (lisensi CC0, CC BY, atau CC BY-SA),
disimpan di `static/assets/bahan/`. Nama pemotret, lisensi, dan tautan sumber tersimpan di kolom
`foto_kredit` dan `foto_sumber` tabel `bahan` dan ditampilkan di halaman detail bahan. Untuk bahan olahan
(misalnya tepung tempe), fotonya menunjukkan bahan asalnya dan keterangannya menyebut hal itu.

## Alur utama (PRD 11.3)

1. Pengunjung membuka halaman awal, membaca cara kerja, lalu **Masuk**.
2. **Beranda** menampilkan pekerjaan terakhir dan tombol untuk melanjutkannya.
3. Formulator menjalani empat langkah: **Sasaran**, **Racik**, **Cek klaim**, **Ajukan**.
4. Peninjau menyetujui, menolak, atau meminta revisi. Batas bahan yang diubah peninjau
   mengembalikan formula ke Racik dengan catatan yang terlihat (REVISI BATAS).
5. Koordinator memantau pilot. Hasil uji lab yang berbeda lebih dari 10% dari hitungan bisa
   dijadikan faktor koreksi, dan formula kembali ke Racik.

## Arsitektur

```
RACIK-LOKAL/
├── app/
│   ├── main.py            FastAPI, galat berbahasa Indonesia, header keamanan, PWA
│   ├── database.py        Skema SQLite (PRD bagian 9) dan daftar zat gizi
│   ├── security.py        Hash kata sandi PBKDF2, sesi cookie, hak akses per peran, enkripsi Hb
│   ├── optimizer.py       Mesin Racik: program linear HiGHS (PRD bagian 7)
│   ├── claim_engine.py    Penjaga Klaim: Sumber dan Tinggi per 100 g (PRD bagian 8)
│   ├── services.py        Logika formula: versi, ajukan, tinjau, REVISI BATAS, koreksi lab
│   ├── seed_data.py       Data contoh Rejang Lebong dan akun demo
│   └── routers/           auth, pustaka (bahan), racik (formula), klaim (acuan label),
│                          pilot, audit (admin), export
├── static/
│   ├── index.html         Kerangka aplikasi satu halaman
│   ├── styles.css         Token dari DESIGN.md
│   ├── js/                app.js (router), ui.js, store.js, views/*.js, ikon Phosphor
│   ├── assets/brand/      Logo 512, 192, 64, 40 px dan ikon PWA
│   ├── manifest.webmanifest, sw.js
├── tests/test_system.py
├── DESIGN.md              Sistem desain untuk pengembang (PRD 11.8)
├── _arsip_v1/             Salinan kode versi sebelumnya (PRD V1), boleh dihapus
└── run.py
```

## Kesesuaian dengan PRD V2

| Bagian PRD | Yang dibangun |
|---|---|
| FR-01 s.d. FR-04 | Halaman awal publik, masuk dengan surel dan kata sandi, keluar, atur ulang kata sandi, empat peran, Beranda "Lanjutkan pekerjaan" |
| FR-10 s.d. FR-14 | Bahan dengan 7 zat gizi, sumber dan tanggal per nilai, tanda "Data perlu diperbarui" setelah 12 bulan, cari, tambah, ubah, riwayat perubahan |
| FR-20 s.d. FR-28 | Sasaran otomatis dari kelompok, batas bawah/atas/kunci, faktor retensi, hasil gram dan gizi, sebab kekurangan dengan tombol perbaikan, kendala berkonflik dan saran satu per satu, versi dan perbandingan, racik ulang |
| FR-30 s.d. FR-34 | Persen ALG per 100 g dan per sajian, klaim Sumber 15% dan Tinggi 30%, satu saran per klaim, klaim yang belum lolos terkunci saat Ajukan, acuan label bertanggal yang dikelola Admin |
| FR-40 s.d. FR-44 | Ajukan dengan catatan, keputusan peninjau dengan batas baru dan alasan, koreksi uji lab, status Draf, Ditinjau, Perlu revisi, Disetujui, Ditolak |
| FR-50 s.d. FR-54 | Peserta dengan kode dan persetujuan wali, batch dan uji mikroba/zat besi, grafik asupan per kelompok, Hb minggu 0 dan 8, peringatan lab, ekspor CSV |
| Bagian 7 | Tahap kedua solver memilih komposisi yang paling dekat dengan versi sebelumnya bila sama murah; koreksi lab tidak menimpa data sumber |
| Bagian 10 | Racik di bawah 2 detik, target sentuh 44 px, navigasi bawah di ponsel, status dengan ikon dan kata, Hb terenkripsi, setiap versi menyimpan semua masukan untuk dihitung ulang |
| Bagian 11 | Teal Mangkuk #066867, sudut 2 px, IBM Plex Sans dan Mono, ikon Phosphor, empat keadaan layar |

## Perbedaan dari PRD yang disengaja

- **Antarmuka memakai JavaScript murni (modul ES), bukan React dan Vite.** Aplikasi tetap bisa
  dijalankan dengan satu perintah `python run.py` tanpa langkah build, dan halamannya ringan untuk
  jaringan lemah (PRD bagian 14). Struktur per layar di `static/js/views/` bisa dipindah ke React
  bila tim memilih tumpukan itu.
- **SQLite, bukan PostgreSQL**, untuk prototipe satu berkas. Skema ditulis agar mudah dipindah.
- Peninjau mendapat layar Tinjau sendiri (menjawab pertanyaan terbuka PRD bagian 15).
- Status **Ditolak** ditambahkan karena FR-41 menyebut keputusan menolak.
- **Takaran rumah tangga (URT)** ditambahkan untuk UMKM yang menakar dengan sendok atau gelas
  (tabel `takaran_bahan`). Layar Racik menampilkan padanan terdekat di samping gram, misalnya
  "3,6 g ≈ 1 sdm peres"; layar Bahan punya tabel takaran dan kalkulator kecil. Gram tetap angka
  utama: takaran tidak pernah dipakai untuk menghitung gizi, biaya, atau klaim.

## Keterbatasan

- Belum ada layanan surel untuk atur ulang kata sandi.
- Kunci enkripsi data peserta disimpan di `data/kunci_data.key`. Di produksi, pakai variabel
  lingkungan `RACIK_KUNCI_DATA` dan simpan kuncinya di luar server aplikasi.
- Berat takaran (sdt, sdm, gelas belimbing) untuk 14 bahan masih data contoh. Timbang ulang dan
  minta ahli gizi memverifikasinya sebelum dipakai untuk produksi.
- Faktor retensi (folat 0,7, vitamin C 0,5, protein 0,95) dan sasaran per sajian masih contoh dan
  perlu dikonfirmasi ahli gizi.
- Aplikasi tidak memberi saran medis, tidak menggantikan tablet tambah darah, dan tidak mengajukan
  izin edar ke BPOM.
