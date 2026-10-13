// Pilot: ringkasan, peringatan uji lab, grafik asupan zat besi, Hb, batch, peserta (FR-50 s.d. FR-54).
import { api, busy, dialog, emptyState, field, h, icon, konfirmasi, mount, num, parseNum, rp, statusCukup, tgl, toast, unitInput } from "../ui.js";
import { go } from "../app.js";

// Warna seri lolos validator palet dataviz (light). Seri 1 lingkaran, seri 2 persegi.
const SERI = [{ warna: "var(--chart-1)", bentuk: "lingkaran" }, { warna: "var(--chart-2)", bentuk: "persegi" }];

export async function render(el) {
  const daftar = await api("/api/pilot");
  if (!daftar.pilot.length) {
    return mount(el, h("h1", { class: "page-title" }, "Pilot"),
      emptyState("Belum ada pilot.", "Pilot dibuat setelah formula disetujui ahli gizi. Hubungi Admin untuk mendaftarkannya."));
  }
  const p = await api(`/api/pilot/${daftar.pilot[0].id}/ringkasan`);
  const isi = [];
  isi.push(h("div", { class: "page-head" },
    h("div", {}, h("h1", { class: "page-title" }, "Pilot"),
      h("p", { class: "lead" }, `${p.nama}, minggu ke-${p.minggu_ke} dari ${p.lama_minggu}`,
        p.formula ? [", formula ", h("a", { href: `#/formula/${p.formula.id}/racik` }, `${p.formula.nama} v${p.formula.versi}`)] : null, ".")),
    h("a", { class: "btn", href: `/api/pilot/${p.id}/ekspor.csv`, download: true }, icon("download-simple"), "Ekspor CSV")));

  isi.push(h("p", { class: "answer" }, h("b", {}, `${num(p.asupan_terakhir)} mg`),
    ` zat besi per hari dari produk, target ${num(p.target_fe)} mg.`,
    p.minggu_terakhir !== null ? h("span", { class: "small muted", style: { display: "block" } }, `Rata-rata semua kelompok, minggu ke-${p.minggu_terakhir}.`) : null));

  const biayaSelisih = p.biaya_nyata && p.biaya_hitung ? p.biaya_nyata - p.biaya_hitung : null;
  isi.push(h("div", { class: "list" },
    h("div", { class: "li three", style: { gridTemplateColumns: "1fr 120px 260px" } },
      h("span", {}, "Peserta aktif"), h("span", { class: "val" }, `${p.peserta_aktif} dari ${p.peserta_total}`),
      h("span", { class: "st" }, p.wali_belum ? statusCukup(false, `${p.wali_belum} formulir wali belum masuk`) : statusCukup(true, "Semua wali setuju"))),
    h("div", { class: "li three", style: { gridTemplateColumns: "1fr 120px 260px" } },
      h("span", {}, "Biaya bahan nyata per sajian"), h("span", { class: "val" }, rp(p.biaya_nyata)),
      h("span", { class: "st small muted" }, `Hitungan ${rp(p.biaya_hitung)}${biayaSelisih !== null ? `, selisih ${biayaSelisih >= 0 ? "+" : ""}${rp(biayaSelisih).replace("Rp-", "-Rp")}` : ""}`))));

  // Peringatan (FR-53).
  for (const w of p.peringatan) {
    if (w.jenis === "lab") {
      const tombol = h("button", { class: "link-btn", type: "button" }, "Pakai sebagai batas baru di Racik");
      tombol.addEventListener("click", async () => {
        const ok = await konfirmasi({
          judul: `Pakai hasil lab ${w.kode}?`,
          pesan: `Zat besi formula akan dikoreksi dengan faktor ${num(w.fe_lab / w.fe_hitung, 2)} (lab ${num(w.fe_lab, 2)} mg dibagi hitungan ${num(w.fe_hitung, 2)} mg). Data sumber bahan tidak berubah. Formula kembali ke langkah Racik sebagai Perlu revisi.`,
          ya: "Pakai hasil lab",
        });
        if (!ok) return;
        await busy(tombol, async () => {
          try {
            const r = await api(`/api/pilot/${p.id}/batch/${w.batch_id}/jadikan-batas`, { method: "POST" });
            toast(`Koreksi tersimpan. Formula perlu diracik ulang oleh formulator.`);
            go("pilot");
            return r;
          } catch (e) { toast(e.message, "bad"); }
        });
      });
      isi.push(h("div", { class: "banner", style: { marginTop: "24px" } }, icon("warning"), h("span", {},
        h("b", {}, w.judul), ` Zat besi ${num(w.fe_lab, 2)} mg per sajian, hitungan ${num(w.fe_hitung, 2)} mg. `, tombol)));
    } else {
      isi.push(h("div", { class: "banner bad", style: { marginTop: "24px" } }, icon("warning"), h("span", {}, h("b", {}, w.judul))));
    }
  }

  // Grafik asupan (FR-52).
  isi.push(h("h2", { class: "section-title", style: { marginTop: "40px" } }, "Asupan zat besi per kelompok"),
    h("p", { class: "hint" }, "mg per hari, rata-rata kelompok, per minggu"),
    grafikAsupan(p),
    h("div", { class: "row", style: { marginTop: "8px" } },
      h("button", { class: "btn sm", type: "button", onclick: () => asupanDialog(p) }, icon("plus"), "Catat asupan minggu ini")));

  // Hb sebagai ukuran tambahan.
  isi.push(h("h2", { class: "section-title" }, "Hemoglobin (ukuran tambahan)"),
    h("p", { class: "hint" }, "Hb diukur pada minggu 0 dan 8. Ukuran utama tetap asupan zat besi, karena Hb dipengaruhi banyak faktor lain."),
    h("div", { class: "list" }, p.hb.map((g) => h("div", { class: "li three", style: { gridTemplateColumns: "1fr 160px 200px" } },
      h("div", {}, h("div", {}, g.kelompok), h("div", { class: "meta" }, `${g.peserta} peserta aktif`)),
      h("span", { class: "val" }, g.hb0 ? `${num(g.hb0)} g/dL` : "–"),
      h("span", { class: "st small muted" }, g.hb8 ? `Minggu 8: ${num(g.hb8)} g/dL` : `Minggu 0 (n=${g.n_hb0}). Minggu 8 belum diukur.`)))));

  // Batch produksi (FR-51).
  isi.push(h("div", { class: "row", style: { marginTop: "32px", marginBottom: "12px" } },
    h("h2", { class: "section-title", style: { margin: 0 } }, "Batch produksi"), h("span", { class: "spacer" }),
    h("button", { class: "btn sm", type: "button", onclick: () => batchDialog(p) }, icon("plus"), "Tambah batch")),
    p.batch.length ? h("div", { class: "list" }, p.batch.map((b) => {
      const lab = b.fe_lab_mg ? `${num(b.fe_lab_mg, 2)} mg` : "Belum diuji";
      const beda = b.selisih_pct !== null && Math.abs(b.selisih_pct) > 10;
      return h("div", { class: "li three", style: { gridTemplateColumns: "1fr 140px 220px" } },
        h("div", {}, h("div", { class: "name" }, b.kode), h("div", { class: "meta" }, `${tgl(b.tanggal, true)}, ${b.umkm}, ${b.jumlah_sajian} sajian`)),
        h("span", { class: "val", title: "Zat besi per sajian dari uji lab" }, lab),
        h("span", { class: "st" },
          b.uji_mikroba === "Memenuhi syarat" ? statusCukup(true, "Mikroba memenuhi syarat")
            : b.uji_mikroba === "Tidak memenuhi syarat" ? h("span", { class: "status bad" }, icon("x-circle"), "Mikroba tidak memenuhi")
              : h("span", { class: "status neutral" }, icon("clock"), "Mikroba belum diuji"),
          b.selisih_pct !== null ? h("div", { class: `small ${beda ? "" : "muted"}`, style: beda ? { color: "var(--warning)" } : {} },
            `${b.selisih_pct > 0 ? "+" : ""}${num(b.selisih_pct)}% dari hitungan${b.koreksi_dipakai ? ", sudah dipakai" : ""}`) : null));
    })) : emptyState("Belum ada batch.", "Catat setiap batch produksi beserta hasil uji mikroba dan zat besinya."));

  // Peserta (FR-50). Hanya kode, tanpa nama.
  isi.push(h("details", { class: "fold" },
    h("summary", {}, icon("caret-down"), "Peserta dan persetujuan wali", h("span", { class: "sum" }, `${p.peserta_total} peserta, ${p.wali_belum} belum ada formulir wali`)),
    h("div", { class: "body" },
      h("p", { class: "small muted", style: { marginBottom: "8px" } }, "Peserta dicatat dengan kode, tanpa nama. Hb disimpan terenkripsi dan hanya boleh dicatat setelah wali setuju."),
      h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Kode"), h("th", {}, "Kelompok"), h("th", {}, "Wali"), h("th", { class: "r" }, "Hb minggu 0"), h("th", { class: "r" }, "Hb minggu 8"), h("th", {}, h("span", { class: "sr-only" }, "Aksi")))),
        h("tbody", {}, p.peserta.map((ps) => h("tr", {},
          h("td", { class: "mono" }, ps.kode), h("td", {}, ps.kelompok),
          h("td", {}, ps.persetujuan_wali ? statusCukup(true, "Setuju") : statusCukup(false, "Belum masuk")),
          h("td", { class: "num mono" }, ps.hb_minggu_0 ? num(ps.hb_minggu_0) : "–"),
          h("td", { class: "num mono" }, ps.hb_minggu_8 ? num(ps.hb_minggu_8) : "–"),
          h("td", {}, h("button", { class: "link-btn small", type: "button", style: { minHeight: "32px" }, onclick: () => pesertaDialog(p, ps) }, "Ubah"))))))),
      h("div", { class: "row", style: { marginTop: "12px" } }, h("button", { class: "btn sm", type: "button", onclick: () => pesertaDialog(p) }, icon("plus"), "Tambah peserta")))));

  mount(el, isi);
}

