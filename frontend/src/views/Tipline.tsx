"use client";
import { useEffect, useState } from "react";
import { HBars, KpiTile, Spark } from "@/components/charts";
import { api } from "@/lib/api";
import { ago, fmt, hash, pct } from "@/lib/format";
import { CHILD_LVL, label, nodeKey, placeOf, talukOf } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { Claim, ClaimDetail, ClaimInfo } from "@/lib/types";
import { isFresh } from "@/lib/updates";
import { KidTable } from "./KidTable";
import { ErrorNote, Loading } from "./common";

const CL_ORDER = ["New", "Triaged", "Draft ready", "Published", "Escalated", "Closed"];
const TONE: Record<string, string> = { New: "ind", Triaged: "", "Draft ready": "warn", Published: "good", Escalated: "crit", Closed: "" };
const CATS = ["Scheme rumour", "Fake recruitment", "Doctored circular", "Synthetic media", "Public safety", "Price rumour"];
const VERDICTS = ["False", "Misleading", "Partly true", "True", "Unverified", "Not of public interest"];

export function Tipline() {
  const app = useApp();
  const { outreach: o, node: n, filters: f, geo, user, toast, invalidate } = app;
  const { data, error } = useApi<ClaimInfo[]>("/tipline/claims");
  const [cf, setCf] = useState("All");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="tipline" />;
  const m = o.M(n, f);
  const all = data.filter((c) => geo.inNode(c.district, n, talukOf(c)) || n.lvl === "state");
  const q = all.filter((c) => cf === "All" || c.status === cf);
  const cats = (
    [
      ["Scheme rumours", 0.34],
      ["Fake recruitment and fee scams", 0.18],
      ["Doctored circulars", 0.15],
      ["Synthetic media", 0.09],
      ["Public safety rumours", 0.12],
      ["Price and fare rumours", 0.12],
    ] as [string, number][]
  ).map(([l, s]) => ({ l, v: m.claims * s * (0.8 + 0.4 * hash(nodeKey(n) + l)) }));
  const canPublish = user.role === "COMMISSIONER" || user.role === "JD_NEWS";

  const move = async (c: Claim, to: string) => {
    setBusy(c.id);
    try {
      await api.post(`/tipline/claims/${c.id}/transition`, { to });
      if (to === "Published") toast("Clarification published", `${c.id} is live on the Karnataka Vaarta Channel and sent to people who forwarded it.`);
      else if (to === "Escalated") toast("Escalated", `${c.id} routed to the ${c.district} district administration.`);
      else if (to === "Closed")
        toast("Claim closed", c.status === "Escalated" ? `${c.id} handled by the ${c.district} district administration.` : `${c.id} closed without action: not of public interest.`);
      invalidate();
    } catch (e) {
      toast("Could not update the claim", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const nextBtn = (c: Claim) => {
    const dis = busy === c.id;
    if (c.status === "New")
      return (
        <button className="btn" disabled={dis} onClick={() => move(c, "Triaged")}>
          Triage with AI
        </button>
      );
    if (c.status === "Triaged")
      return (
        <button className="btn" disabled={dis} onClick={() => move(c, "Draft ready")}>
          Draft clarification
        </button>
      );
    if (c.status === "Draft ready")
      return canPublish ? (
        <button className="btn pri" disabled={dis} onClick={() => move(c, "Published")}>
          Approve &amp; publish
        </button>
      ) : (
        <span className="chip warn" title="Only the Commissioner or Joint Director (News) can approve a verdict">
          Awaiting approval
        </span>
      );
    if (c.status === "Published") return <span className="chip good">Live on Channel</span>;
    if (c.status === "Closed")
      return <span className="chip">{c.verdict === "Handled by district administration" ? "Handled by district admin" : "Closed without action"}</span>;
    return <span className="chip warn">With district admin</span>;
  };
  /** Secondary actions under the next step: route public-safety items, close items not of public interest, close handled escalations. */
  const moreActs = (c: Claim) => {
    const dis = busy === c.id;
    const acts: React.ReactNode[] = [];
    if (c.category === "Public safety" && ["New", "Triaged"].includes(c.status))
      acts.push(
        <button key="esc" className="linkbtn" disabled={dis} onClick={() => move(c, "Escalated")}>
          Route to district admin
        </button>,
      );
    if (["New", "Triaged", "Draft ready"].includes(c.status))
      acts.push(
        <button key="close" className="linkbtn" disabled={dis} onClick={() => move(c, "Closed")} title="Closed without action; no clarification is sent">
          Not of public interest
        </button>,
      );
    if (c.status === "Escalated")
      acts.push(
        <button key="done" className="linkbtn" disabled={dis} onClick={() => move(c, "Closed")}>
          Mark handled
        </button>,
      );
    return acts.length ? <div className="clm-more">{acts}</div> : null;
  };

  return (
    <div className="grid">
      <div className="s12 kpis">
        <KpiTile l="Claims received" v={fmt(m.claims)} d={o.dlt(n, "cl", f)} sp={<Spark vals={o.trend(n, m.claims, "cl", f)} col="var(--arishina)" />} invert />
        <KpiTile l="Found false or misleading" v={pct(m.falseR, 0)} d={o.dlt(n, "fr", f) * 0.3} invert />
        <KpiTile l="Median clarification" v={m.tat.toFixed(1) + " h"} d={o.dlt(n, "tat", f) * 0.6} sp={<Spark vals={o.trend(n, m.tat, "tat", f)} col="var(--arishina)" />} invert />
        <KpiTile l="Clarifications published" v={fmt(m.claims * m.falseR * 0.7)} d={o.dlt(n, "pub", f)} />
        <KpiTile l="Open in queue" v={String(all.filter((c) => c.status !== "Published" && c.status !== "Closed").length)} d={o.dlt(n, "open", f)} invert />
      </div>
      <div className="card s12">
        <div className="note">
          <span className="chip ind">Governance</span>
          <span>
            Every verdict needs a named human approver before it goes out. Claims that are not of public interest are closed without action. Public-safety items
            go to the district administration, not the fact-check desk.
          </span>
        </div>
      </div>
      <div className="card s8">
        <div className="ch">
          <div>
            <h3>
              Live claim queue · {label(n)}{" "}
              <span className="chip wa" title="New claims from the WhatsApp tipline appear here on their own">
                WhatsApp feed
              </span>
            </h3>
            <p>From the WhatsApp tipline, district offices and the analytics team. Select a claim for details.</p>
          </div>
          <div className="clm-tools">
            <div className="seg" role="group" aria-label="Show claims with status">
              {["All", ...CL_ORDER].map((s) => (
                <button key={s} aria-pressed={cf === s} onClick={() => setCf(s)}>
                  {s}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setAdding(!adding)}>
              {adding ? "Cancel" : "+ Log a claim"}
            </button>
          </div>
        </div>
        {adding && <NewClaim onDone={() => setAdding(false)} />}
        {open && (
          <ClaimPanel
            id={open}
            onClose={() => setOpen(null)}
            next={(c) => (
              <>
                {nextBtn(c)}
                {moreActs(c)}
              </>
            )}
          />
        )}
        {q.length ? (
          <div className="tbw">
            <table className="tb">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>District</th>
                  <th>Type</th>
                  <th className="r">Forwards</th>
                  <th>Status</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {q.map((c) => (
                  <tr key={c.id} className={isFresh("claim", c.id) ? "new" : undefined}>
                    <td>
                      <button className="clm-open" onClick={() => setOpen(c.id)} title="Open claim details">
                        {c.text}
                      </button>
                      <small style={{ color: "var(--muted)" }}>
                        {c.id} · {c.lang} · {c.source} · {ago(c.receivedAt)}
                      </small>
                    </td>
                    <td>{placeOf(c.district, c)}</td>
                    <td>{c.category}</td>
                    <td className="r">{fmt(c.forwards)}</td>
                    <td>
                      <span className={`chip ${TONE[c.status]}`}>{c.status}</span>
                      {c.verdict && c.verdict !== "—" && (
                        <div>
                          <small style={{ color: "var(--muted)" }}>{c.verdict}</small>
                        </div>
                      )}
                      {c.approvedBy && (
                        <div>
                          <small style={{ color: "var(--muted)" }}>
                            {c.status === "Closed" ? "Closed" : "Approved"} by {c.approvedBy}
                          </small>
                        </div>
                      )}
                    </td>
                    <td>
                      {nextBtn(c)}
                      {moreActs(c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            No claims with this status in {label(n)}. Try the citizen bot&apos;s “Is this true?” option to send one, or use “Log a claim” for one received outside the tipline.
          </div>
        )}
      </div>
      <div className="card s4">
        <div className="ch">
          <div>
            <h3>Narratives this period</h3>
            <p>Claims grouped by the triage agent</p>
          </div>
          <span className="aiflag">AI clusters</span>
        </div>
        <HBars items={cats.map((c) => ({ ...c, d: fmt(c.v) }))} max={null} />
      </div>
      {o.children(n).length > 0 && (
        <div className="card s12">
          <div className="ch">
            <div>
              <h3>Claims by {CHILD_LVL[n.lvl]}</h3>
              <p>Normalised per lakh subscribers so large districts don&apos;t dominate</p>
            </div>
          </div>
          <KidTable
            key={n.name}
            n={n}
            cols={[
              { k: "claims", label: "Claims", get: (x) => x.claims, fmt },
              { k: "claimsPerL", label: "Per lakh subs", get: (x) => x.claimsPerL, fmt: (v) => v.toFixed(0), bar: true, colf: () => "var(--arishina)" },
              { k: "falseR", label: "False / misleading", get: (x) => x.falseR, fmt: (v) => pct(v, 0) },
              { k: "tat", label: "Clarify (h)", get: (x) => x.tat, fmt: (v) => v.toFixed(1), chip: (v) => (v > 10 ? "crit" : v > 6 ? "warn" : "good") },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function NewClaim({ onDone }: { onDone: () => void }) {
  const { user, geo, node, toast, invalidate, meta } = useApp();
  const [text, setText] = useState("");
  const [lang, setLang] = useState("Kannada");
  const [district, setDistrict] = useState(user.district || node.dist || "Bengaluru Urban");
  const [cat, setCat] = useState(CATS[0]);
  const [fw, setFw] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const c = await api.post<Claim>("/tipline/claims", { text, lang, district, category: cat, forwards: fw ? +fw : 0 });
      toast("New tipline claim", `${c.id} from ${c.district} · queued for triage`);
      invalidate();
      onDone();
    } catch (x) {
      toast("Could not log the claim", (x as Error).message);
    }
  };
  return (
    <form className="fbar" style={{ marginBottom: 12 }} onSubmit={save}>
      <div className="slicer" style={{ flex: "1 1 260px" }}>
        <label htmlFor="nc-text">Claim text</label>
        <input id="nc-text" className="nc-in" value={text} onChange={(e) => setText(e.target.value)} placeholder="What is the message saying?" />
      </div>
      <div className="slicer">
        <label htmlFor="nc-lang">Language</label>
        <select id="nc-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
          {meta.reference.languages.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="nc-dist">District</label>
        <select id="nc-dist" value={district} disabled={!!user.district} onChange={(e) => setDistrict(e.target.value)}>
          {geo.ALL_D.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="nc-cat">Type</label>
        <select id="nc-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
          {CATS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="nc-fw">Forwards</label>
        <input id="nc-fw" className="nc-in" inputMode="numeric" style={{ width: 90 }} value={fw} onChange={(e) => setFw(e.target.value.replace(/\D/g, ""))} />
      </div>
      <button className="btn pri" type="submit">
        Add to queue
      </button>
    </form>
  );
}

const ACTION: Record<string, string> = {
  "claim.create": "Received",
  "claim.edit": "Edited",
  "claim.Triaged": "Triaged",
  "claim.Draft ready": "Clarification drafted",
  "claim.Published": "Approved and published",
  "claim.Escalated": "Routed to district administration",
  "claim.Closed": "Closed",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Claim detail: full text, source, forwards, history from the audit log, and verdict editing before publishing. */
function ClaimPanel({ id, onClose, next }: { id: string; onClose: () => void; next: (c: Claim) => React.ReactNode }) {
  const { toast, invalidate } = useApp();
  const { data, error } = useApi<ClaimDetail>(`/tipline/claims/${encodeURIComponent(id)}`);
  const [form, setForm] = useState<{ verdict: string; category: string; clarification: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const c = data?.claim;
  const startEdit = () =>
    c && setForm({ verdict: c.verdict === "—" ? "" : c.verdict.replace("Suggested: ", ""), category: c.category, clarification: c.clarification || "" });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c || !form) return;
    setSaving(true);
    try {
      await api.post(`/tipline/claims/${c.id}/edit`, form);
      toast("Claim updated", `${c.id} · ${form.verdict || "no verdict yet"} · ${form.category}`);
      setForm(null);
      invalidate();
    } catch (x) {
      toast("Could not save", (x as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cpanel-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="cpanel" role="dialog" aria-modal="true" aria-label={`Claim ${id}`}>
        <div className="cp-head">
          <div>
            <h3>{id}</h3>
            {c && (
              <small style={{ color: "var(--muted)" }}>
                {c.source} · received {ago(c.receivedAt)} ago
              </small>
            )}
          </div>
          <button className="iconbtn" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        {error && <ErrorNote msg={error} />}
        {!data && !error && <Loading what="claim" />}
        {c && data && (
          <>
            <span className={`chip ${TONE[c.status]}`}>{c.status}</span>
            <p className="cp-text">{c.text}</p>
            <dl>
              <dt>District</dt>
              <dd>{placeOf(c.district, c)}</dd>
              <dt>Language</dt>
              <dd>{c.lang}</dd>
              <dt>Type</dt>
              <dd>{c.category}</dd>
              <dt>Forwards</dt>
              <dd>{fmt(c.forwards)}</dd>
              <dt>Source</dt>
              <dd>
                {c.source}
                {c.contact ? ` · ${c.contact}` : ""}
              </dd>
              <dt>Verdict</dt>
              <dd>{c.verdict}</dd>
              {c.clarification && (
                <>
                  <dt>Clarification</dt>
                  <dd>{c.clarification}</dd>
                </>
              )}
              {c.approvedBy && (
                <>
                  <dt>{c.status === "Closed" ? "Closed by" : "Approved by"}</dt>
                  <dd>{c.approvedBy}</dd>
                </>
              )}
              {c.matchOf && (
                <>
                  <dt>Matched to</dt>
                  <dd>{c.matchOf} · the bot replied with its verdict</dd>
                </>
              )}
            </dl>

            {form ? (
              <form className="cp-form" onSubmit={save} style={{ marginTop: 16 }}>
                <label>
                  Verdict
                  <input className="nc-in" list="cp-verdicts" value={form.verdict} maxLength={120} onChange={(e) => setForm({ ...form, verdict: e.target.value })} />
                  <datalist id="cp-verdicts">
                    {VERDICTS.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Type
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Clarification sent to people who forwarded it
                  <textarea
                    className="nc-in"
                    maxLength={1000}
                    value={form.clarification}
                    onChange={(e) => setForm({ ...form, clarification: e.target.value })}
                    placeholder="What is true, in one or two short sentences"
                  />
                </label>
                <div className="cp-acts">
                  <button className="btn pri" type="submit" disabled={saving}>
                    Save
                  </button>
                  <button className="btn" type="button" onClick={() => setForm(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="cp-acts">
                {data.canEdit && (
                  <button className="btn" onClick={startEdit}>
                    Edit verdict and type
                  </button>
                )}
                {next(c)}
              </div>
            )}
            {data.canEdit && !data.canPublish && c.status === "Draft ready" && (
              <div className="note" style={{ marginTop: 12 }}>
                <span>The Commissioner or Joint Director (News) approves and publishes the verdict.</span>
              </div>
            )}

            <h4>History</h4>
            {data.history.length ? (
              <ol className="cp-hist">
                {data.history.map((h, i) => (
                  <li key={i}>
                    <time dateTime={h.at}>{when(h.at)}</time>
                    <span>
                      <b>{ACTION[h.action] || h.action}</b> · {h.who}
                      {h.action === "claim.edit" || h.action === "claim.create" ? (
                        <>
                          <br />
                          <small style={{ color: "var(--muted)" }}>{h.detail.split(" · ").slice(1).join(" · ") || "Logged in the console"}</small>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty">No recorded steps. This claim came with the sample data.</div>
            )}

            {data.related.length > 0 && (
              <>
                <h4>Linked claims</h4>
                <ol className="cp-hist">
                  {data.related.map((r) => (
                    <li key={r.id}>
                      <time>{r.id}</time>
                      <span>
                        {r.text}
                        <br />
                        <small style={{ color: "var(--muted)" }}>
                          {r.district} · {r.status} · {r.verdict}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
