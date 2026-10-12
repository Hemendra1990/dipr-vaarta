"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LiveRun, runAgent } from "@/lib/agents";
import { ago, fmt, lakh, pct } from "@/lib/format";
import { label, Node } from "@/lib/geo";
import { AppState, useApi, useApp } from "@/lib/store";
import type { AgentCard, AgentRunFull, SpendRow } from "@/lib/types";

const SUGS = ["Which districts have the lowest read rate?", "Where are most tipline claims coming from?", "Compare Raichur and Mysuru", "Where is ad spend highest per person?", "Lowest press pickup"];

/** Plain-language answers computed from the same data as the dashboards (prototype answer()). */
function answer(app: AppState, q: string, spend: SpendRow[] | undefined): React.ReactNode {
  const t = q.toLowerCase(),
    { outreach: o, node, filters: f, geo, meta } = app;
  if (/spend|budget|vendor|channel|campaign|money|cost/.test(t) && !/per person|per 1,000|per capita/.test(t)) {
    if (!spend) return <p>Spend data is not part of your login&apos;s access.</p>;
    const rows = spend.filter((r) => r.status !== "RO issued" && r.fy === meta.calendar.curFy && geo.geoOk(r, node));
    if (!rows.length) return <p>No spend booked in {label(node)} in {meta.calendar.curFy} yet.</p>;
    const by = (k: keyof SpendRow) => {
      const m: Record<string, number> = {};
      rows.forEach((r) => (m[r[k] as string] = (m[r[k] as string] || 0) + r.amount));
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3);
    };
    const cur = meta.calendar.curFy;
    if (/vendor/.test(t))
      return (
        <>
          <p>Top vendors in {label(node)}, {cur}:</p>
          <ol>{by("vendorId").map(([k, v]) => <li key={k}>{k}: {lakh(v)}</li>)}</ol>
        </>
      );
    if (/channel/.test(t))
      return (
        <>
          <p>Spend by channel in {label(node)}, {cur}:</p>
          <ol>{by("channel").map(([k, v]) => <li key={k}>{k}: {lakh(v)}</li>)}</ol>
        </>
      );
    return (
      <>
        <p>Biggest campaigns in {label(node)}, {cur} so far:</p>
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
  // A taluk of the district in view opens that taluk (the prototype only knew district names).
  const tk = n.dist ? o.children(geo.distNode(n.dist)).find((k) => k.name !== n.dist && t.includes(k.name.toLowerCase())) : undefined;
  if (tk) {
    app.drillTo({ lvl: "tlk", name: tk.name });
    const m = o.M(tk, f);
    return (
      <p>
        Opened <b>{tk.name}</b> taluk, {tk.dist}. Read rate {pct(m.readR)}, {fmt(m.subs)} subscribers, {fmt(m.claims)} claims, uptake index {m.uptake.toFixed(0)}.
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

const STEP_MS = 520;
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const statusTone = (s: string) => (s === "Approved" ? "good" : s === "Needs approval" ? "warn" : s === "Sent back" ? "crit" : "");
const when = (iso: string | null | undefined) => (!iso ? "" : Date.now() - Date.parse(iso) < 60_000 ? "just now" : ago(iso) + " ago");

export function AIView() {
  const app = useApp();
  const { node: n, agent, setAgent, toast, invalidate, canSee, user } = app;
  const cards = useApi<AgentCard[]>("/agents").data ?? [];
  const spend = useApi<SpendRow[]>(canSee("spend") ? "/spend/orders" : null).data;
  const run = agent as (LiveRun & Partial<AgentRunFull>) | null;
  const histKey = run ? `${run.id}-${run.status}` : "0";
  const history = useApi<AgentRunFull[]>(`/agents/runs?k=${histKey}`).data;
  const inbox = useApi<AgentRunFull[]>(user.role === "COMMISSIONER" ? `/agents/inbox?k=${histKey}` : null).data;
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState<React.ReactNode>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const step = reduceMotion() ? 60 : STEP_MS;
  const shown = run ? Math.min(run.steps.length, Math.floor((Date.now() - run.localStart - 200) / step) + 1) : 0;
  const done = !!run && shown >= run.steps.length && Date.now() - run.localStart > 200 + run.steps.length * step;
  useEffect(() => {
    if (!run || done) return;
    const t = setInterval(() => tick((x) => x + 1), step / 2);
    return () => clearInterval(t);
  }, [run, done, step]);
  useEffect(() => setComment(null), [run?.id]);

  const card = run ? cards.find((c) => c.id === run.agentId) : undefined;
  const ask = (q: string) => {
    setAskQ(q);
    if (q.trim()) setAskA(answer(app, q, spend));
  };
  const open = (r: AgentRunFull) => {
    setAgent({ ...r, localStart: 0 } as LiveRun);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const decide = async (approve: boolean) => {
    if (!run || busy) return;
    if (!approve && !(comment ?? "").trim()) {
      toast("Add a comment", "Write what the agent should change before sending it back.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<AgentRunFull>(`/agents/runs/${run.id}/${approve ? "approve" : "reject"}`, approve ? {} : { comment: comment!.trim() });
      if (r.toast) toast(r.toast.title, r.toast.body);
      invalidate();
      setAgent(approve ? ({ ...r, localStart: 0 } as LiveRun) : null);
    } catch (e) {
      toast("Could not record the decision", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const lines = run ? run.steps.slice(0, Math.max(0, shown)) : [];
  const decidedNote = (r: Partial<AgentRunFull>) => when(r.decidedAt) || "just now";

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
          {cards.map((d) => {
            const on = run?.agentId === d.id;
            return (
              <div key={d.id} className={`agent ${on ? "on" : ""} ${d.canRun ? "" : "off"}`}>
                <h4>{d.name}</h4>
                <p>{d.does}</p>
                <div className="g">
                  <span className="chip good">Guardrail</span>
                  <span>{d.guard}</span>
                </div>
                {!d.canRun && <small className="agnote">{d.note}</small>}
                <div className="foot">
                  <small>
                    {on
                      ? done
                        ? run!.status === "Approved"
                          ? "Approved"
                          : run!.status === "Needs approval"
                            ? "Waiting for approval"
                            : run!.status
                        : "Running…"
                      : d.canRun
                        ? "Ready"
                        : "Not in your access"}
                  </small>
                  <button className={`btn ${on ? "" : "pri"}`} disabled={!d.canRun} onClick={() => runAgent(app, d.id)}>
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
            <span className={`chip ${done ? (run.status === "Approved" ? "good" : "warn") : "ind"}`}>
              {done ? (run.status === "Needs approval" ? "Needs approval" : run.status) : "Running"}
            </span>
          </div>
          <pre className="runlog" aria-live="polite">
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
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                {run.status === "Approved" ? (
                  <>
                    <span className="chip good">
                      Approved by {run.decidedBy} · {decidedNote(run)}
                    </span>
                    {run.effect && <small className="ageff">{run.effect}</small>}
                  </>
                ) : run.status === "Needs approval" ? (
                  comment === null ? (
                    <>
                      <button className="btn pri" disabled={busy || card?.canApprove === false} onClick={() => decide(true)}>
                        {run.approveLabel}
                      </button>
                      <button className="btn" disabled={busy} onClick={() => setComment("")}>
                        Send back with comments
                      </button>
                      {card && !card.canApprove && card.canRun && <small className="ageff">{card.note}</small>}
                    </>
                  ) : (
                    <div className="agback">
                      <label htmlFor="ag-comment">What should the agent change?</label>
                      <textarea id="ag-comment" rows={3} maxLength={1000} value={comment} autoFocus onChange={(e) => setComment(e.target.value)} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn pri" disabled={busy || !comment.trim()} onClick={() => decide(false)}>
                          Send back
                        </button>
                        <button className="btn" onClick={() => setComment(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    <span className={`chip ${statusTone(run.status)}`}>
                      {run.status}
                      {run.decidedBy ? ` by ${run.decidedBy}` : ""}
                    </span>
                    {run.comment && <small className="ageff">“{run.comment}”</small>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {inbox && inbox.length > 0 && (
        <div className="card s12">
          <div className="ch">
            <div>
              <h3>Reports sent to you</h3>
              <p>Approved agent output addressed to the Commissioner. Select one to read it.</p>
            </div>
            <span className="chip ind">{inbox.length}</span>
          </div>
          <RunTable rows={inbox} onOpen={open} sel={run?.id} />
        </div>
      )}
      <div className="card s12">
        <div className="ch">
          <div>
            <h3>Run history</h3>
            <p>Last 20 runs of the agents you can use, with who decided and what changed. Select a run to see its output.</p>
          </div>
        </div>
        {history === undefined ? (
          <div className="empty">Loading run history…</div>
        ) : history.length ? (
          <RunTable rows={history} onOpen={open} sel={run?.id} />
        ) : (
          <div className="empty">No agent runs yet. Run an agent above; every run is kept here with its approver.</div>
        )}
      </div>
    </div>
  );
}

function RunTable({ rows, onOpen, sel }: { rows: AgentRunFull[]; onOpen: (r: AgentRunFull) => void; sel?: number }) {
  return (
    <div className="tbw">
      <table className="tb">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Area</th>
            <th>Started</th>
            <th>Status</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`click ${sel === r.id ? "on" : ""}`}
              tabIndex={0}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(r);
                }
              }}
            >
              <td>
                <span className="nm">{r.name}</span>
                {r.target && <div><small style={{ color: "var(--muted)" }}>Target: {r.target}</small></div>}
              </td>
              <td>{r.area || "—"}</td>
              <td>
                {r.startedBy}
                <div><small style={{ color: "var(--muted)" }}>{when(r.startedAt)}</small></div>
              </td>
              <td>
                <span className={`chip ${statusTone(r.status)}`}>{r.status}</span>
                {r.decidedBy && r.status !== "Superseded" && <div><small style={{ color: "var(--muted)" }}>{r.decidedBy} · {when(r.decidedAt)}</small></div>}
              </td>
              <td style={{ maxWidth: 360 }}>
                {r.status === "Approved" ? (
                  <>
                    {r.effect || "Approved"}
                    {r.sentTo && <div><small style={{ color: "var(--muted)" }}>Sent to {r.sentTo}</small></div>}
                  </>
                ) : r.status === "Sent back" ? (
                  <>“{r.comment}”</>
                ) : r.status === "Superseded" ? (
                  "Run again before a decision"
                ) : (
                  "Waiting for approval"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
