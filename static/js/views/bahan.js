// Bahan: cari, daftar, harga, umur data, detail gizi, riwayat, tambah/ubah (FR-10 s.d. FR-14).
import { api, busy, emptyState, field, fotoBahan, h, icon, mount, num, parseNum, rp, smart, tgl, toast, unitInput } from "../ui.js";
import { store } from "../store.js";
import { go } from "../app.js";

const ZAT_URUT = ["energi", "protein", "zat_besi", "folat", "vitamin_c", "kalsium", "seng"];
const bolehUbah = (u) => ["Admin", "Peninjau"].includes(u.peran);

function perluDiperbarui() {
  return h("span", { class: "tag-warn" }, icon("clock"), " Data perlu diperbarui");
}

// "1", "1,5", "1½", "½", "1/2", "1 1/2" menjadi angka; null bila tidak terbaca.
export function bacaJumlah(teks) {
  const glif = { "¼": 0.25, "½": 0.5, "¾": 0.75 };
  const t = String(teks).trim().replace(/[¼½¾]/g, (g) => ` ${glif[g]}`).trim();
  if (!t) return null;
  let total = 0;
  for (const bagian of t.split(/\s+/)) {
    const m = bagian.match(/^(\d+)\/(\d+)$/);
    const v = m ? Number(m[1]) / Number(m[2]) : /^0\.\d+$/.test(bagian) ? Number(bagian) : parseNum(bagian);
    if (v === null || !Number.isFinite(v)) return null;
    total += v;
  }
  return total;
}

// Tabel takaran rumah tangga dan kalkulator kecil: pilih takaran, isi jumlah, muncul gram.
function bagianTakaran(b, user) {
  const judul = h("h2", { class: "section-title" }, "Takaran rumah tangga");
  if (!b.takaran.length) {
    return [judul, emptyState("Bahan ini belum punya data takaran.",
      bolehUbah(user) ? "Tambahkan berat sendok atau gelas dari hasil timbang agar UMKM bisa menakar tanpa timbangan." : "Minta ahli gizi atau Admin menambahkan berat sendok dan gelas untuk bahan ini.",
      bolehUbah(user) ? h("a", { class: "btn", href: `#/bahan/${b.id}/ubah` }, icon("plus"), "Tambah takaran") : null)];
  }
  const contoh = b.takaran.some((t) => /data contoh/i.test(t.sumber));
  const pilih = h("select", { class: "input" }, b.takaran.map((t, i) => h("option", { value: i }, t.nama_takaran)));
  const jumlah = h("input", { class: "input mini", inputmode: "decimal", value: "1" });
  const hasil = h("div", { class: "hasil", "aria-live": "polite" });
  const hitung = () => {
    const t = b.takaran[Number(pilih.value)];
    const n = bacaJumlah(jumlah.value);
    if (n === null || n <= 0) return mount(hasil, h("span", { class: "small muted" }, "Isi jumlah, misalnya 1, 1½, atau 0,5."));
    const g = n * t.berat_gram;
    mount(hasil, h("span", {}, "≈ ", h("b", {}, `${num(g, g >= 100 ? 0 : 1)} g`)));
  };
  pilih.addEventListener("change", hitung);
  jumlah.addEventListener("input", hitung);
  hitung();
  return [judul,
    h("p", { class: "hint" }, "Berat satu takaran, untuk membantu Anda menakar dengan sendok atau gelas. Gizi dan klaim tetap dihitung dari gram."),
    contoh ? h("div", { class: "banner" }, icon("warning"), h("span", {}, "Berat takaran di bawah ini masih data contoh. Timbang ulang dan minta ahli gizi memverifikasinya sebelum dipakai untuk produksi.")) : null,
    h("div", { class: "list" }, b.takaran.map((t) => h("div", { class: "li three", style: { gridTemplateColumns: "1fr 120px 1fr" } },
      h("span", {}, `1 ${t.nama_takaran}`),
      h("span", { class: "val" }, `${num(t.berat_gram, t.berat_gram % 1 ? 1 : 0)} g`),
      h("span", { class: "st small muted" }, `${t.sumber}, ${tgl(t.tanggal_data, true)}`)))),
    h("div", { class: "takaran-calc" },
      field("Takaran", pilih), field("Jumlah", jumlah), hasil)];
}

