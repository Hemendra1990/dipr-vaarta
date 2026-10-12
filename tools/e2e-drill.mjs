// Drill-down test: signs in as every demo role, opens every module it can see and drills State → Division → District →
// Taluk with the module's own controls (hex tiles, division chips, children-table rows, by-area bars, scatter points,
// taluk tiles), then back up with the breadcrumb and the "Drill up" button. At every level it checks the breadcrumb,
// the level label, the address, the drill-up button, that nothing is stuck loading, that there are no page errors,
// console errors or failed /api calls, no "no data" empty states (outside a short whitelist) and no NaN / undefined / ∞.
//
// Usage: node tools/e2e-drill.mjs [baseUrl] [--role DIO,VENDOR] [--module tipline,spend] [--quick | --full]
//                                  [--shots dir] [--report file.json] [--jobs 3]
//   default  every division, 3 districts per division, every taluk of one district per division
//   --quick  every division, 1 district per division, 2 taluks of it (a fast check while developing)
//   --full   every division, all 31 districts, every taluk of one district per division
// The DIO is pinned to Raichur: it checks Raichur and every Raichur taluk. Exits 1 when any check fails.
// Needs the `playwright` package (e.g. NODE_PATH=$(npm root -g)); set CHROME_PATH to use a specific Chromium.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (k) => argv.includes(k);
const valued = new Set(["--role", "--module", "--shots", "--report", "--jobs"]);
const BASE = argv.find((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1])) || "http://localhost:3000";
const ROLES_ALL = ["COMMISSIONER", "JD_NEWS", "DD_ACCOUNTS", "DIO", "DEPT_NODAL", "VENDOR", "FILM_SECTION"];
const ROLES = opt("--role") ? opt("--role").split(",").map((s) => s.trim().toUpperCase()) : ROLES_ALL;
const MODULES = opt("--module") ? new Set(opt("--module").split(",").map((s) => s.trim())) : null;
const MODE = flag("--quick") ? "quick" : flag("--full") ? "full" : "default";
const SHOTS = opt("--shots") || "";
const REPORT = opt("--report") || "e2e-drill-report.json";
const JOBS = Math.max(1, +(opt("--jobs") || 3));
const DIST_PER_DIV = MODE === "quick" ? 1 : MODE === "full" ? 99 : 3;
const TLK_MAX = MODE === "quick" ? 2 : 99;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// ---------- what counts as "no data" ----------
// Every `.empty` block in the view is an empty state. These are allowed, with the reason; anything else fails.
const ALLOWED_EMPTY = [
  { module: "ai", re: /No agent runs yet/, why: "a fresh database has no agent runs until someone runs one" },
  { module: "upload", re: /No uploads yet/, why: "a fresh database has no upload history" },
  { module: "upload", re: /Your login has no data to upload/, why: "the role has no uploadable dataset" },
  { module: "offices", re: /No open tasks from HQ/, why: "HQ tasks are created at run time, not seeded" },
  { module: "*", re: /^Loading run history/, why: "covered by the stuck-loading check" },
];
// Modules a role may not drill (the check is skipped, with the reason).
const NO_DRILL_OK = [
  { role: "VENDOR", module: "spend", why: "the vendor's page lists its own release orders and has no place card, as in the prototype (docs/notes/drill-spendreg.md)" },
  { role: "VENDOR", module: "empanel", why: "a vendor has one empanelment record; PR-K02 is a statewide outlet, so no division has one" },
];
// "No data" phrases the views print outside an `.empty` block (they also fail unless whitelisted above).
const EMPTY_PHRASES = [
  /No records match/,
  /No releases for this area/,
  /No flagged orders/,
  /No claims with this status/,
  /No spend for this campaign type/,
  /No release orders with this status/,
  /No updates from this area/,
  /No data for this/i,
];
const BAD_VALUE = /\bNaN\b|\bundefined\b|Infinity|∞|₹\s?null\b/;
const LVL_LABEL = ["State view", "Division view", "District view", "Taluk view"];

