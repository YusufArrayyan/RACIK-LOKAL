// Kelola (Admin): akun, acuan label bertanggal (FR-34), log audit.
import { api, busy, dialog, field, h, icon, mount, num, parseNum, tgl, toast, unitInput } from "../ui.js";
import { store } from "../store.js";
import { go } from "../app.js";

export async function render(el, { user }) {
  const [pg, ac, lg] = await Promise.all([api("/api/admin/pengguna"), api("/api/acuan-label"), api("/api/admin/log?limit=30")]);
  const aktif = ac.acuan.filter((a) => a.aktif);
  const lama = ac.acuan.filter((a) => !a.aktif);

  mount(el,
    h("h1", { class: "page-title" }, "Kelola"),
    h("p", { class: "lead" }, "Akun pengguna, acuan label gizi, dan catatan aktivitas."),

    h("div", { class: "row", style: { marginTop: "32px", marginBottom: "12px" } },
      h("h2", { class: "section-title", style: { margin: 0 } }, "Akun"), h("span", { class: "spacer" }),
      h("button", { class: "btn sm", type: "button", onclick: () => akunDialog(pg.peran) }, icon("plus"), "Tambah akun")),
    h("div", { class: "list" }, pg.pengguna.map((u) => h("div", { class: "li three-act", style: { gridTemplateColumns: "1fr 200px 80px" } },
      h("div", {}, h("div", { class: "name" }, u.nama), h("div", { class: "meta" }, `${u.surel}, ${u.wilayah}`)),
      h("span", { class: "st" }, u.aktif ? h("span", { class: "status neutral" }, u.peran) : h("span", { class: "status warn" }, icon("lock-simple"), `${u.peran}, nonaktif`)),
      h("div", { class: "act", style: { textAlign: "right" } },
        u.id === user.id ? h("span", { class: "small subtle" }, "Anda") : h("button", { class: "link-btn", type: "button", onclick: () => ubahAkunDialog(u, pg.peran) }, "Ubah"))))),

    h("div", { class: "row", style: { marginTop: "40px", marginBottom: "12px" } },
      h("h2", { class: "section-title", style: { margin: 0 } }, "Acuan label dan syarat klaim"), h("span", { class: "spacer" }),
      h("button", { class: "btn sm", type: "button", onclick: acuanDialog }, icon("plus"), "Tambah acuan baru")),
    h("p", { class: "hint" }, "Penjaga Klaim memakai acuan terbaru yang sudah berlaku. Acuan lama tetap tersimpan agar hasil lama bisa dihitung ulang."),
    h("div", { class: "list" }, aktif.map((a) => h("div", { class: "li three", style: { gridTemplateColumns: "1fr 140px 220px" } },
      h("div", {}, h("div", { class: "name" }, a.nama), h("div", { class: "meta" }, `${a.dokumen_rujukan}, berlaku ${tgl(a.tanggal_berlaku, true)}`)),
      h("span", { class: "val" }, `${num(a.nilai_alg, a.nilai_alg % 1 ? 1 : 0)} ${a.satuan}`),
      h("span", { class: "st small" }, `Sumber ${num(a.ambang_sumber, 0)}%, Tinggi ${num(a.ambang_tinggi, 0)}% per 100 g`)))),
    lama.length ? h("details", { class: "fold" }, h("summary", {}, icon("caret-down"), "Acuan yang tidak berlaku lagi atau belum berlaku", h("span", { class: "sum" }, `${lama.length} baris`)),
      h("div", { class: "body list" }, lama.map((a) => h("div", { class: "li" }, h("div", {}, h("div", {}, a.nama), h("div", { class: "meta" }, `${a.dokumen_rujukan}, berlaku ${tgl(a.tanggal_berlaku, true)}`)),
        h("span", { class: "val" }, `${num(a.nilai_alg, 1)} ${a.satuan}`))))) : null,

    h("h2", { class: "section-title", style: { marginTop: "40px" } }, "Aktivitas terakhir"),
    h("div", { class: "list" }, lg.log.map((r) => h("div", { class: "li" },
      h("div", {}, h("div", {}, `${r.aksi}, ${r.objek}`), h("div", { class: "meta" }, r.rincian || "")),
      h("span", { class: "small muted", style: { textAlign: "right" } }, r.pengguna, h("br"), `${tgl(r.waktu)} ${r.waktu.slice(11, 16)}`)))));
}

