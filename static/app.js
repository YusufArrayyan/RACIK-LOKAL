// RACIK-LOKAL Client Application Logic

let CURRENT_USER = null;
let ALL_USERS = [];
let ALL_BAHAN = [];
let STANDAR_AKG = [];
let CURRENT_SOLUTION = null;
let SAVED_FORMULAS = [];
let CLAIM_EVAL_LIST = [];

// Init on load
document.addEventListener("DOMContentLoaded", async () => {
  await loadUsers();
  await loadBahanList();
  await loadAKGData();
  await loadDashboardData();
  await loadKaidahKlaim();
  await loadAuditLogs();
});

// Toast notification
function showToast(msg) {
  const container = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerText = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// Navigation Tabs
function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach(el => el.style.display = "none");
  document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active"));

  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.style.display = "block";

  const btn = Array.from(document.querySelectorAll(".nav-tab")).find(b => b.getAttribute("onclick").includes(tabId));
  if (btn) btn.classList.add("active");

  if (tabId === "pilot") loadDashboardData();
  if (tabId === "kaidah") { loadKaidahKlaim(); loadAuditLogs(); }
}

// Modal management
function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }

// ----------------- USER & AUTH (F-01) -----------------
async function loadUsers() {
  const res = await fetch("/api/auth/users");
  ALL_USERS = await res.json();
  const sel = document.getElementById("user-select");
  sel.innerHTML = ALL_USERS.map(u => `<option value="${u.email}">${u.name} (${u.role})</option>`).join("");

  const meRes = await fetch("/api/auth/me");
  CURRENT_USER = await meRes.json();
  sel.value = CURRENT_USER.email;
  updateUserUI();
}

async function switchUser(email) {
  const res = await fetch("/api/auth/switch-user", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email})
  });
  CURRENT_USER = await res.json();
  updateUserUI();
  showToast(`Beralih peran ke: ${CURRENT_USER.name} (${CURRENT_USER.role})`);
}

function updateUserUI() {
  document.getElementById("current-user-badge").innerText = `Peran: ${CURRENT_USER.role.toUpperCase()} (${CURRENT_USER.tim})`;
}

// ----------------- PUSTAKA PANGAN (F-02, F-03, F-04, F-13) -----------------
let searchTimeout = null;
function debounceFilterBahan() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadBahanList, 300);
}

async function loadBahanList() {
  const q = document.getElementById("pustaka-search").value;
  const status = document.getElementById("pustaka-filter-status").value;
  const wilayah = document.getElementById("pustaka-filter-wilayah").value;

  let url = `/api/pustaka/bahan?`;
  if (q) url += `q=${encodeURIComponent(q)}&`;
  if (status) url += `status=${encodeURIComponent(status)}&`;
  if (wilayah) url += `wilayah=${encodeURIComponent(wilayah)}&`;

  const res = await fetch(url);
  ALL_BAHAN = await res.json();
  renderBahanTable();
  populateRacikBahanList();
}

