// Starting an agent run: the server prepares the work; the console sends the area in view and its weakest area.
import { api } from "./api";
import { label, Node } from "./geo";
import type { AppState } from "./store";
import type { AgentRun } from "./types";

export type LiveRun = AgentRun & { localStart: number };

/**
 * Resolves the planner's target to a drill node. Insights pass the node itself; a bare name is looked up the way the
 * prototype did, except that a child of the area in view wins (so the "Raichur" taluk is not read as the district).
 */
function resolve(app: AppState, target: Node | string, fallback: Node): Node {
  if (typeof target !== "string") return target;
  const o = app.outreach!,
    n = app.node;
  const kid = o.children(n).find((k) => k.name === target);
  if (kid) return kid;
  if (n.name === target) return n;
  if (app.geo.DIV_OF[target] && o.districts.includes(target)) return app.geo.distNode(target);
  if (app.geo.DIVS[target]) return { lvl: "div", name: target, div: target };
  return fallback;
}

export function agentContext(app: AppState, target?: Node | string | null) {
  const o = app.outreach;
  const n = app.node;
  if (!o) return { areaLabel: label(n) };
  const kids = o.children(n),
    ms = kids.map((c) => ({ c, m: o.M(c, app.filters) }));
  const low = ms.length ? [...ms].sort((a, b) => a.m.readR - b.m.readR)[0] : { c: n, m: o.M(n, app.filters) };
  const tn = target ? resolve(app, target, n) : low.c;
  const tm = target ? o.M(tn, app.filters) : low.m;
  return {
    areaLabel: label(n), lowLabel: label(low.c), lowReadR: low.m.readR,
    targetLabel: tn.name, targetDistrict: tn.dist ?? null, targetReadR: tm.readR, targetUptake: tm.uptake, targetSubs: tm.subs,
  };
}

export async function runAgent(app: AppState, id: string, target?: Node | string | null) {
  const ctx = agentContext(app, target);
  app.setTab("ai");
  try {
    const run = await api.post<AgentRun>(`/agents/${id}/runs`, { target: id === "planner" ? (ctx.targetLabel ?? null) : null, context: ctx });
    app.setAgent({ ...run, localStart: Date.now() } as LiveRun);
  } catch (e) {
    app.toast("Agent could not start", (e as Error).message);
  }
}
