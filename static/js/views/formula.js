// Formula: daftar, empat langkah (Sasaran, Racik, Cek klaim, Ajukan), dan Tinjau.
import {
  api, busy, dialog, emptyState, errorState, field, fotoBahan, h, icon, konfirmasi, mount, num, parseNum, rp, smart,
  statusCukup, statusFormula, tgl, toast, unitInput,
} from "../ui.js";
import { store } from "../store.js";
import { go } from "../app.js";
import { berikutnya, keteranganVersi, LANGKAH, stepper } from "./langkah.js";

const ZAT_URUT = ["energi", "protein", "zat_besi", "folat", "vitamin_c", "kalsium", "seng"];
const ZAT_UTAMA_SASARAN = ["zat_besi", "folat", "protein", "energi"];

// ---------- Daftar formula ----------
export async function daftar(el, { user, query }) {
  const status = query.get("status") || "";
  const data = await api(`/api/formula${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  const bisaBuat = ["Formulator", "Admin"].includes(user.peran);
  const pilih = h("select", { class: "input", style: { maxWidth: "240px" }, "aria-label": "Saring menurut status",
    onchange: (e) => go(`formula${e.target.value ? `?status=${encodeURIComponent(e.target.value)}` : ""}`) },
    h("option", { value: "" }, "Semua status"),
    ["Draf", "Ditinjau", "Perlu revisi", "Disetujui", "Ditolak"].map((s) => h("option", { value: s, selected: s === status }, s)));

  mount(el,
    h("div", { class: "page-head" },
      h("div", {}, h("h1", { class: "page-title" }, "Formula"),
        h("p", { class: "lead" }, user.peran === "Peninjau" ? "Formula yang diajukan dan riwayatnya. Buka formula untuk meninjau." : "Semua formula Anda beserta status dan versinya.")),
      bisaBuat ? h("button", { class: "btn", type: "button", onclick: formulaBaruDialog }, icon("plus"), "Formula baru") : null),
    h("div", { class: "row", style: { marginBottom: "16px" } }, pilih),
    data.formula.length
      ? h("div", { class: "list" }, data.formula.map((f) => h("div", { class: "li three-act" },
        h("div", {}, h("div", { class: "name" }, f.nama),
          h("div", { class: "meta" }, keteranganVersi(f), user.peran !== "Formulator" ? `, oleh ${f.pemilik}` : "", f.biaya ? `, ${rp(f.biaya)} per sajian` : "")),
        h("div", { class: "st" }, statusFormula(f.status)),
        h("div", { class: "act", style: { textAlign: "right" } }, h("a", { href: `#/formula/${f.id}`, "aria-label": `Buka ${f.nama}` }, "Buka")))))
      : emptyState(status ? `Tidak ada formula berstatus ${status.toLowerCase()}.` : "Belum ada formula.",
        status ? "Pilih status lain, atau lihat semua status." : (bisaBuat ? "Buat formula pertama Anda untuk mulai meracik." : "Formula yang diajukan akan tampil di sini."),
        bisaBuat && !status ? h("button", { class: "btn primary", type: "button", onclick: formulaBaruDialog }, icon("plus"), "Formula baru") : null));
}

export function formulaBaruDialog() {
  const ref = store.ref;
  const nama = h("input", { class: "input", required: true, placeholder: "Contoh: Camilan batang tempe-kelor 40 g", maxlength: 80 });
  const kel = h("select", { class: "input" }, ref.kelompok_sasaran.map((k) => h("option", { value: k.nama }, k.nama)));
  const err = h("div", { role: "alert" });
  const tombol = h("button", { class: "btn primary", type: "submit", form: "form-baru" }, "Lanjut ke Sasaran", icon("arrow-right"));
  const dlg = dialog({
    judul: "Formula baru",
    isi: h("form", { id: "form-baru", class: "stack", onsubmit: async (e) => {
      e.preventDefault();
      err.replaceChildren();
      if (nama.value.trim().length < 3) {
        err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, "Beri nama formula minimal 3 huruf, misalnya jenis camilan dan beratnya.")));
        return nama.focus();
      }
      await busy(tombol, async () => {
        try {
          const r = await api("/api/formula", { method: "POST", body: { nama: nama.value, kelompok: kel.value } });
          dlg.close();
          go(`formula/${r.id}/sasaran`);
        } catch (e2) { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, e2.message))); }
      });
    } }, err, field("Nama formula", nama, { hint: "Nama ini tampil di Beranda dan di lembar formula." }), field("Untuk siapa", kel)),
    tombol: [h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Batal"), tombol],
  });
  nama.focus();
}

// ---------- Buka formula: arahkan ke langkah yang tepat ----------
export async function buka(el, { params, user }) {
  const f = await api(`/api/formula/${params[0]}`);
  const nx = berikutnya(f, user);
  go(`formula/${f.id}/${nx.ke}`);
}

// ---------- Langkah ----------
export async function langkah(el, { params, user }) {
  const [id, step] = params;
  const f = await api(`/api/formula/${id}`);
  const view = { sasaran, racik, klaim, ajukan, tinjau, versi: racik }[step];
  await view(el, f, user);
}

function kepala(f, judul, lead, aktif) {
  const selesai = f.status === "Disetujui" ? 4 : f.langkah_terakhir;
  return [
    h("nav", { class: "crumb", "aria-label": "Jejak" }, h("a", { href: "#/formula" }, "Formula"), " / ", f.nama),
    h("h1", { class: "page-title" }, judul),
    h("p", { class: "lead" }, lead),
    aktif === null ? null : stepper(f.id, aktif, Math.max(selesai, aktif)),
  ];
}

function bannerStatus(f, user) {
  if (f.status === "Perlu revisi" && f.catatan_revisi) {
    // Catatan bisa berasal dari peninjau atau dari koreksi uji lab pilot.
    const t = f.tinjauan[0]?.keputusan === "Perlu revisi" && f.tinjauan[0].catatan === f.catatan_revisi ? f.tinjauan[0] : null;
    const batas = t ? t.batas_baru : [];
    return h("div", { class: "banner" }, icon("warning"), h("div", {},
      h("p", {}, h("b", {}, t ? `Catatan dari ${t.peninjau_nama}: ` : "Catatan revisi: "), f.catatan_revisi),
      batas.length ? h("ul", { style: { margin: "6px 0 0", paddingLeft: "18px" } }, batas.map((b) => {
        const nama = f.batas.find((x) => x.bahan_id === b.bahan_id)?.nama || "Bahan";
        return h("li", {}, `${nama}: batas ${num(b.batas_bawah)}% sampai ${num(b.batas_atas)}%${b.alasan ? `, ${b.alasan}` : ""}`);
      })) : null));
  }
  if (f.status === "Ditinjau" && !f.izin.tinjau) {
    return h("div", { class: "banner info" }, icon("clock"), h("span", {},
      `Formula ini sedang ditinjau ${f.peninjau}. Bila Anda meracik ulang, pengajuan ditarik dan status kembali menjadi Draf.`));
  }
  if (f.status === "Disetujui" && f.izin.ubah) {
    return h("div", { class: "banner info" }, icon("check-circle"), h("span", {},
      `Versi ${f.versi} sudah disetujui. Meracik ulang akan membuat versi baru berstatus Draf yang perlu diajukan lagi.`));
  }
  return null;
}