function renderBahanTable() {
  const tbody = document.getElementById("tbody-bahan");
  if (!ALL_BAHAN.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: #666;">Belum ada bahan di wilayah ini. Tambah bahan pertama atau impor dari CSV.</td></tr>`;
    return;
  }

  tbody.innerHTML = ALL_BAHAN.map(b => {
    const n = b.nutrisi || {};
    const kfText = (b.komponen_fungsional || []).map(k => `${k.nama_komponen} (${k.kadar || '-'})`).join(", ") || "-";
    const statusClass = b.status_verifikasi === "Terverifikasi" ? "badge-terverifikasi"
                      : b.status_verifikasi === "Menunggu verifikasi" ? "badge-menunggu"
                      : b.status_verifikasi === "Ditolak" ? "badge-ditolak" : "badge-draf";

    const buktiClass = b.tingkat_bukti === "A" ? "badge-bukti-a" : b.tingkat_bukti === "B" ? "badge-bukti-b" : "badge-bukti-c";

    let actions = "";
    if (CURRENT_USER.role === "verifikator" || CURRENT_USER.role === "admin") {
      if (b.status_verifikasi !== "Terverifikasi") {
        actions += `<button class="btn btn-sm btn-primary" onclick="setujuiBahan(${b.id})">Setujui</button> `;
      }
      if (b.status_verifikasi !== "Ditolak") {
        actions += `<button class="btn btn-sm btn-secondary" style="color:var(--status-red); border-color:var(--status-red);" onclick="openTolakModal(${b.id})">Tolak</button>`;
      }
    } else if (b.status_verifikasi === "Draf") {
      actions += `<button class="btn btn-sm btn-secondary" onclick="ajukanVerifikasiBahan(${b.id})">Ajukan</button>`;
    } else {
      actions = `<span style="font-size:11px; color:#888;">Lihat saja</span>`;
    }

    return `<tr>
      <td><b>${b.nama}</b><br><small style="color:#777;">${b.kode_tkpi || '-'}</small></td>
      <td>${b.kelompok}</td>
      <td><b>${n.zat_besi_mg != null ? n.zat_besi_mg + ' mg' : '-'}</b></td>
      <td>${n.vit_c_mg != null ? n.vit_c_mg + ' mg' : '-'}</td>
      <td>${n.protein_g != null ? n.protein_g + ' g' : '-'}</td>
      <td>Rp ${Number(b.harga_per_kg).toLocaleString('id-ID')}</td>
      <td><small>${kfText}</small></td>
      <td>
        <span class="badge ${buktiClass}">Bukti ${b.tingkat_bukti}</span><br>
        <small style="color:#555;" title="${b.sumber}">${(b.sumber || '').substring(0, 24)}...</small>
      </td>
      <td>
        <span class="badge ${statusClass}">${b.status_verifikasi}</span>
        ${b.alasan_penolakan ? `<br><small style="color:var(--status-red);" title="${b.alasan_penolakan}">Alasan: ${b.alasan_penolakan.substring(0, 20)}...</small>` : ''}
      </td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
}

function openAddBahanModal() { openModal("modal-tambah-bahan"); }

async function submitTambahBahan(e) {
  e.preventDefault();
  const payload = {
    nama: document.getElementById("mb-nama").value,
    kode_tkpi: document.getElementById("mb-kode").value,
    kelompok: document.getElementById("mb-kelompok").value,
    tingkat_bukti: document.getElementById("mb-bukti").value,
    sumber: document.getElementById("mb-sumber").value,
    wilayah: document.getElementById("mb-wilayah").value,
    musim: "Sepanjang tahun",
    harga_per_kg: parseFloat(document.getElementById("mb-harga").value) || 0,
    nutrisi: {
      energi_kcal: parseFloat(document.getElementById("mb-energi").value) || null,
      protein_g: parseFloat(document.getElementById("mb-protein").value) || null,
      zat_besi_mg: parseFloat(document.getElementById("mb-zatbesi").value) || null,
      vit_c_mg: parseFloat(document.getElementById("mb-vitc").value) || null,
      kalsium_mg: parseFloat(document.getElementById("mb-kalsium").value) || null,
      folat_mcg: parseFloat(document.getElementById("mb-folat").value) || null
    },
    komponen_fungsional: []
  };

  const res = await fetch("/api/pustaka/bahan", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (res.ok) {
    showToast("Bahan berhasil ditambahkan sebagai Draf.");
    closeModal("modal-tambah-bahan");
    document.getElementById("form-tambah-bahan").reset();
    await loadBahanList();
  } else {
    alert("Galat: " + data.detail);
  }
}

async function setujuiBahan(id) {
  const res = await fetch(`/api/pustaka/bahan/${id}/verifikasi`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({status: "Terverifikasi"})
  });
  if (res.ok) {
    showToast("Bahan disetujui (Terverifikasi) dan siap dipakai di Mesin Racik.");
    await loadBahanList();
  } else {
    const err = await res.json();
    alert(err.detail);
  }
}

function openTolakModal(id) {
  document.getElementById("tolak-bahan-id").value = id;
  document.getElementById("tolak-alasan").value = "";
  openModal("modal-tolak");
}

async function submitTolakBahan() {
  const id = document.getElementById("tolak-bahan-id").value;
  const alasan = document.getElementById("tolak-alasan").value;
  if (!alasan.trim()) { alert("Alasan penolakan wajib diisi (F-03)!"); return; }

  const res = await fetch(`/api/pustaka/bahan/${id}/verifikasi`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({status: "Ditolak", alasan_penolakan: alasan})
  });
  if (res.ok) {
    showToast("Bahan ditolak dengan catatan alasan.");
    closeModal("modal-tolak");
    await loadBahanList();
  } else {
    const err = await res.json();
    alert(err.detail);
  }
}

async function ajukanVerifikasiBahan(id) {
  const res = await fetch(`/api/pustaka/bahan/${id}/verifikasi`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({status: "Menunggu verifikasi"})
  });
  if (res.ok) {
    showToast("Bahan diajukan untuk verifikasi dosen.");
    await loadBahanList();
  }
}

function openImportModal() { openModal("modal-import-csv"); }

async function submitImportCSV() {
  const input = document.getElementById("csv-file-input");
  if (!input.files.length) { alert("Pilih berkas CSV!"); return; }

  const formData = new FormData();
  formData.append("file", input.files[0]);

  const res = await fetch("/api/pustaka/import-csv", {
    method: "POST",
    body: formData
  });
  const data = await res.json();
  if (res.ok) {
    showToast(`Berhasil impor ${data.created_count} entri.`);
    closeModal("modal-import-csv");
    await loadBahanList();
  } else {
    alert("Galat impor: " + data.detail);
  }
}

function exportOpenData(fmt) {
  window.open(`/api/pustaka/export-open-data?format=${fmt}`, "_blank");
}

// ----------------- MESIN RACIK & AKG (F-05, F-06) -----------------
async function loadAKGData() {
  const res = await fetch("/api/mesin-racik/akg");
  STANDAR_AKG = await res.json();
  const sel = document.getElementById("racik-kelompok-umur");
  sel.innerHTML = STANDAR_AKG.map(a => `<option value="${a.kelompok_umur}">${a.kelompok_umur} (${a.jenis_kelamin})</option>`).join("");
  updateAKGDisplay();
}

function updateAKGDisplay() {
  const selVal = document.getElementById("racik-kelompok-umur").value;
  const akg = STANDAR_AKG.find(a => a.kelompok_umur === selVal) || STANDAR_AKG[0];
  if (akg) {
    document.getElementById("akg-reference-info").innerText =
      `Acuan AKG PMK 28/2019: Fe ${akg.zat_besi_mg}mg, Vit C ${akg.vit_c_mg}mg, Protein ${akg.protein_g}g, Energi ${akg.energi_kcal}kkal`;
  }
  updateTargetDisplay();
}

function updateTargetDisplay() {
  const selVal = document.getElementById("racik-kelompok-umur").value;
  const akg = STANDAR_AKG.find(a => a.kelompok_umur === selVal);
  const porsiPct = parseFloat(document.getElementById("racik-porsi-akg").value) || 20.0;
  if (!akg) return;

  const checkboxes = document.querySelectorAll('input[name="nut-target"]:checked');
  const targetHTML = Array.from(checkboxes).map(cb => {
    const k = cb.value;
    const akgVal = akg[k] || 0;
    const targetVal = (akgVal * (porsiPct / 100.0)).toFixed(2);
    const unit = k.endsWith("_mg") ? "mg" : k.endsWith("_mcg") ? "mcg" : "g";
    return `<div>&bull; <b>${cb.parentElement.innerText.trim()}</b>: target <b>${targetVal} ${unit}</b> (${porsiPct}% dari ${akgVal} ${unit})</div>`;
  }).join("");

  document.getElementById("target-summary-box").innerHTML = `<b>Target Pemenuhan per Sajian:</b><div style="margin-top:4px;">${targetHTML || 'Pilih minimal satu zat gizi sasaran.'}</div>`;
}

function populateRacikBahanList() {
  const container = document.getElementById("ingredient-selection-list");
  // Only Terverifikasi ingredients! (BR-02)
  const verified = ALL_BAHAN.filter(b => b.status_verifikasi === "Terverifikasi");

  if (!verified.length) {
    container.innerHTML = `<div class="alert alert-warning">Belum ada bahan berstatus Terverifikasi. Verifikasi bahan di tab Pustaka terlebih dahulu (BR-02).</div>`;
    return;
  }

  container.innerHTML = verified.map(b => {
    // Default checked for primary ingredients (Kacang Hijau, Pisang, Kelor, Bilis)
    const isDefault = ["Kacang Hijau Kupas", "Tepung Pisang Raja Lokal", "Bubuk Daun Kelor Lokal", "Tepung Ikan Bilis Bengkulu", "Tepung Mokaf (Singkong Modifikasi)", "Gula Aren Asli Bengkulu"].includes(b.nama);
    const defaultUpper = b.nama.includes("Kelor") ? 15 : b.nama.includes("Bilis") ? 25 : 60;

    return `<div style="border:1px solid var(--color-border); border-radius:var(--radius); padding:8px 12px; margin-bottom:8px; background:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <label style="font-weight:600; cursor:pointer;">
          <input type="checkbox" class="ing-check" value="${b.id}" ${isDefault ? 'checked' : ''} onchange="toggleIngBounds(${b.id})">
          ${b.nama}
        </label>
        <span style="font-size:12px; color:var(--color-accent); font-weight:bold;">Rp ${Number(b.harga_per_kg).toLocaleString('id-ID')}/kg</span>
      </div>
      <div id="ing-bounds-ctrl-${b.id}" style="margin-top:6px; font-size:12px; display:${isDefault ? 'block' : 'none'};">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>Batas Atas (u_i):</span>
          <input type="number" id="ui-val-${b.id}" class="form-input" style="width:70px; padding:3px 6px;" value="${defaultUpper}" min="1" max="100">
          <span>%</span>
          <input type="text" id="ui-reason-${b.id}" class="form-input" style="flex:1; padding:3px 6px;" placeholder="Alasan batas (rasa/tekstur, BR-03)..." value="${b.nama.includes('Kelor') ? 'Mencegah rasa getir' : b.nama.includes('Bilis') ? 'Menjaga aroma' : 'Tekstur adonan'}">
        </div>
      </div>
    </div>`;
  }).join("");
}

function toggleIngBounds(id) {
  const chk = document.querySelector(`.ing-check[value="${id}"]`);
  const ctrl = document.getElementById(`ing-bounds-ctrl-${id}`);
  if (ctrl) ctrl.style.display = chk.checked ? 'block' : 'none';
}

// ----------------- RUN OPTIMIZER (F-06, BR-02, BR-03) -----------------
async function runOptimization() {
  const selectedBoxes = document.querySelectorAll(".ing-check:checked");
  if (!selectedBoxes.length) {
    alert("Pilih minimal satu bahan terverifikasi untuk formulasi!");
    return;
  }

  const bahan_pilihan = [];
  selectedBoxes.forEach(chk => {
    const id = parseInt(chk.value);
    const u_val = parseFloat(document.getElementById(`ui-val-${id}`).value) || 100;
    const reason = document.getElementById(`ui-reason-${id}`).value || "";
    bahan_pilihan.push({
      id_bahan: id,
      u_i: u_val / 100.0,
      u_i_reason: reason
    });
  });

  const checkedNuts = Array.from(document.querySelectorAll('input[name="nut-target"]:checked')).map(cb => cb.value);
  if (!checkedNuts.length) {
    alert("Pilih minimal satu zat gizi sasaran!");
    return;
  }

  const payload = {
    nama_produk: document.getElementById("racik-nama-produk").value || "Kue Kering Fe-Plus",
    kelompok_umur: document.getElementById("racik-kelompok-umur").value,
    porsi_akg_pct: parseFloat(document.getElementById("racik-porsi-akg").value) || 20.0,
    berat_sajian_g: parseFloat(document.getElementById("racik-berat-sajian").value) || 60.0,
    anggaran_max: parseFloat(document.getElementById("racik-anggaran").value) || null,
    zat_gizi_bermasalah: checkedNuts,
    bahan_pilihan: bahan_pilihan
  };

  showToast("Menjalankan solver SciPy HiGHS...");
  const res = await fetch("/api/mesin-racik/hitung", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  if (!res.ok) {
    alert("Galat Mesin Racik: " + data.detail);
    return;
  }

  CURRENT_SOLUTION = data;
  CURRENT_SOLUTION.input_payload = payload;

  // Switch to Tab 3
  switchTab("lembar");
  renderSolutionSheet();
}

function renderSolutionSheet() {
  const alertBox = document.getElementById("solver-status-alert");
  const content = document.getElementById("lembar-racik-content");

  if (!CURRENT_SOLUTION) return;

  if (!CURRENT_SOLUTION.success) {
    content.style.display = "none";
    alertBox.innerHTML = `<div class="alert alert-danger">
      <div>
        <b>Tidak Ada Solusi (Infeasible):</b> ${CURRENT_SOLUTION.message}<br>
        <b>Saran Tindakan:</b> ${CURRENT_SOLUTION.suggestion || 'Naikkan batas atas bahan atau tambahkan bahan baru.'}
      </div>
    </div>`;
    document.getElementById("btn-save-formula").disabled = true;
    document.getElementById("btn-export-csv").disabled = true;
    document.getElementById("btn-print-sheet").disabled = true;
    return;
  }

  alertBox.innerHTML = "";
  content.style.display = "block";

  // Top metric counters
  document.getElementById("res-biaya-sajian").innerText = `Rp ${Number(CURRENT_SOLUTION.biaya_per_sajian).toLocaleString('id-ID')}`;
  document.getElementById("res-berat-sajian").innerText = `Berat: ${CURRENT_SOLUTION.berat_sajian_g} gram`;
  document.getElementById("res-waktu-hitung").innerText = `${CURRENT_SOLUTION.execution_time_ms} ms`;

  const activeIngredients = CURRENT_SOLUTION.komposisi.filter(k => k.proporsi_pct > 0.01);
  document.getElementById("res-jumlah-bahan").innerText = `${activeIngredients.length} Bahan`;

  // Render composition table
  const tbodyKomp = document.getElementById("tbody-hasil-komposisi");
  tbodyKomp.innerHTML = activeIngredients.map(k => `<tr>
    <td><b>${k.nama}</b><br><small style="color:#777;">${k.kelompok}</small></td>
    <td><b>${k.proporsi_pct}%</b></td>
    <td>${k.gram} g</td>
    <td>Rp ${Number(k.biaya).toLocaleString('id-ID')}</td>
    <td>${(k.u_i * 100).toFixed(0)}% <small style="color:#666;">(${k.u_i_reason || '-'})</small></td>
  </tr>`).join("");

  // Render nutrient fulfillment
  const tbodyNut = document.getElementById("tbody-hasil-nutrisi");
  const nutKeys = ["zat_besi_mg", "vit_c_mg", "protein_g", "kalsium_mg", "folat_mcg", "energi_kcal"];
  tbodyNut.innerHTML = nutKeys.map(k => {
    const item = CURRENT_SOLUTION.pemenuhan_nutrisi[k];
    if (!item) return "";
    const pct = item.pct_target ? `${item.pct_target}%` : "-";
    const barW = item.pct_target ? Math.min(100, item.pct_target) : 0;
    return `<tr>
      <td><b>${item.label}</b></td>
      <td>${item.per_sajian} ${item.unit}</td>
      <td>${item.per_100g} ${item.unit}</td>
      <td>
        <b>${pct}</b>
        ${item.pct_target ? `<div class="progress-bar-bg" style="width:80px;"><div class="progress-bar-fill" style="width:${barW}%;"></div></div>` : ''}
      </td>
    </tr>`;
  }).join("");

  // Enable buttons
  document.getElementById("btn-save-formula").disabled = false;

  // Initialize initial claims check
  CLAIM_EVAL_LIST = [
    "Sumber Zat Besi",
    "Zat besi berperan dalam pembentukan sel darah merah",
    "Mencegah anemia pada remaja putri", // purposely violate Pasal 28g to show rejection!
    "Sumber Vitamin C"
  ];
  runClaimsEvaluation();
}

// ----------------- PENJAGA KLAIM (F-07, BR-05, BR-06, BR-07, BR-08) -----------------
async function runClaimsEvaluation() {
  if (!CURRENT_SOLUTION || !CURRENT_SOLUTION.pemenuhan_nutrisi) return;

  const nutrient_per_100g = {};
  for (const [k, v] of Object.entries(CURRENT_SOLUTION.pemenuhan_nutrisi)) {
    if (v && v.per_100g != null) nutrient_per_100g[k] = v.per_100g;
  }

  const tbody = document.getElementById("tbody-hasil-klaim");
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Memeriksa kaidah BPOM...</td></tr>`;

  const results = [];
  for (const claim of CLAIM_EVAL_LIST) {
    const res = await fetch("/api/penjaga-klaim/cek-langsung", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        teks_klaim: claim,
        nilai_nutrisi_per_100g: nutrient_per_100g,
        nilai_lab_per_100g: CURRENT_SOLUTION.lab_results || null,
        versi_kaidah: "v1.0"
      })
    });
    results.push(await res.json());
  }

  CURRENT_SOLUTION.evaluated_claims = results;

  tbody.innerHTML = results.map(r => {
    const badgeClass = r.status === "Diizinkan" ? "badge-diizinkan"
                     : r.status === "Bersyarat" ? "badge-bersyarat" : "badge-ditolak";

    return `<tr>
      <td><b>&ldquo;${r.teks_klaim}&rdquo;</b></td>
      <td><span class="badge ${badgeClass}">${r.status}</span></td>
      <td><small><b>${r.pasal_rujukan}</b></small></td>
      <td>
        <div style="font-size:12px;">${r.catatan}</div>
        <div style="font-size:11px; color:#666; margin-top:2px;">Dasar: ${r.dasar_nilai}</div>
      </td>
    </tr>`;
  }).join("");
}

