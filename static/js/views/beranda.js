// Beranda: lanjutkan pekerjaan terakhir dan formula lainnya (FR-04).
import { api, h, icon, mount, statusFormula, emptyState, num } from "../ui.js";
import { berikutnya, keteranganVersi, stepper } from "./langkah.js";
import { formulaBaruDialog } from "./formula.js";

export async function render(el, { user }) {
  const data = await api("/api/beranda");
  const bisaBuat = ["Formulator", "Admin"].includes(user.peran);
  const isi = [h("h1", { class: "page-title" }, "Beranda")];

  if (data.lanjutkan) {
    const f = data.lanjutkan;
    const nx = berikutnya(f, user);
    isi.push(h("section", { class: "card", style: { marginTop: "24px" }, "aria-labelledby": "lanjut-judul" },
      h("div", { class: "eyebrow" }, user.peran === "Peninjau" ? "Menunggu tinjauan Anda" : "Lanjutkan pekerjaan Anda"),
      h("h2", { id: "lanjut-judul" }, f.nama),
      h("p", { class: "muted", style: { maxWidth: "520px" } }, nx.teks),
      stepper(f.id, nx.aktif, f.status === "Disetujui" ? 4 : Math.min(f.langkah_terakhir, 4), { link: false }),
      h("p", { style: { marginTop: "16px" } }, h("a", { class: "btn primary", href: `#/formula/${f.id}/${nx.ke}` }, nx.tombol, icon("arrow-right")))));
  } else if (user.peran === "Koordinator" && data.pilot) {
    isi.push(await kartuPilot(data.pilot));
  } else if (user.peran === "Peninjau") {
    isi.push(h("section", { class: "card", style: { marginTop: "24px" } },
      h("div", { class: "eyebrow" }, "Tinjauan"),
      h("h2", {}, "Belum ada formula yang menunggu tinjauan Anda"),
      h("p", { class: "muted" }, "Formula yang diajukan kepada Anda akan muncul di sini. Sementara itu, Anda bisa memeriksa data bahan."),
      h("p", { style: { marginTop: "16px" } }, h("a", { class: "btn", href: "#/bahan" }, "Buka Bahan"))));
  }

  if (data.lanjutkan && data.pilot && user.peran === "Admin") isi.push(h("div", { style: { marginTop: "16px" } }, h("a", { href: "#/pilot" }, `Buka ${data.pilot.nama}`)));

  if (user.peran !== "Koordinator") {
    const judul = data.lanjutkan ? "Formula lainnya" : "Formula";
    isi.push(h("h2", { class: "section-title", style: { marginTop: "40px" } }, judul));
    if (data.lainnya.length) {
      isi.push(h("div", { class: "list" }, data.lainnya.map((f) => h("div", { class: "li three-act" },
        h("div", {}, h("div", { class: "name" }, f.nama), h("div", { class: "meta" }, keteranganVersi(f))),
        h("div", { class: "st" }, statusFormula(f.status)),
        h("div", { class: "act", style: { textAlign: "right" } }, h("a", { href: `#/formula/${f.id}`, "aria-label": `Buka ${f.nama}` }, "Buka"))))));
    } else if (!data.lanjutkan) {
      isi.push(emptyState("Belum ada formula.",
        bisaBuat ? "Buat formula pertama Anda. Mesin Racik akan menghitung komposisinya dari bahan lokal." : "Formula yang dibuat formulator akan tampil di sini.",
        bisaBuat ? h("button", { class: "btn primary", type: "button", onclick: formulaBaruDialog }, icon("plus"), "Formula baru") : null));
    }
    isi.push(h("div", { class: "row", style: { marginTop: "16px", gap: "20px" } },
      bisaBuat && (data.lanjutkan || data.lainnya.length) ? h("button", { class: "btn", type: "button", onclick: formulaBaruDialog }, icon("plus"), "Formula baru") : null,
      data.jumlah_formula > 0 ? h("a", { href: "#/formula", class: "b" }, "Lihat semua formula") : null));
  } else {
    isi.push(h("h2", { class: "section-title", style: { marginTop: "40px" } }, "Data bahan"),
      h("p", { class: "muted" }, "Periksa harga dan umur data bahan yang dipakai UMKM mitra."),
      h("p", { style: { marginTop: "12px" } }, h("a", { class: "btn", href: "#/bahan" }, "Buka Bahan")));
  }
  mount(el, isi);
}

async function kartuPilot(p) {
  const r = await api(`/api/pilot/${p.id}/ringkasan`);
  const peringatan = r.peringatan.length;
  return h("section", { class: "card", style: { marginTop: "24px" } },
    h("div", { class: "eyebrow" }, `${r.nama}, minggu ke-${r.minggu_ke} dari ${r.lama_minggu}`),
    h("h2", {}, h("b", {}, `${num(r.asupan_terakhir)} mg`), ` zat besi per hari dari produk, target ${num(r.target_fe)} mg.`),
    h("p", { class: "muted" }, `${r.peserta_aktif} dari ${r.peserta_total} peserta aktif.`,
      peringatan ? ` ${peringatan} peringatan perlu ditindaklanjuti.` : " Tidak ada peringatan."),
    h("p", { style: { marginTop: "16px" } }, h("a", { class: "btn primary", href: "#/pilot" }, "Buka Pilot", icon("arrow-right"))));
}
