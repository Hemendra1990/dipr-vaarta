"use client";
import { HBars, InlineBar, KpiTile, Spark } from "@/components/charts";
import { fmt, hash, pct } from "@/lib/format";
import { CHILD_LVL, label, nodeKey } from "@/lib/geo";
import { useApi, useApp } from "@/lib/store";
import type { Release } from "@/lib/types";
import { KidTable } from "./KidTable";
import { ErrorNote, Loading } from "./common";

export function Press() {
  const { outreach: o, node: n, filters: f, geo } = useApp();
  const { data, error } = useApi<Release[]>("/press/releases");
  if (error) return <ErrorNote msg={error} />;
  if (!o || !data) return <Loading what="press data" />;
  const m = o.M(n, f),
    rl = data.filter((r) => geo.inScope(r.district, n)),
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
        </div>
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
                  <tr key={r.id}>
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