export async function daftar(el, { user, query }) {
  const cari = h("input", { class: "input", type: "search", placeholder: "Cari bahan", value: query.get("q") || "", "aria-label": "Cari bahan menurut nama atau kelompok", style: { paddingLeft: "40px" } });
  const hasil = h("div", { "aria-live": "polite" });
  const info = h("p", { class: "small muted", style: { marginTop: "16px" } });

  async function muat() {
    const q = cari.value.trim();
    try {
      const d = await api(`/api/bahan?q=${encodeURIComponent(q)}`);
      if (!d.bahan.length) {
        mount(hasil, emptyState(q ? `Tidak ada bahan bernama "${q}".` : "Belum ada bahan.",
          q ? "Periksa ejaan, atau cari dengan kata yang lebih pendek." : "Tambahkan bahan lokal beserta kandungan gizi dan sumber datanya.",
          bolehUbah(user) ? h("a", { class: "btn primary", href: "#/bahan/baru" }, icon("plus"), "Tambah bahan") : null));
        info.textContent = "";
        return;
      }
      mount(hasil, h("div", { class: "list" }, d.bahan.map((b) => h("a", { class: "li clickable", href: `#/bahan/${b.id}`, style: { color: "inherit", textDecoration: "none" } },
        h("div", { class: "with-foto" }, fotoBahan(b.foto), h("div", {}, h("div", { class: "name" }, b.nama),
          h("div", { class: "meta" }, `${b.kelompok}, sumber ${b.sumber_utama}`, b.perlu_diperbarui ? perluDiperbarui() : null,
            b.status_pasokan !== "Tersedia" ? h("span", { class: "tag-warn" }, ` ${b.status_pasokan}`) : null))),
        h("span", { class: "val" }, `${rp(b.harga_per_kg)}/kg`)))));
      info.textContent = `Menampilkan ${d.bahan.length} dari ${d.total} bahan. Pilih bahan untuk melihat kandungan gizi lengkapnya.`;
    } catch (err) {
      mount(hasil, h("div", { class: "banner bad" }, icon("warning"), h("span", {}, err.message)));
    }
  }

  let t;
  cari.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      history.replaceState(null, "", `#/bahan${cari.value.trim() ? `?q=${encodeURIComponent(cari.value.trim())}` : ""}`);
      muat();
    }, 250);
  });

  mount(el,
    h("div", { class: "page-head" },
      h("div", {}, h("h1", { class: "page-title" }, "Bahan"), h("p", { class: "lead" }, "Bahan pangan lokal yang bisa dipakai di formula, beserta harganya.")),
      bolehUbah(user) ? h("a", { class: "btn", href: "#/bahan/baru" }, icon("plus"), "Tambah bahan") : null),
    h("div", { style: { position: "relative", marginBottom: "12px" } },
      h("span", { style: { position: "absolute", left: "12px", top: "12px", color: "var(--ink-subtle)" } }, icon("magnifying-glass")), cari),
    hasil, info);
  await muat();
}

