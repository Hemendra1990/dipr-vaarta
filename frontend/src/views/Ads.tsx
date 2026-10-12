"use client";
import { HBars, KpiTile, Scatter, Spark } from "@/components/charts";
import { api } from "@/lib/api";
import { fmt, hash, rs } from "@/lib/format";
import { CHILD_LVL, label, nodeKey } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { AdFlag } from "@/lib/types";
import { ErrorNote, Loading } from "./common";

/** Release-order audit: restricted to the Commissioner and Deputy Director (Accounts). */
export function Ads() {
  const { outreach: o, node: n, filters: f, geo, drillTo, setTab, canSee, toast, invalidate } = useApp();
  const { data, error } = useApi<AdFlag[]>("/ads/flags");
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="audit data" />;
  const m = o.M(n, f),
    fl = data.filter((x) => geo.inNode(x.district, n) || n.lvl === "state");
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
  const review = async (x: AdFlag) => {
    try {
      await api.post("/ads/flags/review", { ro: x.ro });
      toast("Sent for review", `${x.ro} sent to the Deputy Director (Accounts).`);
      invalidate();
    } catch (e) {
      toast("Could not send", (e as Error).message);
    }
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
          <span className="restrict">Restricted view · Commissioner and Secretary only</span>
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
                    <tr key={x.ro}>
                      <td className="num">{x.ro}</td>
                      <td>{x.publication}</td>
                      <td>{x.issue}</td>
                      <td className="r">{rs(x.amount)}</td>
                      <td>
                        <span className={`chip ${x.severity}`}>{x.severity === "crit" ? "High" : "Medium"}</span>
                      </td>
                      <td>
                        {x.reviewStatus === "Sent for review" ? (
                          <button className="btn" disabled title={x.sentBy ? "Sent by " + x.sentBy : undefined}>
                            Sent
                          </button>
                        ) : (
                          <button className="btn" onClick={() => review(x)}>
                            Send for review
                          </button>
                        )}
                      </td>
                    </tr>
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
