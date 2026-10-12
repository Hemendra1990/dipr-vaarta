"use client";
import { useState } from "react";
import { HBars, KpiTile, Spark } from "@/components/charts";
import { api } from "@/lib/api";
import { ago, fmt, hash, pct } from "@/lib/format";
import { CHILD_LVL, label, nodeKey } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { Claim } from "@/lib/types";
import { KidTable } from "./KidTable";
import { ErrorNote, Loading } from "./common";

const CL_ORDER = ["New", "Triaged", "Draft ready", "Published", "Escalated"];
const TONE: Record<string, string> = { New: "ind", Triaged: "", "Draft ready": "warn", Published: "good", Escalated: "crit" };
const CATS = ["Scheme rumour", "Fake recruitment", "Doctored circular", "Synthetic media", "Public safety", "Price rumour"];

export function Tipline() {
  const app = useApp();
  const { outreach: o, node: n, filters: f, geo, user, toast, invalidate } = app;
  const { data, error } = useApi<Claim[]>("/tipline/claims");
  const [cf, setCf] = useState("All");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="tipline" />;
  const m = o.M(n, f);
  const all = data.filter((c) => geo.inNode(c.district, n) || n.lvl === "state");
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
    return <span className="chip warn">With district admin</span>;
  };

  return (
    <div className="grid">
      <div className="s12 kpis">
        <KpiTile l="Claims received" v={fmt(m.claims)} d={o.dlt(n, "cl", f)} sp={<Spark vals={o.trend(n, m.claims, "cl", f)} col="var(--arishina)" />} invert />
        <KpiTile l="Found false or misleading" v={pct(m.falseR, 0)} d={o.dlt(n, "fr", f) * 0.3} invert />
        <KpiTile l="Median clarification" v={m.tat.toFixed(1) + " h"} d={o.dlt(n, "tat", f) * 0.6} sp={<Spark vals={o.trend(n, m.tat, "tat", f)} col="var(--arishina)" />} invert />
        <KpiTile l="Clarifications published" v={fmt(m.claims * m.falseR * 0.7)} d={o.dlt(n, "pub", f)} />
        <KpiTile l="Open in queue" v={String(all.filter((c) => c.status !== "Published").length)} d={o.dlt(n, "open", f)} invert />
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
            <h3>Live claim queue · {label(n)}</h3>
            <p>From the WhatsApp tipline, district offices and the analytics team</p>
          </div>
          <div className="seg">
            {["All", ...CL_ORDER].map((s) => (
              <button key={s} aria-pressed={cf === s} onClick={() => setCf(s)}>
                {s}
              </button>
            ))}
            <button onClick={() => setAdding(!adding)} aria-pressed={adding}>
              + Log a claim
            </button>
          </div>
        </div>
        {adding && <NewClaim onDone={() => setAdding(false)} />}
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
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600, maxWidth: 320 }}>{c.text}</div>
                      <small style={{ color: "var(--muted)" }}>
                        {c.id} · {c.lang} · {c.source} · {ago(c.receivedAt)}
                      </small>
                    </td>
                    <td>{c.district}</td>
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
                          <small style={{ color: "var(--muted)" }}>Approved by {c.approvedBy}</small>
                        </div>
                      )}
                    </td>
                    <td>
                      {nextBtn(c)}
                      {c.category === "Public safety" && ["New", "Triaged"].includes(c.status) && (
                        <div style={{ marginTop: 6 }}>
                          <button className="linkbtn" onClick={() => move(c, "Escalated")}>
                            Route to district admin
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No claims with this status in {label(n)}. Use “Log a claim” to add one received outside the tipline.</div>
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
