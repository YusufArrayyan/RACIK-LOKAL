// Rekam video panduan (WebM dengan suara) dari video.html.
//   node tools/panduan/rekam_video.cjs              -> static/panduan/video-panduan.webm
//   node tools/panduan/rekam_video.cjs --mp4 [file] -> MP4 (H.264 dan AAC), bawaan static/panduan/video-panduan.mp4
// Butuh tangkapan layar di tools/panduan/gambar (jalankan tangkap.cjs dulu).
const path = require("path");
const fs = require("fs");
const { chromium, executablePath } = require("./pw.cjs");

const DIR = __dirname;
const STATIC = path.join(DIR, "..", "..", "static");
const TUJUAN = path.join(STATIC, "panduan");

function dataUrl(file) {
  const ext = path.extname(file).slice(1).replace("jpg", "jpeg");
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
}

const MP4 = process.argv.includes("--mp4");
const BERKAS = MP4
  ? path.resolve(process.argv[process.argv.indexOf("--mp4") + 1] || path.join(TUJUAN, "video-panduan.mp4"))
  : path.join(TUJUAN, "video-panduan.webm");

(async () => {
  fs.mkdirSync(TUJUAN, { recursive: true });
  fs.mkdirSync(path.dirname(BERKAS), { recursive: true });
  const peta = { logo: dataUrl(path.join(STATIC, "assets", "brand", "mark-192.png")) };
  for (const f of fs.readdirSync(path.join(DIR, "gambar"))) {
    if (f.endsWith(".jpg")) peta[f.replace(/\.jpg$/, "")] = dataUrl(path.join(DIR, "gambar", f));
  }
  const browser = await chromium.launch({
    executablePath,
    args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => console.log("[halaman]", m.text()));
  await page.goto("file:///" + path.join(DIR, "video.html").replace(/\\/g, "/"), { waitUntil: "networkidle" });
  console.log("Merekam video, tunggu sekitar satu setengah menit...");
  const hasil = await page.evaluate(([p, f]) => window.MULAI(p, f), [peta, MP4 ? "mp4" : "webm"]);
  fs.writeFileSync(BERKAS, Buffer.from(hasil.data, "base64"));
  const poster = await page.evaluate(() => window.POSTER2 || window.POSTER);
  if (!MP4) fs.writeFileSync(path.join(TUJUAN, "video-poster.jpg"), Buffer.from(poster.split(",")[1], "base64"));
  await browser.close();
  // MediaRecorder tidak menulis durasi; tanpa itu video sulit digeser di pemutar.
  // MP4 dari peramban terfragmentasi tanpa durasi; susun ulang agar bisa digeser di semua pemutar.
  const py = process.env.PYTHON || "python";
  if (MP4) require("child_process").execFileSync(py, [path.join(DIR, "defrag_mp4.py"), BERKAS], { stdio: "inherit" });
  else require("child_process").execFileSync(py, [path.join(DIR, "isi_durasi.py"), BERKAS, hasil.durasi.toFixed(2)], { stdio: "inherit" });
  const kb = Math.round(fs.statSync(BERKAS).size / 1024);
  console.log(`Selesai: ${BERKAS} (${hasil.tipe}, ${hasil.durasi.toFixed(1)} detik, ${kb} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
