"use client";
import { useMemo, useState } from "react";
import { BarList, Kpi, StackChart } from "@/components/charts";
import { dShow, lakh, nIN, pct, sumA, toneOf } from "@/lib/format";
import { CHILD_LVL, geoChildren, label } from "@/lib/geo";
import { chv, isBooked, monIdx, SP_DEFAULT, SpendModel, SpState } from "@/lib/spend";
import { useApi, useApp } from "@/lib/store";
import type { BudgetRow, Meta, Row, SpendRow, VendorInfo } from "@/lib/types";
import { ErrorNote, Loading } from "./common";

function utilChipS(a: number, b: number, e: number) {
  if (!b) return null;
  const t = a > b ? "crit" : a > e * 1.1 || a < e * 0.6 ? "warn" : "good",
    l = a > b ? "Over budget" : a > e * 1.1 ? "Ahead of plan" : a < e * 0.6 ? "Slow" : "On track";
  return (
    <span className={`chip ${t}`} title={l}>
      {pct(a / b, 0)}
    </span>
  );
}

function utilChip(a: number, b: number, e: number) {
  if (!b) return <span className="chip">No budget</span>;
  if (a > b) return <span className="chip crit">Over budget · {pct(a / b, 0)}</span>;
  if (a > e * 1.1) return <span className="chip warn">Ahead of plan · {pct(a / b, 0)}</span>;
  if (a < e * 0.6) return <span className="chip warn">Slow · {pct(a / b, 0)}</span>;
  return <span className="chip good">On track · {pct(a / b, 0)}</span>;
}

