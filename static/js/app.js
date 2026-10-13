// RACIK-LOKAL: router dan kerangka aplikasi (PRD V2 bagian 11.2).
import { api, h, icon, initials, mount, skeleton, errorState, dialog } from "./ui.js";
import { store } from "./store.js";
import * as publik from "./views/publik.js";
import * as beranda from "./views/beranda.js";
import * as formula from "./views/formula.js";
import * as bahan from "./views/bahan.js";
import * as pilot from "./views/pilot.js";
import * as panduan from "./views/panduan.js";
import * as kelola from "./views/kelola.js";

const root = document.getElementById("root");

// Menu per peran (FR-03). Tujuan pertama juga dipakai di bilah bawah ponsel.
const MENU = {
  Formulator: [["beranda", "Beranda", "house"], ["formula", "Formula", "flask"], ["bahan", "Bahan", "stack"]],
  Peninjau: [["beranda", "Beranda", "house"], ["formula", "Formula", "flask"], ["bahan", "Bahan", "stack"]],
  Koordinator: [["beranda", "Beranda", "house"], ["bahan", "Bahan", "stack"], ["pilot", "Pilot", "chart-line"]],
  Admin: [["beranda", "Beranda", "house"], ["formula", "Formula", "flask"], ["bahan", "Bahan", "stack"],
    ["pilot", "Pilot", "chart-line"], ["kelola", "Kelola", "gear"]],
};

const ROUTES = [
  [/^$/, publik.landing, { publik: true }],
  [/^masuk$/, publik.masuk, { publik: true }],
  [/^lupa$/, publik.lupa, { publik: true }],
  [/^atur-ulang$/, publik.aturUlang, { publik: true }],
  [/^beranda$/, beranda.render, { nav: "beranda" }],
  [/^formula$/, formula.daftar, { nav: "formula" }],
  [/^formula\/(\d+)$/, formula.buka, { nav: "formula" }],
  [/^formula\/(\d+)\/(sasaran|racik|klaim|ajukan|tinjau|versi)$/, formula.langkah, { nav: "formula" }],
  [/^bahan$/, bahan.daftar, { nav: "bahan" }],
  [/^bahan\/baru$/, bahan.form, { nav: "bahan" }],
  [/^bahan\/(\d+)$/, bahan.detail, { nav: "bahan" }],
  [/^bahan\/(\d+)\/ubah$/, bahan.form, { nav: "bahan" }],
  [/^pilot$/, pilot.render, { nav: "pilot", peran: ["Koordinator", "Admin"] }],
  [/^kelola$/, kelola.render, { nav: "kelola", peran: ["Admin"] }],
  [/^panduan$/, panduan.render, { nav: "panduan" }],
];

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [path, qs] = raw.split("?");
  return { path: path.replace(/\/$/, ""), query: new URLSearchParams(qs || "") };
}

export function go(path) {
  const target = "#/" + path.replace(/^\//, "");
  if (location.hash === target) render();
  else location.hash = target;
}

let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const match = ROUTES.map(([re, fn, opt]) => [path.match(re), fn, opt]).find(([m]) => m);
  root.setAttribute("aria-busy", "true");

  if (!store.user && store.userChecked === false) {
    try { store.user = (await api("/api/auth/saya")) || null; } catch { store.user = null; }
    store.userChecked = true;
  }
  if (token !== renderToken) return;

  if (!match) {
    mount(root, notFound());
    root.setAttribute("aria-busy", "false");
    return;
  }
  const [m, fn, opt] = match;
  if (opt.publik) {
    if (store.user && (path === "" || path === "masuk")) {
      // Pengguna yang sudah masuk langsung ke Beranda (FR-04), kecuali sengaja membuka halaman awal.
      if (path === "masuk") return go("beranda");
    }
    const page = h("div", {});
    mount(root, page);
    await fn(page, { params: m.slice(1), query, go });
    finish();
    return;
  }
  if (!store.user) {
    store.afterLogin = path;
    return go("masuk");
  }
  if (opt.peran && !opt.peran.includes(store.user.peran)) {
    mount(root, shell(opt.nav, h("div", {}, h("h1", { class: "page-title", tabindex: "-1" }, "Halaman ini bukan untuk peran Anda"),
      h("p", { class: "lead" }, `Halaman ini hanya untuk ${opt.peran.join(" dan ")}. Kembali ke Beranda untuk melanjutkan pekerjaan Anda.`),
      h("p", { style: { marginTop: "24px" } }, h("a", { class: "btn primary", href: "#/beranda" }, "Ke Beranda")))));
    return finish();
  }
  const content = h("div", {}, skeleton());
  mount(root, shell(opt.nav, content));
  try {
    await store.loadRef();
    if (token !== renderToken) return;
    await fn(content, { params: m.slice(1), query, go, user: store.user });
  } catch (err) {
    if (token !== renderToken) return;
    mount(content, h("h1", { class: "page-title", tabindex: "-1" }, "Halaman belum bisa dibuka"),
      h("div", { style: { marginTop: "16px" } }, errorState(err, render)));
  }
  finish();
}

