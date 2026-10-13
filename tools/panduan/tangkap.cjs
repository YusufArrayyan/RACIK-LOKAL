// Ambil tangkapan layar untuk panduan PDF dan video.
// Pakai server dengan basis data contoh yang bersih, misalnya:
//   RACIK_DB_PATH=/tmp/panduan.db PORT=8012 python run.py
//   node tools/panduan/tangkap.cjs http://127.0.0.1:8012
const path = require("path");
const fs = require("fs");
const { chromium, executablePath } = require("./pw.cjs");

const BASE = process.argv[2] || "http://127.0.0.1:8012";
const OUT = path.join(__dirname, "gambar");
const SANDI = "racik-lokal-2026";
fs.mkdirSync(OUT, { recursive: true });

// Penanda bernomor berwarna jingga di atas elemen yang dibahas.
const CSS_SOROT = `
  .pd-ring { position: absolute; z-index: 9998; pointer-events: none; border: 3px solid #E8890C; border-radius: 14px;
    box-shadow: 0 0 0 6px rgba(232, 137, 12, .18); }
  .pd-no { position: absolute; z-index: 9999; pointer-events: none; width: 30px; height: 30px; border-radius: 50%;
    background: #E8890C; color: #fff; font: 700 16px/30px "IBM Plex Sans", system-ui, sans-serif; text-align: center;
    box-shadow: 0 2px 6px rgba(0,0,0,.25); }
  .notice { visibility: hidden; }
`;