async function pastikanBolehRacik(f) {
  if (!["Ditinjau", "Disetujui", "Ditolak"].includes(f.status)) return true;
  return konfirmasi({
    judul: "Racik ulang formula ini?",
    pesan: f.status === "Ditinjau"
      ? `Formula sedang ditinjau ${f.peninjau}. Racik ulang menarik pengajuan dan mengembalikan status ke Draf.`
      : `Racik ulang membuat versi baru berstatus Draf. Versi ${f.versi} tetap tersimpan.`,
    ya: "Racik ulang",
  });
}

async function jalankanRacik(f, btn) {
  if (!(await pastikanBolehRacik(f))) return;
  const run = async () => {
    try {
      const r = await api(`/api/formula/${f.id}/racik`, { method: "POST" });
      toast(r.hasil.berhasil ? `Versi ${r.versi} tersimpan. ${r.hasil.ringkasan}` : `Versi ${r.versi} tersimpan, tetapi belum ada komposisi yang memenuhi semua syarat.`);
      go(`formula/${f.id}/racik`);
    } catch (err) { toast(err.message, "bad"); }
  };
  return btn ? busy(btn, run) : run();
}

// ----- Langkah 1: Sasaran (FR-20, FR-22, FR-23, FR-24) -----
async function sasaran(el, f, user) {
  const ref = store.ref;
  const s = f.sasaran;
  const ro = !f.izin.ubah;
  const kel = h("select", { class: "input", disabled: ro }, ref.kelompok_sasaran.map((k) => h("option", { value: k.nama, selected: k.nama === s.kelompok }, k.nama)));
  const berat = unitInput(num(s.berat_sajian, s.berat_sajian % 1 ? 1 : 0), "g", { disabled: ro, "aria-label": "Berat satu sajian dalam gram" });
  const biaya = unitInput(s.biaya_maks ? Math.round(s.biaya_maks).toLocaleString("id-ID") : "", "Rp", { disabled: ro });
  const wil = h("select", { class: "input", disabled: ro }, ref.wilayah.map((w) => h("option", { value: w, selected: w === s.wilayah }, w === "Semua wilayah" || w.startsWith("Kota") ? w : `Kabupaten ${w}`)));
  const err = h("div", { role: "alert" });

  // Isian sasaran dan pengaturan lanjutan per zat gizi.
  const target = {}, jenis = {}, retensi = {};
  for (const k of ZAT_URUT) {
    const z = store.zat(k);
    target[k] = h("input", { class: "input mini", inputmode: "decimal", value: num(s.target[k], s.target[k] >= 20 ? 0 : 1), disabled: ro, "aria-label": `Sasaran ${z.nama} per sajian dalam ${z.satuan}` });
    jenis[k] = h("select", { class: "input", style: { width: "auto", minHeight: "40px" }, disabled: ro, "aria-label": `Jenis sasaran ${z.nama}` },
      h("option", { value: "wajib", selected: (s.jenis?.[k] || z.jenis) === "wajib" }, "Wajib"),
      h("option", { value: "lunak", selected: (s.jenis?.[k] || z.jenis) === "lunak" }, "Lunak"));
    retensi[k] = h("input", { class: "input mini", inputmode: "decimal", value: num(s.retensi?.[k] ?? z.retensi, 2), disabled: ro, "aria-label": `Faktor retensi ${z.nama}` });
  }
  kel.addEventListener("change", () => {
    const k = ref.kelompok_sasaran.find((x) => x.nama === kel.value);
    const t = JSON.parse(k.sasaran_json);
    for (const z of ZAT_URUT) target[z].value = num(t[z], t[z] >= 20 ? 0 : 1);
    toast("Sasaran zat gizi diisi ulang dari angka kecukupan gizi kelompok ini.");
  });

  const daftarUtama = h("div", { class: "list" }, ZAT_UTAMA_SASARAN.map((k) => {
    const z = store.zat(k);
    return h("div", { class: "li three", style: { gridTemplateColumns: "1fr auto 110px" } },
      h("label", { for: `t-${k}` }, z.nama),
      h("span", { class: "row", style: { gap: "8px", flexWrap: "nowrap" } }, Object.assign(target[k], { id: `t-${k}` }), h("span", { class: "subtle small", style: { width: "32px" } }, z.satuan)),
      h("span", { class: "st" }, k === (s.zat_utama || "zat_besi") ? h("span", { class: "status good" }, icon("star"), "Utama") : ""));
  }));

  const tabelLanjut = h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
    h("caption", { class: "sr-only" }, "Sasaran, jenis, dan faktor retensi semua zat gizi"),
    h("thead", {}, h("tr", {}, h("th", {}, "Zat gizi"), h("th", { class: "r" }, "Sasaran per sajian"), h("th", {}, "Jenis"), h("th", { class: "r" }, "Retensi"))),
    h("tbody", {}, ZAT_URUT.map((k) => {
      const z = store.zat(k);
      const inp = ZAT_UTAMA_SASARAN.includes(k) ? h("span", { class: "mono" }, "lihat di atas") : h("span", { class: "row", style: { gap: "6px", justifyContent: "flex-end", flexWrap: "nowrap" } }, target[k], h("span", { class: "subtle small" }, z.satuan));
      return h("tr", {}, h("td", {}, z.nama), h("td", { class: "r" }, inp), h("td", {}, jenis[k]), h("td", { class: "r" }, retensi[k]));
    }))));

  const bahanRows = f.batas.map((b) => ({ b, ...barisBatas(b, ro) }));
  const tabelBahan = tabelBatas(bahanRows, { pilihPakai: true });

  const lanjut = h("button", { class: "btn primary", type: "button", "data-busy-text": "Menghitung..." }, ro ? "Lihat hasil racik" : "Lanjut ke Racik", icon("arrow-right"));
  lanjut.addEventListener("click", async () => {
    if (ro) return go(`formula/${f.id}/racik`);
    err.replaceChildren();
    const salah = (m, inp) => { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, m))); inp?.focus(); inp?.setAttribute("aria-invalid", "true"); };
    const beratV = parseNum(berat.input.value);
    if (!beratV || beratV <= 0) return salah("Isi berat satu sajian dalam gram, misalnya 40.", berat.input);
    const biayaV = biaya.input.value.trim() ? parseNum(biaya.input.value) : null;
    if (biayaV !== null && (Number.isNaN(biayaV) || biayaV <= 0)) return salah("Biaya maksimal harus angka rupiah, misalnya 2.000. Kosongkan bila tidak ada batas.", biaya.input);
    const t = {}, j = {}, r = {};
    for (const k of ZAT_URUT) {
      const v = parseNum(target[k].value);
      if (v === null || Number.isNaN(v) || v < 0) return salah(`Sasaran ${store.zat(k).nama_kecil} harus angka 0 atau lebih.`, target[k]);
      t[k] = v; j[k] = jenis[k].value;
      const rv = parseNum(retensi[k].value);
      if (!(rv > 0 && rv <= 1)) return salah(`Faktor retensi ${store.zat(k).nama_kecil} harus di antara 0 dan 1, misalnya 0,7.`, retensi[k]);
      r[k] = rv;
    }
    const batas = kumpulkanBatas(bahanRows, salah);
    if (!batas) return;
    if (batas.filter((b) => b.dipakai).length < 2) return salah("Pilih minimal dua bahan yang boleh dipakai.");
    if (!(await pastikanBolehRacik(f))) return;
    await busy(lanjut, async () => {
      try {
        await api(`/api/formula/${f.id}/sasaran`, { method: "PUT", body: { kelompok: kel.value, berat_sajian: beratV, biaya_maks: biayaV, wilayah: wil.value, target: t, jenis: j, retensi: r } });
        if (wil.value === s.wilayah) await api(`/api/formula/${f.id}/batas`, { method: "PUT", body: { batas } });
        const hasil = await api(`/api/formula/${f.id}/racik`, { method: "POST" });
        toast(`Versi ${hasil.versi_daftar[0].nomor} tersimpan.`);
        go(`formula/${f.id}/racik`);
      } catch (e) { salah(e.message); }
    });
  });

  const dipakaiN = f.batas.filter((b) => b.dipakai).length;
  mount(el,
    kepala(f, "Sasaran", "Beri tahu kami untuk siapa camilan ini dan berapa biayanya. Sisanya kami isi otomatis.", 0),
    bannerStatus(f, user),
    err,
    h("div", { class: "grid2", style: { marginTop: "24px" } },
      field("Untuk siapa", kel),
      field("Berat satu sajian", berat.wrap),
      field("Biaya bahan maksimal per sajian", biaya.wrap, { hint: f.biaya ? `Biaya hasil racikan sekarang ${rp(f.biaya)}. Kosongkan bila tidak ada batas.` : "Kosongkan bila tidak ada batas biaya." }),
      field("Wilayah bahan", wil, { hint: "Bahan dari wilayah ini dipakai otomatis. Ubah pilihannya di pengaturan lanjutan." })),
    h("h2", { class: "section-title" }, "Zat gizi yang dikejar"),
    h("p", { class: "hint" }, "Dihitung dari angka kecukupan gizi, kira-kira 10% kebutuhan harian per sajian."),
    daftarUtama,
    h("details", { class: "fold" },
      h("summary", {}, icon("caret-down"), "Pengaturan lanjutan", h("span", { class: "sum" }, "Zat gizi lain, bahan yang boleh dipakai, batas pemakaian")),
      h("div", { class: "body" },
        h("p", { class: "small muted", style: { marginBottom: "8px" } },
          "Sasaran wajib harus tercapai. Sasaran lunak boleh kurang bila memang tidak bisa dihindari, dan sebabnya akan dijelaskan. Retensi adalah bagian zat gizi yang bertahan setelah dipanggang atau dimasak."),
        tabelLanjut,
        h("h3", { class: "section-title" }, `Bahan yang boleh dipakai (${dipakaiN} dari ${f.batas.length})`),
        h("p", { class: "small muted", style: { marginBottom: "8px" } }, "Batas dalam persen berat satu sajian. Kunci membuat bahan dipakai tepat sebesar batas bawahnya."),
        tabelBahan)),
    h("div", { class: "actions" },
      h("div", { class: "secondary-group" }, h("a", { class: "btn", href: "#/beranda" }, "Batal")),
      h("div", { class: "primary-slot" }, lanjut)));
}