export async function detail(el, { params, user }) {
  const b = await api(`/api/bahan/${params[0]}`);
  const kolomNama = { harga_per_kg: "Harga per kg", nama: "Nama", kelompok: "Kelompok", wilayah: "Wilayah", status_pasokan: "Status pasokan", batas_bawah: "Batas bawah", batas_atas: "Batas atas" };
  const namaKolom = (k) => k.startsWith("gizi:") ? `Nilai ${store.zat(k.slice(5)).nama_kecil}`
    : k.startsWith("takaran:") ? `Takaran ${k.slice(8)}` : (kolomNama[k] || k);
  const fmtNilai = (k, v) => (v === null ? "kosong" : k === "harga_per_kg" ? `${rp(Number(v))}/kg` : v);
  mount(el,
    h("nav", { class: "crumb", "aria-label": "Jejak" }, h("a", { href: "#/bahan" }, "Bahan"), " / ", b.nama),
    h("div", { class: "page-head" },
      h("div", {}, h("h1", { class: "page-title" }, b.nama),
        h("p", { class: "lead" }, `${b.kelompok}, ${b.wilayah}. ${rp(b.harga_per_kg)}/kg per ${tgl(b.tanggal_harga, true)}.`)),
      bolehUbah(user) ? h("a", { class: "btn", href: `#/bahan/${b.id}/ubah` }, icon("pencil-simple"), "Ubah") : null),
    b.foto ? h("figure", { class: "bahan-foto" },
      h("img", { src: b.foto, alt: b.foto_keterangan || b.nama, width: 480, height: 360 }),
      h("figcaption", {}, h("span", { class: "ket" }, b.foto_keterangan || b.nama),
        h("span", { class: "kredit" }, b.foto_kredit, b.foto_sumber ? [". ", h("a", { href: b.foto_sumber, target: "_blank", rel: "noopener" }, "Lihat sumber foto")] : null))) : null,
    b.perlu_diperbarui ? h("div", { class: "banner" }, icon("clock"), h("span", {}, "Sebagian data bahan ini berumur lebih dari 12 bulan. Perbarui nilainya dari sumber terbaru atau uji lab.")) : null,
    h("h2", { class: "section-title" }, "Kandungan gizi per 100 g"),
    h("div", { class: "list" }, ZAT_URUT.map((k) => {
      const z = store.zat(k), g = b.gizi[k];
      return h("div", { class: "li three", style: { gridTemplateColumns: "1fr 120px 1fr" } },
        h("span", {}, z.nama),
        h("span", { class: "val" }, g ? smart(g.nilai, z.satuan) : "–"),
        h("span", { class: "st small muted" }, g ? [`${g.sumber}, ${tgl(g.tanggal_data, true)}`, g.perlu_diperbarui ? perluDiperbarui() : null] : h("span", { class: "status warn" }, icon("warning"), "Data belum ada")));
    })),
    h("h2", { class: "section-title" }, "Pemakaian di formula"),
    h("div", { class: "list" },
      h("div", { class: "li" }, h("span", {}, "Batas pemakaian umum"), h("span", { class: "val" }, `${num(b.batas_bawah)}% sampai ${num(b.batas_atas)}%`)),
      b.alasan_batas ? h("div", { class: "li" }, h("span", {}, "Alasan batas"), h("span", { style: { textAlign: "right" } }, b.alasan_batas)) : null,
      h("div", { class: "li" }, h("span", {}, "Status pasokan"), h("span", {}, b.status_pasokan))),
    bagianTakaran(b, user),
    h("h2", { class: "section-title" }, "Riwayat perubahan"),
    b.riwayat.length
      ? h("div", { class: "list" }, b.riwayat.map((r) => h("div", { class: "li" },
        h("div", {}, h("div", {}, namaKolom(r.kolom)), h("div", { class: "meta" }, `${tgl(r.waktu, true)} oleh ${r.oleh}`)),
        h("span", { class: "small", style: { textAlign: "right" } }, r.kolom.startsWith("takaran:") && r.nilai_baru === "dihapus" ? `${fmtNilai(r.kolom, r.nilai_lama)} dihapus` : `${fmtNilai(r.kolom, r.nilai_lama)} menjadi ${fmtNilai(r.kolom, r.nilai_baru)}`))))
      : h("p", { class: "muted" }, "Belum ada perubahan sejak bahan ini dicatat."),
    h("div", { class: "actions" }, h("div", { class: "secondary-group" }, h("a", { class: "btn", href: "#/bahan" }, "Kembali ke daftar"))));
}

