"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, token } from "@/lib/api";
import { CHILD_LVL, Geo, label, LVL, Node } from "@/lib/geo";
import { NAV, OUTREACH } from "@/lib/nav";
import { DEFAULT_FILTERS, Filters, Outreach, sig } from "@/lib/outreach";
import { AppCtx, AppState, clearApiCache, Toasts, useToasts } from "@/lib/store";
import type { AgentRun, Meta, User } from "@/lib/types";
import { useLiveUpdates } from "@/lib/updates";
import { ChangePassword } from "./PasswordDialog";
import { ThemeButton } from "./Theme";
import { ViewSwitch } from "@/views/ViewSwitch";

type Drill = { div: string | null; dist: string | null; tlk: string | null };

export function Console({ user, meta, fresh, onSignOut }: { user: User; meta: Meta; fresh?: boolean; onSignOut: () => void }) {
  const geo = useMemo(() => new Geo(meta.reference), [meta]);
  const allowedTabs = useMemo(() => NAV.flatMap((g) => g.items.map((i) => i[0])).filter((k) => user.modules.includes(k)), [user]);
  const canSee = useCallback((k: string) => user.modules.includes(k), [user]);
  const sc = user.district;

  // The landing module is the first one in the role's own list (prototype allowedTabs()[0]), e.g. Spend for Accounts.
  const homeTab = useMemo(() => user.modules.find((k) => allowedTabs.includes(k)) ?? allowedTabs[0], [user, allowedTabs]);
  // The address names the module and the drill position: #tipline or #tipline/Kalaburagi/Raichur/Sindhanur.
  const fromHash = () => parseHash(typeof window !== "undefined" ? window.location.hash : "", geo, sc);
  const initialTab = () => {
    const h = fromHash().tab;
    return allowedTabs.includes(h) ? h : homeTab;
  };
  const pinned: Drill = sc ? { div: geo.DIV_OF[sc], dist: sc, tlk: null } : { div: null, dist: null, tlk: null };
  const [tab, setTabRaw] = useState<string>(initialTab);
  const [drill, setDrill] = useState<Drill>(() => fromHash().drill ?? pinned);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [version, setVersion] = useState(0);
  const [agent, setAgent] = useState<AgentRun | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [outreach, setOutreach] = useState<Outreach | null>(null);
  const { toasts, toast } = useToasts();
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (fresh) toast("Signed in", `${user.title} · ${user.scope}`);
  }, [fresh, user, toast]);

  const hasOutreach = allowedTabs.some((t) => OUTREACH.has(t));
  useEffect(() => {
    if (!hasOutreach) return;
    api.get<Array<Record<string, unknown>>>("/outreach/base").then(
      (b) => setOutreach(new Outreach(geo, b, meta.reference.schemes, new Date(meta.calendar.asOf + "T00:00:00"))),
      () => toast("Could not load outreach data", "Reload the page to try again."),
    );
  }, [hasOutreach, geo, meta, toast]);

  // Each module has its own URL (#tipline); browser back / forward move between the modules visited.
  // Drilling only rewrites the current entry, so Back still goes to the previous module, at the place it was left.
  const drillRef = useRef(drill);
  drillRef.current = drill;
  const setTab = useCallback(
    (t: string) => {
      if (!allowedTabs.includes(t)) return;
      setTabRaw(t);
      const h = hashFor(t, drillRef.current);
      if (window.location.hash !== h) history.pushState(null, "", h);
      window.scrollTo(0, 0);
    },
    [allowedTabs],
  );
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    // the address bar always names the module and place in view
    const h = hashFor(tab, drill);
    if (window.location.hash !== h) history.replaceState(null, "", h);
  }, [tab, drill]);
  useEffect(() => {
    // an unknown or forbidden module, or a place outside the login's area, falls back to what is on screen
    const onNav = () => {
      const p = parseHash(window.location.hash, geo, sc);
      if (p.tab && !allowedTabs.includes(p.tab)) {
        toast("Not available", "Your login cannot open that module.");
        history.replaceState(null, "", hashFor(tabRef.current, drillRef.current));
        return;
      }
      if (p.tab && p.tab !== tabRef.current) {
        setTabRaw(p.tab);
        window.scrollTo(0, 0);
      }
      if (p.drill && hashFor("", p.drill) !== hashFor("", drillRef.current)) setDrill(p.drill);
      else if (!p.drill && p.path) toast("Outside your area", sc ? `This login covers ${sc} district only.` : "That place is not in Karnataka's district list.");
      if (!p.tab || !p.drill) history.replaceState(null, "", hashFor(p.tab && allowedTabs.includes(p.tab) ? p.tab : tabRef.current, p.drill ?? drillRef.current));
    };
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, [allowedTabs, toast, geo, sc]);

  const node: Node = useMemo(() => {
    if (drill.tlk) return { lvl: "tlk", name: drill.tlk, div: drill.div!, dist: drill.dist! };
    if (drill.dist) return geo.distNode(drill.dist);
    if (drill.div) return { lvl: "div", name: drill.div, div: drill.div };
    return { lvl: "state", name: "Karnataka" };
  }, [drill, geo]);

  const drillTo = useCallback(
    (o: { lvl: Node["lvl"]; name?: string }) => {
      if (sc && (o.lvl === "state" || o.lvl === "div" || (o.lvl === "dist" && o.name !== sc))) {
        toast("Outside your area", `This login covers ${sc} district only.`);
        return;
      }
      // names that are not places (a stale chart, a typo in a link) are ignored rather than shown as empty views
      if (o.lvl === "state") setDrill({ div: null, dist: null, tlk: null });
      else if (o.lvl === "div") {
        if (o.name && geo.DIVS[o.name]) setDrill({ div: o.name, dist: null, tlk: null });
      } else if (o.lvl === "dist") {
        if (o.name && geo.DIV_OF[o.name]) setDrill({ div: geo.DIV_OF[o.name], dist: o.name, tlk: null });
      } else if (o.lvl === "tlk") setDrill((d) => (d.dist && o.name && (geo.TALUKS[d.dist] || []).includes(o.name) ? { ...d, tlk: o.name } : d));
    },
    [sc, geo, toast],
  );

  const drillUp = useCallback(() => {
    setDrill((d) => {
      if (d.tlk) return { ...d, tlk: null };
      if (sc) return d;
      if (d.dist) return { ...d, dist: null };
      if (d.div) return { div: null, dist: null, tlk: null };
      return d;
    });
  }, [sc]);

  const goUpload = useCallback(
    (ds: string) => {
      setUploadTarget(ds + "#" + Date.now());
      setTab("upload");
    },
    [setTab],
  );

  const ctx: AppState = {
    user, meta, geo, tab, setTab, node, drillTo, drillUp, filters, setFilters, toast, canSee, allowedTabs, version,
    invalidate: () => {
      clearApiCache();
      setVersion((v) => v + 1);
    },
    outreach, agent, setAgent, goUpload, uploadTarget,
  };

  const crumbs: { i: number; n: Node }[] = [];
  if (!sc) {
    crumbs.push({ i: 0, n: { lvl: "state", name: "Karnataka" } });
    if (drill.div) crumbs.push({ i: 1, n: { lvl: "div", name: drill.div, div: drill.div } });
  }
  if (drill.dist) crumbs.push({ i: 2, n: geo.distNode(drill.dist) });
  if (drill.tlk) crumbs.push({ i: 3, n: node });
  const gotoCrumb = (i: number) => {
    if (i === 0) drillTo({ lvl: "state" });
    else if (i === 1) drillTo({ lvl: "div", name: drill.div! });
    else if (i === 2) drillTo({ lvl: "dist", name: drill.dist! });
  };
  const unseen = useLiveUpdates({ user, tab, toast, invalidate: ctx.invalidate });
  const badge = (k: string) => (k === "tipline" || k === "offices" ? unseen[k] : 0);
  const isOutreach = OUTREACH.has(tab);
  const navLabel = (k: string, l: string) => (k === "spend" && user.vendorId ? "My orders & payments" : l);

  return (
    <AppCtx.Provider value={ctx}>
      <div id="app">
        <header className="top">
          <div className="brand">
            <div className="flag" aria-hidden="true" />
            <div>
              <div className="nm">
                Vaarta <span>360</span>
              </div>
              <div className="sub">
                <span className="kn">ವಾರ್ತಾ ಮತ್ತು ಸಾರ್ವಜನಿಕ ಸಂಪರ್ಕ ಇಲಾಖೆ</span> · DIPR Karnataka
              </div>
            </div>
          </div>
          <div className="grow" />
          <div className="who">
            <span className="ski sm" style={{ background: user.color }}>
              {user.icon}
            </span>
            <span>
              <b>{user.title}</b>
              <small>{user.scope}</small>
            </span>
          </div>
          <button className="iconbtn" title="Change your password" onClick={() => setPwOpen(true)}>
            Password
          </button>
          <ThemeButton />
          <button
            className="iconbtn"
            onClick={() => {
              token.clear();
              onSignOut();
            }}
          >
            Sign out
          </button>
        </header>
        {pwOpen && (
          <ChangePassword
            onClose={() => setPwOpen(false)}
            onDone={() => {
              setPwOpen(false);
              toast("Password changed", "Use the new password next time you sign in.");
            }}
          />
        )}
        <div className="appgrid">
          <nav className="snav" aria-label="Modules">
            {NAV.map((g) => {
              const its = g.items.filter((i) => canSee(i[0]));
              if (!its.length) return null;
              return (
                <div className="ng" key={g.g}>
                  <span className="ngl">{g.g}</span>
                  {its.map(([k, l]) => (
                    <button key={k} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
                      {navLabel(k, l)}
                      {badge(k) > 0 && (
                        <span className="badge" aria-label={`${badge(k)} new`}>
                          {badge(k)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <main className="mainc">
            <select className="navsel" aria-label="Go to module" value={tab} onChange={(e) => setTab(e.target.value)}>
              {NAV.map((g) => {
                const its = g.items.filter((i) => canSee(i[0]));
                return its.length ? (
                  <optgroup key={g.g} label={g.g}>
                    {its.map(([k, l]) => (
                      <option key={k} value={k}>
                        {navLabel(k, l)}
                        {badge(k) > 0 ? ` (${badge(k)} new)` : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            <div className="cbar">
              <div className="crumbs">
                {crumbs.map((p, k) => (
                  <span key={p.i} style={{ display: "contents" }}>
                    {k > 0 && <span className="sep">›</span>}
                    <button onClick={p.i < 3 ? () => gotoCrumb(p.i) : undefined} aria-current={k === crumbs.length - 1 ? "page" : undefined}>
                      {label(p.n)}
                    </button>
                  </span>
                ))}
                <span className="lvl">{LVL[node.lvl]} view</span>
                {sc && <span className="chip warn">Your district</span>}
              </div>
              <button className="up" disabled={node.lvl === "state" || (!!sc && !drill.tlk)} onClick={drillUp}>
                ↑ Drill up
              </button>
              {isOutreach && <Slicers filters={filters} setFilters={setFilters} schemes={Object.keys(meta.reference.schemes)} />}
            </div>
            <div id="view">
              <ViewSwitch key={tab} />
            </div>
            <div className="foot-note">
              Sample data generated for demonstration. Vendor names are codes, not real outlets. Amounts are in ₹ lakh unless shown in crore. Financial year runs
              April to March; FY {meta.calendar.curFy} data covers April to {monthName(meta.calendar.lastYm)}.
            </div>
          </main>
        </div>
      </div>
      <Toasts toasts={toasts} />
    </AppCtx.Provider>
  );
}

const monthName = (ym: string) =>
  ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+ym.slice(5) - 1];

function Slicers({ filters, setFilters, schemes }: { filters: Filters; setFilters: (f: Filters) => void; schemes: string[] }) {
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, [k]: e.target.value });
  return (
    <div className="slicers">
      <div className="slicer">
        <label htmlFor="f-period">Period</label>
        <select id="f-period" value={filters.period} onChange={set("period")}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last quarter</option>
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="f-scheme">Scheme / campaign</label>
        <select id="f-scheme" value={filters.scheme} onChange={set("scheme")}>
          {schemes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="f-lang">Language</label>
        <select id="f-lang" value={filters.lang} onChange={set("lang")}>
          {["All", "Kannada", "English", "Urdu", "Tulu", "Konkani"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="f-aud">Audience</label>
        <select id="f-aud" value={filters.aud} onChange={set("aud")}>
          {["All", "Citizens", "Journalists", "Officers"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {sig(filters) !== "30d|All|All|All" && (
        <button className="clearf" onClick={() => setFilters(DEFAULT_FILTERS)}>
          Clear filters
        </button>
      )}
    </div>
  );
}

export { CHILD_LVL };

const enc = (x: string) => encodeURIComponent(x).replace(/%20/g, "+");
const dec = (x: string) => {
  try {
    return decodeURIComponent(x.replace(/\+/g, " "));
  } catch {
    return "";
  }
};

/** "#tipline/Kalaburagi/Raichur/Sindhanur" for a module and a drill position. */
function hashFor(tab: string, d: Drill): string {
  return "#" + [tab, d.div, d.dist, d.tlk].filter((x): x is string => !!x).map(enc).join("/");
}

/**
 * Reads the module and place from the address. drill is null when the address names no place (path empty) or a place
 * that does not exist or lies outside the login's district (path set); a district login always gets its district.
 */
function parseHash(h: string, geo: Geo, sc: string | null | undefined): { tab: string; path: boolean; drill: Drill | null } {
  const [tab = "", ...rest] = h.replace(/^#/, "").split("/").map(dec);
  const [div, dist, tlk] = rest;
  const path = rest.some(Boolean);
  const bad = { tab, path, drill: null };
  if (!path) return bad;
  if (!geo.DIVS[div]) return bad;
  if (dist && geo.DIV_OF[dist] !== div) return bad;
  if (tlk && (!dist || !(geo.TALUKS[dist] || []).includes(tlk))) return bad;
  if (sc && dist !== sc) return bad;
  return { tab, path, drill: { div, dist: dist || null, tlk: tlk || null } };
}
