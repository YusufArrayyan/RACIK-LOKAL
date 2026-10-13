// Halaman awal publik (FR-01): janji produk, contoh hasil nyata, cara kerja, untuk siapa, batasan.
import { api, h, icon, mount, num, rp, smart } from "../ui.js";
import { store } from "../store.js";
import { brandLink } from "../app.js";
import { tombolPdf, videoPanduan } from "./panduan.js";

const gulir = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };

export async function landing(el) {
  let c = null;
  try { c = await api("/api/contoh"); } catch { /* halaman tetap tampil tanpa contoh */ }
  const masukBtn = (cls = "btn primary") => store.user
    ? h("a", { class: cls, href: "#/beranda" }, "Ke Beranda", icon("arrow-right"))
    : h("a", { class: cls, href: "#/masuk" }, "Masuk", icon("arrow-right"));

  el.classList.add("lp");
  mount(el,
    h("header", { class: "lp-head" }, h("div", { class: "lp-wrap lp-head-in" },
      brandLink("#/"),
      h("nav", { class: "lp-nav", "aria-label": "Bagian halaman" },
        h("a", { href: "#/", onclick: gulir("cara-kerja") }, "Cara kerja"),
        h("a", { href: "#/", onclick: gulir("panduan") }, "Panduan"),
        h("a", { href: "#/", onclick: gulir("untuk-siapa") }, "Untuk siapa"),
        h("a", { href: "#/", onclick: gulir("batasan") }, "Batasan")),
      masukBtn("btn primary sm"))),
    h("main", { id: "isi" },
      hero(c, masukBtn),
      masalah(),
      caraKerja(c),
      panduanSingkat(),
      c?.bahan?.length ? bahanLokal(c.bahan) : null,
      untukSiapa(),
      batasan(),
      ajakan(masukBtn)),
    footer());
}

// ---------- Hero dengan pratinjau Lembar Racik dari data contoh ----------
function hero(c, masukBtn) {
  const fakta = c?.ada ? [
    [`${c.bahan.length}`, "", "bahan lokal Bengkulu, lengkap dengan sumber datanya"],
    [num(c.waktu_ms, 0), "ms", "untuk menghitung komposisi termurah"],
    [`${c.klaim.length}`, "", "klaim label diperiksa terhadap syarat BPOM"],
  ] : [];
  return h("section", { class: "lp-hero" }, h("div", { class: "lp-wrap lp-hero-grid" },
    h("div", { class: "lp-hero-copy" },
      h("p", { class: "lp-chip" }, icon("map-pin"), "Untuk UMKM pangan dan ahli gizi di Bengkulu"),
      h("h1", {}, "Racik camilan bergizi dari ", h("span", { class: "lp-mark" }, "bahan lokal"), "."),
      h("p", { class: "lp-lead" }, "RACIK-LOKAL menghitung komposisi bahan yang cukup zat besi untuk remaja putri dengan biaya bahan serendah mungkin, lalu memeriksa klaim label menurut Peraturan BPOM Nomor 1 Tahun 2022."),
      h("div", { class: "lp-cta" }, masukBtn(), h("a", { class: "btn", href: "#/", onclick: gulir("panduan") }, icon("play"), "Tonton video panduan")),
      fakta.length ? h("dl", { class: "lp-facts" }, fakta.map(([n, unit, t]) => h("div", {}, h("dt", {}, n, unit ? h("small", {}, unit) : null), h("dd", {}, t)))) : null),
    c?.ada ? pratinjau(c) : null));
}

