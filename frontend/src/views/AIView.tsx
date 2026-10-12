"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LiveRun, runAgent } from "@/lib/agents";
import { fmt, lakh, pct } from "@/lib/format";
import { label, Node } from "@/lib/geo";
import { AppState, useApi, useApp } from "@/lib/store";
import type { AgentInfo, AgentRun, SpendRow } from "@/lib/types";

const SUGS = ["Which districts have the lowest read rate?", "Where are most tipline claims coming from?", "Compare Raichur and Mysuru", "Where is ad spend highest per person?", "Lowest press pickup"];

/** Plain-language answers computed from the same data as the dashboards (prototype answer()). */
function answer(app: AppState, q: string, spend: SpendRow[] | undefined): React.ReactNode {
  const t = q.toLowerCase(),
    { outreach: o, node, filters: f, geo, meta } = app;
  if (/spend|budget|vendor|channel|campaign|money|cost/.test(t) && !/per person|per 1,000|per capita/.test(t)) {
    if (!spend) return <p>Spend data is not part of your login&apos;s access.</p>;
    const rows = spend.filter((r) => r.status !== "RO issued" && r.fy === meta.calendar.curFy);
    const by = (k: keyof SpendRow) => {
      const m: Record<string, number> = {};
      rows.forEach((r) => (m[r[k] as string] = (m[r[k] as string] || 0) + r.amount));
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3);
    };
    const cur = meta.calendar.curFy;
    if (/vendor/.test(t))
      return (
        <>
          <p>Top vendors in {cur}:</p>
          <ol>{by("vendorId").map(([k, v]) => <li key={k}>{k}: {lakh(v)}</li>)}</ol>
        </>
      );
    if (/channel/.test(t))
      return (
        <>
          <p>Spend by channel in {cur}:</p>
          <ol>{by("channel").map(([k, v]) => <li key={k}>{k}: {lakh(v)}</li>)}</ol>
        </>
      );
    return (
      <>
        <p>Biggest campaigns in {cur} so far:</p>
        <ol>{by("campaign").map(([k, v]) => <li key={k}>{k}: {lakh(v)}</li>)}</ol>
        <p>Open Spend analytics for trends and budget comparison.</p>
      </>
    );
  }
  if (!o) return <p>Outreach data is still loading.</p>;
  const n = node;
  let kids = o.children(n);
  if (!kids.length) kids = o.children(geo.distNode(n.dist!));
  const ms = kids.map((c) => ({ c, m: o.M(c, f) }));
  const per = f.period === "7d" ? "last 7 days" : f.period === "90d" ? "last quarter" : "last 30 days";
  const found = o.districts.filter((d) => t.includes(d.toLowerCase()));
  if (found.length >= 2) {
    const [a, b] = found.map((d) => ({ d, m: o.M(geo.distNode(d), f) }));
    return (
      <>
        <p>
          <b>{a.d}</b> vs <b>{b.d}</b>, {per}:
        </p>
        <ol>
          <li>Read rate {pct(a.m.readR)} vs {pct(b.m.readR)}</li>
          <li>Subscribers {fmt(a.m.subs)} vs {fmt(b.m.subs)}</li>
          <li>Claims per lakh {a.m.claimsPerL.toFixed(0)} vs {b.m.claimsPerL.toFixed(0)}</li>
          <li>Uptake index {a.m.uptake.toFixed(0)} vs {b.m.uptake.toFixed(0)}</li>
        </ol>
      </>
    );
  }
  if (found.length === 1) {
    app.drillTo({ lvl: "dist", name: found[0] });
    const m = o.M(geo.distNode(found[0]), f);
    return (
      <p>
        Opened <b>{found[0]}</b>. Read rate {pct(m.readR)}, {fmt(m.subs)} subscribers, {fmt(m.claims)} claims, uptake index {m.uptake.toFixed(0)}.
      </p>
    );
  }
  const list = (title: string, s: { c: Node; m: Record<string, number> }[], fn: (x: { c: Node; m: Record<string, number> }) => string) => (
    <>
      <p>{title}</p>
      <ol>{s.map((x) => <li key={x.c.name}>{label(x.c)}: {fn(x)}</li>)}</ol>
    </>
  );
  if (/read|dark|open|weak|low/.test(t) && !/pickup|press/.test(t))
    return list(`Lowest read rates in ${label(n)}:`, [...ms].sort((a, b) => a.m.readR - b.m.readR).slice(0, 3), (x) => pct(x.m.readR));
  if (/claim|fake|rumou?r|misinfo|tipline/.test(t))
    return list("Most tipline claims per lakh subscribers:", [...ms].sort((a, b) => b.m.claimsPerL - a.m.claimsPerL).slice(0, 3), (x) => `${x.m.claimsPerL.toFixed(0)} (clarified in ${x.m.tat.toFixed(1)} h)`);
  if (/spend|ad|advert/.test(t))
    return list("Highest advertising spend per 1,000 people:", [...ms].sort((a, b) => b.m.spendPer1k - a.m.spendPer1k).slice(0, 3), (x) => `₹${x.m.spendPer1k.toFixed(0)} · uptake ${x.m.uptake.toFixed(0)}`);
  if (/press|journalist|pickup|release/.test(t)) return list("Lowest press pickup rates:", [...ms].sort((a, b) => a.m.pickup - b.m.pickup).slice(0, 3), (x) => pct(x.m.pickup, 0));
  if (/uptake|scheme/.test(t)) return list("Weakest scheme uptake:", [...ms].sort((a, b) => a.m.uptake - b.m.uptake).slice(0, 3), (x) => x.m.uptake.toFixed(0));
  return <p>I can answer questions about read rates, tipline claims, ad spend, press pickup and scheme uptake, or compare two districts. Try one of the suggestions below.</p>;
}

