// Alat bantu antarmuka: pembuat elemen, ikon, format angka, API, toast, dialog.
import { ICON_PATHS } from "./icons-data.js";

// ---------- Elemen ----------
export function h(tag, attrs, ...children) {
  const svgTags = new Set(["svg", "path", "g", "line", "circle", "rect", "text", "polyline", "title"]);
  const el = svgTags.has(tag) ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style" && typeof v === "object") {
      // Properti kustom (--nama) harus lewat setProperty; Object.assign mengabaikannya.
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith("--")) el.style.setProperty(p, String(val));
        else el.style[p] = val;
      }
    }
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && !svgTags.has(tag) && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function icon(name, label) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 256 256");
  svg.setAttribute("class", "icon");
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); }
  else svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICON_PATHS[name] || "";
  return svg;
}

export function mount(target, ...children) {
  target.replaceChildren();
  append(target, children);
}

// ---------- Format (PRD 11.7: Rp1.838, desimal koma, satuan selalu ada) ----------
export function num(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return Number(v).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function smart(v, satuan) {
  // Angka gizi: bilangan bulat untuk nilai besar, satu desimal untuk kecil.
  if (v === null || v === undefined) return "–";
  const d = Math.abs(v) >= 20 ? 0 : 1;
  return `${num(v, d)}${satuan ? " " + satuan : ""}`;
}
export function rp(v) {
  if (v === null || v === undefined) return "–";
  return "Rp" + Math.round(v).toLocaleString("id-ID");
}
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function tgl(s, withYear = false) {
  if (!s) return "–";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getDate()} ${BULAN[d.getMonth()]}${withYear || d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""}`;
}
export function parseNum(s) {
  if (typeof s === "number") return s;
  const clean = String(s).trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return clean === "" ? null : Number(clean);
}
export function initials(nama) {
  return nama.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/\.$/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ---------- API ----------
export class ApiError extends Error {
  constructor(status, pesan) { super(pesan); this.status = status; }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Koneksi ke server terputus. Periksa jaringan Anda, lalu coba lagi.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/login")) {
      window.dispatchEvent(new CustomEvent("racik:sesi-habis"));
    }
    throw new ApiError(res.status, data?.pesan || "Server sedang bermasalah. Tunggu sebentar, lalu coba lagi.");
  }
  return data;
}

// ---------- Status (ikon + kata, PRD 11.1) ----------
const STATUS_FORMULA = {
  "Draf": ["pencil-simple", "neutral"],
  "Ditinjau": ["clock", "neutral"],
  "Perlu revisi": ["warning", "warn"],
  "Disetujui": ["check-circle", "good"],
  "Ditolak": ["x-circle", "bad"],
};
export function statusFormula(s) {
  const [ic, cls] = STATUS_FORMULA[s] || ["info", "neutral"];
  return h("span", { class: `status ${cls}` }, icon(ic), s);
}
export function statusCukup(cukup, teks) {
  return cukup
    ? h("span", { class: "status good" }, icon("check-circle"), teks || "Cukup")
    : h("span", { class: "status warn" }, icon("warning"), teks || "Kurang");
}

// ---------- Toast ----------
export function toast(pesan, jenis = "ok") {
  const box = document.getElementById("toasts");
  const t = h("div", { class: `toast ${jenis === "bad" ? "bad" : ""}` }, icon(jenis === "bad" ? "warning" : "check-circle"), h("span", {}, pesan));
  box.append(t);
  setTimeout(() => t.remove(), 5000);
}

// ---------- Dialog ----------
export function dialog({ judul, isi, tombol = [], lebar = false, onClose }) {
  const dlg = h("dialog", { class: lebar ? "wide" : "", "aria-labelledby": "dlg-judul" },
    h("div", { class: "dlg-head" }, h("h2", { id: "dlg-judul" }, judul)),
    h("div", { class: "dlg-body" }, isi),
    tombol.length ? h("div", { class: "dlg-foot" }, tombol) : null);
  dlg.addEventListener("close", () => { dlg.remove(); onClose && onClose(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function konfirmasi({ judul, pesan, ya, bahaya = false }) {
  return new Promise((resolve) => {
    let hasil = false;
    const dlg = dialog({
      judul, isi: h("p", {}, pesan),
      tombol: [
        h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Batal"),
        h("button", { class: `btn ${bahaya ? "danger" : "primary"}`, type: "button", onclick: () => { hasil = true; dlg.close(); } }, ya),
      ],
      onClose: () => resolve(hasil),
    });
  });
}

// ---------- Keadaan layar (PRD 11.8) ----------
export function skeleton(rows = 5) {
  return h("div", { "aria-label": "Memuat", role: "status" },
    h("div", { class: "skel t" }), h("div", { class: "skel l" }), h("div", { class: "skel l", style: { width: "45%" } }),
    h("div", { style: { height: "24px" } }),
    Array.from({ length: rows }, () => h("div", { class: "skel row" })));
}
export function emptyState(judul, cara, tombol) {
  return h("div", { class: "empty" }, h("p", { class: "b" }, judul), h("p", { class: "muted" }, cara), tombol || null);
}
export function errorState(err, ulang) {
  return h("div", { class: "banner bad", role: "alert" }, icon("warning"),
    h("div", {}, h("p", {}, err.message || String(err)),
      ulang ? h("button", { class: "link-btn", type: "button", onclick: ulang }, icon("arrows-clockwise"), "Coba lagi") : null));
}

// Tombol yang menampilkan putaran saat aksi berjalan.
export async function busy(btn, fn) {
  if (btn.dataset.busy) return;
  btn.dataset.busy = "1";
  btn.setAttribute("aria-disabled", "true");
  const before = [...btn.childNodes];
  const spin = icon("arrows-clockwise"); spin.classList.add("spin");
  btn.replaceChildren(spin, h("span", {}, btn.dataset.busyText || "Memproses..."));
  try { return await fn(); }
  finally {
    if (btn.isConnected) { btn.replaceChildren(...before); }
    delete btn.dataset.busy;
    btn.removeAttribute("aria-disabled");
  }
}

export function field(label, control, { hint, id, err } = {}) {
  // Label harus menunjuk isian sebenarnya, juga bila isian dibungkus satuan (g, Rp).
  const target = control.matches("input, select, textarea") ? control : control.querySelector("input, select, textarea") || control;
  const cid = id || target.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  target.id = cid;
  if (hint) target.setAttribute("aria-describedby", `${cid}-hint`);
  return h("div", { class: "field" },
    h("label", { for: cid }, label), control,
    hint ? h("div", { class: "hint", id: `${cid}-hint` }, hint) : null,
    err ? h("div", { class: "err" }, icon("warning"), err) : null);
}

export function unitInput(value, unit, attrs = {}) {
  const inp = h("input", { class: "input", inputmode: "decimal", value: value ?? "", autocomplete: "off", ...attrs });
  return { wrap: h("div", { class: "unit-wrap" }, inp, h("span", { class: "unit", "aria-hidden": "true" }, unit)), input: inp };
}

// Foto bentuk asli bahan. Tanpa foto, tampil kotak lembut berikon daun agar baris tetap rata.
export function fotoBahan(url, ukuran = "sm") {
  return url
    ? h("img", { class: `foto-bahan ${ukuran}`, src: url, alt: "", loading: "lazy", decoding: "async", width: 480, height: 360 })
    : h("span", { class: `foto-bahan ${ukuran} kosong`, "aria-hidden": "true" }, icon("leaf"));
}
