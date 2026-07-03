// Shared Playwright harness for all phase specs.
// Run any spec with:  node tests/pN_name.spec.mjs
// Uses the environment's chromium; loads the game over file:// with the
// flag that permits ES-module loading from disk.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function boot({ width = 1280, height = 800, record = null } = {}) {
  const browser = await chromium.launch({
    args: ['--allow-file-access-from-files'],
  });
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(record ? { recordVideo: { dir: record, size: { width, height } } } : {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.__game != null, { timeout: 10000 });
  return { browser, ctx, page, errors };
}

let failures = 0;
export function check(name, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  — ' + detail}`);
  if (!ok) failures++;
  return ok;
}
export function finish() {
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

// hold a key for a number of milliseconds of *real* time
export async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
