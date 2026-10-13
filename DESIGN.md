---
name: RACIK-LOKAL
description: "Antarmuka kerja yang tenang untuk UMKM pangan dan ahli gizi. Satu aksen Teal Mangkuk (#066867) dari logo, permukaan abu kehijauan yang datar, garis rambut sebagai pemisah, sudut 2 px, IBM Plex Sans untuk teks dan IBM Plex Mono untuk angka. Gaya mengikuti kedisiplinan IBM Carbon (datar, persegi, tanpa bayangan), disesuaikan dengan PRD V2 bagian 11."
reference: "awesome-design-md/ibm (Carbon) sebagai acuan gaya; nilai warna dan komponen di bawah adalah milik RACIK-LOKAL."

colors:
  accent: "#066867"          # Teal Mangkuk, satu-satunya aksen: tombol utama, tautan, fokus, langkah aktif
  accent-hover: "#05504F"
  accent-pressed: "#043E3D"
  accent-tint: "#DCEAE8"     # latar menu aktif
  on-accent: "#FFFFFF"
  ink: "#161616"
  ink-muted: "#4A524F"
  ink-subtle: "#6B7370"
  canvas: "#F2F4F2"          # latar halaman
  surface: "#FAFBFA"         # kartu, isian, panel samping
  hairline: "#D3D8D5"
  hairline-strong: "#5E6662" # garis atas tabel/daftar
  good: "#066867"            # status Cukup / Boleh dipakai (ikon centang + kata)
  warning: "#8A5A00"         # status Kurang / Belum boleh (ikon segitiga + kata)
  warning-surface: "#F3EBDB"
  danger: "#A2191F"          # galat dan Ditolak
  danger-surface: "#F8E6E6"
  chart-1: "#00918B"         # seri grafik 1, lolos validator dataviz (light)
  chart-2: "#6A5FD6"         # seri grafik 2

typography:
  family-sans: "IBM Plex Sans, system-ui, sans-serif"
  family-mono: "IBM Plex Mono, ui-monospace, monospace"
  display: { size: 44px, weight: 400, lineHeight: 1.15 }   # judul halaman awal
  page-title: { size: 30px, weight: 400, lineHeight: 1.25 }
  lead: { size: 17px, weight: 400, lineHeight: 1.5 }      # kalimat kesimpulan di bawah judul
  answer: { size: 20px, weight: 400, lineHeight: 1.4 }    # "5 dari 7 zat gizi sudah cukup."
  section: { size: 16px, weight: 600, lineHeight: 1.4 }
  body: { size: 15px, weight: 400, lineHeight: 1.5, letterSpacing: 0.16px }
  caption: { size: 13px, weight: 400, lineHeight: 1.4, letterSpacing: 0.16px }
  number: { family: mono, size: 15px }                     # gram, mg, Rp di tabel

rounded: 2px
spacing: [4, 8, 12, 16, 24, 32, 48, 64]
touch-target: 44px
breakpoints: { mobile: "<= 720px", desktop: "> 720px", min-width: 360px }
---

# RACIK-LOKAL DESIGN.md

Dokumen ini menjabarkan komponen visual untuk pengembang (PRD V2 bagian 11.8).
Token di atas adalah sumber kebenaran; `static/styles.css` memetakannya ke variabel CSS.

## Prinsip

1. **Satu tugas per layar, satu tombol utama.** Tombol utama selalu berwarna aksen
   dan berada di kanan bawah area isi (desktop) atau menempel di bawah layar di atas
   bilah navigasi (ponsel).
2. **Jawaban dulu, rincian kemudian.** Setiap langkah dibuka dengan satu kalimat
   kesimpulan berukuran `answer`, angka kuncinya tebal: "**5 dari 7** zat gizi sudah cukup."
3. **Status = ikon + kata.** Warna tidak pernah berdiri sendiri. Cukup memakai ikon
   centang dalam lingkaran, Kurang memakai segitiga peringatan, Ditinjau memakai jam,
   Draf memakai pensil.
4. **Datar.** Tanpa bayangan, tanpa gradien. Kedalaman dibuat dari dua permukaan
   (`canvas` dan `surface`) dan garis rambut.
5. **Satu aksen.** Teal Mangkuk dipakai hemat: tombol utama, tautan, fokus, langkah
   aktif, menu aktif. Status "baik" memakai teal yang sama, dibedakan ikonnya.
6. **Pengguna tidak pernah buntu.** Setiap layar punya Kembali; Beranda selalu
   menampilkan pekerjaan terakhir.

## Tata letak

- Desktop: panel samping 232 px (logo, menu, kartu pengguna di bawah), isi maksimal
  880 px, rata kiri dengan jarak 32 px. Pita info "Data contoh" 28 px di atas isi.
- Ponsel (<= 720 px): panel samping hilang, bilah bawah berisi empat tujuan dengan ikon
  dan label. Tombol utama selebar layar menempel di atas bilah bawah. Penanda langkah
  hanya menampilkan nama langkah aktif. Baris data menjadi dua tingkat.
