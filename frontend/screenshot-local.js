const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:3000";
const OUT = "C:/Users/aditya.nambiar/trading-dashboard/frontend/screenshots";

const PAGES = [
  { name: "overview",  url: "/" },
  { name: "breadth",   url: "/breadth" },
  { name: "setups",    url: "/setups" },
  { name: "watchlist", url: "/watchlist" },
  { name: "regime",    url: "/regime" },
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  for (const { name, url } of PAGES) {
    try {
      await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);
      const file = path.join(OUT, `local-${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`✓ ${name} → ${file}`);
    } catch (e) {
      console.log(`✗ ${name}: ${e.message}`);
    }
  }

  await browser.close();
})();
