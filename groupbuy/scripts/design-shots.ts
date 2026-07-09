/** Screenshots of the redesigned pages in light + dark, he + en. */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? "/tmp";

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

  for (const theme of ["light", "dark"] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 2400 } });
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(2200); // let counters/stagger settle
    await page.screenshot({ path: `${SHOT_DIR}/land-${theme}.png`, fullPage: true });
    await page.goto(`${BASE}/deals`);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOT_DIR}/feed-${theme}.png` });
    await page.close();
  }

  const browserEn = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  await browserEn.context().addCookies([{ name: "locale", value: "en", url: BASE }]);
  await browserEn.goto(`${BASE}/`);
  await browserEn.waitForTimeout(2000);
  await browserEn.screenshot({ path: `${SHOT_DIR}/land-en.png` });

  await browser.close();
  console.log("SHOTS OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
