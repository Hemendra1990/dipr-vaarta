"use client";
import React, { useState } from "react";
import { api } from "@/lib/api";
import { HBars, InlineBar, KpiTile, Spark } from "@/components/charts";
import { fmt, hash, nIN, pct } from "@/lib/format";
import { CHILD_LVL, label, nodeKey } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { PressRelease } from "@/lib/types";
import { KidTable } from "./KidTable";
import { ErrorNote, Loading } from "./common";

export function Press() {
  const { outreach: o, node: n, filters: f, geo, canSee } = useApp();
  const { data, error } = useApi<PressRelease[]>("/press/releases");
  const [composing, setComposing] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="press data" />;
  const m = o.M(n, f),
    inArea = data.filter((r) => geo.inScope(r.district, n)),
    rl = inArea.filter((r) => r.status !== "Draft"),
    drafts = inArea.filter((r) => r.status === "Draft"),
    sel = data.find((r) => r.id === selId) || null,
    canDraft = canSee("press"),
    maxR = Math.max(...rl.map((r) => r.reach), 1);
  const jr = m.jour,
    pipe: [string, number][] = [
      ["Applied", jr * 0.16],
      ["Documents verified", jr * 0.12],
      ["Committee review", jr * 0.08],
      ["Approved", jr * 0.06],
      ["Card issued", jr * 0.05],
    ];
  return (
    <div className="grid">
      <div className="s12 kpis">
        <KpiTile l="Releases issued" v={fmt(m.rel)} d={o.dlt(n, "rel", f)} sp={<Spark vals={o.trend(n, m.rel, "rel", f)} />} />
        <KpiTile l="Event to release" v={(2 + 3 * hash(nodeKey(n) + "t")).toFixed(1) + " h"} d={o.dlt(n, "evr", f) * 0.6} invert />
        <KpiTile l="Accredited journalists" v={fmt(m.jour)} d={o.dlt(n, "jr", f) * 0.2} />
        <KpiTile l="Pickup rate" v={pct(m.pickup, 0)} d={o.dlt(n, "pk", f) * 0.4} sp={<Spark vals={o.trend(n, m.pickup, "pk", f)} />} />
        <KpiTile l="Renewals due in 60 days" v={fmt(m.jour * 0.11)} d={o.dlt(n, "ren", f) * 0.3} invert />
      </div>
      <div className="card s8">
        <div className="ch">
          <div>
            <h3>Recent releases in scope</h3>
            <p>Reach is accredited journalists who received it on WhatsApp; pickup is outlets that carried it</p>
          </div>
          {canDraft && (
            <div className="seg">
              <button onClick={() => setComposing(!composing)} aria-pressed={composing}>
                + Compose release
              </button>
            </div>
          )}
        </div>
        {composing && (
          <Compose
            onDone={(id) => {
              setComposing(false);
              setSelId(id);
            }}
          />
        )}
        {drafts.length > 0 && (
          <div className="pr-drafts">
            <div className="sth">Drafts awaiting approval</div>
            <div className="tbw">
              <table className="tb">
                <tbody>
                  {drafts.map((r) => (
                    <tr key={r.id} className={"click" + (r.id === selId ? " on" : "")}
                    tabIndex={0}
                    aria-expanded={r.id === selId}
                    onClick={() => setSelId(r.id === selId ? null : r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelId(r.id === selId ? null : r.id);
                      }
                    }}
                  >
                      <td>
                        <div style={{ fontWeight: 600, maxWidth: 360 }}>{r.title}</div>
                        <small style={{ color: "var(--muted)" }}>
                          {r.id} · {r.dept} · {r.language} · drafted by {r.draftedBy}
                        </small>
                      </td>
                      <td>{r.district === "State" ? <span className="chip ind">Statewide</span> : r.district}</td>
                      <td className="r">
                        <span className="chip warn">Draft</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {rl.length ? (
          <div className="tbw">
            <table className="tb">
              <thead>
                <tr>
                  <th>Release</th>
                  <th>Scope</th>
                  <th className="r">Reach</th>
                  <th className="r">Media kits</th>
                  <th className="r">Pickup</th>
                </tr>
              </thead>
              <tbody>
                {rl.map((r) => (
                  <tr key={r.id} className={"click" + (r.id === selId ? " on" : "")}
                    tabIndex={0}
                    aria-expanded={r.id === selId}
                    onClick={() => setSelId(r.id === selId ? null : r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelId(r.id === selId ? null : r.id);
                      }
                    }}
                  >
                    <td>
                      <div style={{ fontWeight: 600, maxWidth: 360 }}>{r.title}</div>
                      <small style={{ color: "var(--muted)" }}>
                        {r.id} · {r.dept} · issued {r.hoursAfterEvent} h after event
                      </small>
                    </td>
                    <td>{r.district === "State" ? <span className="chip ind">Statewide</span> : r.district}</td>
                    <td className="r">
                      <InlineBar text={fmt(r.reach)} v={r.reach} max={maxR} col="var(--indigo)" />
                    </td>
                    <td className="r">{r.kits}</td>
                    <td className="r">{r.pickup} outlets</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No releases for this area yet.</div>
        )}
        {sel && <Detail r={sel} onClose={() => setSelId(null)} onIssued={setSelId} />}
      </div>
      <div className="card s4">
        <div className="ch">
          <div>
            <h3>Accreditation pipeline</h3>
            <p>Applications in progress · {label(n)}</p>
          </div>
        </div>
        <HBars items={pipe.map(([l, v]) => ({ l, v, d: fmt(v) }))} />
        <div className="note" style={{ marginTop: 14 }}>
          Journalists check status, renew and download e-cards on WhatsApp. That removes most status calls to the Media Desk.
        </div>
      </div>
      {o.children(n).length > 0 && (
        <div className="card s12">
          <div className="ch">
            <div>
              <h3>Press performance by {CHILD_LVL[n.lvl]}</h3>
              <p>Select a row to drill down</p>
            </div>
          </div>
          <KidTable
            key={n.name}
            n={n}
            cols={[
              { k: "rel", label: "Releases", get: (x) => x.rel, fmt, bar: true },
              { k: "pickup", label: "Pickup rate", get: (x) => x.pickup, fmt: (v) => pct(v, 0), bar: true, colf: (v) => (v < 0.5 ? "var(--crit)" : v < 0.62 ? "var(--warn)" : "var(--good)") },
              { k: "jour", label: "Journalists", get: (x) => x.jour, fmt },
              { k: "events", label: "Events covered", get: (x) => x.events, fmt },
            ]}
          />
        </div>
      )}
    </div>
  );
}

const APPROVERS = ["COMMISSIONER", "JD_NEWS"];
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function Compose({ onDone }: { onDone: (id: string) => void }) {
  const { user, geo, node, toast, invalidate, meta } = useApp();
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState(user.department || meta.reference.departments[0] || "");
  const [district, setDistrict] = useState(user.district || node.dist || "State");
  const [language, setLanguage] = useState("Kannada");
  const [hours, setHours] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return toast("Release not saved", "Write a title and the release text.");
    setBusy(true);
    try {
      const r = await api.post<PressRelease>("/press/releases", {
        title, dept, district, language, body, hoursAfterEvent: hours ? +hours : null,
      });
      toast("Draft saved", `${r.id} is waiting for the Commissioner or Joint Director to approve.`);
      invalidate();
      onDone(r.id);
    } catch (x) {
      toast("Release not saved", (x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="fbar pr-form" onSubmit={save}>
      <div className="slicer" style={{ flex: "1 1 100%" }}>
        <label htmlFor="pr-title">Title</label>
        <input id="pr-title" className="nc-in" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} placeholder="One line on what happened" />
      </div>
      <div className="slicer">
        <label htmlFor="pr-dept">Department</label>
        <select id="pr-dept" value={dept} disabled={!!user.department} onChange={(e) => setDept(e.target.value)}>
          {meta.reference.departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="pr-dist">Scope</label>
        <select id="pr-dist" value={district} disabled={!!user.district} onChange={(e) => setDistrict(e.target.value)}>
          <option value="State">State (statewide)</option>
          {geo.ALL_D.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="pr-lang">Language</label>
        <select id="pr-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option>Kannada</option>
          <option>English</option>
        </select>
      </div>
      <div className="slicer">
        <label htmlFor="pr-h">Hours after event</label>
        <input id="pr-h" className="nc-in" inputMode="decimal" style={{ width: 90 }} placeholder="1.4" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      <div className="slicer" style={{ flex: "1 1 100%" }}>
        <label htmlFor="pr-body">Release text</label>
        <textarea id="pr-body" className="nc-in" rows={7} lang={language === "Kannada" ? "kn" : "en"} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <button className="btn pri" type="submit" disabled={busy}>
        Save draft
      </button>
      <span className="mut" style={{ fontSize: 12 }}>
        Drafts go out only after the Commissioner or Joint Director (News) approves them.
      </span>
    </form>
  );
}

function Detail({ r, onClose, onIssued }: { r: PressRelease; onClose: () => void; onIssued: (id: string) => void }) {
  const { user, toast, invalidate, canSee } = useApp();
  const [outlets, setOutlets] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = r.status === "Draft";
  const approver = APPROVERS.includes(user.role);
  const act = async (f: () => Promise<void>, failTitle: string) => {
    setBusy(true);
    try {
      await f();
    } catch (x) {
      toast(failTitle, (x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const issue = () =>
    act(async () => {
      const p = await api.post<PressRelease>(`/press/releases/${r.id}/issue`);
      toast("Release issued", `${p.id} sent to ${nIN(p.reach)} accredited journalists on WhatsApp.`);
      invalidate();
      onIssued(p.id);
    }, "Could not issue");
  const discard = () =>
    act(async () => {
      await api.post(`/press/releases/${r.id}/discard`);
      toast("Draft discarded", r.id);
      invalidate();
      onClose();
    }, "Could not discard");
  const kit = () =>
    act(async () => {
      const name = await api.download(`/press/releases/${r.id}/kit`, `${r.id}-media-kit.zip`);
      toast("Media kit downloaded", name);
      invalidate();
    }, "Could not download the kit");
  const pickup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outlets) return;
    act(async () => {
      const p = await api.post<PressRelease>(`/press/releases/${r.id}/pickup`, { outlets: +outlets });
      toast("Pickup recorded", `${p.id} now carried by ${p.pickup} outlets.`);
      setOutlets("");
      invalidate();
    }, "Could not record pickup");
  };
  return (
    <div className="pr-detail">
      <div className="pr-dh">
        <div>
          <span className={`chip ${draft ? "warn" : "good"}`}>{r.status}</span>{" "}
          <small className="mut">
            {r.id} · {r.dept} · {r.district === "State" ? "Statewide" : r.district}
            {r.language ? " · " + r.language : ""}
          </small>
          <h4>{r.title}</h4>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Close release detail">
          ✕
        </button>
      </div>
      <div className="pr-body" lang={r.language === "Kannada" ? "kn" : undefined}>
        {r.body || <span className="mut">Full text is held by the Media Desk for releases issued before Vaarta 360.</span>}
      </div>
      <dl className="pr-meta">
        <dt>Drafted</dt>
        <dd>{r.draftedBy ? `${r.draftedBy} · ${when(r.draftedAt)}` : "—"}</dd>
        <dt>Approved</dt>
        <dd>{r.approvedBy ? `${r.approvedBy} · ${when(r.issuedAt)}` : draft ? "Waiting for approval" : `Issued ${when(r.issuedAt)}`}</dd>
        {!draft && (
          <>
            <dt>Reach</dt>
            <dd>{nIN(r.reach)} accredited journalists · {r.kits} media kits · {r.pickup} outlets carried it</dd>
          </>
        )}
      </dl>
      <div className="upacts">
        {draft ? (
          <>
            {approver ? (
              <button className="btn pri" disabled={busy} onClick={issue}>
                Approve &amp; issue
              </button>
            ) : (
              <span className="mut">Only the Commissioner or Joint Director (News) can approve.</span>
            )}
            {(approver || r.draftedBy === user.displayName) && (
              <button className="btn" disabled={busy} onClick={discard}>
                Discard draft
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn" disabled={busy} onClick={kit}>
              ⬇ Media kit
            </button>
            {canSee("press") && (
              <form className="pr-pick" onSubmit={pickup}>
                <label htmlFor="pr-out">Record pickup</label>
                <input id="pr-out" className="nc-in" inputMode="numeric" style={{ width: 80 }} placeholder="Outlets" value={outlets} onChange={(e) => setOutlets(e.target.value.replace(/\D/g, ""))} />
                <button className="btn" type="submit" disabled={busy || !outlets}>
                  Add
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