function barisBatas(b, ro) {
  const pakai = h("input", { type: "checkbox", checked: !!b.dipakai, disabled: ro, "aria-label": `Pakai ${b.nama}` });
  const lo = h("input", { class: "input mini", inputmode: "decimal", value: num(b.batas_bawah, b.batas_bawah % 1 ? 1 : 0), disabled: ro, "aria-label": `Batas bawah ${b.nama} (%)` });
  const hi = h("input", { class: "input mini", inputmode: "decimal", value: num(b.batas_atas, b.batas_atas % 1 ? 1 : 0), disabled: ro, "aria-label": `Batas atas ${b.nama} (%)` });
  const kunci = h("input", { type: "checkbox", checked: !!b.dikunci, disabled: ro, "aria-label": `Kunci ${b.nama}` });
  return { pakai, lo, hi, kunci };
}

function tabelBatas(rows, { pilihPakai }) {
  const asalTeks = { bawaan: "Batas umum", formulator: "Diubah formulator", peninjau: "Dari peninjau", uji_lab: "Dari uji lab", pilot: "Dari pilot" };
  return h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
    h("caption", { class: "sr-only" }, "Batas pemakaian bahan"),
    h("thead", {}, h("tr", {}, pilihPakai ? h("th", {}, "Pakai") : null, h("th", {}, "Bahan"), h("th", { class: "r" }, "Bawah %"), h("th", { class: "r" }, "Atas %"), h("th", {}, "Kunci"), h("th", {}, "Asal batas"))),
    h("tbody", {}, rows.map(({ b, pakai, lo, hi, kunci }) => h("tr", { class: b.dipakai ? "" : "off" },
      pilihPakai ? h("td", {}, h("label", { class: "check" }, pakai)) : null,
      h("td", {}, h("div", {}, b.nama), h("div", { class: "small subtle" }, `${rp(b.harga_per_kg)}/kg${pilihPakai ? `, ${b.wilayah}` : ""}`)),
      h("td", { class: "r" }, lo), h("td", { class: "r" }, hi),
      h("td", {}, h("label", { class: "check" }, kunci)),
      h("td", { class: "small" }, asalTeks[b.asal] || b.asal, b.alasan ? h("div", { class: "subtle" }, b.alasan) : null))))));
}

function kumpulkanBatas(rows, salah) {
  const out = [];
  for (const { b, pakai, lo, hi, kunci } of rows) {
    const L = parseNum(lo.value), U = parseNum(hi.value);
    if ([L, U].some((v) => v === null || Number.isNaN(v) || v < 0 || v > 100)) { salah(`Batas ${b.nama.toLowerCase()} harus angka 0 sampai 100.`, Number.isNaN(L) ? lo : hi); return null; }
    if (L > U) { salah(`Batas bawah ${b.nama.toLowerCase()} lebih besar dari batas atasnya.`, lo); return null; }
    out.push({ bahan_id: b.bahan_id, dipakai: pakai.checked ? 1 : 0, batas_bawah: L, batas_atas: U, dikunci: kunci.checked });
  }
  return out;
}