async function testCustomClaim() {
  const input = document.getElementById("input-custom-claim");
  const val = input.value.trim();
  if (!val) return;
  if (!CLAIM_EVAL_LIST.includes(val)) {
    CLAIM_EVAL_LIST.push(val);
  }
  input.value = "";
  await runClaimsEvaluation();
  showToast(`Klaim '${val}' dievaluasi oleh Penjaga Klaim.`);
}

// ----------------- FORMULA ACTIONS (SAVE, PRINT, CSV) -----------------
let CURRENT_SAVED_FORMULA_ID = null;

async function saveFormulaToDB() {
  if (!CURRENT_SOLUTION) return;
  const payload = {
    nama_produk: CURRENT_SOLUTION.input_payload.nama_produk,
    berat_sajian_g: CURRENT_SOLUTION.berat_sajian_g,
    biaya_per_sajian: CURRENT_SOLUTION.biaya_per_sajian,
    komposisi: CURRENT_SOLUTION.komposisi,
    pemenuhan_nutrisi: CURRENT_SOLUTION.pemenuhan_nutrisi,
    solver_log: CURRENT_SOLUTION.message
  };

  const res = await fetch("/api/mesin-racik/formula", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (res.ok) {
    CURRENT_SAVED_FORMULA_ID = data.id;
    showToast(`Formula #${data.id} v${data.versi} berhasil disimpan ke basis data!`);
    document.getElementById("btn-export-csv").disabled = false;
    document.getElementById("btn-print-sheet").disabled = false;

    // Simpan hasil evaluasi klaim ke formula ini
    if (CURRENT_SOLUTION.evaluated_claims) {
      await fetch("/api/penjaga-klaim/evaluasi", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          id_formula: data.id,
          daftar_klaim: CLAIM_EVAL_LIST
        })
      });
    }

    await loadDashboardData();
  } else {
    alert("Galat simpan: " + data.detail);
  }
}

