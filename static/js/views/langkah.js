// Empat langkah formula dan kalimat "langkah berikutnya" (PRD 11.3).
import { h, icon, tgl } from "../ui.js";

export const LANGKAH = [
  ["sasaran", "Sasaran"],
  ["racik", "Racik"],
  ["klaim", "Cek klaim"],
  ["ajukan", "Ajukan"],
];

// Penanda langkah. `selesai` = jumlah langkah yang sudah selesai, `aktif` = indeks 0..3.
export function stepper(formulaId, aktif, selesai, { link = true } = {}) {
  return h("ol", { class: "steps", "aria-label": "Langkah formula" },
    LANGKAH.map(([key, label], i) => {
      const done = i < selesai && i !== aktif;
      const isAktif = i === aktif;
      const isi = [done ? icon("check-circle", "Selesai") : h("span", { class: "n" }, i + 1), h("span", { class: "lbl" }, label)];
      const bisaKlik = link && formulaId && (done || i <= selesai) && !isAktif;
      return h("li", { class: done ? "done" : isAktif ? "active" : "", "aria-current": isAktif ? "step" : null },
        bisaKlik ? h("a", { href: `#/formula/${formulaId}/${key}` }, isi) : isi);
    }));
}

// Apa yang harus dilakukan selanjutnya untuk sebuah formula, dari sudut pandang pengguna.
export function berikutnya(f, user) {
  const pemilik = user && (user.id === f.pemilik_id || user.peran === "Admin");
  if (f.status === "Ditinjau") {
    if (user && user.id === f.peninjau_id) {
      return { teks: `Diajukan oleh ${f.pemilik} dan menunggu tinjauan Anda.`, tombol: "Tinjau formula", ke: "tinjau", aktif: 3 };
    }
    return { teks: `Sedang ditinjau ${f.peninjau || "ahli gizi"}. Anda akan melihat keputusannya di sini.`, tombol: "Lihat pengajuan", ke: "ajukan", aktif: 3 };
  }
  if (f.status === "Perlu revisi") {
    return { teks: `Peninjau meminta revisi${f.catatan_revisi ? `: "${f.catatan_revisi}"` : "."} Racik ulang dengan batas baru.`,
      tombol: "Lanjut ke Racik", ke: "racik", aktif: 1 };
  }
  if (f.status === "Disetujui") return { teks: `Formula versi ${f.versi} sudah disetujui.`, tombol: "Lihat hasil", ke: "racik", aktif: 1 };
  if (f.status === "Ditolak") return { teks: "Formula ini ditolak peninjau. Lihat catatannya, lalu racik ulang bila ingin mencoba lagi.", tombol: "Lihat catatan", ke: "ajukan", aktif: 3 };
  if (!pemilik) return { teks: "Formula ini masih draf.", tombol: "Lihat formula", ke: "racik", aktif: 1 };
  const L = f.langkah_terakhir;
  if (L <= 0) return { teks: "Mulai dengan menentukan untuk siapa camilan ini dan berapa biayanya.", tombol: "Lanjut ke Sasaran", ke: "sasaran", aktif: 0 };
  if (L === 1 || f.berhasil === false) {
    return f.versi && f.berhasil === false
      ? { teks: "Racik belum menemukan komposisi yang memenuhi semua syarat. Buka Racik untuk melihat saran pelonggaran.", tombol: "Lanjut ke Racik", ke: "racik", aktif: 1 }
      : { teks: "Sasaran sudah diisi. Langkah berikutnya: jalankan Mesin Racik.", tombol: "Lanjut ke Racik", ke: "racik", aktif: 1 };
  }
  if (L === 2) return { teks: "Hasil racikan sudah jadi. Langkah berikutnya: periksa apakah klaim di label boleh dipakai.", tombol: "Lanjut ke Cek klaim", ke: "klaim", aktif: 2 };
  return { teks: "Klaim sudah diperiksa. Langkah berikutnya: kirim formula ke ahli gizi.", tombol: "Lanjut ke Ajukan", ke: "ajukan", aktif: 3 };
}

export function keteranganVersi(f) {
  if (!f.versi) return "Belum diracik";
  const st = { "Draf": "draf", "Ditinjau": "menunggu tinjauan ahli gizi", "Perlu revisi": "perlu revisi",
    "Disetujui": `disetujui, ${tgl(f.diubah)}`, "Ditolak": "ditolak" }[f.status] || f.status.toLowerCase();
  return `Versi ${f.versi}, ${st}`;
}