// ----- Langkah 2: Racik (FR-21, FR-25 s.d. FR-28) -----
// Gram tetap angka utama; padanan takaran rumah tangga hanya bantuan menakar (tidak dipakai menghitung).
function gramTakaran(k) {
  return h("span", { class: "val" }, `${num(k.gram)} g`,
    k.takaran ? h("span", { class: "urt", title: `1 ${k.takaran.nama_takaran} kira-kira ${num(k.takaran.berat_gram)} g` }, `≈ ${k.takaran.teks}`) : null);
}

function catatanTakaran(komposisi) {
  if (!komposisi.some((k) => k.takaran)) return null;
  return h("p", { class: "small muted", style: { marginTop: "8px" } }, icon("info"),
    " Takaran sendok dan gelas hanya perkiraan untuk membantu menakar. Gizi, biaya, dan klaim tetap dihitung dari gram, jadi timbang bahan bila bisa.");
}

async function racik(el, f, user) {
  const hsl = f.hasil;
  const ro = !f.izin.ubah;
  const isi = [kepala(f, "Racik", hsl?.berhasil ? "Mesin sudah menghitung komposisi paling murah yang memenuhi sasaran Anda." : "Mesin Racik menghitung komposisi bahan termurah yang memenuhi sasaran gizi.", 1), bannerStatus(f, user)];

  if (Object.keys(f.koreksi || {}).length) {
    isi.push(h("div", { class: "banner info" }, icon("info"), h("span", {},
      Object.entries(f.koreksi).map(([k, v]) => `Koreksi ${store.zat(k).nama_kecil} dari ${v.sumber}: faktor ${num(v.faktor, 2)}. `),
      "Data sumber bahan tidak diubah.")));
  }

  if (!hsl) {
    isi.push(emptyState("Formula ini belum diracik.", ro ? "Pemilik formula belum menjalankan Mesin Racik." : "Isi sasaran dulu, lalu jalankan Mesin Racik.",
      ro ? null : h("a", { class: "btn primary", href: `#/formula/${f.id}/sasaran` }, "Ke Sasaran")));
    return mount(el, isi);
  }

  const racikUlang = h("button", { class: "btn", type: "button", "data-busy-text": "Menghitung...", onclick: (e) => jalankanRacik(f, e.currentTarget) }, icon("arrows-clockwise"), "Racik ulang");

  if (!hsl.berhasil) {
    isi.push(h("p", { class: "answer" }, hsl.ringkasan));
    if (hsl.konflik?.length) {
      isi.push(h("h2", { class: "section-title" }, "Kendala yang berkonflik"),
        h("div", { class: "list" }, hsl.konflik.map((k) => h("div", { class: "li" }, h("div", {}, h("div", { class: "name" }, k.kendala), h("div", { class: "meta" }, k.rincian)), h("span", { class: "status warn" }, icon("warning"), "Tidak tercapai")))));
    }
    isi.push(h("h2", { class: "section-title" }, "Saran, coba satu per satu"),
      h("div", { class: "list" }, hsl.saran.map((s) => h("div", { class: "li" }, h("span", {}, s.teks), ro ? h("span") : tombolSaran(f, s)))));
  } else {
    isi.push(h("p", { class: "answer" }, ...jawabanTebal(hsl.ringkasan)));
    for (const s of hsl.sebab_kurang || []) {
      isi.push(h("div", { class: "banner" }, icon("warning"), h("span", {}, s.teks, " ",
        !ro && s.aksi?.jenis === "batas" ? [h("button", { class: "link-btn", type: "button", onclick: () => naikkanBatasDialog(f, s.aksi) }, `Naikkan batas ${s.aksi.nama.toLowerCase()}`), " lalu racik ulang, atau terima kekurangannya."] : null,
        !ro && s.aksi?.jenis === "biaya" ? [h("a", { href: `#/formula/${f.id}/sasaran` }, "Ubah biaya maksimal"), " atau terima kekurangannya."] : null)));
    }
    const dipakai = hsl.komposisi.filter((k) => k.gram >= 0.05);
    isi.push(h("h2", { class: "section-title" }, `Isi satu sajian (${num(hsl.berat_sajian, 0)} g)`),
      h("div", { class: "list" },
        dipakai.map((k) => h("div", { class: "li" },
          h("div", { class: "with-foto" }, fotoBahan(k.foto, "xs"), h("div", {}, h("div", {}, k.nama), h("div", { class: "meta" }, `${num(k.persen)}%, ${rp(k.biaya)}`, k.di_batas_atas ? h("span", { class: "tag-warn" }, icon("lock-simple"), ` di batas ${num(k.batas_atas)}%`) : null))),
          gramTakaran(k))),
        h("div", { class: "li total" }, h("span", {}, "Biaya bahan"), h("span", { class: "val" }, rp(hsl.biaya)))),
      catatanTakaran(dipakai));

    const tanpaData = Object.values(hsl.gizi).filter((g) => g.tanpa_data?.length);
    isi.push(h("h2", { class: "section-title" }, "Gizi dalam satu sajian"),
      h("div", { class: "list" }, ZAT_URUT.filter((k) => hsl.gizi[k]).map((k) => {
        const g = hsl.gizi[k];
        const kurang = g.target && !g.cukup ? `Kurang ${num(100 - g.persen_target, 0)}%` : null;
        return h("div", { class: "li three", style: { gridTemplateColumns: "1fr 150px 130px" } },
          h("div", {}, h("div", {}, g.nama, g.jenis === "lunak" ? h("span", { class: "small subtle" }, " (lunak)") : null),
            h("div", { class: "meta" }, g.target ? `Target ${smart(g.target, g.satuan)}` : "Tanpa sasaran")),
          h("span", { class: "val" }, smart(g.per_sajian, g.satuan)),
          h("span", { class: "st" }, g.target ? statusCukup(g.cukup, kurang) : h("span", { class: "status neutral" }, "–")));
      })),
      tanpaData.length ? h("p", { class: "small muted", style: { marginTop: "8px" } }, icon("info"),
        ` Data belum ada dan dihitung sebagai tidak tersedia: ${tanpaData.map((g) => `${g.nama_kecil} pada ${g.tanpa_data.join(", ")}`).join("; ")}.`) : null,
      h("p", { class: "small muted", style: { marginTop: "12px" } }, "Ini rancangan dari data bahan, bukan hasil uji. Nilai gizi produk jadi tetap harus diuji di laboratorium."));
  }

  // Batas pemakaian bahan, bisa diubah lalu racik ulang (FR-23, FR-28).
  const rows = f.batas.filter((b) => b.dipakai).map((b) => ({ b, ...barisBatas(b, ro) }));
  const nBatas = hsl.berhasil ? hsl.bahan_di_batas.length : 0;
  const errB = h("div", { role: "alert" });
  const simpanBatas = h("button", { class: "btn", type: "button", "data-busy-text": "Menghitung..." }, icon("arrows-clockwise"), "Simpan batas dan racik ulang");
  simpanBatas.addEventListener("click", async () => {
    errB.replaceChildren();
    const salah = (m, inp) => { errB.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, m))); inp?.focus(); };
    const batas = kumpulkanBatas(rows, salah);
    if (!batas || !(await pastikanBolehRacik(f))) return;
    await busy(simpanBatas, async () => {
      try {
        await api(`/api/formula/${f.id}/batas`, { method: "PUT", body: { batas } });
        await api(`/api/formula/${f.id}/racik`, { method: "POST" });
        toast("Batas disimpan dan formula diracik ulang.");
        go(`formula/${f.id}/racik`);
      } catch (e) { salah(e.message); }
    });
  });
  isi.push(h("details", { class: "fold" },
    h("summary", {}, icon("caret-down"), "Batas pemakaian bahan", h("span", { class: "sum" }, nBatas ? `${nBatas} bahan sudah di batas` : `${rows.length} bahan dipakai`)),
    h("div", { class: "body" }, errB, tabelBatas(rows, { pilihPakai: false }),
      ro ? null : h("div", { class: "row", style: { marginTop: "12px" } }, simpanBatas,
        h("a", { href: `#/formula/${f.id}/sasaran` }, "Tambah atau kurangi bahan di Sasaran")))));

  // Riwayat versi dan perbandingan (FR-27).
  isi.push(lipatanVersi(f));

  const lanjut = hsl.berhasil
    ? h("a", { class: "btn primary", href: `#/formula/${f.id}/klaim` }, "Lanjut ke Cek klaim", icon("arrow-right"))
    : h("button", { class: "btn primary", type: "button", disabled: true, title: "Butuh hasil racik yang berhasil" }, "Lanjut ke Cek klaim", icon("arrow-right"));
  isi.push(h("div", { class: "actions" },
    h("div", { class: "secondary-group" }, h("a", { class: "btn", href: `#/formula/${f.id}/sasaran` }, "Kembali"), ro ? null : racikUlang),
    h("div", { class: "primary-slot" }, lanjut)));
  mount(el, isi);
}