- Grafik dibungkus wadah yang bisa digeser mendatar, halaman tidak ikut bergeser.

## Komponen

**Tombol utama**: latar `accent`, teks putih 16 px tebal 500, tinggi 44 px, padding
0 24 px, radius 2 px, ikon panah kanan setelah label. Hover `accent-hover`.

**Tombol sekunder**: latar `surface`, garis 1 px `hairline-strong`, teks `ink`.

**Tautan aksi**: teks `accent` tanpa garis bawah; garis bawah saat hover dan fokus.

**Isian**: latar `surface`, garis 1 px `hairline-strong`, tinggi 44 px, radius 2 px.
Label selalu tampak di atas (13 px tebal 500). Satuan (g, Rp) ditaruh di dalam isian
sebelah kanan dengan warna `ink-subtle`. Angka rata kanan memakai Plex Mono.
Fokus: garis 2 px `accent` (outline offset 0). Galat: garis `danger` + pesan di bawah.

**Penanda langkah**: empat batang 3 px. Langkah selesai dan aktif berwarna `accent`,
yang belum berwarna `hairline`. Di bawahnya: ikon centang (selesai) atau nomor + nama.
Langkah aktif tebal.

**Daftar data** (pengganti tabel): garis atas 1 px `hairline-strong`, baris dipisah
garis rambut, tinggi baris minimal 48 px. Kolom: nama (dan keterangan 13 px di
bawahnya), nilai mono rata kanan, status ikon + kata rata kanan.

**Kartu Lanjutkan**: latar `surface`, garis 1 px `hairline-strong`, padding 24 px.

**Pita peringatan**: latar `warning-surface`, garis kiri 3 px `warning`, ikon segitiga,
satu kalimat sebab + satu tautan aksi.

**Rincian terlipat** (`details`): garis atas dan bawah, ikon caret, judul tebal 500,
ringkasan kecil rata kanan ("2 bahan sudah di batas").

**Grafik**: garis 2 px, penanda >= 8 px (lingkaran untuk seri 1, persegi untuk seri 2),
label langsung di ujung garis, legenda tetap ada, garis sasaran putus-putus `ink`,
kisi `hairline`, angka sumbu Plex Mono 12 px. Hover menampilkan crosshair dan tooltip.
Tabel data tersedia di bawah grafik.

## Varian "lembut membulat" (halaman awal)

Dipilih pengguna pada 13 Oktober 2026 untuk halaman awal publik (`static/landing.css`), menggantikan
gaya persegi Carbon di halaman itu. Aksen tetap satu (Teal Mangkuk); yang berubah adalah bentuk:

- Radius: 10 px (kecil), 14 px (panel mini), 22 px (kartu), 32 px (panel besar), pil 999 px untuk tombol dan chip.
- Pemisah memakai bayangan halus dan blok warna, bukan garis. Bayangan kecil
  `0 1px 2px rgba(16,40,38,.05), 0 4px 14px rgba(16,40,38,.06)`; besar `0 24px 56px rgba(16,40,38,.12)`.
- Warna lembut tambahan `#E6F1EF` untuk latar ikon, chip, dan label bagian berbentuk pil.
- Nomor langkah dalam lingkaran teal yang disambung garis titik-titik; batang data berujung bulat.
- Label bagian berupa pil kecil, tanpa garis atau tanda pisah di depannya.

Pada hari yang sama gaya ini dibawa ke seluruh aplikasi (blok "lembut membulat" di `static/styles.css`):
daftar data menjadi panel putih membulat, status menjadi lencana pil, penanda langkah memakai batang
membulat dan nomor dalam lingkaran, area isi maksimal 1040 px di tengah. Ketentuan sudut 2 px di atas
tidak berlaku lagi; struktur, warna, tipografi, dan aturan teks tetap sama.

## Keadaan layar

Setiap layar data punya empat keadaan:
- **Memuat**: kerangka abu berbentuk tata letak akhir (bukan pemutar).
- **Kosong**: satu kalimat keadaan + satu kalimat cara mengisi + satu tombol.
- **Galat**: satu kalimat penyebab + satu kalimat solusi + tombol Coba lagi.
- **Berhasil**: isi biasa; perubahan penting diumumkan lewat toast satu kalimat.

## Aturan teks (PRD 11.7)

Sapaan Anda. Huruf kapital hanya di awal kalimat. Tanpa tanda pisah panjang.
Rupiah ditulis Rp1.838 tanpa spasi, desimal koma, satuan selalu ada.
Tombol: Masuk, Batal, Kembali, Lanjut ke ..., Kirim ke peninjau, Racik ulang.

## Aksesibilitas (WCAG 2.2 AA)

Kontras teks >= 4,5:1 (aksen di atas `canvas` 5,9:1; `warning` 5,4:1). Target sentuh
>= 44 px. Semua kontrol bisa dioperasikan papan ketik dengan fokus tampak. Lompatan
"Langsung ke isi". Perubahan halaman memindahkan fokus ke judul. Pesan status
diumumkan lewat `aria-live`.
