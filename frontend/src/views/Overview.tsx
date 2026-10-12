"use client";
import { useState } from "react";
import { HBars, KpiTile, LineChart, Spark } from "@/components/charts";
import { fmt, hash, pct, rateCol } from "@/lib/format";
import { label } from "@/lib/geo";
import { LANGS, MM } from "@/lib/outreach";
import { useApp } from "@/lib/store";
import { Glance } from "./Glance";
import { HexMap } from "./HexMap";
import { Insights } from "./Insights";
import { KidTable } from "./KidTable";
import { Loading } from "./common";

const mmShort = (l: string) =>
  l.replace(" (hours)", "").replace("Subscribers per 1,000 people", "Per 1,000 people").replace("Claims per lakh subscribers", "Claims / lakh").replace("Scheme uptake index", "Uptake");

export function Overview() {
  const { outreach: o, node: n, filters: f, geo, drillTo, meta } = useApp();
  const [mm, setMm] = useState("read");
  if (!o) return <Loading what="outreach data" />;
  const m = o.M(n, f),
    kids = o.children(n),
    lab = o.tLabels(f);
  const tr = o.trend(n, m.read, "read", f),
    trS = o.trend(n, m.deliv, "deliv", f);
  const per = f.period === "7d" ? "last 7 days" : f.period === "90d" ? "last quarter" : "last 30 days";

  let spatial: React.ReactNode;
  if (n.lvl === "state" || n.lvl === "div") {
    const chips = n.lvl === "state" ? o.children(n) : null;
    spatial = (
      <div className="card s7">
        <div className="ch">
          <div>
            <h3>{n.lvl === "state" ? "District map" : "Districts in " + label(n)}</h3>
            <p>Tile map, one hex per district, not to scale. Select a district to drill down.</p>
          </div>
          <div className="seg" role="group" aria-label="Map metric">
            {Object.entries(MM).map(([k, v]) => (
              <button key={k} aria-pressed={mm === k} onClick={() => setMm(k)}>
                {mmShort(v.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="hexwrap">
          <HexMap n={n} mm={mm} o={o} geo={geo} f={f} onPick={(d) => drillTo({ lvl: "dist", name: d })} />
          <div className="legend">
            <div>
              <b style={{ color: "var(--ink)" }}>{MM[mm].label}</b>
              <div className="ramp" style={{ marginTop: 6 }} />
              <div className="ramp-l">
                <span>{MM[mm].inv ? "Worse" : "Lower"}</span>
                <span>{MM[mm].inv ? "Better" : "Higher"}</span>
              </div>
            </div>
            {mm === "read" && (
              <div>
                <span className="chip crit">Red outline</span> three lowest read rates
              </div>
            )}
            <div className="divchips">
              {chips ? (
                chips.map((c) => (
                  <button key={c.name} onClick={() => drillTo({ lvl: "div", name: c.name })}>
                    <b>{c.name} Division</b>
                    <span className="num">{pct(o.M(c, f).readR, 0)} read</span>
                  </button>
                ))
              ) : (
                <button onClick={() => drillTo({ lvl: "state" })}>
                  <b>← All divisions</b>
                  <span />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (n.lvl === "dist") {
    const ms = kids.map((c) => ({ c, m: o.M(c, f) })),
      lo = Math.min(...ms.map((x) => x.m.readR)),
      hi = Math.max(...ms.map((x) => x.m.readR));
    spatial = (
      <div className="card s7">
        <div className="ch">
          <div>
            <h3>Taluks of {n.name}</h3>
            <p>Shaded by read rate. Select a taluk to drill down.</p>
          </div>
          <span className="chip ind">{kids.length} taluks</span>
        </div>
        <div className="tiles">
          {ms.map(({ c, m: mm2 }) => {
            const t = (mm2.readR - lo) / (hi - lo || 1);
            return (
              <button
                key={c.name}
                className="tile"
                onClick={() => drillTo({ lvl: "tlk", name: c.name })}
                style={{ background: `color-mix(in oklab,var(--heat-hi) ${Math.round(6 + t * 55)}%,var(--surface))` }}
              >
                <b>{c.name}</b>
                <span className="big">{pct(mm2.readR, 0)}</span>
                <small>
                  {fmt(mm2.subs)} subscribers · {fmt(mm2.claims)} claims
                </small>
              </button>
            );
          })}
        </div>
      </div>
    );
  } else {
    const qs: [string, number][] = [
      ["Gruha Lakshmi amount not credited for September", 0.31],
      ["How to link Aadhaar with ration card for Anna Bhagya", 0.22],
      ["Is Shakti valid on premium buses?", 0.15],
      ["Gruha Jyothi bill shows a charge", 0.13],
      ["Yuva Nidhi monthly self-declaration deadline", 0.11],
      ["Where is this week's public grievance camp?", 0.08],
    ];
    spatial = (
      <div className="card s7">
        <div className="ch">
          <div>
            <h3>What citizens in {n.name} are asking</h3>
            <p>Top intents from bot conversations, {per}</p>
          </div>
          <span className="aiflag">Clustered by AI</span>
        </div>
        <ul className="leafq">
          {qs.map(([q, s], i) => (
            <li key={q}>
              <span>{q}</span>
              <span>{fmt(m.reply * s * (0.8 + 0.4 * hash(n.name + i)))}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const fun: [string, number][] = [
    ["Sent", m.sent],
    ["Delivered", m.deliv],
    ["Read", m.read],
    ["Replied", m.reply],
  ];
  const schemes = Object.keys(meta.reference.schemes)
    .filter((k) => k !== "All")
    .map((k) => ({ l: k, v: o.M(n, { ...f, scheme: k }).read, on: f.scheme === k }));
  const langs = LANGS.map((k) => ({ l: k, v: o.M(n, { ...f, lang: k }).subs, on: f.lang === k }));
  const sT = schemes.reduce((a, b) => a + b.v, 0);
  const pctOf = (v: number) => pct(v, 0);

  return (
    <>
      <Glance />
      <div className="grid">
        <div className="s12 kpis">
          <KpiTile l="Opted-in subscribers" v={fmt(m.subs)} d={o.dlt(n, "subs", f)} sp={<Spark vals={o.trend(n, m.subs, "subs", f)} />} />
          <KpiTile l="Messages delivered" v={fmt(m.deliv)} d={o.dlt(n, "deliv", f)} sp={<Spark vals={trS} />} />
          <KpiTile l="Read rate" v={pct(m.readR)} d={o.dlt(n, "readR", f) * 0.4} sp={<Spark vals={o.trend(n, m.readR, "rr", f)} col={rateCol(m.readR)} />} />
          <KpiTile l="Reply rate" v={pct(m.replyR)} d={o.dlt(n, "rep", f) * 0.5} sp={<Spark vals={o.trend(n, m.reply, "rep", f)} />} />
          <KpiTile l="Tipline claims" v={fmt(m.claims)} d={o.dlt(n, "cl", f)} sp={<Spark vals={o.trend(n, m.claims, "cl", f)} col="var(--arishina)" />} invert />
          <KpiTile
            l="Median clarification"
            v={m.tat.toFixed(1) + " h"}
            d={o.dlt(n, "tat", f) * 0.6}
            sp={<Spark vals={o.trend(n, m.tat, "tat", f)} col="var(--arishina)" />}
            invert
          />
        </div>
        {spatial}
        <div className="card s5 ins">
          <div className="ch">
            <div>
              <h3>What needs attention</h3>
              <p>{label(n)} · generated from the current slice</p>
            </div>
            <span className="aiflag">AI insight</span>
          </div>
          <Insights n={n} />
        </div>
        <div className="card s8">
          <div className="ch">
            <div>
              <h3>Messages read vs delivered</h3>
              <p>
                {label(n)} · {f.period === "90d" ? "weekly" : "daily"} · solid line read, dashed delivered
              </p>
            </div>
          </div>
          <LineChart
            series={[
              { vals: tr, col: "var(--indigo)" },
              { vals: trS, col: "var(--arishina)" },
            ]}
            labels={lab}
          />
        </div>
        <div className="card s4">
          <div className="ch">
            <div>
              <h3>Engagement funnel</h3>
              <p>Where messages drop off</p>
            </div>
          </div>
          <div className="funnel">
            {fun.map(([l, v], i) => (
              <div className="st" key={l}>
                <span>{l}</span>
                <div className="fb" style={{ width: `${Math.max(28, (v / m.sent) * 100)}%`, opacity: 1 - i * 0.15 }}>
                  <span>{fmt(v)}</span>
                  <span>{i ? pctOf(v / fun[i - 1][1]) : ""}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 14 }}>
            Biggest drop is Delivered → Read. Shorter Kannada voice notes and morning slots usually lift opens; ask the Campaign Planner agent to test it.
          </div>
        </div>
        {kids.length > 0 && (
          <div className="card s12">
            <div className="ch">
              <div>
                <h3>
                  {label(n)} by {n.lvl === "state" ? "divisions" : n.lvl === "div" ? "districts" : "taluks"}
                </h3>
                <p>Select a row to drill down. Select a column to sort.</p>
              </div>
            </div>
            <KidTable
              key={n.name}
              n={n}
              cols={[
                { k: "subs", label: "Subscribers", get: (x) => x.subs, fmt },
                { k: "per1k", label: "Per 1,000 people", get: (x) => x.per1k, fmt: (v) => v.toFixed(1) },
                { k: "readR", label: "Read rate", get: (x) => x.readR, fmt: (v) => pct(v), bar: true, colf: rateCol },
                { k: "replyR", label: "Reply rate", get: (x) => x.replyR, fmt: (v) => pct(v) },
                { k: "claims", label: "Claims", get: (x) => x.claims, fmt },
                { k: "tat", label: "Clarify (h)", get: (x) => x.tat, fmt: (v) => v.toFixed(1) },
                { k: "uptake", label: "Uptake index", get: (x) => x.uptake, fmt: (v) => v.toFixed(0), bar: true },
              ]}
            />
          </div>
        )}
        <div className="card s6">
          <div className="ch">
            <div>
              <h3>Messages read by scheme</h3>
              <p>Change the Scheme filter to focus on one</p>
            </div>
          </div>
          <HBars items={schemes.map((s) => ({ ...s, d: pct(s.v / sT, 0) }))} />
        </div>
        <div className="card s6">
          <div className="ch">
            <div>
              <h3>Subscribers by language</h3>
              <p>Preferred language set at opt-in</p>
            </div>
          </div>
          <HBars items={langs.map((s) => ({ ...s, d: fmt(s.v) }))} />
        </div>
      </div>
    </>
  );
}
