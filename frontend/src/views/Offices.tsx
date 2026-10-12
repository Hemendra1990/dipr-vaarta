"use client";
import { useState } from "react";
import { KpiTile, Spark } from "@/components/charts";
import { api } from "@/lib/api";
import { ago, cl, fmt, pct, rateTone } from "@/lib/format";
import { label } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { FeedEntry, FeedItem } from "@/lib/types";
import { feedTitle, isFresh } from "@/lib/updates";
import { KidTable } from "./KidTable";
import { ErrorNote, Loading } from "./common";

const IC: Record<string, [string, string]> = { pulse: ["ind", "Field pulse"], report: ["good", "Daily report"], esc: ["crit", "Escalation"], rel: ["warn", "Coverage"] };
const SENT: Record<string, string> = { Positive: "good", Mixed: "warn", Negative: "crit" };

export function Offices() {
  const { outreach: o, node: n, filters: f, geo } = useApp();
  const { data, error } = useApi<FeedEntry[]>("/offices/feed");
  const [posting, setPosting] = useState(false);
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="district offices" />;
  const m = o.M(n, f),
    fd = data.filter((x) => geo.inNode(x.district, n) || n.lvl === "state");
  const showTbl = o.children(n).length > 0 && n.lvl !== "dist";
  const prof = n.lvl === "dist" || n.lvl === "tlk";
  return (
    <div className="grid">
      <div className="s12 kpis">
        <KpiTile l="Report compliance" v={pct(m.comp, 0)} d={o.dlt(n, "cmp", f) * 0.3} />
        <KpiTile l="Events covered" v={fmt(m.events)} d={o.dlt(n, "ev", f)} sp={<Spark vals={o.trend(n, m.events, "ev", f)} />} />
        <KpiTile l="Field pulse notes" v={fmt(m.pulse + fd.filter((x) => x.type === "pulse").length)} d={o.dlt(n, "pl", f)} />
        <KpiTile l="Open HQ tasks" v={fmt(m.tasks)} d={o.dlt(n, "tk", f)} invert />
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
        {posting && <PostUpdate onDone={() => setPosting(false)} />}
        {fd.length ? (
          <ul className="feed">
            {fd.map((x) => (
              <li key={x.id} className={isFresh("feed", x.id) ? "new" : undefined}>
                <span className={`chip ${IC[x.type][0]}`}>{IC[x.type][1]}</span>
                <div>
                  <p>{x.note}</p>
                  <small>
                    {x.district}
                    {x.scheme ? " · " + x.scheme : ""}
                    {x.channel === "WhatsApp" ? " · via WhatsApp" : x.channel === "Console" ? ` · posted by ${x.author}` : ""}
                    {x.sentiment && (
                      <>
                        {" · "}
                        <span className={`chip ${SENT[x.sentiment]}`}>{x.sentiment}</span>
                      </>
                    )}
                  </small>
                </div>
                <span className="when">{ago(x.createdAt)} ago</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">No updates from this area yet. District officers can post one with “Post an update”.</div>
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
          <h4 style={{ margin: "16px 0 8px", font: "700 13px var(--f-display)" }}>Open tasks from HQ</h4>
          <ul className="leafq">
            <li>
              <span>Yuva Nidhi posters to 14 colleges</span>
              <span>due 10 Oct</span>
            </li>
            <li>
              <span>Press arrangements for minister&apos;s visit</span>
              <span>due 12 Oct</span>
            </li>
            <li>
              <span>Shakti campaign photos</span>
              <span style={{ color: "var(--crit)" }}>1 day late</span>
            </li>
          </ul>
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
              { k: "tasks", label: "Open HQ tasks", get: (x) => x.tasks, fmt: (v) => v.toFixed(0) },
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