function pratinjau(c) {
  const maxGram = Math.max(...c.komposisi.map((k) => k.gram));
  const lolos = c.klaim.filter((k) => k.lolos);
  const belum = c.klaim.filter((k) => !k.lolos);
  return h("figure", { class: "lp-sheet", "aria-label": `Contoh Lembar Racik: ${c.nama}` },
    h("div", { class: "lp-sheet-top" },
      h("span", {}, icon("flask"), " Lembar racik"),
      h("span", { class: "mono" }, `${num(c.berat_sajian, 0)} g per sajian`)),
    h("div", { class: "lp-sheet-body" },
      h("p", { class: "lp-sheet-name" }, c.nama),
      h("p", { class: "lp-sheet-ans" }, h("b", {}, `${c.jumlah_cukup} dari ${c.jumlah_sasaran}`), " zat gizi sudah cukup."),

      h("div", { class: "lp-sheet-sec" }, h("h3", {}, "Isi satu sajian"),
        h("ul", { class: "lp-bars" }, c.komposisi.slice(0, 6).map((k) => h("li", {},
          h("span", { class: "nm" }, k.nama),
          h("span", { class: "track", "aria-hidden": "true" }, h("span", { class: `fill${k.di_batas_atas ? " cap" : ""}`, style: { width: `${(k.gram / maxGram) * 100}%` } })),
          h("span", { class: "mono v" }, `${num(k.gram)} g`)))),
        c.komposisi.length > 6 ? h("p", { class: "lp-more" }, `dan ${c.komposisi.length - 6} bahan lain`) : null),

      h("div", { class: "lp-sheet-sec" }, h("h3", {}, "Gizi terhadap sasaran"),
        h("ul", { class: "lp-meters" }, c.gizi.map((g) => {
          const pct = Math.min(g.persen_target ?? 0, 150);
          return h("li", { class: g.cukup ? "ok" : "low" },
            h("span", { class: "nm" }, g.nama),
            h("span", { class: "track", "aria-hidden": "true" }, h("span", { class: "fill", style: { width: `${(pct / 150) * 100}%` } }), h("span", { class: "tick" })),
            h("span", { class: "mono v" }, smart(g.per_sajian, g.satuan)),
            h("span", { class: "st", title: g.cukup ? "Cukup" : "Kurang" }, icon(g.cukup ? "check-circle" : "warning", g.cukup ? "Cukup" : "Kurang")));
        })),
        h("p", { class: "lp-legend" }, h("span", { class: "tick-l" }), "garis tipis = 100% sasaran per sajian")),

      h("div", { class: "lp-sheet-sec" }, h("h3", {}, `Klaim label: ${lolos.length} boleh, ${belum.length} belum`),
        h("div", { class: "lp-claims" },
          lolos.slice(0, 4).map((k) => h("span", { class: "lp-claim ok" }, icon("check"), k.label)),
          belum.slice(0, 2).map((k) => h("span", { class: "lp-claim no" }, icon("lock-simple"), k.label))))),
    h("div", { class: "lp-sheet-foot" },
      h("span", {}, "Biaya bahan"),
      h("span", { class: "mono b" }, rp(c.biaya)),
      c.biaya_maks ? h("span", { class: "lp-budget" }, icon("check-circle"), `di bawah batas ${rp(c.biaya_maks)}`) : null),
    h("figcaption", { class: "sr-only" }, "Contoh hasil dari data contoh, bukan hasil uji laboratorium."));
}

// ---------- Masalah dan jawaban (PRD bagian 2) ----------
function masalah() {
  const baris = [
    ["coins", "Hitungan gizi dan biaya dikerjakan manual", "Mesin Racik menghitung keduanya sekaligus dan memilih komposisi termurah yang memenuhi sasaran."],
    ["clipboard-text", "Data bahan lokal tersebar dan cepat usang", "Setiap nilai gizi punya sumber dan tanggal. Data yang lewat 12 bulan ditandai untuk diperbarui."],
    ["seal-check", "Klaim label ditulis tanpa diperiksa", "Penjaga Klaim membandingkan setiap klaim dengan syarat, lalu mengunci klaim yang belum lolos."],
    ["arrow-u-down-left", "Hasil uji tidak kembali ke formula", "Hasil lab, tinjauan ahli gizi, dan data pilot menjadi batas baru untuk racikan berikutnya."],
  ];
  return h("section", { class: "lp-band", "aria-labelledby": "h-masalah" }, h("div", { class: "lp-wrap" },
    h("div", { class: "lp-sec-head" },
      h("p", { class: "lp-kicker" }, "Mengapa"),
      h("h2", { id: "h-masalah" }, "Formula camilan masih disusun dengan coba-coba."),
      h("p", {}, "UMKM sulit menghitung gizi dan biaya bersamaan. Ahli gizi harus mengulang hitungan setiap kali harga berubah.")),
    h("ul", { class: "lp-problems" }, baris.map(([ic, masalahT, jawab]) => h("li", {},
      h("span", { class: "lp-ico" }, icon(ic)),
      h("div", {}, h("p", { class: "q" }, masalahT), h("p", { class: "a" }, jawab)))))));
}

