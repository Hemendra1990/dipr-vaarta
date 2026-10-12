"use client";
import { Fragment, useState } from "react";
import { HBars, KpiTile, Scatter, Spark } from "@/components/charts";
import { api } from "@/lib/api";
import { fmt, hash, rs } from "@/lib/format";
import { CHILD_LVL, label, nodeKey, talukOf } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { AdFlagReview } from "@/lib/types";
import { ErrorNote, Loading } from "./common";

/** Release-order audit: restricted to the Commissioner and Deputy Director (Accounts). */
export function Ads() {
  const { outreach: o, node: n, filters: f, geo, drillTo, setTab, canSee, toast, invalidate, user } = useApp();
  const { data, error } = useApi<AdFlagReview[]>("/ads/flags");
  const [deciding, setDeciding] = useState<{ ro: string; outcome: Outcome } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="audit data" />;
  const m = o.M(n, f),
    fl = data.filter((x) => geo.inNode(x.district, n, talukOf(x)) || n.lvl === "state");
  const med = (
    [
      ["Kannada dailies", 0.38],
      ["English dailies", 0.1],
      ["Television", 0.22],
      ["Radio and FM", 0.07],
      ["Digital and social", 0.15],
      ["Outdoor", 0.08],
    ] as [string, number][]
  ).map(([l, s]) => ({ l, v: m.spend * s * (0.85 + 0.3 * hash(nodeKey(n) + l)) }));
  const kids = o.children(n);
  const pts = (kids.length ? kids : [n]).map((c) => {
    const cm = o.M(c, f);
    return {
      key: c.name, label: label(c), short: c.lvl === "dist" ? geo.CODE[c.name] : c.name.slice(0, 12), x: cm.spendPer1k, y: cm.uptake,
      onClick: () => drillTo({ lvl: c.lvl, name: c.name }),
    };
  });
  const isDD = user.role === "DD_ACCOUNTS";
  const review = async (x: AdFlagReview) => {
    setBusy(x.ro);
    try {
      await api.post("/ads/flags/review", { ro: x.ro });
      toast("Sent for review", `${x.ro} sent to the Deputy Director (Accounts).`);
      invalidate();
    } catch (e) {
      toast("Could not send", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const decide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deciding) return;
    if (deciding.outcome === "withheld" && !note.trim()) return toast("Give a reason", "Say why payment is withheld; the vendor and the bill desk see it.");
    setBusy(deciding.ro);
    try {
      await api.post("/ads/flags/decide", { ro: deciding.ro, outcome: deciding.outcome, note });
      toast(OUT[deciding.outcome].toast, `${deciding.ro}${note.trim() ? " · " + note.trim() : ""}`);
      setDeciding(null);
      setNote("");
      invalidate();
    } catch (x) {
      toast("Could not record the decision", (x as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const open = (ro: string, outcome: Outcome) => {
    setDeciding({ ro, outcome });
    setNote("");
  };
  const actions = (x: AdFlagReview) => {
    const st = x.reviewStatus || "Flagged";
    if (st === "Flagged")
      return (
        <button className="btn" disabled={busy === x.ro} onClick={() => review(x)}>
          Send for review
        </button>
      );
    const by = (who?: string | null, at?: string | null) => (who ? `${who}${at ? " · " + when(at) : ""}` : "");
    const head =
      st === "Sent for review" ? (
        <>
          <button className="btn" disabled title={x.sentBy ? "Sent by " + x.sentBy : undefined}>
            Sent
          </button>
          <small className="adf-by">Sent by {by(x.sentBy, x.sentAt)}</small>
        </>
      ) : (
        <>
          <span className={`chip ${OUT_TONE[st] || ""}`}>{st}</span>
          <small className="adf-by">
            {by(x.decidedBy, x.decidedAt)}
            {x.outcomeNote ? <> · {x.outcomeNote}</> : null}
          </small>
          {x.sentBy && <small className="adf-by">Sent by {by(x.sentBy, x.sentAt)}</small>}
        </>
      );
    const can = isDD && (st === "Sent for review" || st === "Payment withheld");
    return (
      <div className="adf-st">
        {head}
        {can && (
          <div className="adf-acts">
            {(Object.keys(OUT) as Outcome[])
              .filter((k) => OUT[k].status !== st)
              .map((k) => (
                <button key={k} className="linkbtn" onClick={() => open(x.ro, k)}>
                  {st === "Payment withheld" && k === "cleared" ? "Release payment" : OUT[k].label}
                </button>
              ))}
          </div>
        )}
        {!can && st === "Sent for review" && !isDD && <small className="adf-by">Awaiting the Deputy Director (Accounts)</small>}
      </div>
    );
  };
  return (
    <>
      <div className="note" style={{ marginBottom: 12 }}>
        This audit view uses the release-order sample. For spend by campaign, channel and vendor, open{" "}
        {canSee("spend") ? (
          <button className="linkbtn" onClick={() => setTab("spend")}>
            Spend analytics
          </button>
        ) : (
          "Spend analytics"
        )}
        .
      </div>
      <div className="grid">
        <div className="s12" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className="restrict">Restricted view · Commissioner and Deputy Director (Accounts) only</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Amounts in ₹ lakh unless shown in crore</span>
        </div>
        <div className="s12 kpis">
          <KpiTile l="Advertising spend" v={rs(m.spend)} d={o.dlt(n, "sp", f)} sp={<Spark vals={o.trend(n, m.spend, "sp", f)} col="var(--arishina)" />} invert />
          <KpiTile l="Release orders" v={fmt(m.spend / 0.42)} d={o.dlt(n, "ro", f)} />
          <KpiTile l="Spend per 1,000 people" v={"₹" + m.spendPer1k.toFixed(0)} d={o.dlt(n, "pk1", f)} invert />
          <KpiTile l="Bills pending > 90 days" v={rs(m.spend * 0.14)} d={o.dlt(n, "pend", f)} invert />
          <KpiTile l="Orders flagged by audit agent" v={String(fl.length)} d={o.dlt(n, "fl", f)} invert />
        </div>
        <div className="card s7">
          <div className="ch">
            <div>
              <h3>Spend against scheme uptake</h3>
              <p>
                Each dot is a {CHILD_LVL[n.lvl] ? CHILD_LVL[n.lvl].replace(/s$/, "") : "taluk"}. Red: above-average spend with below-average uptake. Select a dot to
                drill down.
              </p>
            </div>
          </div>
          <Scatter pts={pts} />
        </div>
        <div className="card s5">
          <div className="ch">
            <div>
              <h3>Spend by medium</h3>
              <p>{label(n)}</p>
            </div>
          </div>
          <HBars items={med.map((x) => ({ ...x, d: rs(x.v) }))} />
        </div>
        <div className="card s12">
          <div className="ch">
            <div>
              <h3>Release orders flagged for review</h3>
              <p>Raised by the Ad Spend Auditor agent. Nothing is withheld automatically; an officer decides.</p>
            </div>
            <span className="aiflag">AI audit</span>
          </div>
          {fl.length ? (
            <div className="tbw">
              <table className="tb">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Publication or vendor</th>
                    <th>Issue</th>
                    <th className="r">Amount</th>
                    <th>Severity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fl.map((x) => (
                    <Fragment key={x.ro}>
                      <tr>
                        <td className="num">{x.ro}</td>
                        <td>{x.publication}</td>
                        <td>{x.issue}</td>
                        <td className="r">{rs(x.amount)}</td>
                        <td>
                          <span className={`chip ${x.severity}`}>{x.severity === "crit" ? "High" : "Medium"}</span>
                        </td>
                        <td>{actions(x)}</td>
                      </tr>
                      {deciding?.ro === x.ro && (
                        <tr className="adf-form">
                          <td colSpan={6}>
                            <form className="fbar" onSubmit={decide}>
                              <div className="slicer" style={{ flex: "1 1 320px" }}>
                                <label htmlFor="adf-note">
                                  {OUT[deciding.outcome].label} · {deciding.outcome === "withheld" ? "reason (required)" : "note (optional)"}
                                </label>
                                <input
                                  id="adf-note"
                                  className="nc-in"
                                  autoFocus
                                  maxLength={500}
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  placeholder={OUT[deciding.outcome].ph}
                                />
                              </div>
                              <button className={`btn${deciding.outcome === "withheld" ? " pri" : ""}`} type="submit" disabled={busy === x.ro}>
                                {OUT[deciding.outcome].confirm}
                              </button>
                              <button className="btn" type="button" onClick={() => setDeciding(null)}>
                                Cancel
                              </button>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No flagged orders in this area.</div>
          )}
        </div>
      </div>
    </>
  );
}

type Outcome = "cleared" | "withheld" | "resolved";
const OUT: Record<Outcome, { status: string; label: string; confirm: string; toast: string; ph: string }> = {
  cleared: { status: "Cleared", label: "Clear", confirm: "Clear the order", toast: "Order cleared", ph: "e.g. Rate matches the revised card" },
  withheld: { status: "Payment withheld", label: "Withhold payment", confirm: "Withhold payment", toast: "Payment withheld", ph: "e.g. Telecast certificates still missing" },
  resolved: { status: "Resolved", label: "Mark resolved", confirm: "Mark resolved", toast: "Flag resolved", ph: "e.g. Vendor sent a corrected bill" },
};
const OUT_TONE: Record<string, string> = { Cleared: "good", Resolved: "good", "Payment withheld": "crit" };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