// ---------- page helpers ----------
async function signIn(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const st = { problems: [], inflight: 0, lastChange: Date.now() };
  page.on("pageerror", (e) => st.problems.push("page error: " + e.message));
  // a web font or other third-party file that cannot load (offline, proxy) is not an app error
  const external = (m) => /^Failed to load resource/.test(m.text()) && !(m.location().url || "").startsWith(BASE);
  page.on("console", (m) => m.type() === "error" && !external(m) && st.problems.push("console error: " + m.text().slice(0, 200)));
  const isApi = (u) => u.includes("/api/");
  page.on("request", (r) => {
    if (isApi(r.url())) st.inflight++, (st.lastChange = Date.now());
  });
  const done = (r) => {
    if (isApi(r.url())) st.inflight = Math.max(0, st.inflight - 1), (st.lastChange = Date.now());
  };
  page.on("requestfinished", done);
  page.on("requestfailed", (r) => {
    done(r);
    if (isApi(r.url())) st.problems.push(`failed API call: ${r.method()} ${short(r.url())} (${r.failure()?.errorText})`);
  });
  page.on("response", (r) => isApi(r.url()) && r.status() >= 400 && st.problems.push(`API ${r.status()}: ${r.request().method()} ${short(r.url())}`));
  await page.goto(BASE);
  await page.locator(`input[name=stk][value=${role}]`).check({ force: true });
  await page.waitForFunction(() => /\d+ \+ \d+/.test(document.querySelector(".capbox")?.textContent || ""));
  const q = await page.locator(".capbox").textContent();
  const [a, b] = q.split("+").map((x) => +x.replace(/[^\d]/g, ""));
  await page.fill("#lg-cap", String(a + b));
  const metaP = page.waitForResponse((r) => /\/api\/meta$/.test(r.url()) && r.ok(), { timeout: 20000 });
  await page.click("button[type=submit]");
  const meta = await (await metaP).json();
  await page.waitForSelector("nav.snav");
  return { ctx, page, st, ref: meta.reference, registers: meta.registers || [] };
}
const short = (u) => u.replace(/^https?:\/\/[^/]+/, "");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits until no /api request has been in flight for 150 ms (twice in a row) and nothing says "Loading". */
async function settle(page, st, problems) {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < 15000) {
    if (st.inflight === 0 && Date.now() - st.lastChange > 150) {
      if (++calm >= 2) break;
    } else calm = 0;
    await pause(60);
  }
  if (st.inflight) problems.push(`API calls still running after 15 s (${st.inflight})`);
  const ok = await page
    .waitForFunction(() => !/(^|\s)Loading\b/.test(document.querySelector("#view")?.innerText || ""), null, { timeout: 15000 })
    .then(() => true, () => false);
  if (!ok) {
    const l = await page.evaluate(() => (document.querySelector("#view")?.innerText.match(/Loading[^\n]*/) || [""])[0]);
    problems.push(`stuck loading: "${l}"`);
  }
}

/**
 * Marks the first enabled control in the view that drills to `name` (a division, district or taluk) for each control
 * type. Returns the enabled types, and `zero`: true when the only controls for the place are disabled area bars
 * (BarList disables a bar whose area has no rows, so a zero area is not drillable).
 */