function jawabanTebal(teks) {
  const m = teks.match(/^(\d+ dari \d+)(.*)$/);
  return m ? [h("b", {}, m[1]), m[2]] : [teks];
}

function tombolSaran(f, s) {
  if (s.jenis === "biaya") {
    return h("button", { class: "btn sm", type: "button", "data-busy-text": "Menghitung...", onclick: async (e) => {
      const btn = e.currentTarget;
      await busy(btn, async () => {
        try {
          await api(`/api/formula/${f.id}/sasaran`, { method: "PUT", body: { biaya_maks: s.nilai } });
          await jalankanRacik(f);
        } catch (err) { toast(err.message, "bad"); }
      });
    } }, "Terapkan");
  }
  if (s.jenis === "batas") {
    const b = f.batas.find((x) => x.bahan_id === s.bahan_id);
    return h("button", { class: "btn sm", type: "button", onclick: () => naikkanBatasDialog(f, { bahan_id: s.bahan_id, nama: b?.nama || "bahan", batas_sekarang: b?.batas_atas, usulan: s.nilai, buka_kunci: b?.dikunci }) }, "Terapkan");
  }
  return h("a", { class: "btn sm", href: `#/formula/${f.id}/sasaran` }, "Ubah sasaran");
}

function naikkanBatasDialog(f, aksi) {
  const b = f.batas.find((x) => x.bahan_id === aksi.bahan_id);
  const inp = unitInput(num(aksi.usulan ?? Math.min(100, (b.batas_atas || 0) + 2), 1), "%");
  const alasan = h("input", { class: "input", placeholder: "Contoh: rasa masih diterima pada uji rasa 12 Okt" });
  const err = h("div", { role: "alert" });
  const ok = h("button", { class: "btn primary", type: "button", "data-busy-text": "Menghitung..." }, "Simpan dan racik ulang");
  const dlg = dialog({
    judul: `Naikkan batas ${b.nama.toLowerCase()}`,
    isi: h("div", { class: "stack" }, err,
      h("p", { class: "muted" }, `Batas atas sekarang ${num(b.batas_atas)}%${b.alasan ? ` (${b.alasan})` : ""}.`,
        aksi.usulan ? ` Mesin menghitung butuh sekitar ${num(aksi.usulan)}%.` : "",
        aksi.cukup === false ? " Menaikkan batas ini saja belum menutup seluruh kekurangan." : ""),
      field("Batas atas baru", inp.wrap), field("Alasan (boleh kosong)", alasan, { hint: "Alasan membantu peninjau memahami perubahan." })),
    tombol: [h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Batal"), ok],
  });
  inp.input.focus();
  ok.addEventListener("click", async () => {
    err.replaceChildren();
    const v = parseNum(inp.input.value);
    if (!(v >= 0 && v <= 100)) { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, "Isi angka 0 sampai 100."))); return; }
    if (!(await pastikanBolehRacik(f))) return;
    await busy(ok, async () => {
      try {
        await api(`/api/formula/${f.id}/batas`, { method: "PUT", body: { batas: [{ bahan_id: b.bahan_id, dipakai: 1, batas_bawah: aksi.buka_kunci ? 0 : b.batas_bawah, batas_atas: v, dikunci: false, alasan: alasan.value || null }] } });
        dlg.close();
        await jalankanRacik({ ...f, status: "Draf" });
      } catch (e) { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, e.message))); }
    });
  });
}

function lipatanVersi(f) {
  const vs = f.versi_daftar;
  const isi = h("div", { class: "body" });
  const list = h("div", { class: "list" }, vs.map((v) => h("div", { class: "li" },
    h("div", {}, h("div", { class: "name" }, `Versi ${v.nomor}`, v.nomor === f.versi ? h("span", { class: "small subtle" }, " (terbaru)") : null),
      h("div", { class: "meta" }, `${tgl(v.dibuat)}, ${v.berhasil ? rp(v.biaya) + " per sajian" : "tanpa solusi"}. ${v.ringkasan || ""}`)),
    h("a", { href: `/api/ekspor/formula/${f.id}.csv?versi=${v.nomor}`, download: true, "aria-label": `Unduh CSV versi ${v.nomor}`, class: v.berhasil ? "" : "sr-only" }, icon("download-simple"), " CSV"))));
  isi.append(list);
  if (vs.length >= 2) {
    const a = h("select", { class: "input", style: { width: "auto" }, "aria-label": "Versi pertama" }, vs.map((v, i) => h("option", { value: v.nomor, selected: i === 1 }, `Versi ${v.nomor}`)));
    const b = h("select", { class: "input", style: { width: "auto" }, "aria-label": "Versi kedua" }, vs.map((v, i) => h("option", { value: v.nomor, selected: i === 0 }, `Versi ${v.nomor}`)));
    const hasil = h("div", {});
    const btn = h("button", { class: "btn", type: "button", onclick: async () => {
      try { tampilkanBanding(hasil, await api(`/api/formula/${f.id}/banding?a=${a.value}&b=${b.value}`)); }
      catch (e) { mount(hasil, errorState(e)); }
    } }, icon("git-diff"), "Bandingkan");
    isi.append(h("div", { class: "row", style: { marginTop: "16px" } }, a, h("span", {}, "dengan"), b, btn), hasil);
  }
  return h("details", { class: "fold" },
    h("summary", {}, icon("caret-down"), "Riwayat versi", h("span", { class: "sum" }, `${vs.length} versi tersimpan`)), isi);
}

