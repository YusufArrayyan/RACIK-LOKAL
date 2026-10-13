// Panduan penggunaan: video singkat bersuara dan PDF bergambar (dibuat oleh tools/panduan).
import { h, icon, mount } from "../ui.js";

export const PDF_PANDUAN = "/static/panduan/panduan-racik-lokal.pdf";
export const VIDEO_PANDUAN = "/static/panduan/video-panduan.webm";
export const POSTER_PANDUAN = "/static/panduan/video-poster.jpg";

// Video tidak diunduh sampai Anda menekan putar, agar halaman tetap ringan di jaringan lemah.
export function videoPanduan() {
  return h("video", {
    class: "video-panduan", controls: true, preload: "none", playsinline: true, poster: POSTER_PANDUAN,
    "aria-label": "Video panduan memakai RACIK-LOKAL, sekitar satu setengah menit, dengan efek suara",
  },
  h("source", { src: VIDEO_PANDUAN, type: "video/webm" }),
  h("p", {}, "Peramban Anda belum bisa memutar video ini. ", h("a", { href: VIDEO_PANDUAN, download: true }, "Unduh videonya"), "."));
}

export function tombolPdf(cls = "btn primary") {
  return h("a", { class: cls, href: PDF_PANDUAN, download: "Panduan RACIK-LOKAL.pdf" }, icon("download-simple"), "Unduh panduan PDF");
}

const ISI = [
  ["Masuk dan Beranda", "Melanjutkan pekerjaan terakhir atau membuat formula baru."],
  ["Empat langkah meracik", "Sasaran, Racik, Cek klaim, dan Ajukan, lengkap dengan arti setiap tombol."],
  ["Bahan dan takaran sendok", "Mengenali bahan lewat fotonya dan memakai kalkulator takaran."],
  ["Untuk ahli gizi dan koordinator", "Meninjau formula dan memantau pilot."],
];

export async function render(el) {
  mount(el,
    h("div", { class: "page-head" },
      h("div", {}, h("h1", { class: "page-title" }, "Panduan"),
        h("p", { class: "lead" }, "Tonton videonya untuk gambaran singkat, lalu simpan PDF-nya untuk dibaca langkah demi langkah."))),
    videoPanduan(),
    h("p", { class: "small muted", style: { marginTop: "10px" } }, icon("info"), " Sekitar satu setengah menit, dengan efek suara. Nyalakan suara perangkat Anda."),
    h("h2", { class: "section-title" }, "Panduan PDF bergambar"),
    h("div", { class: "card panduan-pdf" },
      h("span", { class: "panduan-ikon", "aria-hidden": "true" }, icon("book-open")),
      h("div", {},
        h("p", { class: "b" }, "Cara memakai RACIK-LOKAL"),
        h("p", { class: "small muted" }, "14 halaman, sekitar 3 MB. Setiap layar diberi penanda bernomor dan penjelasannya."),
        h("div", { class: "row-btn" }, tombolPdf(), h("a", { class: "btn", href: PDF_PANDUAN, target: "_blank", rel: "noopener" }, "Buka di tab baru")))),
    h("h2", { class: "section-title" }, "Isi panduan"),
    h("div", { class: "list" }, ISI.map(([judul, teks], i) => h("div", { class: "li" },
      h("div", { class: "with-foto" }, h("span", { class: "nomor-bulat", "aria-hidden": "true" }, String(i + 1)),
        h("div", {}, h("div", { class: "name" }, judul), h("div", { class: "meta" }, teks))), h("span")))));
}