async function controlsFor(page, name, lvl) {
  return page.evaluate(
    ({ name, lvl }) => {
      const v = document.querySelector("#view");
      v.querySelectorAll("[data-e2e]").forEach((e) => e.removeAttribute("data-e2e"));
      const want = lvl === "div" ? name + " Division" : name;
      const t = (s) => (s || "").trim();
      const found = {};
      let zero = false;
      const add = (type, el, ok) => {
        if (!ok || found[type]) return;
        if (el.disabled) return void (zero = true);
        found[type] = true;
        (el.querySelector("polygon,circle") || el).setAttribute("data-e2e", type);
      };
      if (lvl === "dist") v.querySelectorAll("svg.hexmap g.hx[role=button]").forEach((g) => add("hex tile", g, t((g.getAttribute("aria-label") || "").split(",")[0]) === want));
      v.querySelectorAll("svg.chart g.hx[role=button]").forEach((g) => add("scatter point", g, t((g.getAttribute("aria-label") || "").split(":")[0]) === want));
      v.querySelectorAll(".divchips button").forEach((b) => add("division chip", b, t(b.querySelector("b")?.textContent) === want));
      v.querySelectorAll("tr.click").forEach((r) => add("children row", r, t(r.querySelector(".nm")?.textContent) === want));
      v.querySelectorAll(".tiles button.tile").forEach((b) => add("taluk tile", b, t(b.querySelector("b")?.textContent) === want));
      v.querySelectorAll(".hb button.rbtn").forEach((b) => add("area bar", b, t(b.querySelector("span[title]")?.getAttribute("title")) === want));
      const types = Object.keys(found);
      return { types, zero: zero && !types.length };
    },
    { name, lvl },
  );
}

/** What the screen shows about the drill position and the view's health. */
async function inspect(page) {
  return page.evaluate(() => {
    const v = document.querySelector("#view");
    const text = v?.innerText || "";
    return {
      crumbs: [...document.querySelectorAll(".crumbs button")].map((b) => b.textContent.trim()),
      current: document.querySelector(".crumbs button[aria-current=page]")?.textContent.trim() || "",
      lvl: document.querySelector(".crumbs .lvl")?.textContent.trim() || "",
      upDisabled: document.querySelector("button.up")?.disabled ?? null,
      hash: decodeURIComponent(location.hash.replace(/\+/g, " ")),
      empties: [...(v?.querySelectorAll(".empty") || [])].map((e) => e.textContent.trim().replace(/\s+/g, " ")),
      text,
      len: text.trim().length,
    };
  });
}