function Sel({ id, lab, opts, v, onChange }: { id: string; lab: string; opts: (string | [string, string])[]; v: string; onChange: (v: string) => void }) {
  return (
    <div className="slicer">
      <label htmlFor={id}>{lab}</label>
      <select id={id} value={v} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => {
          const [val, txt] = Array.isArray(o) ? o : [o, o];
          return (
            <option key={val} value={val}>
              {txt}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function Spend() {
  const { user, node: n, geo, meta, canSee, drillTo, goUpload } = useApp();
  const orders = useApi<SpendRow[]>("/spend/orders");
  const budget = useApi<BudgetRow[]>("/spend/budget");
  const vendors = useApi<VendorInfo[]>("/spend/vendors").data ?? [];
  const camps = useApi<Row[]>(canSee("campaigns") ? "/registers/campaigns/rows" : null).data ?? [];
  const live = useApi<Meta>("/meta").data ?? meta;
  const [SP, setSPRaw] = useState<SpState>(SP_DEFAULT);
  const set = (p: Partial<SpState>) => setSPRaw((s) => ({ ...s, ...p }));
  const cal = meta.calendar,
    CHANNELS = meta.reference.channels,
    DEPTS = meta.reference.departments,
    CTYPES = meta.reference.campaignTypes,
    FYS = cal.fys,
    CUR = cal.curFy,
    EL = cal.elapsed;
  const CHV = chv(CHANNELS);
  const model = useMemo(
    () => new SpendModel(orders.data ?? [], budget.data ?? [], cal, CHANNELS, (r) => geo.geoOk(r, n), n.lvl === "state", !!user.vendorId),
    [orders.data, budget.data, cal, CHANNELS, geo, n, user.vendorId],
  );
  if (orders.error) return <ErrorNote msg={orders.error} />;
  if (!orders.data || !budget.data) return <Loading what="spend data" />;

  const vend = !!user.vendorId;
  const rows = model.base(SP),
    bk = rows.filter(isBooked),
    spent = sumA(bk),
    comm = sumA(rows.filter((r) => !isBooked(r))),
    paid = sumA(rows.filter((r) => r.status === "Paid"));
  const bo = model.budOk(SP),
    br = bo ? model.budRows(SP) : [],
    bud = sumA(br, (b) => b.budget),
    exp = sumA(br, model.expTo);
  const vs: Record<string, number> = {};
  bk.forEach((r) => (vs[r.vendorId] = (vs[r.vendorId] || 0) + r.amount));
  const vArr = Object.entries(vs).sort((a, b) => b[1] - a[1]);
  const top5 = spent ? sumA(vArr.slice(0, 5), (x) => x[1]) / spent : 0;
  const kp: [string, string, string, string?][] = vend
    ? [
        ["Orders received", nIN(rows.length), "release orders"],
        ["Billed and paid", lakh(spent), ""],
        ["Paid", lakh(paid), ""],
        ["Awaiting payment", lakh(spent - paid), "billed, not yet paid", "warn"],
        ["Not yet billed", lakh(comm), "orders to bill", ""],
      ]
    : [
        ["Budget", bo ? lakh(bud) : "—", bo ? (SP.fy === "All" ? "all years" : SP.fy) : "set by department and channel only"],
        ["Spent", lakh(spent), "billed + paid"],
        ["Used", bo && bud ? pct(spent / bud, 0) : "—", bo && (SP.fy === CUR || SP.fy === "All") ? `expected to date ${pct(exp / bud, 0)}` : "", bo && spent > exp * 1.1 ? "warn" : ""],
        ["Committed", lakh(comm), "orders issued, not billed"],
        ["Vendors paid", nIN(vArr.length), `top 5 take ${pct(top5, 0)}`, top5 > 0.5 ? "warn" : ""],
      ];
  const td = model.trend(SP),
    selI = SP.gran === "year" && SP.fy !== "All" ? td.P.findIndex((p) => p.fy === SP.fy) : -1;
  const chR = CHANNELS.map((c) => {
    const a = sumA(bk.filter((r) => r.channel === c)),
      bb = br.filter((x) => x.channel === c);
    return { c, a, b: sumA(bb, (x) => x.budget), e: sumA(bb, model.expTo) };
  }).filter((x) => x.a || x.b);
  const chM = Math.max(1, ...chR.map((x) => Math.max(x.a, x.b)));
  const dR = DEPTS.map((d) => {
    const a = sumA(bk.filter((r) => r.department === d)),
      bb = br.filter((x) => x.department === d);
    return { d, a, b: sumA(bb, (x) => x.budget), e: sumA(bb, model.expTo) };
  })
    .filter((x) => x.a || x.b)
    .sort((x, y) => y.a - x.a);
  type CG = { id: string; name: string; type: string; dept: string; fy: string; s: number; c: number; ch: Record<string, number> };
  const cg: Record<string, CG> = {};
  rows.forEach((r) => {
    const o = cg[r.campaignId] || (cg[r.campaignId] = { id: r.campaignId, name: r.campaign, type: r.ctype, dept: r.department, fy: r.fy, s: 0, c: 0, ch: {} });
    if (isBooked(r)) o.s += r.amount;
    else o.c += r.amount;
    o.ch[r.channel] = (o.ch[r.channel] || 0) + r.amount;
  });
  const cArr = Object.values(cg).sort((a, b) => b.s - a.s);
  const cb: Record<string, number> = {};
  camps.forEach((c) => (cb[String(c.campaignId)] = +c.budget));
  const geoKids = n.lvl === "state" || n.lvl === "div" ? geoChildren(geo, n) : [];
  const swAmt = sumA(model.base(SP).filter((r) => r.district === "Statewide" && isBooked(r)));
  const geoAll = model.rows.filter(
    (r) =>
      isBooked(r) && (SP.fy === "All" || r.fy === SP.fy) && (SP.ctype === "All" || r.ctype === SP.ctype) && (SP.channel === "All" || r.channel === SP.channel) &&
      (SP.dept === "All" || r.department === SP.dept) && (!SP.vendor || r.vendorId === SP.vendor) && (!SP.campaign || r.campaignId === SP.campaign) && r.district !== "Statewide",
  );
  const geoIt = geoKids
    .map((c) => ({ l: label(c), v: sumA(geoAll.filter((r) => geo.geoOk(r, c))), c }))
    .sort((a, b) => b.v - a.v)
    .map((x) => ({ l: x.l, v: x.v, d: lakh(x.v), onClick: () => drillTo({ lvl: x.c.lvl, name: x.c.name }) }));

  // Same campaign type across years
  const ts: Record<string, number> = {};
  model.rows.forEach((r) => {
    if (isBooked(r) && geo.geoOk(r, n) && (SP.dept === "All" || r.department === SP.dept)) ts[r.ctype] = (ts[r.ctype] || 0) + r.amount;
  });
  let cmp = SP.cmp;
  if (!ts[cmp]) {
    const top = Object.entries(ts).sort((a, b) => b[1] - a[1])[0];
    if (top) cmp = top[0];
  }
  const yRows = model.rows.filter((r) => r.ctype === cmp && isBooked(r) && (SP.dept === "All" || r.department === SP.dept) && geo.geoOk(r, n) && (!SP.l4l || monIdx(r.month) < 6));
  const yP = FYS.map((fy) => ({ key: fy, label: "FY " + fy.slice(2), fy }));
  const ySer = CHANNELS.map((c) => FYS.map((fy) => sumA(yRows.filter((r) => r.fy === fy && r.channel === c))));
  const yTot = FYS.map((_, i) => ySer.reduce((s, a) => s + a[i], 0));
  const cA = SP.l4l ? FYS.length - 1 : FYS.length - 2,
    cB = cA - 1;
  const ins = model.insights(SP, model.rows);
  const chips: [keyof SpState, string][] = [];
  if (SP.vendor) chips.push(["vendor", "Vendor: " + SP.vendor]);
  if (SP.campaign) chips.push(["campaign", "Campaign: " + (cg[SP.campaign]?.name || SP.campaign)]);
  const src = live.sources?.spend;
  const legend = (withBud: boolean) => (
    <div className="lgd">
      {CHANNELS.map((c) => (
        <span key={c}>
          <i style={{ background: CHV(c) }} />
          {c}
        </span>
      ))}
      {withBud && (
        <span>
          <i className="dash" />
          Budget
        </span>
      )}
    </div>
  );
  const colors = CHANNELS.map(CHV);
  const pickPeriod = (i: number) => {
    const p = td.P[i];
    if (!p) return;
    if (SP.gran === "year") set({ fy: p.fy, gran: "quarter" });
    else if (SP.gran === "quarter") set({ fy: p.fy, gran: "month" });
  };
  const toggle = (k: "channel" | "dept", v: string) => set({ [k]: SP[k] === v ? "All" : v } as Partial<SpState>);

  return (
    <div className="grid">
      <div className="s12 modhead">
        <div>
          <h2>{vend ? "My release orders and payments" : "Spend analytics"}</h2>
          <p>
            {vend
              ? "Every release order DIPR has issued to " + user.vendorId + ", and where each payment stands"
              : "Where publicity money goes, by campaign, channel, vendor and place, against budget"}
          </p>
        </div>
        <div className="mh-acts">
          {src ? <span className="chip good">Uploaded · {src.file}</span> : <span className="chip">Sample data</span>}
          {canSee("upload") && !vend && (
            <>
              <button className="btn pri" onClick={() => goUpload("spend")}>
                ⬆ Upload spend
              </button>
              {!user.district && (
                <button className="btn" onClick={() => goUpload("budget")}>
                  ⬆ Upload budget
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="card s12 fcard">
        <div className="fbar">
          <Sel
            id="sp-fy"
            lab="Financial year"
            opts={[["All", "All years"], ...FYS.map((f) => [f, f + (f === CUR ? ` (Apr–${dShow(cal.lastYm).slice(0, 3)})` : "")] as [string, string])]}
            v={SP.fy}
            onChange={(v) => set({ fy: v, ...(v !== "All" && SP.gran === "year" ? { gran: "quarter" as const } : {}) })}
          />
          <Sel id="sp-ct" lab="Campaign type" opts={["All", ...CTYPES]} v={SP.ctype} onChange={(v) => set({ ctype: v })} />
          <Sel id="sp-ch" lab="Channel" opts={["All", ...CHANNELS]} v={SP.channel} onChange={(v) => set({ channel: v })} />
          {!user.department && !vend && <Sel id="sp-dp" lab="Department" opts={["All", ...DEPTS]} v={SP.dept} onChange={(v) => set({ dept: v })} />}
          {user.department && <span className="chip ind">Locked: {user.department}</span>}
          {chips.map(([k, t]) => (
            <button key={k} className="fchip" onClick={() => set({ [k]: null } as Partial<SpState>)}>
              {t} ×
            </button>
          ))}
          <button className="clearf" onClick={() => set({ fy: "All", ctype: "All", channel: "All", dept: "All", vendor: null, campaign: null, gran: "year" })}>
            Reset
          </button>
        </div>
      </div>
      <div className="s12 kpis">
        {kp.map(([l, v, s, t]) => (
          <Kpi key={l} l={l} v={v} s={s} t={t} />
        ))}
      </div>
      <div className="card s8">
        <div className="ch">
          <div>
            <h3>Spend over time</h3>
            <p>
              {SP.gran === "year" ? "By financial year. Select a year to see its quarters." : SP.gran === "quarter" ? "By quarter. Select a quarter to see its months." : "By month"}
              {td.bud ? " · dashed line is budget" : ""}
            </p>
          </div>
          <div className="seg">
            {(
              [
                ["year", "Year"],
                ["quarter", "Quarter"],
                ["month", "Month"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} aria-pressed={SP.gran === k} onClick={() => set({ gran: k })}>
                {l}
              </button>
            ))}
            {SP.gran !== "year" && <button onClick={() => (SP.gran === "month" ? set({ gran: "quarter" }) : set({ gran: "year", fy: "All" }))}>↑ Up</button>}
          </div>
        </div>
        <StackChart
          periods={td.P}
          ser={td.ser}
          bud={td.bud}
          colors={colors}
          proj={SP.gran === "year"}
          curFy={CUR}
          elapsed={EL}
          sel={selI}
          onSelect={SP.gran !== "month" ? pickPeriod : undefined}
          maxLabels={SP.gran === "month" ? 14 : 20}
        />
        {legend(!!td.bud)}
        {SP.gran === "year" && (
          <p className="cap">
            FY {CUR.slice(2)} covers April to {dShow(cal.lastYm).slice(0, 3) === "Sep" ? "September" : dShow(cal.lastYm)}. The dashed outline shows the full year at the
            current run-rate. Dips in 2023 and 2024 match the election Model Code periods.
          </p>
        )}
      </div>
      <div className="card s4 ins">
        <div className="ch">
          <div>
            <h3>What the numbers say</h3>
            <p>{label(n)}</p>
          </div>
          <span className="aiflag">AI insight</span>
        </div>
        <ul>
          {ins.map((o, i) => (
            <li key={i}>
              <span className="bar" style={{ background: `var(--${o.t})` }} />
              <div>
                <p dangerouslySetInnerHTML={{ __html: o.x }} />
              </div>
            </li>
          ))}
        </ul>
        {!vend && canSee("ai") && (
          <div className="acts" style={{ marginTop: 12 }}>
            <SpendForecastButton />
          </div>
        )}
      </div>
      {!vend && (
        <>
          <div className="card s6">
            <div className="ch">
              <div>
                <h3>Budget vs spent by channel</h3>
                <p>{bo ? "Bar is spent, outline is budget, tick is where spend should be by now" : "Budget comparison needs state level with no campaign or vendor filter"}</p>
              </div>
            </div>
            <div className="bul">
              {chR.map((x) => (
                <button key={x.c} className="bulr" onClick={() => toggle("channel", x.c)}>
                  <span className="bn">
                    <i style={{ background: CHV(x.c) }} />
                    {x.c}
                  </span>
                  <span className="bt">
                    {x.b > 0 && <i className="bb" style={{ width: `${(x.b / chM) * 100}%` }} />}
                    <i className="ba" style={{ width: `${(x.a / chM) * 100}%`, background: CHV(x.c) }} />
                    {x.b > 0 && x.e < x.b && <i className="be" style={{ left: `${(x.e / chM) * 100}%` }} />}
                  </span>
                  <span className="bv">
                    {lakh(x.a)}
                    {x.b ? " of " + lakh(x.b) : ""}
                    <br />
                    {bo ? utilChip(x.a, x.b, x.e) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="card s6">
            <div className="ch">
              <div>
                <h3>Budget vs spent by department</h3>
                <p>Variance against what should be spent by now</p>
              </div>
            </div>
            <div className="tbw">
              <table className="tb tight">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="r">Budget</th>
                    <th className="r">Spent</th>
                    <th className="r">Variance</th>
                    <th>Used</th>
                  </tr>
                </thead>
                <tbody>
                  {dR.map((x) => (
                    <tr key={x.d} className={`click ${SP.dept === x.d ? "on" : ""}`} onClick={() => !user.department && toggle("dept", x.d)}>
                      <td>
                        <span className="nm">{x.d}</span>
                      </td>
                      <td className="r">{x.b ? lakh(x.b) : "—"}</td>
                      <td className="r">{lakh(x.a)}</td>
                      <td className={`r ${x.b && x.a > x.e ? "neg" : ""}`}>{x.b ? (x.a > x.e ? "+" : "−") + lakh(Math.abs(x.a - x.e)) : "—"}</td>
                      <td>{bo ? utilChipS(x.a, x.b, x.e) : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="cap">Status chip: share of budget used. Red is over budget, amber is ahead of plan or slow.</p>
          </div>
        </>
      )}
      <div className={`card ${vend ? "s12" : "s7"}`}>
        <div className="ch">
          <div>
            <h3>{vend ? "My release orders" : "Spend by campaign"}</h3>
            <p>{vend ? "Latest first" : "Select a campaign to see its channels, vendors and months"}</p>
          </div>
        </div>
        {vend ? (
          <>
            <div className="tbw">
              <table className="tb tight">
                <thead>
                  <tr>
                    <th>RO number</th>
                    <th>Month</th>
                    <th>Campaign</th>
                    <th>Department</th>
                    <th className="r">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .sort((a, b) => b.month.localeCompare(a.month))
                    .slice(0, SP.allC ? 400 : 25)
                    .map((r) => (
                      <tr key={r.roNo}>
                        <td className="num">{r.roNo}</td>
                        <td>{dShow(r.month)}</td>
                        <td>{r.campaign}</td>
                        <td>{r.department}</td>
                        <td className="r">{lakh(r.amount)}</td>
                        <td>
                          <span className={`chip ${toneOf(r.status === "RO issued" ? "Pending" : r.status)}`}>{r.status === "RO issued" ? "To be billed" : r.status}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {rows.length > 25 && !SP.allC && (
              <button className="btn more" onClick={() => set({ allC: true })}>
                Show all {rows.length}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="tbw">
              <table className="tb tight">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>FY</th>
                    <th className="r">Budget</th>
                    <th className="r">Spent</th>
                    <th>Used</th>
                    <th>Channel mix</th>
                  </tr>
                </thead>
                <tbody>
                  {cArr.slice(0, SP.allC ? 200 : 10).map((c) => {
                    const b = cb[c.id] || 0,
                      t = c.s + c.c || 1;
                    return (
                      <tr key={c.id} className={`click ${SP.campaign === c.id ? "on" : ""}`} onClick={() => set({ campaign: SP.campaign === c.id ? null : c.id })}>
                        <td>
                          <span className="nm">{c.name.replace(/ \d{4}-\d{2}$/, "")}</span>
                          <br />
                          <small className="mut">
                            {c.type} · {c.dept}
                          </small>
                        </td>
                        <td>{c.fy}</td>
                        <td className="r">{b ? lakh(b) : "—"}</td>
                        <td className="r">{lakh(c.s)}</td>
                        <td>{b ? <span className={`chip ${c.s > b ? "crit" : c.s > b * 0.9 ? "warn" : "good"}`}>{pct(c.s / b, 0)}</span> : null}</td>
                        <td>
                          <span className="mix">
                            {CHANNELS.map((ch) =>
                              c.ch[ch] ? <i key={ch} style={{ width: `${(c.ch[ch] / t) * 100}%`, background: CHV(ch) }} title={`${ch}: ${lakh(c.ch[ch])}`} /> : null,
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {cArr.length > 10 && !SP.allC && (
              <button className="btn more" onClick={() => set({ allC: true })}>
                Show all {cArr.length} campaigns
              </button>
            )}
          </>
        )}
      </div>
      {!vend && (
        <>
          <div className="card s5">
            <div className="ch">
              <div>
                <h3>Spend by vendor</h3>
                <p>Top vendors in this selection · select to filter</p>
              </div>
              <span className={`chip ${top5 > 0.5 ? "warn" : "ind"}`}>Top 5 share {pct(top5, 0)}</span>
            </div>
            <div className="tbw">
              <table className="tb tight">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th className="r">Spent</th>
                    <th className="r">Share</th>
                    <th className="r">Running total</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let cum = 0;
                    return vArr.slice(0, SP.allV ? 200 : 12).map(([id, v]) => {
                      cum += v;
                      const vd = vendors.find((x) => x.id === id);
                      return (
                        <tr key={id} className={`click ${SP.vendor === id ? "on" : ""}`} onClick={() => set({ vendor: SP.vendor === id ? null : id })}>
                          <td>
                            <span className="nm">{id}</span>
                            <br />
                            <small className="mut">{vd ? vd.kind + (vd.district !== "Statewide" ? ", " + vd.district : "") : ""}</small>
                          </td>
                          <td className="r">{lakh(v)}</td>
                          <td className="r">{pct(v / (spent || 1), 1)}</td>
                          <td className="r">
                            <div className="ib">
                              <span>{pct(cum / (spent || 1), 0)}</span>
                              <div className="t">
                                <i style={{ width: `${(cum / (spent || 1)) * 100}%`, background: "var(--indigo)" }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
            {vArr.length > 12 && !SP.allV && (
              <button className="btn more" onClick={() => set({ allV: true })}>
                Show all {vArr.length} vendors
              </button>
            )}
          </div>
          <div className="card s8">
            <div className="ch">
              <div>
                <h3>Same campaign type across years</h3>
                <p>Spend by channel for one type of campaign, year on year{SP.l4l ? " · April to September only, so this year compares fairly" : ""}</p>
              </div>
              <div className="fbar mini">
                <Sel id="sp-cmp" lab="Campaign type" opts={CTYPES} v={cmp} onChange={(v) => set({ cmp: v })} />
                <label className="tog">
                  <input type="checkbox" checked={SP.l4l} onChange={(e) => set({ l4l: e.target.checked })} /> Like-for-like (Apr–Sep)
                </label>
              </div>
            </div>
            {yTot.some((v) => v) ? (
              <>
                <StackChart periods={yP} ser={ySer} bud={null} colors={colors} curFy={CUR} elapsed={EL} aria="Campaign type by year" />
                {legend(false)}
              </>
            ) : (
              <div className="empty">No spend for this campaign type in the current selection.</div>
            )}
            <div className="tbw">
              <table className="tb tight">
                <thead>
                  <tr>
                    <th>Channel</th>
                    {FYS.map((f) => (
                      <th key={f} className="r">
                        {f}
                      </th>
                    ))}
                    <th className="r">
                      {FYS[cA].slice(2)} vs {FYS[cB].slice(2)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CHANNELS.map((c, ci) => {
                    const v = ySer[ci];
                    if (!v.some((x) => x)) return null;
                    const ch = v[cB] ? (v[cA] - v[cB]) / v[cB] : null;
                    return (
                      <tr key={c}>
                        <td>
                          <span className="sw" style={{ background: CHV(c) }} />
                          {c}
                        </td>
                        {v.map((x, i) => (
                          <td key={i} className="r">
                            {x ? lakh(x) : "—"}
                          </td>
                        ))}
                        <td className={`r ${ch !== null && ch > 0 ? "pos" : ch !== null && ch < 0 ? "neg" : ""}`}>{ch === null ? "new" : (ch > 0 ? "+" : "") + pct(ch, 0)}</td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>Total</td>
                    {yTot.map((x, i) => (
                      <td key={i} className="r">
                        {x ? lakh(x) : "—"}
                      </td>
                    ))}
                    <td className="r">{yTot[cB] ? (yTot[cA] - yTot[cB] > 0 ? "+" : "") + pct((yTot[cA] - yTot[cB]) / yTot[cB], 0) : "new"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {cmp === "Guarantee schemes awareness" && <p className="cap">The guarantee schemes began in 2023, so there is no 2022-23 spend for this type.</p>}
          </div>
          <div className="card s4">
            <div className="ch">
              <div>
                <h3>{geoKids.length ? "By " + CHILD_LVL[n.lvl].replace(/s$/, "") : "District media buys"}</h3>
                <p>District papers, outdoor and field shows. Select to drill down.</p>
              </div>
            </div>
            {geoKids.length ? (
              <BarList items={geoIt} />
            ) : (
              <p className="cap">
                {lakh(sumA(bk))} spent through {n.dist || ""} vendors in this selection.
              </p>
            )}
            <div className="note" style={{ marginTop: 12 }}>
              {lakh(swAmt)} went to statewide media (TV, statewide papers, digital) and is not split by district.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SpendForecastButton() {
  const app = useApp();
  return (
    <button className="btn pri" onClick={() => import("@/lib/agents").then((m) => m.runAgent(app, "spend"))}>
      Run Spend Forecaster
    </button>
  );
}
