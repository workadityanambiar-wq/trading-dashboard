const { chromium } = require("playwright");
const path = require("path");
const fs   = require("fs");

const BASE = "http://localhost:3000";
const OUT  = "C:/Users/aditya.nambiar/trading-dashboard/frontend/screenshots";

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await ctx.newPage();

  // Initial load (shows loading state)
  await page.goto(BASE + "/crowding", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "crowding-loading.png") });
  console.log("✓ loading state");

  // Wait for data (up to 90s for first yfinance fetch)
  try {
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 90000 },
    );
    await page.waitForTimeout(2000);
  } catch {
    console.log("  (still loading after 90s — taking screenshot anyway)");
  }

  await page.screenshot({ path: path.join(OUT, "crowding-overview.png") });
  console.log("✓ overview tab");

  // Click Heatmap tab
  const tabs = ["Heatmap", "Emerging", "Sectors", "Distribution", "Stocks"];
  for (const label of tabs) {
    try {
      await page.click(`button:has-text("${label}")`, { timeout: 5000 });
      await page.waitForTimeout(1200);
      const fname = `crowding-${label.toLowerCase()}.png`;
      await page.screenshot({ path: path.join(OUT, fname) });
      console.log(`✓ ${label}`);
    } catch (e) {
      console.log(`✗ ${label}: ${e.message.slice(0, 60)}`);
    }
  }

  await browser.close();
})();