function exportFormulaCSV() {
  if (!CURRENT_SAVED_FORMULA_ID) { alert("Simpan formula terlebih dahulu!"); return; }
  window.open(`/api/export/formula/${CURRENT_SAVED_FORMULA_ID}/csv`, "_blank");
}

function printFormulaSheet() {
  if (!CURRENT_SAVED_FORMULA_ID) { alert("Simpan formula terlebih dahulu!"); return; }
  window.open(`/api/export/formula/${CURRENT_SAVED_FORMULA_ID}/print`, "_blank");
}

// ----------------- PILOT DASHBOARD (F-10, F-11) -----------------
async function loadDashboardData() {
  const res = await fetch("/api/pilot/dasbor");
  const data = await res.json();

  // 1. Render SMART indicators
  const grid = document.getElementById("smart-indicators-container");
  grid.innerHTML = (data.indikator || []).map(ind => `
    <div class="metric-card">
      <div class="metric-header">${ind.metrik}</div>
      <div class="metric-value" style="font-size:16px;">${ind.capaian}</div>
      <div class="metric-target">Target: ${ind.target}</div>
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${ind.pct_capaian}%;"></div></div>
    </div>
  `).join("");

  // 2. Render task queue
  const tq = data.antrean_tugas || {};
  const tqList = document.getElementById("task-queue-list");
  let tqHTML = "";

  if (tq.verifikasi_bahan && tq.verifikasi_bahan.length) {
    tqHTML += `<div><b>Verifikasi Bahan Menunggu (${tq.verifikasi_bahan.length}):</b><ul style="margin:4px 0 10px 18px; font-size:12px;">`;
    tq.verifikasi_bahan.forEach(b => tqHTML += `<li>${b.nama} &bull; <small>${b.sumber}</small></li>`);
    tqHTML += `</ul></div>`;
  }

  if (tq.verifikasi_formula && tq.verifikasi_formula.length) {
    tqHTML += `<div><b>Formula Menunggu Persetujuan Dosen (${tq.verifikasi_formula.length}):</b><ul style="margin:4px 0 10px 18px; font-size:12px;">`;
    tq.verifikasi_formula.forEach(f => tqHTML += `<li>Formula #${f.id}: ${f.nama_produk}</li>`);
    tqHTML += `</ul></div>`;
  }

  if (tq.menunggu_uji_lab && tq.menunggu_uji_lab.length) {
    tqHTML += `<div><b>Formula Menunggu Uji Lab untuk Klaim (${tq.menunggu_uji_lab.length}):</b><ul style="margin:4px 0 10px 18px; font-size:12px;">`;
    tq.menunggu_uji_lab.forEach(f => tqHTML += `<li>Formula #${f.id}: ${f.nama_produk} (Klaim berstatus Bersyarat)</li>`);
    tqHTML += `</ul></div>`;
  }

  tqList.innerHTML = tqHTML || `<div style="color:#666; font-size:12px;">Tidak ada tugas tertunda saat ini.</div>`;

  // 3. Render saved formulas list & modal dropdowns
  const fRes = await fetch("/api/mesin-racik/formula");
  SAVED_FORMULAS = await fRes.json();
  const fContainer = document.getElementById("saved-formula-list");

  if (!SAVED_FORMULAS.length) {
    fContainer.innerHTML = `<div style="color:#777; font-size:12px;">Belum ada formula tersimpan.</div>`;
  } else {
    fContainer.innerHTML = SAVED_FORMULAS.map(f => `
      <div style="border-bottom:1px solid var(--color-border-subtle); padding:8px 0; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <b>#${f.id} ${f.nama_produk} (v${f.versi})</b><br>
          <small style="color:#666;">Biaya: Rp ${Number(f.biaya_per_sajian).toLocaleString('id-ID')} &bull; Status: ${f.status}</small>
        </div>
        <div>
          <a href="/api/export/formula/${f.id}/print" target="_blank" class="btn btn-sm btn-secondary">Lembar PDF</a>
        </div>
      </div>
    `).join("");

    // Populate modal selects
    const orgSelect = document.getElementById("org-formula-select");
    const labSelect = document.getElementById("lab-formula-select");
    const options = SAVED_FORMULAS.map(f => `<option value="${f.id}">#${f.id} ${f.nama_produk} (v${f.versi})</option>`).join("");
    if (orgSelect) orgSelect.innerHTML = options;
    if (labSelect) labSelect.innerHTML = options;
  }
}

