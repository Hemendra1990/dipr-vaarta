"use client";
import { useState } from "react";
import { KpiTile, Spark } from "@/components/charts";
import { api } from "@/lib/api";
import { ago, cl, fmt, pct, rateTone } from "@/lib/format";
import { label, placeOf, talukOf } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { FeedItem, FeedResolvable, OfficeTask } from "@/lib/types";
import { feedTitle, isFresh } from "@/lib/updates";
import { KidTable } from "./KidTable";
import { ErrorNote, Loading } from "./common";

const IC: Record<string, [string, string]> = { pulse: ["ind", "Field pulse"], report: ["good", "Daily report"], esc: ["crit", "Escalation"], rel: ["warn", "Coverage"] };
const SENT: Record<string, string> = { Positive: "good", Mixed: "warn", Negative: "crit" };

export function Offices() {
  const { outreach: o, node: n, filters: f, geo, toast, invalidate } = useApp();
  const { data, error } = useApi<FeedResolvable[]>("/offices/feed");
  const [posting, setPosting] = useState(false);
  const [ft, setFt] = useState("All");
  const [resolving, setResolving] = useState<number | null>(null);
  const [resNote, setResNote] = useState("");
  const { data: tasks } = useApi<OfficeTask[]>("/offices/tasks");
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="district offices" />;
  const m = o.M(n, f),
    fd = data.filter((x) => geo.inNode(x.district, n, talukOf(x)) || n.lvl === "state");
  const shown = fd.filter((x) => ft === "All" || (ft === "open" ? x.type === "esc" && !x.resolvedAt : x.type === ft));
  const openEsc = fd.filter((x) => x.type === "esc" && !x.resolvedAt).length;
  const resolve = async (e: React.FormEvent, x: FeedResolvable) => {
    e.preventDefault();
    try {
      await api.post(`/offices/feed/${x.id}/resolve`, { note: resNote });
      toast("Escalation resolved", `${x.district}: ${x.note.slice(0, 60)}${x.note.length > 60 ? "…" : ""}`);
      setResolving(null);
      setResNote("");
      invalidate();
    } catch (er) {
      toast("Could not resolve", (er as Error).message);
    }
  };
  // Open HQ tasks come from the task list (assigned by HQ, closed by the office) once it has loaded.
  const openTasks = (nd: typeof n) => (tasks ? tasks.filter((t) => t.status === "Open" && geo.inNode(t.district, nd)).length : null);
  const taskOf = new Map(o.children(n).map((c) => [o.M(c, f), openTasks(c)] as const));
  const showTbl = o.children(n).length > 0 && n.lvl !== "dist";
  const prof = n.lvl === "dist" || n.lvl === "tlk";
  return (
    <div className="grid">
      <div className="s12 kpis">
        <KpiTile l="Report compliance" v={pct(m.comp, 0)} d={o.dlt(n, "cmp", f) * 0.3} />
        <KpiTile l="Events covered" v={fmt(m.events)} d={o.dlt(n, "ev", f)} sp={<Spark vals={o.trend(n, m.events, "ev", f)} />} />
        <KpiTile l="Field pulse notes" v={fmt(m.pulse + fd.filter((x) => x.type === "pulse").length)} d={o.dlt(n, "pl", f)} />
        <KpiTile l="Open HQ tasks" v={String(openTasks(n) ?? fmt(m.tasks))} d={o.dlt(n, "tk", f)} invert />
        <KpiTile l="Citizen escalations" v={String(fd.filter((x) => x.type === "esc").length + Math.round(m.claims * 0.004))} d={o.dlt(n, "es", f)} invert />
      </div>
      <div className={`card ${prof ? "s8" : "s12"}`}>
        <div className="ch">
          <div>
            <h3>
              Ground feed · {label(n)}{" "}
              <span className="chip wa" title="District officers send field pulse, daily reports, escalations and coverage to the WhatsApp bot">
                WhatsApp feed
              </span>
            </h3>
            <p>Sent by district officers and citizens over WhatsApp. Newest first.</p>
          </div>
          <button className="btn" onClick={() => setPosting(!posting)}>
            {posting ? "Cancel" : "+ Post an update"}
          </button>
        </div>
        <div className="seg" style={{ marginBottom: 10 }} role="group" aria-label="Show updates of type">
          {[["All", "All"], ...Object.entries(IC).map(([k, v]) => [k, v[1]]), ["open", `Open escalations (${openEsc})`]].map(([k, l]) => (
            <button key={k} aria-pressed={ft === k} onClick={() => setFt(k)}>
              {l}
            </button>
          ))}
        </div>
        {posting && <PostUpdate onDone={() => setPosting(false)} />}
        {shown.length ? (
          <ul className="feed">
            {shown.map((x) => (
              <li key={x.id} className={isFresh("feed", x.id) ? "new" : undefined}>
                <span className={`chip ${IC[x.type][0]}`}>{IC[x.type][1]}</span>
                <div>
                  <p>{x.note}</p>
                  <small>
                    {placeOf(x.district, x)}
                    {x.scheme ? " · " + x.scheme : ""}
                    {x.channel === "WhatsApp" ? " · via WhatsApp" : x.channel === "Console" ? ` · posted by ${x.author}` : ""}
                    {x.sentiment && (
                      <>
                        {" · "}
                        <span className={`chip ${SENT[x.sentiment]}`}>{x.sentiment}</span>
                      </>
                    )}
                  </small>
                  {x.type === "esc" &&
                    (x.resolvedAt ? (
                      <div className="fd-res">
                        <span className="chip good">Resolved</span>
                        <small>
                          {x.resolvedBy} · {ago(x.resolvedAt)} ago{x.resolution ? " · " + x.resolution : ""}
                        </small>
                      </div>
                    ) : resolving === x.id ? (
                      <form className="fd-res" onSubmit={(e) => resolve(e, x)}>
                        <input
                          className="nc-in"
                          autoFocus
                          maxLength={500}
                          aria-label="How was it resolved?"
                          placeholder="How was it resolved? (optional)"
                          value={resNote}
                          onChange={(e) => setResNote(e.target.value)}
                        />
                        <button className="btn pri" type="submit">
                          Mark resolved
                        </button>
                        <button className="btn" type="button" onClick={() => setResolving(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="fd-res">
                        <span className="chip crit">Open</span>
                        <button
                          className="linkbtn"
                          onClick={() => {
                            setResolving(x.id);
                            setResNote("");
                          }}
                        >
                          Resolve
                        </button>
                      </div>
                    ))}
                </div>
                <span className="when">{ago(x.createdAt)} ago</span>
              </li>
            ))}
          </ul>
        ) : fd.length ? (
          <div className="empty">No {ft === "open" ? "open escalations" : (IC[ft]?.[1] || "").toLowerCase() + " updates"} from {label(n)}.</div>
        ) : (
          <div className="empty">No updates from this area yet. District officers can post one with “Post an update” or send it to the WhatsApp bot.</div>
        )}
      </div>
      {prof && (
        <div className="card s4">
          <div className="ch">
            <div>
              <h3>{n.dist} office</h3>
              <p>Assistant Director, District Information Office</p>
            </div>
            <span className={`chip ${m.comp < 0.75 ? "crit" : m.comp < 0.85 ? "warn" : "good"}`}>{pct(m.comp, 0)} compliance</span>
          </div>
          <div className="hb">
            {(
              [
                ["Events covered", m.events],
                ["Releases issued", m.rel],
                ["Field pulse notes", m.pulse],
              ] as [string, number][]
            ).map(([l, v]) => (
              <div className="r" key={l}>
                <span>{l}</span>
                <div className="t">
                  <i style={{ width: `${cl(v / Math.max(m.events, m.rel, m.pulse), 0, 1) * 100}%` }} />
                </div>
                <span className="v">{fmt(v)}</span>
              </div>
            ))}
          </div>
          <HqTasks district={n.dist!} />
        </div>
      )}
      {showTbl && (
        <div className="card s12">
          <div className="ch">
            <div>
              <h3>District Information Office scorecard</h3>
              <p>{label(n)} · select a row to drill down</p>
            </div>
          </div>
          <KidTable
            key={n.name}
            n={n}
            cols={[
              { k: "comp", label: "Report compliance", get: (x) => x.comp, fmt: (v) => pct(v, 0), bar: true, colf: (v) => (v < 0.75 ? "var(--crit)" : v < 0.85 ? "var(--warn)" : "var(--good)") },
              { k: "events", label: "Events covered", get: (x) => x.events, fmt },
              { k: "pulse", label: "Field pulse notes", get: (x) => x.pulse, fmt },
              { k: "tasks", label: "Open HQ tasks", get: (x) => taskOf.get(x) ?? x.tasks, fmt: (v) => v.toFixed(0) },
              { k: "readR", label: "Read rate", get: (x) => x.readR, fmt: (v) => pct(v, 0), chip: rateTone },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function PostUpdate({ onDone }: { onDone: () => void }) {
  const { user, geo, node, toast, invalidate, meta } = useApp();
  const [type, setType] = useState("pulse");
  const [district, setDistrict] = useState(user.district || node.dist || geo.ALL_D[0]);
  const [scheme, setScheme] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [note, setNote] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      const x = await api.post<FeedItem>("/offices/feed", { type, district, scheme, sentiment, note });
      toast(feedTitle(x.type), `${x.district}: ${x.note.slice(0, 80)}${x.note.length > 80 ? "…" : ""}`);
      invalidate();
      onDone();
    } catch (er) {
      toast("Could not post", (er as Error).message);
    }
  };
  return (
    <form className="fbar" style={{ marginBottom: 12 }} onSubmit={save}>
      <div className="slicer">
        <label htmlFor="pu-type">Type</label>
        <select id="pu-type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(IC).map(([k, v]) => (
            <option key={k} value={k}>
              {v[1]}
            </option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="pu-dist">District</label>
        <select id="pu-dist" value={district} disabled={!!user.district} onChange={(e) => setDistrict(e.target.value)}>
          {geo.ALL_D.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="pu-sch">Scheme</label>
        <select id="pu-sch" value={scheme} onChange={(e) => setScheme(e.target.value)}>
          <option value="">—</option>
          {Object.keys(meta.reference.schemes)
            .filter((s) => s !== "All")
            .map((s) => (
              <option key={s}>{s}</option>
            ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="pu-sent">Sentiment</label>
        <select id="pu-sent" value={sentiment} onChange={(e) => setSentiment(e.target.value)}>
          <option value="">—</option>
          <option>Positive</option>
          <option>Mixed</option>
          <option>Negative</option>
        </select>
      </div>
      <div className="slicer" style={{ flex: "1 1 260px" }}>
        <label htmlFor="pu-note">Update</label>
        <input id="pu-note" className="nc-in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on the ground?" />
      </div>
      <button className="btn pri" type="submit">
        Post
      </button>
    </form>
  );
}

/** "Open tasks from HQ" for one district office: HQ (Commissioner) assigns, the office marks them done. */
function HqTasks({ district }: { district: string }) {
  const { user, meta, toast, invalidate } = useApp();
  const { data, error } = useApi<OfficeTask[]>("/offices/tasks");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const isHq = user.role === "COMMISSIONER";
  const asOf = new Date(meta.calendar.asOf + "T00:00:00");
  const mine = (data || []).filter((t) => t.district === district);
  const open = mine.filter((t) => t.status === "Open"),
    done = mine.filter((t) => t.status === "Done");
  const dueTxt = (t: OfficeTask) => {
    const d = new Date(t.due + "T00:00:00"),
      late = Math.round((asOf.getTime() - d.getTime()) / 86400000);
    if (late > 0) return <span className="tk-due" style={{ color: "var(--crit)" }}>{late === 1 ? "1 day late" : `${late} days late`}</span>;
    return <span className="tk-due">due {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>;
  };
  const markDone = async (t: OfficeTask) => {
    setBusy(t.id);
    try {
      await api.post(`/offices/tasks/${t.id}/done`, {});
      toast("Task done", `${district}: ${t.title}`);
      invalidate();
    } catch (e) {
      toast("Could not update the task", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !due) return toast("Task and due date", "Enter what the office should do and by when.");
    try {
      await api.post("/offices/tasks", { district, title, due });
      toast("Task sent", `${district} office: ${title.trim()}`);
      setTitle("");
      setDue("");
      setAdding(false);
      invalidate();
    } catch (x) {
      toast("Could not send the task", (x as Error).message);
    }
  };
  return (
    <>
      <h4 style={{ margin: "16px 0 8px", font: "700 13px var(--f-display)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>Open tasks from HQ</span>
        {isHq && (
          <button className="linkbtn" style={{ font: "600 12px var(--f-body)" }} onClick={() => setAdding(!adding)}>
            {adding ? "Cancel" : "+ Add task"}
          </button>
        )}
      </h4>
      {error && <ErrorNote msg={error} />}
      {!data && !error && <Loading what="tasks" />}
      {data &&
        (open.length ? (
          <ul className="leafq">
            {open.map((t) => (
              <li key={t.id}>
                <span title={`From ${t.assignedBy}`}>{t.title}</span>
                <div className="tk-acts">
                  {dueTxt(t)}
                  <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} disabled={busy === t.id} onClick={() => markDone(t)}>
                    Done
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No open tasks from HQ.</div>
        ))}
      {adding && (
        <form className="tk-form" onSubmit={assign}>
          <input className="nc-in" aria-label="Task" placeholder="What should the office do?" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="row">
            <input className="nc-in" type="date" aria-label="Due date" value={due} min={meta.calendar.asOf} onChange={(e) => setDue(e.target.value)} />
            <button className="btn pri" type="submit">
              Send to office
            </button>
          </div>
        </form>
      )}
      {done.length > 0 && (
        <>
          <button className="linkbtn" style={{ marginTop: 10, fontSize: 12.5 }} onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone && (
            <ul className="leafq" style={{ marginTop: 8 }}>
              {done.map((t) => (
                <li key={t.id} className="done">
                  <span>{t.title}</span>
                  <span>
                    {t.doneBy} · {ago(t.doneAt!)} ago
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
