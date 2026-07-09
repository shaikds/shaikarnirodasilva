/**
 * Dev-only browser walkthrough of the core flows against a running server:
 * member login -> join deal -> admin login -> dashboard render.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? "/tmp";

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // --- Member: login ---
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "dana@groupbuy.local");
  await page.fill('input[name="password"]', "Demo1234!");
  await page.click('main form button');
  await page.waitForURL(`${BASE}/deals`, { timeout: 15000 });
  console.log("member login OK");
  await page.screenshot({ path: `${SHOT_DIR}/01-deals-feed.png` });

  // --- Join first open deal ---
  const dealLink = page.locator('a[href^="/deals/"]').first();
  await dealLink.click();
  await page.waitForURL(/\/deals\//);
  await page.screenshot({ path: `${SHOT_DIR}/02-deal-detail.png` });
  const joinButton = page.locator("main form button").last();
  const label = await joinButton.textContent();
  await joinButton.click();
  await page.waitForTimeout(1500);
  console.log(`deal page action ('${label?.trim()}') OK`);
  await page.screenshot({ path: `${SHOT_DIR}/03-after-join.png` });

  // --- My groups ---
  await page.goto(`${BASE}/my`);
  const groups = await page.locator('a[href^="/deals/"]').count();
  console.log(`my-groups shows ${groups} membership(s)`);
  await page.screenshot({ path: `${SHOT_DIR}/04-my-groups.png` });

  // --- Admin ---
  const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await admin.goto(`${BASE}/login`);
  await admin.fill('input[name="email"]', "admin@groupbuy.local");
  await admin.fill('input[name="password"]', "Demo1234!");
  await admin.click("main form button");
  await admin.waitForURL(`${BASE}/deals`, { timeout: 15000 });
  await admin.goto(`${BASE}/admin`);
  await admin.waitForSelector("table");
  const blocked = await admin.locator("text=BLOCKED_BY_GUARDRAIL").count();
  console.log(`admin dashboard OK; ${blocked} blocked decision(s) visible`);
  await admin.screenshot({ path: `${SHOT_DIR}/05-admin.png`, fullPage: true });

  await browser.close();
  console.log("BROWSER CHECK OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