// ---------- Cara kerja: empat langkah dan lingkaran REVISI BATAS ----------
function caraKerja(c) {
  const fe = c?.gizi?.find((g) => g.zat_gizi === "zat_besi");
  const mini = (judul, cls, ...isi) => h("div", { class: `mini ${cls}` }, h("p", { class: "mini-cap" }, judul), h("div", { class: "mini-body" }, isi));
  const langkah = [
    ["Sasaran", "Pilih untuk siapa camilan ini, berat sajian, dan batas biaya. Sasaran gizi terisi otomatis.",
      mini("Isian sasaran", "mini-form",
        h("span", {}, icon("users-three"), "Remaja putri, 13 sampai 18 tahun"),
        h("span", {}, icon("scales"), "40 g per sajian"),
        h("span", {}, icon("coins"), "Biaya paling mahal Rp2.000"))],
    ["Racik", "Mesin menghitung komposisi bahan lokal termurah yang memenuhi sasaran gizi.",
      mini("Komposisi termurah", "mini-bars",
        [92, 74, 48, 30, 18].map((w, j) => h("span", { class: "bar", style: { width: `${w}%`, "--j": j } })),
        fe ? h("p", { class: "mini-note" }, icon("check-circle"), `Zat besi ${smart(fe.per_sajian, "mg")}, target ${smart(fe.target, "mg")}`) : null)],
    ["Cek klaim", "Setiap klaim label diperiksa terhadap syarat BPOM, lengkap dengan saran perbaikan.",
      mini("Hasil pemeriksaan", "mini-claims",
        h("span", { class: "lp-claim ok" }, icon("check"), "Sumber zat besi"),
        h("span", { class: "lp-claim ok" }, icon("check"), "Sumber folat"),
        h("span", { class: "lp-claim no" }, icon("lock-simple"), "Sumber vitamin C"))],
    ["Ajukan", "Kirim ke ahli gizi untuk disetujui, diminta revisi, atau diberi batas bahan baru.",
      mini("Dikirim ke ahli gizi", "mini-send",
        h("div", { class: "who" }, h("span", { class: "avatar" }, "RM"),
          h("span", {}, h("b", {}, "Rina Mardiani"), h("br"), "Ahli gizi peninjau"), icon("paper-plane-tilt")),
        h("p", { class: "bubble" }, "Vitamin C masih kurang. Mohon pertimbangkan batas jeruk nipis."),
        h("span", { class: "status-pill" }, icon("clock"), "Menunggu tinjauan"))],
  ];
  const list = h("ol", { class: "lp-steps" }, langkah.map(([judul, teks, m], i) => h("li", { style: { "--i": i } },
    h("div", { class: "lp-step-n" }, h("span", { class: "num" }, i + 1), h("span", { class: "line", "aria-hidden": "true" })),
    h("h3", {}, judul), h("p", { class: "lp-step-text" }, teks), m)));
  const loop = h("div", { class: "lp-loop" },
    h("div", { class: "lp-loop-arc", "aria-hidden": "true" },
      h("span", { class: "lp-loop-pill" }, icon("arrows-clockwise"), "REVISI BATAS")),
    h("p", { class: "lp-loop-text" },
      h("b", { class: "sr-only" }, "REVISI BATAS: "),
      "Hasil uji lab, tinjauan ahli gizi, dan data pilot kembali ke Mesin Racik sebagai batas baru. Formula membaik dari versi ke versi, data sumber tetap utuh."));
  const sec = h("section", { class: "lp-sec lp-tint", id: "cara-kerja", "aria-labelledby": "h-cara" }, h("div", { class: "lp-wrap" },
    h("div", { class: "lp-sec-head" },
      h("p", { class: "lp-kicker" }, "Cara kerja"),
      h("h2", { id: "h-cara" }, "Empat langkah, satu per layar."),
      h("p", {}, "Anda boleh kembali ke langkah mana pun. Setiap hasil racik disimpan sebagai versi.")),
    list, loop));
  putarSaatTerlihat(sec);
  return sec;
}

