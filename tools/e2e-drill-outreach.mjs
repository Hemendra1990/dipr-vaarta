// Drill-down check for the command and outreach modules (Overview, Tipline, Press, Ads, District offices, AI agents).
// Walks State → Division → District → Taluk with every place-showing element (hex map, division chips, child tables,
// taluk tiles, scatter dots, breadcrumbs, drill up), as the Commissioner and as the DIO pinned to Raichur, and checks
// that each module's lists only hold rows of the area in view. Usage: node tools/e2e-drill-outreach.mjs [baseUrl]
// Needs the `playwright` package (e.g. NODE_PATH=$(npm root -g)); CHROME_PATH may point at a Chromium binary.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-proxy-server"] });
const problems = [];
const log = (...a) => console.log(...a);

async function signIn(role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${role} pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/ERR_CERT|ERR_PROXY|ERR_NAME/.test(m.text()) && problems.push(`${role} console: ${m.text()}`));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 400 && problems.push(`${role} HTTP ${r.status()} ${r.url()}`));
  await page.goto(BASE);
  await page.locator(`input[name=stk][value=${role}]`).check({ force: true });
  await page.waitForFunction(() => /\d+ \+ \d+/.test(document.querySelector(".capbox")?.textContent || ""));
  const [, a, b] = (await page.locator(".capbox").textContent()).match(/(\d+)\s*\+\s*(\d+)/).map(Number);
  await page.fill("#lg-cap", String(a + b));
  await page.click("button[type=submit]");
  await page.waitForSelector("nav.snav");
  return { ctx, page };
}