function simpanDialog(judul, isi, aksi, label = "Simpan") {
  const err = h("div", { role: "alert" });
  const ok = h("button", { class: "btn primary", type: "button", "data-busy-text": "Menyimpan..." }, label);
  const dlg = dialog({ judul, isi: h("div", { class: "stack" }, err, isi),
    tombol: [h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Batal"), ok] });
  ok.addEventListener("click", () => busy(ok, async () => {
    err.replaceChildren();
    try { const tutup = await aksi(); if (tutup !== false) { dlg.close(); go("kelola"); } }
    catch (e) { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, e.message))); }
  }));
}

function akunDialog(peranList) {
  const nama = h("input", { class: "input" });
  const surel = h("input", { class: "input", type: "email" });
  const peran = h("select", { class: "input" }, peranList.map((p) => h("option", { value: p }, p)));
  const wilayah = h("input", { class: "input", value: "Rejang Lebong" });
  simpanDialog("Tambah akun", [field("Nama lengkap", nama), field("Surel", surel), h("div", { class: "grid2" }, field("Peran", peran), field("Wilayah", wilayah)),
    h("p", { class: "small muted" }, "Kata sandi sementara dibuat otomatis dan ditampilkan sekali. Serahkan kepada pengguna, lalu minta mereka menggantinya lewat Lupa kata sandi.")], async () => {
    const r = await api("/api/admin/pengguna", { method: "POST", body: { nama: nama.value, surel: surel.value, peran: peran.value, wilayah: wilayah.value } });
    store.ref = null;
    if (r.kata_sandi_sementara) {
      dialog({ judul: "Akun dibuat", isi: h("div", { class: "stack" },
        h("p", {}, `Kata sandi sementara untuk ${surel.value}:`),
        h("p", { class: "mono", style: { fontSize: "18px", userSelect: "all" } }, r.kata_sandi_sementara),
        h("p", { class: "small muted" }, "Kata sandi ini tidak akan ditampilkan lagi.")),
        tombol: [h("button", { class: "btn primary", type: "button", onclick: (e) => e.target.closest("dialog").close() }, "Sudah saya catat")] });
    }
  }, "Buat akun");
}

function ubahAkunDialog(u, peranList) {
  const peran = h("select", { class: "input" }, peranList.map((p) => h("option", { value: p, selected: p === u.peran }, p)));
  const wilayah = h("input", { class: "input", value: u.wilayah });
  const aktif = h("input", { type: "checkbox", checked: !!u.aktif });
  simpanDialog(`Ubah akun ${u.nama}`, [h("div", { class: "grid2" }, field("Peran", peran), field("Wilayah", wilayah)),
    h("label", { class: "check" }, aktif, "Akun aktif (bisa masuk)")], async () => {
    await api(`/api/admin/pengguna/${u.id}`, { method: "PUT", body: { peran: peran.value, wilayah: wilayah.value, aktif: aktif.checked } });
    store.ref = null;
    toast("Akun diperbarui.");
  });
}

function acuanDialog() {
  const zat = h("select", { class: "input" }, Object.entries(store.ref.zat_gizi).map(([k, z]) => h("option", { value: k }, `${z.nama} (${z.satuan})`)));
  const alg = unitInput("", "per hari");
  const sumber = unitInput("15", "%");
  const tinggi = unitInput("30", "%");
  const berlaku = h("input", { class: "input", type: "date", value: new Date().toISOString().slice(0, 10) });
  const dok = h("input", { class: "input", placeholder: "Contoh: Peraturan BPOM Nomor 1 Tahun 2022, Lampiran I" });
  simpanDialog("Tambah acuan label", [field("Zat gizi", zat), field("Nilai acuan label gizi (ALG)", alg.wrap),
    h("div", { class: "grid2" }, field("Ambang klaim Sumber", sumber.wrap, { hint: "Persen ALG per 100 g" }), field("Ambang klaim Tinggi", tinggi.wrap, { hint: "Persen ALG per 100 g" })),
    field("Tanggal berlaku", berlaku), field("Dokumen rujukan", dok)], async () => {
    await api("/api/acuan-label", { method: "POST", body: { zat_gizi: zat.value, nilai_alg: parseNum(alg.input.value), ambang_sumber: parseNum(sumber.input.value),
      ambang_tinggi: parseNum(tinggi.input.value), tanggal_berlaku: berlaku.value, dokumen_rujukan: dok.value } });
    toast("Acuan label tersimpan. Racik ulang formula untuk memakai acuan baru.");
  });
}