function tampilkanBanding(el, d) {
  const sel = (v) => (v > 0.005 ? `+${num(v)}` : v < -0.005 ? num(v) : "0");
  mount(el, h("div", { style: { marginTop: "16px" } },
    h("p", { class: "small muted" }, `Biaya: ${rp(d.biaya_a)} pada versi ${d.a}, ${rp(d.biaya_b)} pada versi ${d.b}.`),
    h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, h("th", {}, "Bahan"), h("th", { class: "r" }, `Versi ${d.a}`), h("th", { class: "r" }, `Versi ${d.b}`), h("th", { class: "r" }, "Selisih"))),
      h("tbody", {}, d.bahan.map((x) => h("tr", {}, h("td", {}, x.nama), h("td", { class: "num mono" }, `${num(x.gram_a)} g`), h("td", { class: "num mono" }, `${num(x.gram_b)} g`), h("td", { class: "num mono" }, sel(x.selisih))))))),
    h("div", { class: "tbl-wrap", style: { marginTop: "12px" } }, h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, h("th", {}, "Zat gizi"), h("th", { class: "r" }, `Versi ${d.a}`), h("th", { class: "r" }, `Versi ${d.b}`), h("th", { class: "r" }, "Sasaran"))),
      h("tbody", {}, d.gizi.map((g) => h("tr", {}, h("td", {}, g.nama), h("td", { class: "num mono" }, smart(g.a, g.satuan)), h("td", { class: "num mono" }, smart(g.b, g.satuan)), h("td", { class: "num mono" }, g.target ? smart(g.target, g.satuan) : "–"))))))));
}

// ----- Langkah 3: Cek klaim (FR-30 s.d. FR-34) -----
async function klaim(el, f, user) {
  if (!f.hasil?.berhasil) {
    return mount(el, kepala(f, "Cek klaim", "Label hanya boleh memuat klaim gizi yang memenuhi syarat BPOM. Kami periksa untuk Anda.", 2),
      emptyState("Belum ada hasil racik yang berhasil.", "Klaim diperiksa dari hasil racik. Selesaikan langkah Racik dulu.",
        h("a", { class: "btn primary", href: `#/formula/${f.id}/racik` }, "Ke Racik")));
  }
  const d = await api(`/api/formula/${f.id}/klaim`);
  if (f.izin.ubah && f.langkah_terakhir < 3 && f.status !== "Disetujui") f.langkah_terakhir = 3;
  const boleh = d.klaim.filter((k) => k.lolos).length;
  mount(el,
    kepala(f, "Cek klaim", "Label hanya boleh memuat klaim gizi yang memenuhi syarat BPOM. Kami periksa untuk Anda.", 2),
    h("p", { class: "answer" }, h("b", {}, `${boleh} dari ${d.klaim.length}`), " klaim boleh dipakai di label."),
    h("div", { class: "list" }, d.klaim.map((k) => h("div", { class: "li klaim" },
      h("span", { class: k.lolos ? "status good" : "status warn", style: { marginTop: "2px" } }, icon(k.lolos ? "check-circle" : "warning")),
      h("div", {}, h("div", { class: "name" }, k.label),
        h("div", { class: "meta" }, `${num(k.nilai_pct)}% dari acuan label per 100 g. Syarat ${num(k.syarat_pct, 0)}%.`,
          k.lolos ? ` Per sajian ${num(k.nilai_pct_sajian)}% acuan label.` : "",
          k.lolos ? "" : ` ${k.saran.replace(/^.*?Syarat \d+%\.\s*/, "")}`)),
      h("span", { class: `st ${k.lolos ? "status good" : "status warn"}` }, k.lolos ? "Boleh dipakai" : "Belum boleh")))),
    h("p", { class: "small muted", style: { marginTop: "16px" } },
      `Acuan label berlaku sejak ${tgl(d.acuan_tanggal, true)}. Syarat 15% dan 30% di sini masih contoh dan perlu dicocokkan dengan Peraturan BPOM 1/2022 sebelum dipakai. Klaim kesehatan berada di luar cakupan versi ini.`),
    h("div", { class: "actions" },
      h("div", { class: "secondary-group" }, h("a", { class: "btn", href: `#/formula/${f.id}/racik` }, "Kembali ke Racik")),
      h("div", { class: "primary-slot" }, h("a", { class: "btn primary", href: `#/formula/${f.id}/ajukan` }, "Lanjut ke Ajukan", icon("arrow-right")))));
}

// ----- Langkah 4: Ajukan (FR-33, FR-40, FR-44) -----
function ringkasanHasil(f) {
  const hsl = f.hasil;
  const sas = Object.values(hsl.gizi).filter((g) => g.target);
  const kurang = sas.filter((g) => !g.cukup);
  const boleh = f.klaim.filter((k) => k.lolos).length;
  const biayaOk = !hsl.biaya_maks || hsl.biaya <= hsl.biaya_maks + 0.5;
  const row = (label, val, st) => h("div", { class: "li three", style: { gridTemplateColumns: "1fr 120px 200px" } }, h("span", {}, label), h("span", { class: "val" }, val), h("span", { class: "st" }, st));
  return h("div", { class: "list", style: { marginTop: "24px" } },
    row("Zat gizi yang cukup", `${sas.length - kurang.length} dari ${sas.length}`,
      kurang.length ? statusCukup(false, `${kurang.map((g) => g.nama).join(", ").replace(/, ([^,]*)$/, " dan $1")} kurang`) : statusCukup(true, "Semua cukup")),
    row("Klaim label yang boleh dipakai", `${boleh} dari ${f.klaim.length}`,
      boleh < f.klaim.length ? statusCukup(false, `${f.klaim.length - boleh} belum boleh`) : statusCukup(true, "Semua boleh")),
    row("Biaya bahan per sajian", rp(hsl.biaya), hsl.biaya_maks ? statusCukup(biayaOk, biayaOk ? `Di bawah ${rp(hsl.biaya_maks)}` : `Di atas ${rp(hsl.biaya_maks)}`) : h("span", { class: "status neutral" }, "Tanpa batas")));
}