const settle = async (page) => {
  await page.waitForTimeout(250);
  await page.waitForFunction(() => !/Loading /.test(document.querySelector("#view")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
};
const crumbs = (page) => page.$$eval(".crumbs button", (bs) => bs.map((b) => b.textContent.trim()).join(" › "));
async function tab(page, t) {
  await page.evaluate((t) => (location.hash = t), t);
  await settle(page);
}
async function expectCrumbs(page, want, where) {
  const got = await crumbs(page);
  if (got !== want) problems.push(`${where}: crumbs "${got}", expected "${want}"`);
}

/** Checks the lists of one module at node {dist, tlk}: every row belongs to the area; empties use the module's text. */
async function checkModule(page, role, t, nd) {
  await tab(page, t);
  const where = `${role} ${t} @ ${nd.label}`;
  const view = await page.locator("#view").innerText();
  if (view.trim().length < 40) problems.push(`${where}: view empty`);
  const empties = await page.$$eval("#view .empty", (es) => es.map((e) => e.textContent.trim()));
  let rows = [];
  if (t === "tipline") rows = await page.$$eval("#view .card.s8 table.tb tbody tr td:nth-child(2)", (tds) => tds.map((x) => x.textContent.trim()));
  if (t === "press") rows = await page.$$eval("#view .card.s8 table.tb tbody tr td:nth-child(2)", (tds) => tds.map((x) => x.textContent.trim()));
  if (t === "offices") rows = await page.$$eval("#view ul.feed li small", (s) => s.map((x) => x.textContent.split(" · ").slice(0, 2).join(" · ")));
  // feed lines read "District · Taluk · Scheme"; only a known taluk name counts as the row's taluk
  const TALUKS = ["Raichur", "Sindhanur", "Manvi", "Lingasugur", "Devadurga"];
  rows = rows.map((r) => (r.includes(" · ") && !TALUKS.includes(r.split(" · ")[1]) ? r.split(" · ")[0] : r));
  const bad = rows.filter((r) => {
    if (r === "Statewide") return t !== "press";
    if (nd.div && !nd.dist) return !nd.dists.some((d) => r === d || r.startsWith(d + " · "));
    if (!nd.dist) return false;
    if (!(r === nd.dist || r.startsWith(nd.dist + " · "))) return true;
    if (nd.tlk && r.startsWith(nd.dist + " · ") && r !== `${nd.dist} · ${nd.tlk}`) return true;
    return false;
  });
  if (bad.length) problems.push(`${where}: rows outside the area: ${bad.join(" | ")}`);
  if (t === "ads") {
    const n = await page.$$eval("#view .card.s12 table.tb tbody tr", (r) => r.length);
    log(`  ${where}: ${n} flagged orders${empties.length ? " · empty: " + empties.join(" / ") : ""}`);
  } else log(`  ${where}: ${rows.length} rows${empties.length ? " · empty: " + empties.join(" / ") : ""}`);
  return rows;
}

const MODS = ["overview", "tipline", "press", "ads", "offices", "ai"];

// ---------- Commissioner: full tree ----------
{
  const role = "COMMISSIONER";
  const { ctx, page } = await signIn(role);
  await tab(page, "overview");
  await expectCrumbs(page, "Karnataka", "state");
  for (const t of MODS) await checkModule(page, role, t, { label: "Karnataka" });

  // hex map: state → district directly (as the prototype)
  await tab(page, "overview");
  await page.locator('svg.hexmap g.hx[aria-label^="Raichur,"]').click();
  await settle(page);
  await expectCrumbs(page, "Karnataka › Kalaburagi Division › Raichur", "hex click");
  await page.click("button.up");
  await settle(page);
  await expectCrumbs(page, "Karnataka › Kalaburagi Division", "drill up from hex");
  await page.click("button.up");
  await settle(page);

  // division chip → division
  await page.locator(".divchips button", { hasText: "Kalaburagi Division" }).click();
  await settle(page);
  await expectCrumbs(page, "Karnataka › Kalaburagi Division", "division chip");
  const dists = ["Bidar", "Kalaburagi", "Yadgir", "Raichur", "Koppal", "Ballari", "Vijayanagara"];
  for (const t of MODS) await checkModule(page, role, t, { label: "Kalaburagi Division", div: "Kalaburagi", dists });
  // child table row → district (from Tipline's "Claims by districts")
  await tab(page, "tipline");
  await page.locator("#view .card.s12 table.tb tbody tr", { hasText: "Raichur" }).click();
  await settle(page);
  await expectCrumbs(page, "Karnataka › Kalaburagi Division › Raichur", "tipline kid row");
  for (const t of MODS) await checkModule(page, role, t, { label: "Raichur", dist: "Raichur" });
  // taluks: overview tiles, then each module
  for (const tk of ["Raichur", "Sindhanur", "Manvi", "Lingasugur", "Devadurga"]) {
    await tab(page, "overview");
    await page.locator("#view .tiles button.tile", { hasText: tk }).first().click();
    await settle(page);
    await expectCrumbs(page, `Karnataka › Kalaburagi Division › Raichur › ${tk}`, `taluk tile ${tk}`);
    for (const t of MODS) await checkModule(page, role, t, { label: tk, dist: "Raichur", tlk: tk });
    await page.locator(".crumbs button", { hasText: /^Raichur$/ }).first().click();
    await settle(page);
    await expectCrumbs(page, "Karnataka › Kalaburagi Division › Raichur", `crumb back from ${tk}`);
  }
  // module-specific drills: press table, ads scatter, offices scorecard
  await page.locator(".crumbs button", { hasText: "Karnataka" }).click();
  await settle(page);
  await tab(page, "press");
  await page.locator("#view .card.s12 table.tb tbody tr", { hasText: "Mysuru Division" }).click();
  await settle(page);
  await expectCrumbs(page, "Karnataka › Mysuru Division", "press kid row");
  await tab(page, "ads");
  await page.locator("#view svg.chart g.hx").first().click();
  await settle(page);
  if ((await crumbs(page)).split(" › ").length !== 3) problems.push("ads scatter dot did not drill to a district");
  await page.locator("#view svg.chart g.hx").first().click();
  await settle(page);
  if ((await crumbs(page)).split(" › ").length !== 4) problems.push("ads scatter dot did not drill to a taluk");
  await page.locator(".crumbs button", { hasText: "Karnataka" }).click();
  await settle(page);
  await tab(page, "offices");
  await page.locator("#view .card.s12 table.tb tbody tr").first().click();
  await settle(page);
  if ((await crumbs(page)).split(" › ").length !== 2) problems.push("offices scorecard row did not drill to a division");
  // every scatter dot takes a real click (dots are nudged apart): Kalaburagi Division and Raichur district
  for (const [path, want] of [[["Karnataka", "Kalaburagi Division"], 3], [["Karnataka", "Mysuru Division"], 3], [["Karnataka", "Kalaburagi Division", "Raichur"], 4], [["Karnataka", "Belagavi Division", "Belagavi"], 4], [["Karnataka", "Kalaburagi Division", "Kalaburagi"], 4], [["Karnataka", "Bengaluru Division", "Bengaluru Urban"], 4]]) {
    await page.locator(".crumbs button", { hasText: "Karnataka" }).click();
    await tab(page, "overview");
    if (path.length > 1) await page.locator(".divchips button", { hasText: path[1] }).click();
    if (path.length > 2) await page.locator(`svg.hexmap g.hx[aria-label^="${path[2]},"]`).click();
    await tab(page, "ads");
    const names = await page.$$eval("#view svg.chart g.hx", (gs) => gs.map((g) => g.getAttribute("aria-label").split(":")[0]));
    for (const nm of names) {
      await page.locator(`#view svg.chart g.hx[aria-label^="${nm}:"]`).click({ timeout: 5000 }).catch(() => problems.push(`ads dot ${nm} not clickable`));
      await settle(page);
      const c = await crumbs(page);
      if (c.split(" › ").length !== want || !c.endsWith(nm)) problems.push(`ads dot ${nm}: crumbs ${c}`);
      await page.click("button.up");
      await settle(page);
    }
  }
  // offices: district → taluk through the taluk table
  await page.locator(".crumbs button", { hasText: "Karnataka" }).click();
  await tab(page, "overview");
  await page.locator('svg.hexmap g.hx[aria-label^="Raichur,"]').click();
  await settle(page);
  await tab(page, "offices");
  await page.locator("#view .card.s12 table.tb tbody tr", { hasText: "Sindhanur" }).click();
  await settle(page);
  await expectCrumbs(page, "Karnataka › Kalaburagi Division › Raichur › Sindhanur", "offices taluk row");
  await page.click("button.up");
  await settle(page);
  // glance tile opens its module at the current node
  await tab(page, "overview");
  const before = await crumbs(page);
  await page.locator(".glance button.gl").first().click();
  await settle(page);
  if ((await crumbs(page)) !== before) problems.push("glance tile lost the drill position");
  // ask: a taluk name opens it
  await page.locator(".crumbs button", { hasText: "Karnataka" }).click();
  await tab(page, "overview");
  await page.locator('svg.hexmap g.hx[aria-label^="Raichur,"]').click();
  await settle(page);
  await tab(page, "ai");
  await page.fill(".ask input", "How is Sindhanur doing?");
  await page.click(".ask button[type=submit]");
  await settle(page);
  await expectCrumbs(page, "Karnataka › Kalaburagi Division › Raichur › Sindhanur", "ask taluk");
  await ctx.close();
}

// ---------- DIO Raichur: pinned to its district, drills to each taluk and back ----------
{
  const role = "DIO";
  const { ctx, page } = await signIn(role);
  await tab(page, "overview");
  await expectCrumbs(page, "Raichur", "dio start");
  const tabs = await page.$$eval("nav.snav button", (bs) => bs.length);
  const mods = [];
  for (const t of MODS) {
    await tab(page, t);
    if ((await page.evaluate(() => location.hash.slice(1))) === t) mods.push(t);
  }
  log(`  DIO modules among area: ${mods.join(", ")} (${tabs} in nav)`);
  for (const t of mods) await checkModule(page, role, t, { label: "Raichur", dist: "Raichur" });
  for (const tk of ["Raichur", "Sindhanur", "Manvi", "Lingasugur", "Devadurga"]) {
    await tab(page, "overview");
    await page.locator("#view .tiles button.tile", { hasText: tk }).first().click();
    await settle(page);
    await expectCrumbs(page, `Raichur › ${tk}`, `dio taluk ${tk}`);
    for (const t of mods) await checkModule(page, role, t, { label: tk, dist: "Raichur", tlk: tk });
    await page.click("button.up");
    await settle(page);
    await expectCrumbs(page, "Raichur", `dio up from ${tk}`);
    if (!(await page.locator("button.up").isDisabled())) problems.push("dio: drill up should be disabled at the district");
  }
  await tab(page, "offices");
  await page.locator("#view .card.s12 table.tb tbody tr", { hasText: "Manvi" }).click();
  await settle(page);
  await expectCrumbs(page, "Raichur › Manvi", "dio offices taluk row");
  await page.click("button.up");
  await settle(page);
  // KidTable row (taluks) drills too
  await tab(page, "tipline");
  await page.locator("#view .card.s12 table.tb tbody tr").first().click();
  await settle(page);
  if ((await crumbs(page)).split(" › ").length !== 2) problems.push("dio tipline taluk row did not drill");
  await page.locator(".crumbs button", { hasText: /^Raichur$/ }).first().click();
  await settle(page);
  await expectCrumbs(page, "Raichur", "dio crumb back");
  await ctx.close();
}

await browser.close();
console.log(problems.length ? "PROBLEMS:\n  " + problems.join("\n  ") : "All drill checks passed");
process.exit(problems.length ? 1 : 0);
