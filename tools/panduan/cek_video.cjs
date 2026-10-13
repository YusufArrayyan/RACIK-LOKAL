// Periksa video: durasi, seek, dan tingkat suara.
const path = require("path"), fs = require("fs");
const { chromium, executablePath } = require("./pw.cjs");
(async () => {
  const b = await chromium.launch({ executablePath, args: ["--autoplay-policy=no-user-gesture-required"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const BASE = process.argv[3] || "http://127.0.0.1:8012";
  await p.goto(BASE + "/static/manifest.webmanifest");
  await p.evaluate((src) => { document.documentElement.innerHTML = `<body style="margin:0"><video id=v src="${src}" style="width:1280px;height:720px"></video></body>`; }, BASE + (process.argv[4] || "/static/panduan/video-panduan.webm"));
  const hasil = await p.evaluate(async () => {
    const v = document.getElementById("v");
    await Promise.race([new Promise((ok) => v.readyState >= 1 ? ok() : v.onloadedmetadata = ok), new Promise((_, no) => setTimeout(() => no(new Error("metadata tidak termuat: " + (v.error && v.error.message))), 15000))]);
    const ac = new AudioContext(); const src = ac.createMediaElementSource(v); const an = ac.createAnalyser(); an.fftSize = 2048;
    src.connect(an); an.connect(ac.destination);
    v.currentTime = 42.5; await Promise.race([new Promise((ok) => v.onseeked = ok), new Promise((r) => setTimeout(r, 8000))]);
    await v.play(); await ac.resume();
    let puncak = 0; const d = new Float32Array(an.fftSize);
    const akhir = performance.now() + 3000;
    while (performance.now() < akhir) { an.getFloatTimeDomainData(d); for (const s of d) puncak = Math.max(puncak, Math.abs(s)); await new Promise((r) => setTimeout(r, 50)); }
    v.pause();
    return { durasi: v.duration, posisi: v.currentTime, puncak_suara: +puncak.toFixed(3), lebar: v.videoWidth };
  });
  console.log(JSON.stringify(hasil));
  await p.screenshot({ path: process.argv[2] || "cek.jpg", type: "jpeg", quality: 80 });
  await b.close();
})();