async function ajukan(el, f, user) {
  const lead = "Kirim formula ke ahli gizi untuk ditinjau. Anda masih bisa mengubahnya sampai ditinjau.";
  if (!f.hasil?.berhasil) {
    return mount(el, kepala(f, "Ajukan", lead, 3), emptyState("Formula belum bisa diajukan.", "Selesaikan Racik sampai ada komposisi yang memenuhi syarat.",
      h("a", { class: "btn primary", href: `#/formula/${f.id}/racik` }, "Ke Racik")));
  }
  const isi = [kepala(f, "Ajukan", lead, 3), bannerStatus(f, user), ringkasanHasil(f)];
  const ref = store.ref;
  const sudah = f.status === "Ditinjau" || f.status === "Disetujui" || f.status === "Ditolak";

  if (sudah && f.pengajuan) {
    const p = f.pengajuan;
    isi.push(h("h2", { class: "section-title" }, "Pengajuan"),
      h("div", { class: "list" },
        h("div", { class: "li" }, h("span", {}, "Dikirim ke"), h("span", {}, p.peninjau_nama)),
        h("div", { class: "li" }, h("span", {}, "Waktu"), h("span", {}, `${tgl(p.waktu, true)}, versi ${p.versi_nomor}`)),
        h("div", { class: "li" }, h("span", {}, "Klaim yang dicantumkan"), h("span", { style: { textAlign: "right" } }, p.klaim.length ? p.klaim.map((k) => labelKlaim(k)).join(", ") : "Tanpa klaim")),
        p.catatan ? h("div", { class: "li" }, h("span", {}, "Catatan"), h("span", { style: { textAlign: "right" } }, p.catatan)) : null));
  } else if (f.izin.ubah) {
    const lolos = f.klaim.filter((k) => k.lolos), gagal = f.klaim.filter((k) => !k.lolos);
    const cek = lolos.map((k) => ({ k, inp: h("input", { type: "checkbox", checked: true, value: `${k.jenis}:${k.zat_gizi}` }) }));
    // Peninjau sebelumnya dulu, lalu ahli gizi di wilayah pengguna.
    const sebelumnya = f.tinjauan[0]?.peninjau_id || ref.peninjau.find((p) => p.wilayah === user.wilayah)?.id;
    const peninjau = h("select", { class: "input" }, ref.peninjau.length ? ref.peninjau.map((p) => h("option", { value: p.id, selected: p.id === (sebelumnya || f.peninjau_id) }, `Ahli gizi: ${p.nama}`)) : h("option", { value: "" }, "Belum ada peninjau terdaftar"));
    const catatan = h("textarea", { class: "input", maxlength: 1000, rows: 3 });
    const kurang = Object.values(f.hasil.gizi).filter((g) => g.target && !g.cukup);
    if (kurang.length) catatan.placeholder = `Contoh: ${kurang[0].nama} kurang karena batas bahan. Mohon pertimbangkan batas yang lebih tinggi.`;
    const err = h("div", { role: "alert" });
    const kirim = h("button", { class: "btn primary", type: "button", "data-busy-text": "Mengirim..." }, "Kirim ke peninjau", icon("paper-plane-tilt"));
    kirim.addEventListener("click", async () => {
      err.replaceChildren();
      if (!peninjau.value) { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, "Belum ada ahli gizi peninjau. Minta Admin menambahkan akun peninjau."))); return; }
      await busy(kirim, async () => {
        try {
          await api(`/api/formula/${f.id}/ajukan`, { method: "POST", body: { peninjau_id: Number(peninjau.value), catatan: catatan.value, klaim: cek.filter((c) => c.inp.checked).map((c) => c.inp.value) } });
          toast("Formula terkirim ke peninjau.");
          go(`formula/${f.id}/ajukan`);
        } catch (e) { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, e.message))); }
      });
    });
    isi.push(err,
      h("h2", { class: "section-title" }, "Klaim yang dicantumkan di label"),
      h("p", { class: "hint" }, "Hanya klaim yang lolos yang bisa dipilih. Klaim yang belum lolos terkunci."),
      h("div", { class: "list" },
        cek.map(({ k, inp }) => h("div", { class: "li" }, h("label", { class: "check" }, inp, k.label), h("span", { class: "status good" }, icon("check-circle"), "Boleh dipakai"))),
        gagal.map((k) => h("div", { class: "li" }, h("label", { class: "check", style: { color: "var(--ink-subtle)", cursor: "not-allowed" } }, h("input", { type: "checkbox", disabled: true, "aria-describedby": `kunci-${k.id}` }), k.label),
          h("span", { class: "status warn", id: `kunci-${k.id}` }, icon("lock-simple"), "Terkunci, belum lolos")))),
      h("div", { class: "stack", style: { marginTop: "24px" } }, field("Dikirim ke", peninjau), field("Catatan untuk peninjau (boleh kosong)", catatan)),
      h("div", { class: "actions" },
        h("div", { class: "secondary-group" }, h("a", { class: "btn", href: `#/formula/${f.id}/klaim` }, "Kembali")),
        h("div", { class: "primary-slot" }, kirim)));
    return mount(el, isi);
  }

  if (f.tinjauan.length) isi.push(riwayatTinjauan(f));
  isi.push(h("div", { class: "actions" },
    h("div", { class: "secondary-group" }, h("a", { class: "btn", href: `#/formula/${f.id}/klaim` }, "Kembali")),
    h("div", { class: "primary-slot" },
      f.izin.tinjau ? h("a", { class: "btn primary", href: `#/formula/${f.id}/tinjau` }, "Tinjau formula", icon("arrow-right"))
        : h("a", { class: "btn primary", href: "#/beranda" }, "Ke Beranda"))));
  mount(el, isi);
}

function labelKlaim(kunci) {
  const [jenis, zat] = kunci.split(":");
  return `${jenis} ${store.zat(zat).nama_kecil}`;
}

function riwayatTinjauan(f) {
  const ic = { "Disetujui": "check-circle", "Perlu revisi": "warning", "Ditolak": "x-circle" };
  return [h("h2", { class: "section-title" }, "Riwayat tinjauan"),
    h("div", { class: "list" }, f.tinjauan.map((t) => h("div", { class: "li" },
      h("div", {}, h("div", { class: "name" }, `${t.peninjau_nama}, versi ${t.versi_nomor}`), h("div", { class: "meta" }, `${tgl(t.waktu, true)}${t.catatan ? `. ${t.catatan}` : ""}`),
        t.batas_baru.length ? h("div", { class: "meta" }, `Batas baru untuk ${t.batas_baru.length} bahan.`) : null),
      statusFormula(t.keputusan))))];
}