// Animasi bertahap: langkah muncul satu per satu saat bagian ini masuk layar.
// Tanpa JavaScript, tanpa IntersectionObserver, atau bila pengguna mengurangi gerak, isi langsung tampil.
function putarSaatTerlihat(sec) {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  sec.classList.add("lp-anim");
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { sec.classList.add("lp-play"); io.disconnect(); }
  }, { threshold: 0.25 });
  requestAnimationFrame(() => io.observe(sec.querySelector(".lp-steps")));
}

// ---------- Panduan: video bersuara dan PDF bergambar ----------
function panduanSingkat() {
  const topik = ["Sasaran", "Racik", "Takaran sendok", "Cek klaim", "Ajukan", "Tinjau ahli gizi"];
  return h("section", { class: "lp-band", id: "panduan", "aria-labelledby": "h-panduan" }, h("div", { class: "lp-wrap lp-panduan" },
    h("div", { class: "lp-video" }, videoPanduan()),
    h("div", {},
      h("div", { class: "lp-sec-head" },
        h("p", { class: "lp-kicker" }, "Panduan"),
        h("h2", { id: "h-panduan" }, "Lihat cara pakainya dalam satu setengah menit."),
        h("p", {}, "Video singkat ini menunjukkan cara meracik dari awal sampai formula diajukan ke ahli gizi. Nyalakan suara untuk efeknya. Butuh rincian? Simpan panduan PDF bergambar untuk dibaca kapan saja.")),
      h("ul", { class: "lp-topik" }, topik.map((t) => h("li", {}, icon("check"), t))),
      h("div", { class: "lp-cta" }, tombolPdf(), h("span", { class: "lp-meta" }, "PDF, 14 halaman, sekitar 3 MB")))));
}

// ---------- Bahan lokal dari basis data ----------
function bahanLokal(bahan) {
  const wilayah = [...new Set(bahan.map((b) => b.wilayah))];
  return h("section", { class: "lp-band lp-band-alt", "aria-labelledby": "h-bahan" }, h("div", { class: "lp-wrap lp-bahan" },
    h("div", { class: "lp-sec-head" },
      h("p", { class: "lp-kicker" }, "Bahan"),
      h("h2", { id: "h-bahan" }, "Mulai dari bahan yang ada di pasar sendiri."),
      h("p", {}, `${bahan.length} bahan dari ${wilayah.map((w) => (w.startsWith("Kota") ? w : `Kabupaten ${w}`)).join(" dan ")} sudah tercatat dengan harga per kilogram, sumber data, dan batas pemakaian.`)),
    h("ul", { class: "lp-ingredients" }, bahan.map((b) => h("li", {},
      b.foto ? h("img", { src: b.foto, alt: "", loading: "lazy", width: 28, height: 28 }) : icon("leaf"),
      h("span", {}, b.nama), h("small", {}, b.kelompok))))));
}