// ---------- one role ----------
async function runRole(browser, role, log) {
  const results = [];
  let s;
  try {
    s = await signIn(browser, role);
  } catch (e) {
    results.push({ role, module: "(sign-in)", level: "-", place: "-", via: "-", ok: false, reasons: ["sign-in failed: " + e.message.split("\n")[0]] });
    return results;
  }
  const { page, st, ref } = s;
  // modules whose data is tied to places (the others show the same at every level)
  const GEO = new Set(["overview", "tipline", "press", "offices", "ads", "spend", ...s.registers.filter((r) => !r.geoAll).map((r) => r.id)]);
  const DIV_OF = {};
  for (const [v, ds] of Object.entries(ref.divisions)) ds.forEach((d) => (DIV_OF[d] = v));
  const mods = await page.$$eval("select.navsel option", (os) => os.map((o) => ({ key: o.value, label: o.textContent.trim() })));
  const user = await page.evaluate(() => document.querySelector(".who small")?.textContent || "");
  const sc = (await page.locator(".crumbs .chip.warn").count()) ? (await inspect(page)).crumbs[0] : null; // the pinned district
  const top = sc ? [DIV_OF[sc], sc] : [];
  log(`${role} (${user}): ${mods.length} modules${sc ? ", pinned to " + sc : ""}`);
  st.problems.length = 0;

  const labelsFor = (p) => (sc ? [p[1], p[2]] : ["Karnataka", p[0] && p[0] + " Division", p[1], p[2]]).filter(Boolean);
  const hashFor = (mod, p) => "#" + [mod, ...p].join("/");

  for (let mi = 0; mi < mods.length; mi++) {
    const mod = mods[mi];
    if (MODULES && !MODULES.has(mod.key)) continue;
    const noDrillOk = NO_DRILL_OK.find((a) => a.role === role && (a.module === "*" || a.module === mod.key));
    const used = {}; // control type → count, so every type the module offers gets exercised
    const record = (p, via, reasons) => {
      const level = ["state", "division", "district", "taluk"][p.length];
      const r = { role, module: mod.key, level, place: labelsFor(p).join(" › "), via, ok: !reasons.length, reasons };
      results.push(r);
      return r;
    };

    /** Checks the screen against drill path p (e.g. ["Kalaburagi","Raichur","Sindhanur"]). */
    const check = async (p, via) => {
      const reasons = [...st.problems.splice(0)];
      const want = labelsFor(p);
      // wait for the breadcrumb to show the place, then for the data to arrive
      const moved = await page
        .waitForFunction((w) => JSON.stringify([...document.querySelectorAll(".crumbs button")].map((b) => b.textContent.trim())) === w, JSON.stringify(want), { timeout: 6000 })
        .then(() => true, () => false);
      await settle(page, st, reasons);
      const i = await inspect(page);
      if (!moved) reasons.push(`breadcrumb shows "${i.crumbs.join(" › ")}", expected "${want.join(" › ")}"`);
      if (i.current !== want[want.length - 1]) reasons.push(`current crumb is "${i.current}", expected "${want[want.length - 1]}"`);
      if (i.lvl !== LVL_LABEL[p.length]) reasons.push(`level label "${i.lvl}", expected "${LVL_LABEL[p.length]}"`);
      const upWant = p.length === 0 || (!!sc && p.length < 3);
      if (i.upDisabled !== upWant) reasons.push(`drill-up button ${i.upDisabled ? "disabled" : "enabled"}, expected ${upWant ? "disabled" : "enabled"}`);
      if (i.hash !== hashFor(mod.key, p)) reasons.push(`address "${i.hash}", expected "${hashFor(mod.key, p)}"`);
      if (i.len < 40) reasons.push("view is empty");
      const level = ["state", "division", "district", "taluk"][p.length];
      const allowed = (txt) =>
        ALLOWED_EMPTY.find((a) => (a.module === "*" || a.module === mod.key) && (!a.role || a.role === role) && (!a.level || a.level === level) && a.re.test(txt));
      for (const e of i.empties) if (!allowed(e)) reasons.push(`empty state: "${e.slice(0, 110)}"`);
      for (const re of EMPTY_PHRASES) {
        const m = i.text.match(new RegExp(re.source + "[^\\n]{0,60}", re.flags));
        if (m && !allowed(m[0]) && !i.empties.some((e) => e.includes(m[0].trim().slice(0, 30)))) reasons.push(`empty text: "${m[0].trim()}"`);
      }
      const bad = i.text.match(new RegExp("[^\\n]{0,40}(" + BAD_VALUE.source + ")[^\\n]{0,20}"));
      if (bad) reasons.push(`bad value: "${bad[0].trim()}"`);
      reasons.push(...st.problems.splice(0));
      const r = record(p, via, [...new Set(reasons)]);
      if (!r.ok && SHOTS) await page.screenshot({ path: path.join(SHOTS, `${role}-${mod.key}-${p.join("_") || "state"}.png`.replace(/[^\w.-]+/g, "_")), fullPage: true }).catch(() => {});
      return r;
    };

    /** Puts the console at path p through the address (used when the view has no control for it). */
    const viaLink = async (p) => {
      await page.evaluate((h) => (location.hash = h), hashFor(mod.key, p));
    };

    /** Drills from the current place (path p minus its last part) to p with the module's own controls. */
    const drill = async (p, needControl) => {
      const lvl = ["div", "dist", "tlk"][p.length - 1];
      const { types, zero } = await controlsFor(page, p[p.length - 1], lvl);
      if (zero) {
        // a zero area: its bar is disabled, so there is nothing to drill to (and no empty level to open)
        results.push({ role, module: mod.key, level: ["state", "division", "district", "taluk"][p.length], place: labelsFor(p).join(" › "), via: "zero", ok: true, reasons: [], skipped: true });
        return null;
      }
      if (!types.length) {
        await viaLink(p);
        const r = await check(p, "address");
        if (needControl && !noDrillOk) {
          r.ok = false;
          r.reasons.unshift(`no control in the view drills to ${labelsFor(p).slice(-1)[0]} (reached through the address instead)`);
        }
        return r;
      }
      types.sort((a, b) => (used[a] || 0) - (used[b] || 0));
      const ty = types[0];
      used[ty] = (used[ty] || 0) + 1;
      const el = page.locator(`#view [data-e2e="${ty}"]`).first();
      let blocked = null;
      try {
        await el.click({ timeout: 3000 });
      } catch (e) {
        // covered by another element (e.g. overlapping chart points): note it, then use the keyboard as a user could,
        // but only when the control itself took the focus (Enter must not land on whatever had it before)
        const by = (e.message.match(/aria-label="([^":]+)/) || [])[1];
        blocked = `the ${ty} for ${p[p.length - 1]} cannot be clicked${by ? ", it is covered by " + by : ""}`;
        const focused = await el.evaluate((x) => {
          const f = x.closest("[tabindex],button") || x;
          f.focus();
          return document.activeElement === f;
        });
        if (focused) await page.keyboard.press("Enter");
        else await viaLink(p);
      }
      const r = await check(p, ty);
      if (blocked) (r.ok = false), r.reasons.unshift(blocked);
      return r;
    };
    // Breadcrumb and drill-up start from where the previous step should have left the view. If that step failed, the
    // control may be missing or disabled: recover through the address and record why, instead of timing out.
    const crumb = async (p) => {
      const b = page.locator(".crumbs button").nth(labelsFor(p).length - 1);
      if (!(await b.count())) {
        await viaLink(p);
        const r = await check(p, "address");
        return (r.ok = false), r.reasons.unshift("breadcrumb to go back up was missing (the previous drill did not happen)"), r;
      }
      await b.click({ timeout: 5000 });
      return check(p, "breadcrumb");
    };
    const up = async (p) => {
      const b = page.locator("button.up");
      if (await b.isDisabled()) {
        await viaLink(p);
        const r = await check(p, "address");
        return (r.ok = false), r.reasons.unshift("drill-up button was disabled (the previous drill did not happen)"), r;
      }
      await b.click({ timeout: 5000 });
      return check(p, "drill-up");
    };

    /** Every taluk of district path dp (up to TLK_MAX), back up by drill-up and breadcrumb in turn. */
    const taluks = async (dp, parent) => {
      const tl = ref.taluks[dp[1]].slice(0, TLK_MAX);
      const zero = [];
      let k = 0;
      for (const t of tl) {
        const r = await drill([...dp, t], true);
        if (!r) {
          zero.push(t);
          continue;
        }
        await (k++ % 2 ? crumb(dp) : up(dp));
      }
      allZero(dp, parent, zero, tl);
    };
    /** All children disabled (zero rows) is a failure only when the parent level itself shows data. */
    const allZero = (p, parent, zero, kids) => {
      if (!kids.length || zero.length < kids.length || noDrillOk) return;
      const parentEmpty = parent && parent.reasons.some((x) => /^empty (state|text)/.test(x));
      if (!parentEmpty) record(p, "drill check", [`every ${["division", "district", "taluk"][p.length]} bar is disabled (zero rows) although ${labelsFor(p).slice(-1)[0] || "Karnataka"} shows data`]);
    };

    try {
      await page.locator("nav.snav button").nth(mi).click();
      // start at the top of the role's area
      if ((await inspect(page)).crumbs.length > labelsFor(top).length) await page.locator(".crumbs button").first().click();
      const topCheck = await check(top, "module menu");

      // A module drills when its view offers a control for a child of the top level.
      const kidsOf = (p) => (p.length === 0 ? Object.keys(ref.divisions) : p.length === 1 ? ref.divisions[p[0]] : p.length === 2 ? ref.taluks[p[1]] : []);
      let drills = false;
      for (const k of kidsOf(top)) {
        const c = await controlsFor(page, k, ["div", "dist", "tlk"][top.length]);
        if (c.types.length || c.zero) drills = true;
      }

      if (!drills && GEO.has(mod.key) && !noDrillOk) {
        const kids = ["divisions", "districts", "taluks"][top.length];
        record(top, "drill check", [`the view has no control that drills to its ${kids}`]);
      }
      if (!drills) {
        // not geographic (or no drill in this module): check one place per level through the address
        const d0 = Object.keys(ref.divisions)[2];
        const dist = sc || ref.divisions[d0][0];
        const steps = sc ? [[DIV_OF[sc], sc, ref.taluks[sc][0]]] : [[d0], [d0, dist], [d0, dist, ref.taluks[dist][0]]];
        for (const p of steps) {
          await viaLink(p);
          await check(p, "address");
        }
        await (sc ? crumb(top) : crumb([]));
      } else if (sc) {
        await taluks(top, topCheck);
      } else {
        const divs = Object.keys(ref.divisions);
        let stateCheck = topCheck;
        const zDiv = [];
        for (let vi = 0; vi < divs.length; vi++) {
          const dv = divs[vi];
          const rd = await drill([dv], true);
          if (!rd) {
            zDiv.push(dv);
            continue;
          }
          // districts: the first DIST_PER_DIV that have rows (a zero district's bar is disabled, so it is skipped)
          const zDist = [];
          let done = 0,
            talukDone = false;
          for (const d of ref.divisions[dv]) {
            if (done >= DIST_PER_DIV) break;
            const r = await drill([dv, d], true);
            if (!r) {
              zDist.push(d);
              continue;
            }
            done++;
            if (!talukDone && r.via !== "address") {
              talukDone = true;
              await taluks([dv, d], r);
            }
            await (done % 2 ? crumb([dv]) : up([dv]));
          }
          allZero([dv], rd, zDist, ref.divisions[dv]);
          await (vi % 2 ? up([]) : crumb([]));
        }
        allZero([], stateCheck, zDiv, divs);
      }
      const cov = Object.entries(used).map(([k, n]) => `${k} ×${n}`).join(", ");
      const mine = results.filter((r) => r.module === mod.key);
      log(`  ${role} ${mod.key}: ${mine.filter((r) => r.ok).length}/${mine.length} checks passed${drills ? " · drilled with " + cov : " · no drill controls (checked through the address)"}`);
      if (drills) results.push({ role, module: mod.key, level: "-", place: "-", via: "coverage", ok: true, reasons: [], coverage: used });
    } catch (e) {
      record([], "error", ["test error: " + e.message.split("\n")[0]]);
      log(`  ${role} ${mod.key}: test error ${e.message.split("\n").slice(0, 12).join("\n    ")}`);
      await page.evaluate((h) => (location.hash = h), "#" + mod.key).catch(() => {});
    }
  }

  // Shell checks: a place outside the login's area in the address is refused; Back returns to the previous module.
  try {
    const shell = { role, module: "(shell)", level: "-", place: "-", via: "address", reasons: [] };
    const first = mods[0].key;
    await page.evaluate((h) => (location.hash = h), "#" + first);
    await settle(page, st, shell.reasons);
    const before = (await inspect(page)).crumbs.join(" › ");
    await page.evaluate((h) => (location.hash = h), "#" + first + (sc ? "/Bengaluru/Bengaluru Urban" : "/Nowhere/Atlantis"));
    await page.waitForFunction(() => /Outside your area/.test(document.querySelector(".toasts")?.textContent || ""), null, { timeout: 4000 }).catch(() => shell.reasons.push("no \"Outside your area\" toast for a place outside the login's area"));
    const after = await inspect(page);
    if (after.crumbs.join(" › ") !== before) shell.reasons.push(`a place outside the area moved the drill to "${after.crumbs.join(" › ")}"`);
    if (mods.length > 1) {
      await page.locator("nav.snav button").nth(1).click();
      await page.waitForFunction((k) => location.hash.startsWith("#" + k), mods[1].key, { timeout: 4000 }).catch(() => shell.reasons.push("module change did not update the address"));
      await page.goBack();
      await page.waitForFunction((k) => location.hash.split("/")[0] === "#" + k, first, { timeout: 4000 }).catch(() => shell.reasons.push("Back did not return to the previous module"));
    }
    // a link to a place opens there, also after a reload
    await page.evaluate((h) => (location.hash = h), "#" + first + "/Kalaburagi/Raichur/Sindhanur");
    await page.reload();
    await page.waitForSelector("nav.snav");
    const deep = sc ? ["Raichur", "Sindhanur"] : ["Karnataka", "Kalaburagi Division", "Raichur", "Sindhanur"];
    await page
      .waitForFunction((w) => JSON.stringify([...document.querySelectorAll(".crumbs button")].map((b) => b.textContent.trim())) === w, JSON.stringify(deep), { timeout: 6000 })
      .catch(() => shell.reasons.push("a link to Raichur › Sindhanur did not open at that taluk after a reload"));
    await settle(page, st, shell.reasons);
    shell.reasons.push(...st.problems.splice(0));
    shell.ok = !shell.reasons.length;
    results.push(shell);
  } catch (e) {
    results.push({ role, module: "(shell)", level: "-", place: "-", via: "-", ok: false, reasons: ["test error: " + e.message.split("\n")[0]] });
  }
  await s.ctx.close();
  return results;
}