async function sorot(page, daftar) {
  await page.addStyleTag({ content: CSS_SOROT });
  for (let i = 0; i < daftar.length; i++) {
    const loc = typeof daftar[i] === "string" ? page.locator(daftar[i]).first() : daftar[i](page);
    await loc.evaluate((el, no) => {
      const r = el.getBoundingClientRect();
      const x = r.left + scrollX, y = r.top + scrollY, pad = 6;
      const ring = document.createElement("div");
      ring.className = "pd-ring";
      Object.assign(ring.style, { left: `${x - pad}px`, top: `${y - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      const n = document.createElement("div");
      n.className = "pd-no";
      n.textContent = no;
      Object.assign(n.style, { left: `${x - pad - 15}px`, top: `${y - pad - 15}px` });
      document.body.append(ring, n);
    }, i + 1);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "id-ID" });
  const page = await ctx.newPage();

  async function sebagai(surel) {
    await page.request.post(`${BASE}/api/auth/keluar`);
    if (surel) {
      const r = await page.request.post(`${BASE}/api/auth/login`, { data: { surel, kata_sandi: SANDI } });
      if (!r.ok()) throw new Error(`Gagal masuk sebagai ${surel}`);
    }
  }
  async function buka(hash) {
    await page.goto(`${BASE}/${hash}`);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
  }
  async function gulirKe(selector, atas = 90) {
    await page.locator(selector).first().evaluate((el, a) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - a), atas);
    await page.waitForTimeout(250);
  }
  const simpan = (nama) => page.screenshot({ path: path.join(OUT, `${nama}.jpg`), type: "jpeg", quality: 82 });
  const judul = (teks) => page.locator("h2", { hasText: teks });

  // 1. Halaman awal dan masuk
  await sebagai(null);
  await buka("");
  await sorot(page, [".lp-hero .lp-cta .btn.primary"]);
  await simpan("01-halaman-awal");
  await buka("#/masuk");
  await page.fill('input[type="email"], input[autocomplete="username"], input', "dewi@contoh.id");
  await sorot(page, ["form", ".demo-accounts"]);
  await simpan("02-masuk");

  // 2. Formulator
  await sebagai("dewi@contoh.id");
  await buka("#/beranda");
  await sorot(page, [(p) => p.locator(".card").first(), (p) => p.locator("button", { hasText: "Formula baru" }).first()]);
  await simpan("03-beranda");

  await page.locator("button", { hasText: "Formula baru" }).first().click();
  await page.waitForTimeout(500);
  await simpan("04-formula-baru");
  await page.keyboard.press("Escape");

  await buka("#/formula/4/sasaran");
  await sorot(page, [(p) => p.locator(".field").nth(0), (p) => p.locator(".field").nth(1), (p) => p.locator(".field").nth(2),
    (p) => p.locator("button", { hasText: "Lanjut ke Racik" })]);
  await simpan("05-sasaran");

  await buka("#/formula/4/racik");
  await sorot(page, [".steps", ".answer"]);
  await simpan("06-racik-hasil");

  await buka("#/formula/4/racik");
  await gulirKe('h2.section-title:has-text("Isi satu sajian")', 40);
  await sorot(page, [(p) => p.locator(".urt").first(), (p) => p.locator(".foto-bahan").first()]);
  await simpan("07-racik-takaran");

  await buka("#/formula/4/racik");
  await gulirKe('h2.section-title:has-text("Gizi dalam satu sajian")', 40);
  await sorot(page, [(p) => p.locator(".status.warn").first()]);
  await simpan("08-racik-gizi");

  await buka("#/formula/4/racik");
  for (const s of await page.locator("details.fold > summary").all()) await s.click();
  await page.waitForTimeout(300);
  await gulirKe("details.fold", 40);
  await sorot(page, [(p) => p.locator("details.fold").first().locator("input").first(),
    (p) => p.locator("details.fold").first().locator('input[type="checkbox"]').first()]);
  await simpan("09-racik-batas");

  await buka("#/formula/4/klaim");
  await gulirKe(".li.klaim:nth-last-child(5)", 120);
  await sorot(page, [(p) => p.locator(".li.klaim").filter({ has: p.locator(".status.good") }).last(),
    (p) => p.locator(".li.klaim").filter({ has: p.locator(".status.warn") }).first()]);
  await simpan("10-cek-klaim");

  await buka("#/formula/4/ajukan");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(250);
  await sorot(page, [(p) => p.locator("label", { hasText: "Sumber zat besi" }).first(), (p) => p.locator("label", { hasText: "Tinggi kalsium" }).first(),
    (p) => p.locator("select").first(), (p) => p.locator("button", { hasText: "Kirim ke peninjau" })]);
  await simpan("11-ajukan");

  // 3. Bahan
  await buka("#/bahan");
  await sorot(page, ['input[type="search"]', (p) => p.locator(".foto-bahan").first()]);
  await simpan("12-bahan-daftar");

  await buka("#/bahan/2");
  await sorot(page, [".bahan-foto", (p) => judul("Kandungan gizi per 100 g")]);
  await simpan("13-bahan-detail");

  await buka("#/bahan/2");
  await gulirKe('h2.section-title:has-text("Takaran rumah tangga")', 40);
  await page.locator(".takaran-calc select").selectOption({ index: 1 });
  await page.locator(".takaran-calc input").fill("2");
  await page.locator(".takaran-calc input").dispatchEvent("input");
  await sorot(page, [(p) => p.locator(".list").nth(1), ".takaran-calc"]);
  await simpan("14-bahan-takaran");

  // 4. Ahli gizi
  await sebagai("rina@contoh.id");
  await buka("#/formula/2/tinjau");
  await gulirKe('h2.section-title:has-text("Keputusan")', 40);
  await sorot(page, [(p) => p.locator('[role="radiogroup"], fieldset').first(), (p) => p.locator("textarea").first(),
    (p) => p.locator("button", { hasText: "Kirim keputusan" })]);
  await simpan("15-tinjau");

  // 5. Koordinator pilot
  await sebagai("rian@contoh.id");
  await buka("#/pilot");
  await sorot(page, [".answer", (p) => p.locator(".banner").first(), (p) => p.locator("a", { hasText: "Ekspor CSV" })]);
  await simpan("16-pilot");

  await browser.close();
  console.log("Tangkapan layar tersimpan di", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