export async function form(el, { params, user }) {
  if (!bolehUbah(user)) {
    return mount(el, h("h1", { class: "page-title" }, "Hanya Admin dan Peninjau yang bisa mengubah bahan"),
      h("p", { class: "lead" }, "Minta ahli gizi atau Admin bila data bahan perlu diperbarui."),
      h("p", { style: { marginTop: "24px" } }, h("a", { class: "btn", href: "#/bahan" }, "Kembali ke daftar")));
  }
  const id = params[0];
  const ref = store.ref;
  const b = id ? await api(`/api/bahan/${id}`) : null;
  const hariIni = ref.hari_ini;

  const nama = h("input", { class: "input", value: b?.nama || "", maxlength: 80 });
  const kelompok = h("input", { class: "input", value: b?.kelompok || "", list: "kel-bahan" });
  const dl = h("datalist", { id: "kel-bahan" }, ref.kelompok_bahan.map((k) => h("option", { value: k })));
  const wilayah = h("input", { class: "input", value: b?.wilayah || user.wilayah, list: "wil-bahan" });
  const dlw = h("datalist", { id: "wil-bahan" }, ref.wilayah.filter((w) => w !== "Semua wilayah").map((w) => h("option", { value: w })));
  const harga = unitInput(b ? Math.round(b.harga_per_kg).toLocaleString("id-ID") : "", "Rp/kg");
  const tglHarga = h("input", { class: "input", type: "date", value: b?.tanggal_harga || hariIni, max: hariIni });
  const pasokan = h("select", { class: "input" }, ref.status_pasokan.map((s) => h("option", { value: s, selected: s === (b?.status_pasokan || "Tersedia") }, s)));
  const lo = unitInput(num(b?.batas_bawah ?? 0, 0), "%");
  const hi = unitInput(num(b?.batas_atas ?? 100, b?.batas_atas % 1 ? 1 : 0), "%");
  const alasan = h("input", { class: "input", value: b?.alasan_batas || "", placeholder: "Contoh: rasa getir terasa di atas 9%" });

  const gz = {};
  for (const k of ZAT_URUT) {
    const g = b?.gizi?.[k];
    const z = store.zat(k);
    gz[k] = {
      nilai: h("input", { class: "input mini", inputmode: "decimal", value: g ? num(g.nilai, g.nilai % 1 ? 1 : 0) : "", "aria-label": `${z.nama} per 100 g dalam ${z.satuan}` }),
      sumber: h("select", { class: "input", style: { minHeight: "40px" }, "aria-label": `Sumber nilai ${z.nama}` },
        ref.sumber_data.map((s) => h("option", { value: s, selected: s === (g?.sumber || "TKPI 2017") }, s))),
      tanggal: h("input", { class: "input", type: "date", style: { minHeight: "40px" }, value: g?.tanggal_data || hariIni, max: hariIni, "aria-label": `Tanggal data ${z.nama}` }),
    };
  }
  // Takaran rumah tangga: baris yang bisa ditambah dan dihapus.
  const dlt = h("datalist", { id: "nama-takaran" }, (ref.nama_takaran || []).map((t) => h("option", { value: t })));
  const dls = h("datalist", { id: "sumber-takaran" }, (ref.sumber_takaran || []).map((t) => h("option", { value: t })));
  const tbodyTakaran = h("tbody");
  const barisTakaran = [];
  function tambahBaris(t) {
    const r = {
      nama: h("input", { class: "input", value: t?.nama_takaran || "", list: "nama-takaran", placeholder: "sdm peres", style: { minHeight: "40px" }, "aria-label": "Nama takaran" }),
      berat: h("input", { class: "input mini", inputmode: "decimal", value: t ? num(t.berat_gram, t.berat_gram % 1 ? 1 : 0) : "", "aria-label": "Berat satu takaran dalam gram" }),
      sumber: h("input", { class: "input", value: t?.sumber || "Hasil timbang", list: "sumber-takaran", style: { minHeight: "40px" }, "aria-label": "Sumber berat takaran" }),
      tanggal: h("input", { class: "input", type: "date", style: { minHeight: "40px" }, value: t?.tanggal_data || hariIni, max: hariIni, "aria-label": "Tanggal data takaran" }),
    };
    r.tr = h("tr", {}, h("td", {}, r.nama), h("td", { class: "r" }, r.berat), h("td", {}, r.sumber), h("td", {}, r.tanggal),
      h("td", { class: "r" }, h("button", { class: "icon-btn", type: "button", title: "Hapus takaran", "aria-label": "Hapus takaran ini",
        onclick: () => { r.tr.remove(); barisTakaran.splice(barisTakaran.indexOf(r), 1); } }, icon("trash"))));
    barisTakaran.push(r);
    tbodyTakaran.append(r.tr);
    return r;
  }
  (b?.takaran || []).forEach(tambahBaris);
  const tambahTakaran = h("button", { class: "btn", type: "button", style: { marginTop: "12px" }, onclick: () => tambahBaris().nama.focus() }, icon("plus"), "Tambah takaran");

  const err = h("div", { role: "alert" });
  const simpan = h("button", { class: "btn primary", type: "button", "data-busy-text": "Menyimpan..." }, id ? "Simpan perubahan" : "Simpan bahan");
  simpan.addEventListener("click", async () => {
    err.replaceChildren();
    const salah = (m, inp) => { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, m))); inp?.focus(); window.scrollTo(0, 0); };
    if (nama.value.trim().length < 2) return salah("Isi nama bahan.", nama);
    if (!kelompok.value.trim()) return salah("Isi kelompok bahan, misalnya Kacang-kacangan.", kelompok);
    const hv = parseNum(harga.input.value);
    if (!(hv > 0)) return salah("Isi harga per kilogram dalam rupiah, misalnya 38.000.", harga.input);
    const L = parseNum(lo.input.value), U = parseNum(hi.input.value);
    if (!(L >= 0 && U <= 100 && L <= U)) return salah("Batas pemakaian harus 0 sampai 100%, dan batas bawah tidak lebih dari batas atas.", lo.input);
    const gizi = {};
    for (const k of ZAT_URUT) {
      if (!gz[k].nilai.value.trim()) continue;
      const v = parseNum(gz[k].nilai.value);
      if (!(v >= 0)) return salah(`Nilai ${store.zat(k).nama_kecil} harus angka 0 atau lebih.`, gz[k].nilai);
      gizi[k] = { nilai: v, sumber: gz[k].sumber.value, tanggal_data: gz[k].tanggal.value };
    }
    const takaran = [];
    for (const r of barisTakaran) {
      if (!r.nama.value.trim() && !r.berat.value.trim()) continue;
      if (r.nama.value.trim().length < 2) return salah("Tulis nama takaran, misalnya sdm peres.", r.nama);
      const bt = parseNum(r.berat.value);
      if (!(bt > 0)) return salah(`Isi berat 1 ${r.nama.value.trim()} dalam gram, misalnya 7,5.`, r.berat);
      if (!r.sumber.value.trim()) return salah(`Tulis sumber berat ${r.nama.value.trim()}, misalnya Hasil timbang.`, r.sumber);
      takaran.push({ nama_takaran: r.nama.value.trim(), berat_gram: bt, sumber: r.sumber.value.trim(), tanggal_data: r.tanggal.value });
    }
    const body = { nama: nama.value, kelompok: kelompok.value, harga_per_kg: hv, wilayah: wilayah.value, status_pasokan: pasokan.value,
      batas_bawah: L, batas_atas: U, alasan_batas: alasan.value || null, tanggal_harga: tglHarga.value, gizi, takaran };
    await busy(simpan, async () => {
      try {
        const r = await api(id ? `/api/bahan/${id}` : "/api/bahan", { method: id ? "PUT" : "POST", body });
        store.ref = null;
        toast(id ? "Perubahan bahan tersimpan. Riwayatnya tercatat." : "Bahan baru tersimpan.");
        go(`bahan/${r.id}`);
      } catch (e) { salah(e.message); }
    });
  });

  mount(el,
    h("nav", { class: "crumb", "aria-label": "Jejak" }, h("a", { href: "#/bahan" }, "Bahan"), " / ", id ? b.nama : "Bahan baru"),
    h("h1", { class: "page-title" }, id ? "Ubah bahan" : "Tambah bahan"),
    h("p", { class: "lead" }, "Setiap nilai gizi perlu sumber dan tanggal, agar umur data bisa dipantau."),
    err, dl, dlw,
    h("div", { class: "grid2", style: { marginTop: "24px" } },
      field("Nama bahan", nama), field("Kelompok", kelompok),
      field("Wilayah", wilayah), field("Status pasokan", pasokan),
      field("Harga", harga.wrap), field("Tanggal harga", tglHarga),
      field("Batas bawah pemakaian", lo.wrap), field("Batas atas pemakaian", hi.wrap)),
    h("div", { style: { marginTop: "20px" } }, field("Alasan batas (boleh kosong)", alasan)),
    h("h2", { class: "section-title" }, "Kandungan gizi per 100 g"),
    h("p", { class: "hint" }, "Kosongkan nilai yang belum diketahui. Nilai kosong dihitung sebagai tidak tersedia, bukan nol."),
    h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, h("th", {}, "Zat gizi"), h("th", { class: "r" }, "Nilai"), h("th", {}, "Sumber"), h("th", {}, "Tanggal data"))),
      h("tbody", {}, ZAT_URUT.map((k) => h("tr", {}, h("td", {}, `${store.zat(k).nama} (${store.zat(k).satuan})`), h("td", { class: "r" }, gz[k].nilai), h("td", {}, gz[k].sumber), h("td", {}, gz[k].tanggal)))))),
    h("h2", { class: "section-title" }, "Takaran rumah tangga"),
    h("p", { class: "hint" }, "Berat satu sendok atau gelas dalam gram, sebaiknya dari hasil timbang. Takaran hanya bantuan menakar dan tidak dipakai menghitung gizi."),
    dlt, dls,
    h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, h("th", {}, "Takaran"), h("th", { class: "r" }, "Berat (g)"), h("th", {}, "Sumber"), h("th", {}, "Tanggal data"), h("th", {}, h("span", { class: "sr-only" }, "Hapus")))),
      tbodyTakaran)),
    tambahTakaran,
    h("div", { class: "actions" },
      h("div", { class: "secondary-group" }, h("a", { class: "btn", href: id ? `#/bahan/${id}` : "#/bahan" }, "Batal")),
      h("div", { class: "primary-slot" }, simpan)));
}