// ----- Tinjau (FR-41, FR-42) -----
async function tinjau(el, f, user) {
  const isi = [kepala(f, "Tinjau formula", `Diajukan oleh ${f.pemilik}. Setujui, minta revisi, atau tolak. Anda juga bisa mengubah batas pemakaian bahan.`, null)];
  if (!f.izin.tinjau) {
    isi.push(h("div", { style: { marginTop: "24px" } }, statusFormula(f.status)),
      h("p", { class: "muted", style: { marginTop: "12px" } }, f.status === "Ditinjau" ? `Formula ini diajukan ke ${f.peninjau}.` : "Formula ini tidak sedang menunggu tinjauan."),
      f.tinjauan.length ? riwayatTinjauan(f) : null,
      h("p", { style: { marginTop: "24px" } }, h("a", { class: "btn", href: `#/formula/${f.id}/racik` }, "Lihat hasil racik")));
    return mount(el, isi);
  }
  const hsl = f.hasil;
  const p = f.pengajuan;
  isi.push(ringkasanHasil(f));
  if (p?.catatan) isi.push(h("div", { class: "banner info", style: { marginTop: "24px" } }, icon("info"), h("span", {}, h("b", {}, `Catatan dari ${f.pemilik}: `), p.catatan)));
  isi.push(h("h2", { class: "section-title" }, `Isi satu sajian (${num(hsl.berat_sajian, 0)} g), versi ${f.versi}`),
    h("div", { class: "list" }, hsl.komposisi.filter((k) => k.gram >= 0.05).map((k) => h("div", { class: "li" },
      h("div", { class: "with-foto" }, fotoBahan(k.foto, "xs"), h("div", {}, h("div", {}, k.nama), h("div", { class: "meta" }, `${num(k.persen)}%`, k.di_batas_atas ? h("span", { class: "tag-warn" }, icon("lock-simple"), ` di batas ${num(k.batas_atas)}%`) : null))),
      gramTakaran(k)))),
    catatanTakaran(hsl.komposisi.filter((k) => k.gram >= 0.05)),
    h("p", { class: "small", style: { marginTop: "8px" } }, h("a", { href: `#/formula/${f.id}/racik` }, "Lihat rincian gizi dan riwayat versi")),
    h("h2", { class: "section-title" }, "Klaim yang dicantumkan"),
    h("p", { class: "muted" }, p?.klaim.length ? p.klaim.map(labelKlaim).join(", ") : "Formulator tidak mencantumkan klaim."));

  const pilihan = [["Disetujui", "Setujui", "Formula siap dipakai untuk produksi."],
    ["Perlu revisi", "Minta revisi", "Formula kembali ke langkah Racik dengan catatan Anda."],
    ["Ditolak", "Tolak", "Formula tidak dilanjutkan."]];
  const radios = pilihan.map(([v, label, ket], i) => {
    const r = h("input", { type: "radio", name: "keputusan", value: v, checked: i === 0 });
    return { r, el: h("label", { class: "check", style: { display: "flex", alignItems: "flex-start", minHeight: "0", padding: "8px 0" } }, r, h("span", {}, h("b", {}, label), h("span", { class: "small muted", style: { display: "block" } }, ket))) };
  });
  const catatan = h("textarea", { class: "input", rows: 3, maxlength: 1000 });
  const rows = f.batas.filter((b) => b.dipakai).map((b) => {
    const r = barisBatas(b, false);
    const alasan = h("input", { class: "input", style: { minWidth: "180px" }, placeholder: "Alasan bila diubah", "aria-label": `Alasan batas ${b.nama}` });
    return { b, ...r, alasan };
  });
  const tbl = h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
    h("thead", {}, h("tr", {}, h("th", {}, "Bahan"), h("th", { class: "r" }, "Bawah %"), h("th", { class: "r" }, "Atas %"), h("th", {}, "Kunci"), h("th", {}, "Alasan"))),
    h("tbody", {}, rows.map(({ b, lo, hi, kunci, alasan }) => h("tr", {}, h("td", {}, b.nama), h("td", { class: "r" }, lo), h("td", { class: "r" }, hi), h("td", {}, h("label", { class: "check" }, kunci)), h("td", {}, alasan))))));
  const err = h("div", { role: "alert" });
  const kirim = h("button", { class: "btn primary", type: "button", "data-busy-text": "Mengirim..." }, "Kirim keputusan", icon("paper-plane-tilt"));
  kirim.addEventListener("click", async () => {
    err.replaceChildren();
    const salah = (m, inp) => { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, m))); (inp || err).focus?.(); };
    const keputusan = radios.find((x) => x.r.checked).r.value;
    const batas = [];
    for (const row of rows) {
      const L = parseNum(row.lo.value), U = parseNum(row.hi.value);
      const berubah = L !== row.b.batas_bawah || U !== row.b.batas_atas || row.kunci.checked !== !!row.b.dikunci;
      if (!berubah) continue;
      if ([L, U].some((v) => v === null || Number.isNaN(v) || v < 0 || v > 100) || L > U) return salah(`Periksa batas ${row.b.nama.toLowerCase()}: angka 0 sampai 100, bawah tidak lebih dari atas.`, row.lo);
      if (!row.alasan.value.trim()) return salah(`Tulis alasan perubahan batas ${row.b.nama.toLowerCase()}.`, row.alasan);
      batas.push({ bahan_id: row.b.bahan_id, dipakai: 1, batas_bawah: L, batas_atas: U, dikunci: row.kunci.checked, alasan: row.alasan.value.trim() });
    }
    if (keputusan !== "Disetujui" && !catatan.value.trim()) return salah("Tulis catatan agar formulator tahu apa yang perlu diperbaiki.", catatan);
    if (keputusan === "Disetujui" && batas.length) {
      const ok = await konfirmasi({ judul: "Batas bahan berubah", pesan: "Karena batas bahan Anda ubah, formula dikembalikan ke Racik sebagai Perlu revisi, bukan disetujui.", ya: "Lanjutkan" });
      if (!ok) return;
    }
    await busy(kirim, async () => {
      try {
        const r = await api(`/api/formula/${f.id}/tinjau`, { method: "POST", body: { keputusan, catatan: catatan.value, batas } });
        toast(`Keputusan terkirim: ${r.status}.`);
        go("beranda");
      } catch (e) { salah(e.message); }
    });
  });
  isi.push(h("h2", { class: "section-title" }, "Keputusan"), err,
    h("fieldset", { style: { border: 0, padding: 0, margin: 0 } }, h("legend", { class: "sr-only" }, "Keputusan tinjauan"), radios.map((x) => x.el)),
    h("div", { style: { marginTop: "16px" } }, field("Catatan untuk formulator", catatan, { hint: "Wajib bila meminta revisi atau menolak." })),
    h("details", { class: "fold" }, h("summary", {}, icon("caret-down"), "Ubah batas pemakaian bahan", h("span", { class: "sum" }, "REVISI BATAS")),
      h("div", { class: "body" }, h("p", { class: "small muted", style: { marginBottom: "8px" } }, "Batas yang Anda ubah mengembalikan formula ke langkah Racik. Formulator melihat alasan Anda."), tbl)),
    h("div", { class: "actions" },
      h("div", { class: "secondary-group" }, h("a", { class: "btn", href: "#/beranda" }, "Kembali")),
      h("div", { class: "primary-slot" }, kirim)));
  mount(el, isi);
}

export { LANGKAH };
