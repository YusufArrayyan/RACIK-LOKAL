// Halaman publik: halaman awal, masuk, lupa kata sandi, atur ulang (FR-01, FR-02).
import { api, busy, field, h, icon, mount } from "../ui.js";
import { store } from "../store.js";
import { brandLink } from "../app.js";

export { landing } from "./landing.js";

// Akun contoh untuk prototipe lokal (lihat app/seed_data.py).
const AKUN_CONTOH = [
  ["dewi@contoh.id", "Formulator"], ["rina@contoh.id", "Peninjau (ahli gizi)"],
  ["rian@contoh.id", "Koordinator pilot"], ["admin@contoh.id", "Admin"],
];
const SANDI_CONTOH = "racik-lokal-2026";

export async function masuk(el) {
  const surel = h("input", { class: "input", type: "email", autocomplete: "username", required: true, name: "surel" });
  const sandi = h("input", { class: "input", type: "password", autocomplete: "current-password", required: true, name: "kata_sandi" });
  const lihat = h("button", { class: "link-btn small", type: "button", "aria-pressed": "false", onclick: () => {
    const show = sandi.type === "password"; sandi.type = show ? "text" : "password";
    lihat.setAttribute("aria-pressed", String(show)); lihat.replaceChildren(icon(show ? "eye-slash" : "eye"), show ? "Sembunyikan" : "Tampilkan");
  } }, icon("eye"), "Tampilkan");
  const pesan = h("div", { role: "alert" });
  const tombol = h("button", { class: "btn primary", type: "submit", "data-busy-text": "Memeriksa..." }, "Masuk");

  if (store.sesiHabis) {
    pesan.append(h("div", { class: "banner info" }, icon("info"), h("span", {}, "Sesi Anda sudah berakhir. Silakan masuk lagi untuk melanjutkan.")));
    store.sesiHabis = false;
  }

  const form = h("form", { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    pesan.replaceChildren();
    if (!surel.value.trim() || !sandi.value) {
      pesan.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, "Isi surel dan kata sandi Anda.")));
      (surel.value.trim() ? sandi : surel).focus();
      return;
    }
    await busy(tombol, async () => {
      try {
        await api("/api/auth/login", { method: "POST", body: { surel: surel.value, kata_sandi: sandi.value } });
        store.user = await api("/api/auth/saya");
        store.userChecked = true;
        if (!store.user) throw new Error("Peramban menolak cookie sesi. Izinkan cookie untuk situs ini, lalu coba lagi.");
        store.onLogin();
      } catch (err) {
        pesan.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, err.message)));
        sandi.focus();
        sandi.select();
      }
    });
  } },
    pesan,
    field("Surel", surel),
    h("div", { class: "field" }, h("div", { class: "row", style: { justifyContent: "space-between" } }, h("label", { for: "f-sandi", class: "label" }, "Kata sandi"), lihat), sandi),
    tombol);
  sandi.id = "f-sandi";

  el.classList.add("auth-bg");
  mount(el, h("main", { class: "auth", id: "isi" },
    brandLink("#/"),
    h("h1", {}, "Masuk"),
    form,
    h("p", { style: { marginTop: "20px" }, class: "row" }, h("a", { href: "#/lupa" }, "Lupa kata sandi?"), h("span", { class: "spacer" }), h("a", { href: "#/" }, "Kembali ke halaman awal")),
    h("div", { class: "demo-accounts" },
      h("p", {}, "Akun contoh untuk mencoba prototipe:"),
      AKUN_CONTOH.map(([s, peran]) => h("button", { type: "button", onclick: () => { surel.value = s; sandi.value = SANDI_CONTOH; tombol.focus(); } }, `${peran}: ${s}`)))));
}

export async function lupa(el) {
  const surel = h("input", { class: "input", type: "email", autocomplete: "email", required: true });
  const hasil = h("div", { role: "status" });
  const tombol = h("button", { class: "btn primary", type: "submit" }, "Kirim tautan");
  el.classList.add("auth-bg");
  mount(el, h("main", { class: "auth", id: "isi" },
    brandLink("#/"),
    h("h1", {}, "Atur ulang kata sandi"),
    h("p", { class: "muted", style: { marginBottom: "24px" } }, "Tulis surel akun Anda. Kami kirim tautan untuk membuat kata sandi baru."),
    h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      hasil.replaceChildren();
      if (!surel.value.includes("@")) {
        hasil.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, "Alamat surel belum lengkap, misalnya nama@contoh.id.")));
        return surel.focus();
      }
      await busy(tombol, async () => {
        try {
          const r = await api("/api/auth/lupa-sandi", { method: "POST", body: { surel: surel.value } });
          hasil.append(h("div", { class: "banner info" }, icon("check-circle"), h("span", {}, r.pesan,
            h("br"), h("span", { class: "small muted" }, "Prototipe ini belum terhubung ke layanan surel; tautannya tercatat di jendela server."))));
        } catch (err) {
          hasil.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, err.message)));
        }
      });
    } }, hasil, field("Surel", surel), tombol),
    h("p", { style: { marginTop: "20px" } }, h("a", { href: "#/masuk" }, "Kembali ke Masuk"))));
}

export async function aturUlang(el, { query, go }) {
  const token = query.get("token") || "";
  const s1 = h("input", { class: "input", type: "password", autocomplete: "new-password", minlength: 8 });
  const s2 = h("input", { class: "input", type: "password", autocomplete: "new-password" });
  const hasil = h("div", { role: "alert" });
  const tombol = h("button", { class: "btn primary", type: "submit" }, "Simpan kata sandi");
  el.classList.add("auth-bg");
  mount(el, h("main", { class: "auth", id: "isi" },
    brandLink("#/"),
    h("h1", {}, "Buat kata sandi baru"),
    token ? h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      hasil.replaceChildren();
      const salah = (m) => hasil.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, m)));
      if (s1.value.length < 8) return salah("Kata sandi minimal 8 karakter.");
      if (s1.value !== s2.value) return salah("Kedua kata sandi belum sama. Ketik ulang di kolom kedua.");
      await busy(tombol, async () => {
        try {
          await api("/api/auth/atur-ulang", { method: "POST", body: { token, kata_sandi: s1.value } });
          go("masuk");
        } catch (err) { salah(err.message); }
      });
    } }, hasil, field("Kata sandi baru", s1, { hint: "Minimal 8 karakter." }), field("Ulangi kata sandi baru", s2), tombol)
      : h("div", { class: "banner bad" }, icon("warning"), h("span", {}, "Tautan ini tidak lengkap. Minta tautan baru lewat ", h("a", { href: "#/lupa" }, "Lupa kata sandi"), "."))));
}