function openOrganoleptikModal() {
  if (!SAVED_FORMULAS.length) { alert("Simpan minimal satu formula terlebih dahulu sebelum mencatat uji!"); return; }
  openModal("modal-organoleptik");
}

async function submitOrganoleptik(e) {
  e.preventDefault();
  const payload = {
    id_formula: parseInt(document.getElementById("org-formula-select").value),
    jumlah_panelis: parseInt(document.getElementById("org-panelis").value) || 30,
    persen_suka_keatas: parseFloat(document.getElementById("org-persen").value) || 75.0,
    skor_rasa: parseFloat(document.getElementById("org-rasa").value) || 4.2,
    skor_tekstur: parseFloat(document.getElementById("org-tekstur").value) || 4.1,
    catatan_panelis: document.getElementById("org-catatan").value
  };

  const res = await fetch("/api/pilot/uji-organoleptik", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    showToast("Hasil uji organoleptik 30 panelis anonim berhasil dicatat (BR-09)!");
    closeModal("modal-organoleptik");
    await loadDashboardData();
  } else {
    const err = await res.json();
    alert(err.detail);
  }
}

function openLabTestModal() {
  if (!SAVED_FORMULAS.length) { alert("Simpan minimal satu formula terlebih dahulu sebelum mencatat uji!"); return; }
  openModal("modal-lab");
}