export function AIView() {
  const app = useApp();
  const { node: n, agent, setAgent, toast, invalidate, canSee } = app;
  const agents = useApi<AgentInfo[]>("/agents").data ?? [];
  const spend = useApi<SpendRow[]>(canSee("spend") ? "/spend/orders" : null).data;
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState<React.ReactNode>(null);
  const [, tick] = useState(0);
  const run = agent as LiveRun | null;
  const shown = run ? Math.min(run.steps.length, Math.floor((Date.now() - run.localStart - 200) / 520) + 1) : 0;
  const done = !!run && shown >= run.steps.length && Date.now() - run.localStart > 200 + run.steps.length * 520;
  useEffect(() => {
    if (!run || done) return;
    const t = setInterval(() => tick((x) => x + 1), 260);
    return () => clearInterval(t);
  }, [run, done]);

  const ask = (q: string) => {
    setAskQ(q);
    if (q.trim()) setAskA(answer(app, q, spend));
  };
  const decide = async (approve: boolean) => {
    if (!run) return;
    try {
      const r = await api.post<AgentRun>(`/agents/runs/${run.id}/${approve ? "approve" : "reject"}`, approve ? {} : { comment: "Sent back from the console" });
      if (r.toast) toast(r.toast.title, r.toast.body);
      invalidate();
      setAgent(approve ? ({ ...r, localStart: run.localStart } as LiveRun) : null);
    } catch (e) {
      toast("Could not record the decision", (e as Error).message);
    }
  };
  const lines = run ? run.steps.slice(0, Math.max(0, shown)) : [];

  return (
    <div className="grid">
      <div className="card s12">
        <div className="ch">
          <div>
            <h3>Ask Vaarta 360</h3>
            <p>Plain-language questions about the current view ({label(n)}). Answers are computed from the same data as the dashboards.</p>
          </div>
          <span className="aiflag">Conversational analytics</span>
        </div>
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            ask(askQ.trim());
          }}
        >
          <input value={askQ} onChange={(e) => setAskQ(e.target.value)} placeholder="e.g. Which districts have the lowest read rate?" aria-label="Ask a question" />
          <button className="btn pri" type="submit">
            Ask
          </button>
        </form>
        <div className="sugs">
          {SUGS.map((s) => (
            <button key={s} onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
        {askA && <div className="answer">{askA}</div>}
      </div>
      <div className={`card ${run ? "s7" : "s12"}`}>
        <div className="ch">
          <div>
            <h3>Agents working for DIPR</h3>
            <p>Each agent prepares work and stops for a named officer&apos;s approval</p>
          </div>
        </div>
        <div className="agents">
          {agents.map((d) => {
            const on = run?.agentId === d.id;
            return (
              <div key={d.id} className={`agent ${on ? "on" : ""}`}>
                <h4>{d.name}</h4>
                <p>{d.does}</p>
                <div className="g">
                  <span className="chip good">Guardrail</span>
                  <span>{d.guard}</span>
                </div>
                <div className="foot">
                  <small>{on ? (done ? (run!.status === "Approved" ? "Approved" : "Waiting for approval") : "Running…") : "Ready"}</small>
                  <button className={`btn ${on ? "" : "pri"}`} onClick={() => runAgent(app, d.id)}>
                    {on ? "Run again" : "Run"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {run && (
        <div className="card s5">
          <div className="ch">
            <div>
              <h3>{run.name}</h3>
              <p>{done ? "Finished. Review before anything goes out." : "Working…"}</p>
            </div>
            <span className={`chip ${done ? "warn" : "ind"}`}>{done ? (run.status === "Approved" ? "Approved" : "Needs approval") : "Running"}</span>
          </div>
          <pre className="runlog">
            {lines.map((l, i) => {
              const last = i === lines.length - 1 && !done;
              return (
                <span key={i}>
                  <span className={last ? "wait" : "ok"}>{last ? "…" : "✓"}</span> {l}
                  {i < lines.length - 1 ? "\n" : ""}
                </span>
              );
            })}
          </pre>
          {done && (
            <div className="out">
              {/* Agent output is HTML generated by the server with every inserted value escaped. */}
              <div dangerouslySetInnerHTML={{ __html: run.output }} />
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {run.status === "Approved" ? (
                  <span className="chip good">Approved by {run.decidedBy} · just now</span>
                ) : (
                  <>
                    <button className="btn pri" onClick={() => decide(true)}>
                      {run.approveLabel}
                    </button>
                    <button className="btn" onClick={() => decide(false)}>
                      Send back with comments
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