// ---------- run ----------
const t0 = Date.now();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-proxy-server"] });
const queue = [...ROLES];
const all = [];
await Promise.all(
  Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) {
      const role = queue.shift();
      all.push(...(await runRole(browser, role, (l) => console.log(l))));
    }
  }),
);
await browser.close();

// summary: role × module × level
const checks = all.filter((r) => r.via !== "coverage" && !r.skipped);
const skipped = all.filter((r) => r.skipped);
const key = (r) => `${r.role}|${r.module}|${r.level}`;
const groups = new Map();
for (const r of checks) {
  const g = groups.get(key(r)) || { role: r.role, module: r.module, level: r.level, pass: 0, fail: 0, reasons: new Map() };
  r.ok ? g.pass++ : g.fail++;
  for (const x of r.reasons) g.reasons.set(x, (g.reasons.get(x) || 0) + 1);
  groups.set(key(r), g);
}
const rows = [...groups.values()].sort((a, b) => ROLES_ALL.indexOf(a.role) - ROLES_ALL.indexOf(b.role) || a.module.localeCompare(b.module));
const pad = (s, n) => String(s).padEnd(n);
console.log("\n" + pad("Role", 14) + pad("Module", 14) + pad("Level", 10) + pad("Result", 12) + "Reasons");
for (const g of rows) {
  const res = g.fail ? `FAIL ${g.fail}/${g.pass + g.fail}` : `pass ${g.pass}`;
  const why = [...g.reasons.entries()].slice(0, 3).map(([x, n]) => (n > 1 ? `${x} (×${n})` : x)).join("; ");
  console.log(pad(g.role, 14) + pad(g.module, 14) + pad(g.level, 10) + pad(res, 12) + why);
}
const failed = checks.filter((r) => !r.ok).length;
if (skipped.length) console.log(`\n${skipped.length} zero-row places skipped (their area bar is disabled, so they cannot be drilled to).`);
console.log(`\n${checks.length - failed}/${checks.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)} s (${MODE} mode). Report: ${REPORT}`);
fs.writeFileSync(
  REPORT,
  JSON.stringify(
    {
      base: BASE,
      mode: MODE,
      when: new Date().toISOString(),
      passed: checks.length - failed,
      skippedZeroRows: skipped.map((r) => `${r.role} ${r.module} ${r.place}`),
      failed,
      allowedEmpty: ALLOWED_EMPTY.map((a) => ({ module: a.module, role: a.role || "*", level: a.level || "*", text: a.re.source, why: a.why })),
      noDrillAllowed: NO_DRILL_OK,
      summary: rows.map((g) => ({ role: g.role, module: g.module, level: g.level, pass: g.pass, fail: g.fail, reasons: Object.fromEntries(g.reasons) })),
      checks: all,
    },
    null,
    1,
  ),
);
process.exit(failed ? 1 : 0);
