// Starting an agent run: the server prepares the work; the console sends the area in view and its weakest area.
import { api } from "./api";
import { label, Node } from "./geo";
import type { AppState } from "./store";
import type { AgentRun } from "./types";

export type LiveRun = AgentRun & { localStart: number };

export function agentContext(app: AppState, target?: string | null) {
  const o = app.outreach;
  const n = app.node;
  if (!o) return { areaLabel: label(n) };
  const kids = o.children(n),
    ms = kids.map((c) => ({ c, m: o.M(c, app.filters) }));
  const low = ms.length ? [...ms].sort((a, b) => a.m.readR - b.m.readR)[0] : { c: n, m: o.M(n, app.filters) };
  let tn: Node = low.c;
  if (target) {
    if (app.geo.DIV_OF[target] && o.districts.includes(target)) tn = app.geo.distNode(target);
    else if (app.geo.DIVS[target]) tn = { lvl: "div", name: target, div: target };
    else tn = n.lvl === "dist" && kids.some((k) => k.name === target) ? kids.find((k) => k.name === target)! : n;
  }
  const tm = target ? o.M(tn, app.filters) : low.m;
  return {
    areaLabel: label(n), lowLabel: label(low.c), lowReadR: low.m.readR,
    targetLabel: target || low.c.name, targetReadR: tm.readR, targetUptake: tm.uptake, targetSubs: tm.subs,
  };
}

export async function runAgent(app: AppState, id: string, target?: string | null) {
  const ctx = agentContext(app, target);
  app.setTab("ai");
  try {
    const run = await api.post<AgentRun>(`/agents/${id}/runs`, { target: target ?? ctx.targetLabel ?? null, context: ctx });
    app.setAgent({ ...run, localStart: Date.now() } as LiveRun);
  } catch (e) {
    app.toast("Agent could not start", (e as Error).message);
  }
}
