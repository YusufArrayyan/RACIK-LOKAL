// Ubah panduan.html menjadi static/panduan/panduan-racik-lokal.pdf.
//   node tools/panduan/buat_pdf.cjs
const path = require("path");
const fs = require("fs");
const { chromium, executablePath } = require("./pw.cjs");

const SUMBER = path.join(__dirname, "panduan.html");
const TUJUAN = path.join(__dirname, "..", "..", "static", "panduan", "panduan-racik-lokal.pdf");

(async () => {
  fs.mkdirSync(path.dirname(TUJUAN), { recursive: true });
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();
  await page.goto("file:///" + SUMBER.replace(/\\/g, "/"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: TUJUAN, format: "A4", printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font:8px 'IBM Plex Sans',sans-serif;color:#6b7370;padding:0 16mm;display:flex;justify-content:space-between">
      <span>Panduan RACIK-LOKAL</span><span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>`,
  });
  await browser.close();
  console.log("PDF:", TUJUAN, Math.round(fs.statSync(TUJUAN).size / 1024), "KB");
})().catch((e) => { console.error(e); process.exit(1); });
