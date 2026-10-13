// Simpan beberapa bingkai video sebagai gambar untuk diperiksa.
const path = require("path"), fs = require("fs");
const { chromium, executablePath } = require("./pw.cjs");
const STATIC = path.join(__dirname, "..", "..", "static");
const du = (f) => `data:image/${path.extname(f).slice(1).replace("jpg", "jpeg")};base64,${fs.readFileSync(f).toString("base64")}`;
(async () => {
  const peta = { logo: du(path.join(STATIC, "assets", "brand", "mark-192.png")) };
  for (const f of fs.readdirSync(path.join(__dirname, "gambar"))) peta[f.replace(/\.jpg$/, "")] = du(path.join(__dirname, "gambar", f));
  const b = await chromium.launch({ executablePath });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto("file:///" + path.join(__dirname, "video.html").split(path.sep).join("/"), { waitUntil: "networkidle" });
  console.log(JSON.stringify(await p.evaluate(() => window.INFO())));
  const ts = (process.argv[2] || "3,12,45,100").split(",").map(Number);
  const out = await p.evaluate(([pt, t]) => window.PRATINJAU(pt, t), [peta, ts]);
  const dir = process.argv[3] || ".";
  out.forEach((d, i) => fs.writeFileSync(path.join(dir, `bingkai-${ts[i]}.jpg`), Buffer.from(d.split(",")[1], "base64")));
  await b.close();
})();