async function submitLabTest(e) {
  e.preventDefault();
  const fId = parseInt(document.getElementById("lab-formula-select").value);
  const fe = parseFloat(document.getElementById("lab-fe").value) || 0;
  const vitc = parseFloat(document.getElementById("lab-vitc").value) || 0;

  const payload = {
    id_formula: fId,
    nama_laboratorium: document.getElementById("lab-nama").value,
    nomor_sertifikat: document.getElementById("lab-sertifikat").value,
    kandungan_terukur_per_100g: {
      "zat_besi_mg": fe,
      "vit_c_mg": vitc
    }
  };

  const res = await fetch("/api/pilot/uji-laboratorium", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    showToast("Uji laboratorium dicatat! Status klaim diperbarui menjadi Diizinkan (BR-05).");
    closeModal("modal-lab");
    await loadDashboardData();
  } else {
    const err = await res.json();
    alert(err.detail);
  }
}

// ----------------- KAIDAH BPOM & LOG AUDIT (F-08, F-12) -----------------
async function loadKaidahKlaim() {
  const res = await fetch("/api/penjaga-klaim/kaidah");
  const rules = await res.json();
  const tbody = document.getElementById("tbody-kaidah");
  tbody.innerHTML = rules.map(r => `<tr>
    <td><b>${r.versi}</b></td>
    <td><span class="badge ${r.jenis_klaim === 'sumber' ? 'badge-diizinkan' : 'badge-bukti-b'}">${r.jenis_klaim}</span></td>
    <td>${r.zat_gizi}</td>
    <td>${r.bentuk_pangan}</td>
    <td>${r.ambang_pct_alg}% ALG</td>
    <td><small>${r.pasal_rujukan}</small></td>
    <td><small>${r.deskripsi_kaidah}</small></td>
  </tr>`).join("");
}

async function loadAuditLogs() {
  const res = await fetch("/api/audit/logs?limit=50");
  const logs = await res.json();
  const tbody = document.getElementById("tbody-audit");
  tbody.innerHTML = logs.map(l => `<tr>
    <td><small>${l.waktu}</small></td>
    <td><b>${l.user_email}</b></td>
    <td><span class="badge badge-draf">${l.role}</span></td>
    <td>${l.objek}</td>
    <td><b>${l.aksi}</b></td>
    <td><small>${l.detail}</small></td>
  </tr>`).join("");
}
