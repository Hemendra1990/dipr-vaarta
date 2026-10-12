"use client";
import { runAgent } from "@/lib/agents";
import { pct } from "@/lib/format";
import { CHILD_LVL, label, Node } from "@/lib/geo";
import { useApp } from "@/lib/store";

type Act = [string, () => void];

/** "What needs attention": three insights from the current slice, each with follow-up actions. */
export function Insights({ n }: { n: Node }) {
  const app = useApp();
  const { outreach: o, filters: f, drillTo, setTab, geo } = app;
  if (!o) return null;
  const kids = o.children(n),
    out: { tone: string; txt: React.ReactNode; acts: Act[] }[] = [];
  const plan = (t: Node) => () => runAgent(app, "planner", t);
  if (kids.length) {
    const ms = kids.map((c) => ({ c, m: o.M(c, f) }));
    const low = [...ms].sort((a, b) => a.m.readR - b.m.readR)[0];
    const hiC = [...ms].sort((a, b) => b.m.claimsPerL - a.m.claimsPerL)[0];
    const lowU = [...ms].sort((a, b) => a.m.uptake - b.m.uptake)[0];
    out.push({
      tone: "crit",
      txt: (
        <>
          <b>{label(low.c)}</b> has the lowest read rate among {CHILD_LVL[n.lvl]} at <b>{pct(low.m.readR)}</b>, against {pct(o.M(n, f).readR)} for {label(n)}.
          Messages are delivered but not opened.
        </>
      ),
      acts: [
        ["Plan a recovery campaign", plan(low.c)],
        ["Drill in", () => drillTo({ lvl: low.c.lvl, name: low.c.name })],
      ],
    });
    out.push({
      tone: "warn",
      txt: (
        <>
          <b>{label(hiC.c)}</b> sends the most tipline claims per subscriber ({hiC.m.claimsPerL.toFixed(0)} per lakh). Median clarification time there is{" "}
          <b>{hiC.m.tat.toFixed(1)} h</b>.
        </>
      ),
      acts: [
        ["Open tipline", () => setTab("tipline")],
        ["Drill in", () => drillTo({ lvl: hiC.c.lvl, name: hiC.c.name })],
      ],
    });
    out.push({
      tone: "ind",
      txt: (
        <>
          Scheme uptake index is weakest in <b>{label(lowU.c)}</b> ({lowU.m.uptake.toFixed(0)}). Pairing outreach there with the department&apos;s enrolment
          camps would test whether reach moves uptake.
        </>
      ),
      acts: [["Ask the planner agent", plan(lowU.c)]],
    });
  } else {
    const m = o.M(n, f),
      pm = o.M(geo.distNode(n.dist!), f);
    out.push({
      tone: m.readR < pm.readR ? "crit" : "good",
      txt: (
        <>
          Read rate in <b>{n.name}</b> is {pct(m.readR)}, {m.readR < pm.readR ? "below" : "above"} the {n.dist} average of {pct(pm.readR)}.
        </>
      ),
      acts: [["Plan a campaign", plan(n)]],
    });
    out.push({
      tone: "warn",
      txt: <>Most citizen questions here are about benefit credit delays. Route repeat questions to the department&apos;s grievance desk with the taluk tag.</>,
      acts: [["Open district offices", () => setTab("offices")]],
    });
  }
  const need = (l: string) => (l.startsWith("Open tipline") ? "tipline" : l.startsWith("Open district") ? "offices" : /plan/i.test(l) ? "ai" : null);
  const can = (a: Act) => {
    const m = need(a[0]);
    return !m || app.canSee(m);
  };
  return (
    <ul>
      {out.map((x, i) => (
        <li key={i}>
          <span className="bar" style={{ background: `var(--${x.tone === "ind" ? "indigo" : x.tone})` }} />
          <div>
            <p>{x.txt}</p>
            <div className="acts">
              {x.acts.filter(can).map(([l, fn]) => (
                <button key={l} className="btn" onClick={fn}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
