// Pemuat Playwright bersama: memakai playwright-core dari @playwright/cli global dan Chromium yang sudah terpasang.
const path = require("path");
const fs = require("fs");
const os = require("os");

const CORE = process.env.PLAYWRIGHT_CORE || "C:/NVM/nodejs/node_modules/@playwright/cli/node_modules/playwright-core";
const { chromium } = require(CORE);

function cariChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const akar = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  const versi = fs.existsSync(akar) ? fs.readdirSync(akar).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const v of versi) {
    const exe = path.join(akar, v, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return undefined; // biarkan Playwright mencari sendiri
}

module.exports = { chromium, executablePath: cariChrome() };