// ---------- Untuk siapa ----------
function untukSiapa() {
  const peran = [
    ["storefront", "Formulator UMKM", "Pemilik atau staf produksi, juga mahasiswa gizi.",
      ["Formula baru tanpa hitungan manual", "Tahu klaim mana yang boleh dicetak", "Bandingkan versi formula"]],
    ["stethoscope", "Ahli gizi", "Peninjau yang menjaga mutu formula.",
      ["Setujui, minta revisi, atau tolak", "Ubah batas pemakaian bahan beserta alasannya", "Perbarui data bahan dan sumbernya"]],
    ["chart-line-up", "Koordinator pilot", "Peneliti atau petugas lapangan.",
      ["Asupan zat besi per kelompok per minggu", "Hasil uji batch dan peringatan selisih lab", "Persetujuan wali dan ekspor CSV"]],
  ];
  return h("section", { class: "lp-sec", id: "untuk-siapa", "aria-labelledby": "h-siapa" }, h("div", { class: "lp-wrap" },
    h("div", { class: "lp-sec-head" },
      h("p", { class: "lp-kicker" }, "Untuk siapa"),
      h("h2", { id: "h-siapa" }, "Satu formula, tiga peran yang saling menyambung.")),
    h("ul", { class: "lp-roles" }, peran.map(([ic, judul, sub, isi]) => h("li", {},
      h("span", { class: "lp-ico lg" }, icon(ic)),
      h("h3", {}, judul), h("p", { class: "sub" }, sub),
      h("ul", {}, isi.map((t) => h("li", {}, icon("check"), t))))))));
}

// ---------- Batasan (latar gelap agar tegas) ----------
function batasan() {
  const isi = [
    ["flask", "Rancangan, bukan hasil uji", "Hasil racikan adalah hitungan dari data bahan. Nilai gizi produk jadi tetap harus diuji di laboratorium."],
    ["scales", "Dasar klaim", "Pemeriksaan klaim mengacu pada Peraturan BPOM Nomor 1 Tahun 2022. Ambang klaim di prototipe ini masih perlu dicocokkan dengan teks resminya."],
    ["shield-check", "Bukan saran medis", "RACIK-LOKAL tidak menggantikan tablet tambah darah atau pemeriksaan tenaga kesehatan."],
  ];
  return h("div", { class: "lp-dark-wrap" }, h("section", { class: "lp-dark", id: "batasan", "aria-labelledby": "h-batas" }, h("div", { class: "lp-wrap" },
    h("div", { class: "lp-sec-head" },
      h("p", { class: "lp-kicker" }, "Batasan"),
      h("h2", { id: "h-batas" }, "Yang perlu Anda ketahui sebelum memakai hasilnya.")),
    h("ul", { class: "lp-limits" }, isi.map(([ic, judul, teks]) => h("li", {},
      h("span", { class: "lp-ico" }, icon(ic)), h("h3", {}, judul), h("p", {}, teks)))))));
}

function ajakan(masukBtn) {
  return h("div", { class: "lp-cta-wrap" }, h("section", { class: "lp-cta-band", "aria-labelledby": "h-ajak" }, h("div", { class: "lp-wrap lp-cta-in" },
    h("div", {},
      h("h2", { id: "h-ajak" }, "Mulai dari satu formula."),
      h("p", {}, "Masuk, isi sasaran, dan lihat komposisi pertama Anda dalam hitungan detik.")),
    masukBtn("btn lp-btn-inv"))));
}

function footer() {
  return h("footer", { class: "lp-foot" }, h("div", { class: "lp-wrap lp-foot-in" },
    h("div", {}, brandLink("#/"),
      h("p", {}, "Pendamping esai Lomba Esai Nasional HIMAGI 2026, Universitas Tidar."),
      h("p", { class: "subtle" }, "Prototipe. Angka pada halaman ini adalah data contoh, bukan data TKPI atau hasil uji laboratorium.")),
    h("nav", { "aria-label": "Tautan bawah" },
      h("a", { href: "#/", onclick: gulir("cara-kerja") }, "Cara kerja"),
      h("a", { href: "#/", onclick: gulir("panduan") }, "Panduan"),
      h("a", { href: "#/", onclick: gulir("untuk-siapa") }, "Untuk siapa"),
      h("a", { href: "#/", onclick: gulir("batasan") }, "Batasan"),
      store.user ? h("a", { href: "#/beranda" }, "Ke Beranda") : h("a", { href: "#/masuk" }, "Masuk"))));
}