// ---------- Grafik garis SVG ringan, dengan crosshair dan tooltip ----------
function grafikAsupan(p) {
  const kelompok = Object.keys(p.seri);
  if (!kelompok.length) return emptyState("Belum ada data asupan.", "Catat rata-rata asupan zat besi tiap kelompok setiap minggu.");
  const W = 720, H = 300, m = { l: 48, r: 150, t: 16, b: 44 };
  const maxMinggu = Math.max(1, ...kelompok.flatMap((k) => p.seri[k].map((t) => t.minggu)));
  const maxY = Math.max(3, Math.ceil(Math.max(p.target_fe, ...kelompok.flatMap((k) => p.seri[k].map((t) => t.fe))) * 2) / 2);
  const x = (v) => m.l + (v / maxMinggu) * (W - m.l - m.r);
  const y = (v) => H - m.b - (v / maxY) * (H - m.t - m.b);
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "grafik-judul grafik-ket" },
    h("title", { id: "grafik-judul" }, "Asupan zat besi per kelompok per minggu"));
  const ket = kelompok.map((k) => { const t = p.seri[k].at(-1); return `${k} ${num(t.fe)} mg pada minggu ${t.minggu}`; }).join("; ");
  const desc = h("p", { id: "grafik-ket", class: "sr-only" }, `Target ${num(p.target_fe)} mg per hari. ${ket}.`);

  // Kisi dan sumbu
  for (let v = 0; v <= maxY + 1e-9; v += maxY > 4 ? 1 : 0.5) {
    svg.append(h("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: "var(--hairline)", "stroke-width": 1 }));
    svg.append(h("text", { x: m.l - 10, y: y(v) + 4, "text-anchor": "end", "font-size": 12, fill: "var(--ink-muted)", "font-family": "var(--mono)" }, num(v)));
  }
  for (let w = 0; w <= maxMinggu; w++) {
    svg.append(h("text", { x: x(w), y: H - m.b + 20, "text-anchor": "middle", "font-size": 12, fill: "var(--ink-muted)", "font-family": "var(--mono)" }, w));
  }
  svg.append(h("text", { x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle", "font-size": 13, fill: "var(--ink-muted)" }, "Minggu ke-"));
  // Target putus-putus
  svg.append(h("line", { x1: m.l, x2: W - m.r, y1: y(p.target_fe), y2: y(p.target_fe), stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "6 5" }));
  svg.append(h("text", { x: W - m.r + 10, y: y(p.target_fe) + 4, "font-size": 13, fill: "var(--ink)" }, `Target ${num(p.target_fe)}`));

  // Garis per kelompok, label langsung di ujung (dijauhkan bila bertumpuk)
  const ujung = [];
  kelompok.forEach((k, i) => {
    const s = SERI[i % SERI.length];
    const pts = p.seri[k];
    svg.append(h("polyline", { points: pts.map((t) => `${x(t.minggu)},${y(t.fe)}`).join(" "), fill: "none", stroke: s.warna, "stroke-width": 2, "stroke-linejoin": "round" }));
    for (const t of pts) svg.append(penanda(s, x(t.minggu), y(t.fe)));
    ujung.push({ k, s, y: y(pts.at(-1).fe), x: x(pts.at(-1).minggu) });
  });
  ujung.sort((a, b) => a.y - b.y);
  const tgtY = y(p.target_fe);
  let prev = -Infinity;
  for (const u of ujung) {
    let ly = Math.max(u.y + 4, prev + 18);
    if (Math.abs(ly - (tgtY + 4)) < 16) ly = tgtY + 22;
    prev = ly;
    svg.append(h("text", { x: W - m.r + 10, y: ly, "font-size": 13, fill: "var(--ink)", "font-weight": 500 }, u.k));
  }

  // Lapisan hover: crosshair + tooltip
  const garisV = h("line", { y1: m.t, y2: H - m.b, stroke: "var(--ink-subtle)", "stroke-width": 1, visibility: "hidden" });
  svg.append(garisV);
  const tip = h("div", { class: "tip", role: "presentation" });
  const area = h("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent", style: { cursor: "crosshair" } });
  svg.append(area);
  const wrap = h("div", { class: "chart" }, svg, tip);
  const tampil = (minggu) => {
    garisV.setAttribute("x1", x(minggu)); garisV.setAttribute("x2", x(minggu)); garisV.setAttribute("visibility", "visible");
    const baris = kelompok.map((k, i) => {
      const t = p.seri[k].find((z) => z.minggu === minggu);
      return t ? h("div", {}, h("span", { class: "k", style: { background: SERI[i % SERI.length].warna, borderRadius: i % 2 ? "0" : "50%" } }), `${k}: ${num(t.fe)} mg`) : null;
    });
    mount(tip, h("div", { class: "b" }, `Minggu ke-${minggu}`), baris);
    const r = svg.getBoundingClientRect();
    const top = Math.min(...kelompok.map((k) => { const t = p.seri[k].find((z) => z.minggu === minggu); return t ? y(t.fe) : H; }));
    tip.style.left = `${(x(minggu) / W) * r.width}px`;
    tip.style.top = `${(top / H) * r.height - 8}px`;
    tip.style.display = "block";
  };
  area.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    tampil(Math.max(0, Math.min(maxMinggu, Math.round(((px - m.l) / (W - m.l - m.r)) * maxMinggu))));
  });
  area.addEventListener("pointerleave", () => { tip.style.display = "none"; garisV.setAttribute("visibility", "hidden"); });

  const legenda = h("div", { class: "legend", "aria-hidden": "true" },
    kelompok.map((k, i) => { const s = SERI[i % SERI.length]; return h("span", {}, h("svg", { viewBox: "0 0 22 12" }, h("line", { x1: 0, x2: 22, y1: 6, y2: 6, stroke: s.warna, "stroke-width": 2 }), penanda(s, 11, 6, 3.5)), k); }),
    h("span", {}, h("svg", { viewBox: "0 0 22 12" }, h("line", { x1: 0, x2: 22, y1: 6, y2: 6, stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "4 3" })), "Target"));

  const minggu = [...new Set(kelompok.flatMap((k) => p.seri[k].map((t) => t.minggu)))].sort((a, b) => a - b);
  const tabel = h("details", { class: "fold", style: { marginTop: "8px" } },
    h("summary", {}, icon("caret-down"), "Lihat sebagai tabel"),
    h("div", { class: "body tbl-wrap" }, h("table", { class: "tbl" },
      h("caption", { class: "sr-only" }, "Asupan zat besi mg per hari per kelompok"),
      h("thead", {}, h("tr", {}, h("th", {}, "Minggu"), kelompok.map((k) => h("th", { class: "r" }, k)))),
      h("tbody", {}, minggu.map((w) => h("tr", {}, h("td", { class: "mono" }, w),
        kelompok.map((k) => { const t = p.seri[k].find((z) => z.minggu === w); return h("td", { class: "num mono" }, t ? num(t.fe) : "–"); })))))));

  return h("div", {}, legenda, h("div", { class: "chart-scroll" }, wrap), desc, tabel);
}

function penanda(s, cx, cy, r = 4.5) {
  return s.bentuk === "persegi"
    ? h("rect", { x: cx - r, y: cy - r, width: r * 2, height: r * 2, fill: "var(--surface)", stroke: s.warna, "stroke-width": 2 })
    : h("circle", { cx, cy, r, fill: s.warna, stroke: "var(--surface)", "stroke-width": 2 });
}

// ---------- Dialog isian ----------
function formDialog(judul, isi, onSimpan, label = "Simpan") {
  const err = h("div", { role: "alert" });
  const ok = h("button", { class: "btn primary", type: "button", "data-busy-text": "Menyimpan..." }, label);
  const dlg = dialog({ judul, isi: h("div", { class: "stack" }, err, isi),
    tombol: [h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Batal"), ok] });
  ok.addEventListener("click", async () => {
    err.replaceChildren();
    await busy(ok, async () => {
      try { await onSimpan(); dlg.close(); go("pilot"); }
      catch (e) { err.append(h("div", { class: "banner bad" }, icon("warning"), h("span", {}, e.message))); }
    });
  });
  return dlg;
}

function asupanDialog(p) {
  const minggu = h("input", { class: "input", type: "number", min: 0, max: p.lama_minggu, value: p.minggu_ke });
  const kel = h("select", { class: "input" }, p.kelompok.map((k) => h("option", { value: k }, k)));
  const fe = unitInput("", "mg/hari");
  formDialog("Catat asupan zat besi", [field("Minggu ke-", minggu), field("Kelompok", kel),
    field("Rata-rata asupan zat besi dari produk", fe.wrap, { hint: "Rata-rata kelompok, mg per hari. Data minggu yang sama akan ditimpa." })], async () => {
    const v = parseNum(fe.input.value);
    if (!(v >= 0)) throw new Error("Isi asupan dalam mg, misalnya 2,3.");
    await api(`/api/pilot/${p.id}/asupan`, { method: "PUT", body: { minggu: Number(minggu.value), kelompok: kel.value, fe_mg_per_hari: v } });
    toast("Asupan tersimpan.");
  });
}

function batchDialog(p) {
  const kode = h("input", { class: "input", value: `B-${String(p.batch.length + 1).padStart(2, "0")}` });
  const tanggal = h("input", { class: "input", type: "date", value: new Date().toISOString().slice(0, 10) });
  const umkm = h("input", { class: "input", list: "umkm-list" });
  const dl = h("datalist", { id: "umkm-list" }, [...new Set(p.batch.map((b) => b.umkm))].map((u) => h("option", { value: u })));
  const jumlah = h("input", { class: "input", type: "number", min: 1, inputmode: "numeric" });
  const biaya = unitInput("", "Rp");
  const mikroba = h("select", { class: "input" }, ["Belum diuji", "Memenuhi syarat", "Tidak memenuhi syarat"].map((s) => h("option", { value: s }, s)));
  const fe = unitInput("", "mg/sajian");
  formDialog("Tambah batch produksi", [dl, h("div", { class: "grid2" }, field("Kode batch", kode), field("Tanggal produksi", tanggal)),
    field("UMKM pembuat", umkm), h("div", { class: "grid2" }, field("Jumlah sajian", jumlah), field("Biaya bahan total (boleh kosong)", biaya.wrap)),
    field("Uji mikroba", mikroba), field("Zat besi hasil lab per sajian (boleh kosong)", fe.wrap, { hint: "Bila berbeda lebih dari 10% dari hitungan, Pilot menampilkan peringatan." })], async () => {
    if (!umkm.value.trim()) throw new Error("Isi nama UMKM pembuat batch.");
    if (!(Number(jumlah.value) > 0)) throw new Error("Isi jumlah sajian, misalnya 120.");
    await api(`/api/pilot/${p.id}/batch`, { method: "POST", body: {
      kode: kode.value, tanggal: tanggal.value, umkm: umkm.value, jumlah_sajian: Number(jumlah.value),
      biaya_bahan_total: biaya.input.value ? parseNum(biaya.input.value) : null, uji_mikroba: mikroba.value,
      fe_lab_mg: fe.input.value ? parseNum(fe.input.value) : null } });
    toast(`Batch ${kode.value.toUpperCase()} tersimpan.`);
  });
}

function pesertaDialog(p, ps) {
  const kode = h("input", { class: "input", value: ps?.kode || `P-${String(p.peserta_total + 1).padStart(3, "0")}`, disabled: !!ps });
  const kel = h("select", { class: "input", disabled: !!ps }, p.kelompok.map((k) => h("option", { value: k, selected: k === ps?.kelompok }, k)));
  const wali = h("input", { type: "checkbox", checked: !!ps?.persetujuan_wali });
  const hb0 = unitInput(ps?.hb_minggu_0 ? num(ps.hb_minggu_0) : "", "g/dL");
  const hb8 = unitInput(ps?.hb_minggu_8 ? num(ps.hb_minggu_8) : "", "g/dL");
  const sinkron = () => { hb0.input.disabled = !wali.checked; hb8.input.disabled = !wali.checked; };
  wali.addEventListener("change", sinkron); sinkron();
  formDialog(ps ? `Ubah peserta ${ps.kode}` : "Tambah peserta", [
    h("div", { class: "grid2" }, field("Kode peserta", kode, { hint: "Jangan pakai nama asli." }), field("Kelompok lokasi", kel)),
    h("label", { class: "check" }, wali, "Formulir persetujuan wali sudah masuk"),
    h("div", { class: "grid2" }, field("Hb minggu 0", hb0.wrap), field("Hb minggu 8", hb8.wrap))], async () => {
    const body = { persetujuan_wali: wali.checked,
      hb_minggu_0: wali.checked && hb0.input.value ? parseNum(hb0.input.value) : null,
      hb_minggu_8: wali.checked && hb8.input.value ? parseNum(hb8.input.value) : null };
    if (ps) await api(`/api/pilot/${p.id}/peserta/${ps.id}`, { method: "PUT", body });
    else await api(`/api/pilot/${p.id}/peserta`, { method: "POST", body: { ...body, kode: kode.value, kelompok: kel.value } });
    toast("Data peserta tersimpan.");
  });
}
