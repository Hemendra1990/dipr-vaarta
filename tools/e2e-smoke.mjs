// Browser smoke test: signs in as every demo role, opens every module it can see, and fails on page errors,
// console errors or failed API calls. Usage: node tools/e2e-smoke.mjs [baseUrl] [screenshotDir]
// Needs the `playwright` package (e.g. NODE_PATH=$(npm root -g)).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:3000";
const SHOTS = process.argv[3] || "";
const ROLES = ["COMMISSIONER", "JD_NEWS", "DD_ACCOUNTS", "DIO", "DEPT_NODAL", "VENDOR", "FILM_SECTION"];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-proxy-server"] });
let failures = 0;
for (const role of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && problems.push("console: " + m.text()));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));
  await page.goto(BASE);
  await page.locator(`input[name=stk][value=${role}]`).check({ force: true });
  await page.waitForFunction(() => /\d+ \+ \d+/.test(document.querySelector(".capbox")?.textContent || ""));
  const q = await page.locator(".capbox").textContent();
  const [a, b] = q.split("+").map((x) => +x.trim());
  await page.fill("#lg-cap", String(a + b));
  await page.click("button[type=submit]");
  await page.waitForSelector("nav.snav");
  const tabs = await page.$$eval("nav.snav button", (bs) => bs.map((b) => b.textContent.trim()));
  for (const t of tabs) {
    await page.locator("nav.snav button", { hasText: t }).first().click();
    await page.waitForTimeout(400);
    await page.waitForFunction(() => !/Loading /.test(document.querySelector("#view")?.textContent || ""), null, { timeout: 15000 }).catch(() => problems.push(`still loading: ${t}`));
    const empty = await page.locator("#view").innerText();
    if (empty.trim().length < 40) problems.push(`view looks empty: ${t}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${role}-${t.replace(/[^A-Za-z0-9]+/g, "_")}.png`, fullPage: true });
  }
  console.log(`${role}: ${tabs.length} modules${problems.length ? "\n  " + problems.join("\n  ") : " OK"}`);
  failures += problems.length;
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