function finish() {
  root.setAttribute("aria-busy", "false");
  const t = root.querySelector(".page-title, h1");
  if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

function notFound() {
  return h("main", { class: "auth", id: "isi" },
    brandLink(store.user ? "#/beranda" : "#/"),
    h("h1", {}, "Halaman tidak ditemukan"),
    h("p", { class: "muted" }, "Alamat ini tidak ada di RACIK-LOKAL. Mungkin tautannya salah ketik atau sudah dipindah."),
    h("p", { style: { marginTop: "24px" } }, h("a", { class: "btn primary", href: store.user ? "#/beranda" : "#/" }, store.user ? "Ke Beranda" : "Ke halaman awal")));
}

export function brandLink(href = "#/") {
  return h("a", { class: "brand", href, "aria-label": "RACIK-LOKAL, ke beranda" },
    h("img", { src: "/static/assets/brand/mark-64.png", alt: "", width: 28, height: 28 }),
    h("span", {}, h("span", { class: "racik" }, "RACIK-"), h("span", { class: "lokal" }, "LOKAL")));
}

function shell(active, content) {
  const u = store.user;
  const menu = MENU[u.peran] || MENU.Formulator;
  const navLink = ([key, label, ic]) => h("a", { href: `#/${key}`, "aria-current": key === active ? "page" : null }, icon(ic), label);
  // Koordinator melihat Pilot di kelompok tersendiri, seperti rancangan PRD.
  const koord = u.peran === "Koordinator" ? menu.filter(([k]) => k === "pilot") : [];
  const utama = menu.filter((m) => !koord.includes(m));
  const bawah = menu.length > 4 ? menu.filter(([k]) => k !== "pilot") : menu;

  return h("div", { class: "app" },
    h("aside", { class: "side", "aria-label": "Navigasi utama" },
      brandLink("#/beranda"),
      h("nav", { class: "nav" },
        utama.map(navLink),
        koord.length ? [h("div", { class: "group" }, "Untuk koordinator"), koord.map(navLink)] : null,
        h("div", { class: "group" }, "Bantuan"), navLink(["panduan", "Panduan", "book-open"])),
      h("div", { class: "user-card" },
        h("div", { class: "avatar", "aria-hidden": "true" }, initials(u.nama)),
        h("div", { class: "who" }, h("b", {}, u.nama), h("span", {}, `${u.peran}, ${u.wilayah}`)),
        h("button", { class: "icon-btn", type: "button", title: "Keluar", "aria-label": "Keluar", onclick: keluar }, icon("sign-out")))),
    h("div", { class: "main" },
      h("div", { class: "mobile-top" }, brandLink("#/beranda"),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Akun Anda", onclick: akunDialog }, icon("user-circle"))),
      h("div", { class: "notice" }, icon("info"), "Data contoh untuk prototipe, bukan data TKPI atau hasil uji laboratorium."),
      h("main", { class: "content", id: "isi" }, content)),
    h("nav", { class: "bottom-nav", "aria-label": "Navigasi bawah", style: { gridTemplateColumns: `repeat(${bawah.length}, 1fr)` } },
      bawah.map(([key, label, ic]) => h("a", { href: `#/${key}`, "aria-current": key === active ? "page" : null }, icon(ic), label))));
}

function akunDialog() {
  const u = store.user;
  const dlg = dialog({
    judul: u.nama,
    isi: h("div", { class: "stack" },
      h("p", { class: "muted" }, `${u.peran}, ${u.wilayah}`), h("p", { class: "muted" }, u.surel),
      h("a", { href: "#/panduan", onclick: () => dlg.close() }, icon("book-open"), " Panduan penggunaan"),
      u.peran === "Admin" ? h("a", { href: "#/pilot", onclick: () => dlg.close() }, "Buka Pilot") : null),
    tombol: [h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Tutup"),
      h("button", { class: "btn primary", type: "button", onclick: () => { dlg.close(); keluar(); } }, icon("sign-out"), "Keluar")],
  });
}

async function keluar() {
  try { await api("/api/auth/keluar", { method: "POST" }); } catch { /* tetap keluar di sisi klien */ }
  store.reset();
  go("masuk");
}

window.addEventListener("racik:sesi-habis", () => {
  if (!store.user) return;
  store.reset();
  store.sesiHabis = true;
  go("masuk");
});
window.addEventListener("hashchange", render);
store.onLogin = () => go(store.afterLogin || "beranda");
render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
