"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarList, Kpi, StackChart } from "@/components/charts";
import { dShow, isoL, lakh, nIN, pct, sumA } from "@/lib/format";
import { CHILD_LVL, geoChildren, label } from "@/lib/geo";
import {
  billCap, canBill, canCancel, canEditBudget, canIssue, canPay, chv, fyOfMonth, isBooked, monIdx, nextCampaignId, orderAmt, SP_DEFAULT, spendApi, SpendModel,
  statusLabel, statusTone,
} from "@/lib/spend";
import type { OrderDetail, SpendOrderRow, SpState } from "@/lib/spend";
import { placeOk, taggedDistricts, untagged } from "@/lib/registers";
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
  const orders = useApi<SpendOrderRow[]>("/spend/orders?cancelled=true");
  const budget = useApi<BudgetRow[]>("/spend/budget");
  const vendors = useApi<VendorInfo[]>("/spend/vendors").data ?? [];
  const camps = useApi<Row[]>(canSee("campaigns") ? "/registers/campaigns/rows" : null).data ?? [];
  const live = useApi<Meta>("/meta").data ?? meta;
  const [SP, setSPRaw] = useState<SpState>(SP_DEFAULT);
  const set = (p: Partial<SpState>) => setSPRaw((s) => ({ ...s, ...p }));
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const cal = meta.calendar,
    CHANNELS = meta.reference.channels,
    DEPTS = meta.reference.departments,
    CTYPES = meta.reference.campaignTypes,
    FYS = cal.fys,
    CUR = cal.curFy,
    EL = cal.elapsed;
  const CHV = chv(CHANNELS);
  // Orders carry a taluk (statewide ones do not); a taluk node matches it strictly where the district's orders are tagged.
  const tagged = useMemo(() => taggedDistricts(orders.data ?? []), [orders.data]);
  const inNode = useMemo(() => (r: SpendRow) => placeOk(geo, tagged, r, n), [geo, tagged, n]);
  const model = useMemo(
    () => new SpendModel(orders.data ?? [], budget.data ?? [], cal, CHANNELS, inNode, n.lvl === "state", !!user.vendorId),
    [orders.data, budget.data, cal, CHANNELS, inNode, n, user.vendorId],
  );
  if (orders.error) return <ErrorNote msg={orders.error} />;
  if (!orders.data || !budget.data) return <Loading what="spend data" />;

  const vend = !!user.vendorId;
  const rows = model.base(SP),
    listed = model.list(SP) as SpendOrderRow[],
    nCxl = listed.length - rows.length,
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
        ["Orders received", nIN(rows.length), nCxl ? `release orders · ${nIN(nCxl)} cancelled, not counted` : "release orders"],
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
  // State → divisions, division → districts, district → taluks (when its orders carry taluks); a taluk lists its vendors.
  const geoKids = n.lvl === "state" || n.lvl === "div" || (n.lvl === "dist" && tagged.has(n.dist!)) ? geoChildren(geo, n) : [];
  const geoAll = model.rows.filter(
    (r) =>
      isBooked(r) && (SP.fy === "All" || r.fy === SP.fy) && (SP.ctype === "All" || r.ctype === SP.ctype) && (SP.channel === "All" || r.channel === SP.channel) &&
      (SP.dept === "All" || r.department === SP.dept) && (!SP.vendor || r.vendorId === SP.vendor) && (!SP.campaign || r.campaignId === SP.campaign) && r.district !== "Statewide",
  );
  const geoIt = geoKids
    .map((c) => ({ l: label(c), v: sumA(geoAll.filter((r) => placeOk(geo, tagged, r, c))), c }))
    .sort((a, b) => b.v - a.v)
    .map((x) => ({ l: x.l, v: x.v, d: lakh(x.v), onClick: () => drillTo({ lvl: x.c.lvl, name: x.c.name }) }));
  // Statewide media is not split by place: the amount in this selection, whatever the drill level.
  const swAmt = sumA(model.base(SP, { geo: true }).filter((r) => r.district === "Statewide" && isBooked(r)));
  const noTlk = untagged(geoAll.filter((r) => geo.geoOk(r, n)), n);
  const vendorIt = vArr.slice(0, 10).map(([id, v]) => ({ l: id, v, d: lakh(v), on: SP.vendor === id, onClick: () => set({ vendor: SP.vendor === id ? null : id }) }));

  // Same campaign type across years
  const ts: Record<string, number> = {};
  model.rows.forEach((r) => {
    if (isBooked(r) && inNode(r) && (SP.dept === "All" || r.department === SP.dept)) ts[r.ctype] = (ts[r.ctype] || 0) + r.amount;
  });
  let cmp = SP.cmp;
  if (!ts[cmp]) {
    const top = Object.entries(ts).sort((a, b) => b[1] - a[1])[0];
    if (top) cmp = top[0];
  }
  // as in the prototype, the fallback type sticks (it becomes the selected type)
  if (cmp !== SP.cmp) setSPRaw((s) => ({ ...s, cmp }));
  const yRows = model.rows.filter((r) => r.ctype === cmp && isBooked(r) && (SP.dept === "All" || r.department === SP.dept) && inNode(r) && (!SP.l4l || monIdx(r.month) < 6));
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
          {canIssue(user) && (
            <button className="btn pri" onClick={() => setDlg({ k: "issue" })}>
              ＋ Issue release order
            </button>
          )}
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
              {canEditBudget(user) && (
                <button className="btn" onClick={() => setDlg({ k: "budget", fy: SP.fy === "All" ? undefined : SP.fy, channel: SP.channel === "All" ? undefined : SP.channel })}>
                  Edit budget
                </button>
              )}
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {listed
                    .slice()
                    .sort((a, b) => b.month.localeCompare(a.month))
                    .slice(0, SP.allC ? 400 : 25)
                    .map((r) => (
                      <tr key={r.id} className={`click ${r.status === "Cancelled" ? "cxl" : ""}`} onClick={() => setDlg({ k: "order", id: r.id })}>
                        <td className="num">
                          <span className="nm">{r.roNo}</span>
                        </td>
                        <td>{dShow(r.month)}</td>
                        <td>
                          {r.campaign}
                          {r.status === "Cancelled" && (
                            <>
                              <br />
                              <small className="mut">Cancelled{r.cancelledOn ? " on " + dShow(r.cancelledOn) : ""}: {r.cancelReason}</small>
                            </>
                          )}
                        </td>
                        <td>{r.department}</td>
                        <td className="r">
                          <AmtCell r={r} />
                        </td>
                        <td>
                          <span className={`chip ${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
                        </td>
                        <td className="r">
                          {canBill(user, r) && (
                            <button
                              className="btn pri"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDlg({ k: "bill", o: r });
                              }}
                            >
                              Submit bill
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {listed.length > 25 && !SP.allC && (
              <button className="btn more" onClick={() => set({ allC: true })}>
                Show all {listed.length}
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
                <h3>{geoKids.length ? "By " + CHILD_LVL[n.lvl].replace(/s$/, "") : n.lvl === "tlk" ? "Taluk media buys" : "District media buys"}</h3>
                <p>
                  {geoKids.length
                    ? "District papers, outdoor and field shows. Select to drill down."
                    : "Vendors paid for orders in this place · select to filter"}
                </p>
              </div>
            </div>
            {geoKids.length ? (
              <>
                <BarList items={geoIt} />
                {noTlk > 0 && <p className="cap">{nIN(noTlk)} orders have no taluk and count only at district level.</p>}
              </>
            ) : (
              <>
                <p className="cap">
                  {lakh(spent)} spent through {nIN(vArr.length)} vendor{vArr.length === 1 ? "" : "s"} in {label(n)} in this selection.
                </p>
                {vendorIt.length > 0 && <BarList items={vendorIt} />}
              </>
            )}
            {swAmt > 0 && (
              <div className="note" style={{ marginTop: 12 }}>
                {lakh(swAmt)} went to statewide media (TV, statewide papers, digital) and is not split by district.
              </div>
            )}
          </div>
          <OrdersCard rows={listed} onOpen={(id) => setDlg({ k: "order", id })} onAct={setDlg} />
        </>
      )}
      {dlg?.k === "issue" && <IssueDialog rows={orders.data} vendors={vendors} onClose={() => setDlg(null)} onIssued={(id) => setDlg({ k: "order", id })} />}
      {dlg?.k === "order" && <OrderPanel id={dlg.id} onClose={() => setDlg(null)} onAct={setDlg} />}
      {dlg?.k === "bill" && <BillDialog o={dlg.o} onClose={() => setDlg(null)} />}
      {dlg?.k === "pay" && <PayDialog o={dlg.o} onClose={() => setDlg(null)} />}
      {dlg?.k === "cancel" && <CancelDialog o={dlg.o} onClose={() => setDlg(null)} />}
      {dlg?.k === "budget" && <BudgetDialog init={dlg} budget={budget.data} onClose={() => setDlg(null)} />}
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

// ---------------- Release-order workflow ----------------

type Dlg =
  | { k: "issue" }
  | { k: "order"; id: number }
  | { k: "bill"; o: SpendOrderRow }
  | { k: "pay"; o: SpendOrderRow }
  | { k: "cancel"; o: SpendOrderRow }
  | { k: "budget"; dept?: string; channel?: string; fy?: string };

/** The amount spend figures count; when the bill differs from the order, the order amount is shown underneath. */
function AmtCell({ r }: { r: SpendOrderRow }) {
  const oa = orderAmt(r);
  return (
    <>
      {lakh(r.amount)}
      {Math.abs(oa - r.amount) > 0.004 && (
        <>
          <br />
          <small className="mut">order {lakh(oa)}</small>
        </>
      )}
    </>
  );
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function Dialog({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", k);
    ref.current?.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled])")?.focus();
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div className="spdlg-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`spdlg ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="ch">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Fld({ l, children, full }: { l: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? "full" : ""}>
      {l}
      {children}
    </label>
  );
}

function useSubmit(onDone: () => void) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<{ title: string; body: string } | void>) => {
    setBusy(true);
    setErr(null);
    try {
      const t = await f();
      app.invalidate();
      if (t) app.toast(t.title, t.body);
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, setErr, run };
}

function IssueDialog({ rows, vendors, onClose, onIssued }: { rows: SpendOrderRow[]; vendors: VendorInfo[]; onClose: () => void; onIssued: (id: number) => void }) {
  const { user, meta, node } = useApp();
  const ref = meta.reference;
  const cal = meta.calendar;
  const districts = useMemo(() => Object.values(ref.divisions).flat().sort(), [ref.divisions]);
  const camps = useMemo(() => {
    const m = new Map<string, SpendRow>();
    rows.forEach((r) => m.has(r.campaignId) || m.set(r.campaignId, r));
    return [...m.values()].filter((r) => r.fy === cal.curFy || r.fy === cal.fys[cal.fys.length - 2]).sort((a, b) => b.campaignId.localeCompare(a.campaignId));
  }, [rows, cal]);
  const thisMonth = cal.asOf.slice(0, 7);
  const [f, setF] = useState({
    pick: "", campaignId: "", campaign: "", ctype: ref.campaignTypes[0], department: ref.departments[0], district: user.district || (node.lvl === "dist" || node.lvl === "tlk" ? node.dist! : "Statewide"),
    taluk: node.lvl === "tlk" ? node.name : "", channel: ref.channels[0], vendorId: "", month: thisMonth, amount: "",
  });
  const up = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const isNew = f.pick === "";
  const suggested = nextCampaignId(rows, fyOfMonth(f.month || thisMonth));
  const chOpts = ref.channels.filter((c) => vendors.some((v) => v.channel === c && v.district === f.district));
  const channel = chOpts.includes(f.channel) ? f.channel : chOpts[0] || f.channel;
  const vOpts = vendors.filter((v) => v.channel === channel && v.district === f.district);
  const vendorId = vOpts.some((v) => v.id === f.vendorId) ? f.vendorId : vOpts[0]?.id || "";
  const { busy, err, setErr, run } = useSubmit(() => {});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = camps.find((x) => x.campaignId === f.pick);
    const amount = +f.amount;
    if (!vendorId) return setErr("No " + channel.toLowerCase() + " vendor is empanelled for " + f.district + ". Pick another channel or place.");
    if (!(amount > 0)) return setErr("Enter an amount in ₹ lakh.");
    run(async () => {
      const o = await spendApi.issue({
        campaignId: c ? c.campaignId : f.campaignId.trim() || suggested,
        campaign: c ? c.campaign : f.campaign.trim(),
        ctype: c ? c.ctype : f.ctype,
        department: c ? c.department : f.department,
        channel, vendorId, district: f.district, taluk: f.taluk || undefined, month: f.month, amount,
      });
      onIssued(o.id);
      return { title: "Release order issued", body: `${o.roNo} · ${o.vendorId} · ${lakh(o.amount)}` };
    });
  };
  return (
    <Dialog title="Issue release order" sub="The vendor sees it at once and can bill against it" onClose={onClose}>
      <form className="spf" onSubmit={submit}>
        <Fld l="Campaign" full>
          <select value={f.pick} onChange={(e) => up({ pick: e.target.value })}>
            <option value="">New campaign…</option>
            {camps.map((c) => (
              <option key={c.campaignId} value={c.campaignId}>
                {c.campaignId} · {c.campaign}
              </option>
            ))}
          </select>
        </Fld>
        {isNew && (
          <>
            <Fld l="Campaign id">
              <input value={f.campaignId} placeholder={suggested} maxLength={20} onChange={(e) => up({ campaignId: e.target.value })} />
            </Fld>
            <Fld l="Campaign name">
              <input value={f.campaign} required maxLength={120} placeholder="e.g. Dengue prevention, monsoon 2026" onChange={(e) => up({ campaign: e.target.value })} />
            </Fld>
            <Fld l="Campaign type">
              <select value={f.ctype} onChange={(e) => up({ ctype: e.target.value })}>
                {ref.campaignTypes.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Fld>
            <Fld l="Department">
              <select value={f.department} onChange={(e) => up({ department: e.target.value })}>
                {ref.departments.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Fld>
          </>
        )}
        <Fld l="District">
          <select value={f.district} disabled={!!user.district} onChange={(e) => up({ district: e.target.value, taluk: "" })}>
            {!user.district && <option value="Statewide">Statewide</option>}
            {(user.district ? [user.district] : districts).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Fld>
        {f.district !== "Statewide" && (
          <Fld l="Taluk (optional)">
            <select value={f.taluk} onChange={(e) => up({ taluk: e.target.value })}>
              <option value="">Whole district</option>
              {(ref.taluks[f.district] ?? []).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Fld>
        )}
        <Fld l="Channel">
          <select value={channel} onChange={(e) => up({ channel: e.target.value })}>
            {(chOpts.length ? chOpts : ref.channels).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Fld>
        <Fld l="Vendor" full>
          <select value={vendorId} onChange={(e) => up({ vendorId: e.target.value })} disabled={!vOpts.length}>
            {!vOpts.length && <option value="">No empanelled vendor for this channel and place</option>}
            {vOpts.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.language ? " · " + v.language : ""}
              </option>
            ))}
          </select>
        </Fld>
        <Fld l="Month">
          <input type="month" value={f.month} required min={cal.fys[0].slice(0, 4) + "-04"} max={+cal.curFy.slice(0, 4) + 1 + "-03"} onChange={(e) => up({ month: e.target.value })} />
        </Fld>
        <Fld l="Amount (₹ lakh)">
          <input type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required value={f.amount} onChange={(e) => up({ amount: e.target.value })} />
        </Fld>
        <p className="cap full">
          {user.district ? `You can issue orders for ${user.district} only, with vendors based there. ` : ""}
          District vendors take orders for their own district; statewide media take statewide orders. The RO number is given on saving.
        </p>
        {err && <div className="note bad full">{err}</div>}
        <div className="upacts full">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={busy}>
            {busy ? "Issuing…" : "Issue release order"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BillDialog({ o, onClose }: { o: SpendOrderRow; onClose: () => void }) {
  const oa = orderAmt(o);
  const cap = billCap(oa);
  const [f, setF] = useState({ billNo: "", amount: String(oa), billDate: isoL(new Date()) });
  const { busy, err, setErr, run } = useSubmit(onClose);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = +f.amount;
    if (!(amount > 0)) return setErr("Enter the bill amount in ₹ lakh.");
    if (amount > cap) return setErr(`The bill can be at most ${lakh(cap)} (order amount plus 5%).`);
    run(async () => {
      const r = await spendApi.bill(o.id, { billNo: f.billNo.trim(), amount, billDate: f.billDate });
      return { title: "Bill submitted", body: `${r.roNo} · bill ${r.billNo} · ${lakh(r.billAmount ?? amount)}` };
    });
  };
  return (
    <Dialog title="Submit bill" sub={`${o.roNo} · ${o.campaign} · order ${lakh(oa)}`} onClose={onClose}>
      <form className="spf" onSubmit={submit}>
        <Fld l="Bill number">
          <input value={f.billNo} required maxLength={40} onChange={(e) => setF({ ...f, billNo: e.target.value })} />
        </Fld>
        <Fld l="Bill date">
          <input type="date" value={f.billDate} required max={isoL(new Date())} onChange={(e) => setF({ ...f, billDate: e.target.value })} />
        </Fld>
        <Fld l={`Amount (₹ lakh, up to ${cap.toFixed(2)})`} full>
          <input type="number" inputMode="decimal" min="0.01" max={cap} step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Fld>
        {err && <div className="note bad full">{err}</div>}
        <div className="upacts full">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={busy}>
            {busy ? "Submitting…" : "Submit bill"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function PayDialog({ o, onClose }: { o: SpendOrderRow; onClose: () => void }) {
  const [f, setF] = useState({ paidOn: isoL(new Date()), reference: "" });
  const { busy, err, run } = useSubmit(onClose);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await spendApi.pay(o.id, { paidOn: f.paidOn, reference: f.reference.trim() });
      return { title: "Marked paid", body: `${r.roNo} · ${r.vendorId} · ref ${r.paymentRef}` };
    });
  };
  return (
    <Dialog title="Mark paid" sub={`${o.roNo} · ${o.vendorId} · bill ${o.billNo ? o.billNo + " for " + lakh(o.billAmount ?? o.amount) : "on record"}`} onClose={onClose}>
      <form className="spf" onSubmit={submit}>
        <Fld l="Payment date">
          <input type="date" value={f.paidOn} required min={o.billDate} max={isoL(new Date())} onChange={(e) => setF({ ...f, paidOn: e.target.value })} />
        </Fld>
        <Fld l="Payment reference">
          <input value={f.reference} required maxLength={60} placeholder="UTR or cheque number" onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Fld>
        {err && <div className="note bad full">{err}</div>}
        <div className="upacts full">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={busy}>
            {busy ? "Saving…" : "Mark paid"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({ o, onClose }: { o: SpendOrderRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, err, setErr, run } = useSubmit(onClose);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setErr("Give the reason for cancelling.");
    run(async () => {
      const r = await spendApi.cancel(o.id, reason.trim());
      return { title: "Release order cancelled", body: `${r.roNo} · ${r.vendorId} · ${lakh(orderAmt(r))} no longer counts as committed` };
    });
  };
  return (
    <Dialog title="Cancel release order" sub={`${o.roNo} · ${o.vendorId} · ${o.campaign} · ${lakh(orderAmt(o))}`} onClose={onClose}>
      <form className="spf" onSubmit={submit}>
        <Fld l="Reason" full>
          <textarea value={reason} required maxLength={300} rows={3} placeholder="e.g. Issued twice by mistake" onChange={(e) => setReason(e.target.value)} />
        </Fld>
        <p className="cap full">
          The order leaves every spend figure. The vendor sees it as cancelled, with this reason, and can no longer bill it. This cannot be undone.
        </p>
        {err && <div className="note bad full">{err}</div>}
        <div className="upacts full">
          <button type="button" className="btn" onClick={onClose}>
            Keep the order
          </button>
          <button className="btn pri danger" disabled={busy}>
            {busy ? "Cancelling…" : "Cancel release order"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BudgetDialog({ init, budget, onClose }: { init: { dept?: string; channel?: string; fy?: string }; budget: BudgetRow[]; onClose: () => void }) {
  const { meta } = useApp();
  const ref = meta.reference;
  const [f, setF] = useState({ fy: init.fy || meta.calendar.curFy, department: init.dept || ref.departments[0], channel: init.channel || ref.channels[0], budget: "" });
  const cur = budget.filter((b) => b.fy === f.fy && b.department === f.department && b.channel === f.channel);
  const curV = cur.length ? sumA(cur, (b) => b.budget) : null;
  const deptLines = budget.filter((b) => b.fy === f.fy && b.department === f.department);
  const { busy, err, setErr, run } = useSubmit(onClose);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = +f.budget;
    if (f.budget === "" || !(v >= 0)) return setErr("Enter the new budget in ₹ lakh (0 or more).");
    run(async () => {
      await spendApi.setBudget({ fy: f.fy, department: f.department, channel: f.channel, budget: v });
      return { title: "Budget updated", body: `${f.department} · ${f.channel} · ${f.fy}: ${lakh(v)}` };
    });
  };
  return (
    <Dialog title="Edit budget" sub="One line per financial year, department and channel" onClose={onClose}>
      <form className="spf" onSubmit={submit}>
        <Fld l="Financial year">
          <select value={f.fy} onChange={(e) => setF({ ...f, fy: e.target.value })}>
            {meta.calendar.fys.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Fld>
        <Fld l="Department">
          <select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
            {ref.departments.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Fld>
        <Fld l="Channel">
          <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            {ref.channels.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Fld>
        <Fld l={`New budget (₹ lakh) · now ${curV === null ? "not set" : lakh(curV)}`}>
          <input type="number" inputMode="decimal" min="0" max="100000" step="0.01" required value={f.budget} placeholder={curV === null ? "" : String(curV)} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        </Fld>
        {deptLines.length > 0 && (
          <div className="full spbl">
            {ref.channels.map((c) => {
              const v = deptLines.filter((b) => b.channel === c);
              return (
                <button type="button" key={c} className={`chip ${c === f.channel ? "ind" : ""}`} onClick={() => setF({ ...f, channel: c })}>
                  {c}: {v.length ? lakh(sumA(v, (b) => b.budget)) : "—"}
                </button>
              );
            })}
          </div>
        )}
        {err && <div className="note bad full">{err}</div>}
        <div className="upacts full">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={busy}>
            {busy ? "Saving…" : "Save budget"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function OrderPanel({ id, onClose, onAct }: { id: number; onClose: () => void; onAct: (d: Dlg) => void }) {
  const { user } = useApp();
  const { data: o, error } = useApi<OrderDetail>(`/spend/orders/${id}`);
  const dl: [string, React.ReactNode][] = o
    ? [
        ["Status", <span key="s" className={`chip ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>],
        ["Campaign", `${o.campaignId} · ${o.campaign}`],
        ["Type", o.ctype],
        ["Department", o.department],
        ["Vendor", o.vendor],
        ["Channel", o.channel],
        ["District", o.district],
        ...(o.taluk ? ([["Taluk", o.taluk]] as [string, React.ReactNode][]) : []),
        ["Month", `${dShow(o.month)} · ${o.fy} ${o.quarter}`],
        ["Order amount", lakh(orderAmt(o))],
        ["Bill", o.billNo ? `${o.billNo} · ${lakh(o.billAmount ?? 0)} · ${dShow(o.billDate)}` : "—"],
        ["Payment", o.paidOn ? `${dShow(o.paidOn)} · ref ${o.paymentRef}` : "—"],
        [
          "Counts in spend as",
          o.status === "Cancelled" ? "Nothing (cancelled)" : o.status === "RO issued" ? `${lakh(o.amount)} committed` : `${lakh(o.amount)} spent${o.billNo ? " (bill amount)" : ""}`,
        ],
        ...(o.status === "Cancelled" ? ([["Cancelled", `${o.cancelledOn ? dShow(o.cancelledOn) + " · " : ""}${o.cancelledBy ?? ""} · ${o.cancelReason ?? ""}`]] as [string, string][]) : []),
      ]
    : [];
  return (
    <Dialog title={o ? o.roNo : "Release order"} sub={o ? `${o.vendorId} · ${o.campaign}` : undefined} onClose={onClose} wide>
      {error ? (
        <ErrorNote msg={error} />
      ) : !o ? (
        <Loading what="release order" />
      ) : (
        <>
          <dl className="spdl">
            {dl.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h4 className="sph">History</h4>
          {o.history.length ? (
            <ol className="sphist">
              {o.history.map((h, i) => (
                <li key={i}>
                  <b>{h.action}</b> <span className="mut">· {h.by} · {new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  <br />
                  {h.note}
                </li>
              ))}
            </ol>
          ) : (
            <p className="cap">This order came in with the sample data or an upload, so it has no history in Vaarta 360. Status: {statusLabel(o.status)}.</p>
          )}
          <div className="upacts">
            {canBill(user, o) && (
              <button className="btn pri" onClick={() => onAct({ k: "bill", o })}>
                Submit bill
              </button>
            )}
            {canPay(user) && o.status === "Billed" && (
              <button className="btn pri" onClick={() => onAct({ k: "pay", o })}>
                Mark paid
              </button>
            )}
            {canCancel(user, o) && (
              <button className="btn danger" onClick={() => onAct({ k: "cancel", o })}>
                Cancel release order
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}

const ST_FILTERS = [
  ["All", "All"],
  ["RO issued", "To be billed"],
  ["Billed", "Billed"],
  ["Paid", "Paid"],
  ["Cancelled", "Cancelled"],
] as const;

function OrdersCard({ rows, onOpen, onAct }: { rows: SpendOrderRow[]; onOpen: (id: number) => void; onAct: (d: Dlg) => void }) {
  const { user } = useApp();
  const [st, setSt] = useState<string>(canPay(user) ? "Billed" : "All");
  const [n, setN] = useState(10);
  const list = rows
    .filter((r) => st === "All" || r.status === st)
    .sort((a, b) => b.month.localeCompare(a.month) || b.id - a.id);
  const pay = canPay(user);
  return (
    <div className="card s12">
      <div className="ch">
        <div>
          <h3>Release orders</h3>
          <p>In this selection, latest first · select an order to see its bill, payment and history. Cancelled orders count in no figure.</p>
        </div>
        <div className="seg">
          {ST_FILTERS.map(([k, l]) => (
            <button key={k} aria-pressed={st === k} onClick={() => setSt(k)}>
              {l} · {nIN(k === "All" ? rows.length : rows.filter((r) => r.status === k).length)}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <div className="tbw">
          <table className="tb tight">
            <thead>
              <tr>
                <th>RO number</th>
                <th>Month</th>
                <th>Campaign</th>
                <th>Vendor</th>
                <th>District</th>
                <th className="r">Amount</th>
                <th>Status</th>
                {pay && <th />}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, n).map((r) => (
                <tr key={r.id} className={`click ${r.status === "Cancelled" ? "cxl" : ""}`} onClick={() => onOpen(r.id)}>
                  <td className="num">
                    <span className="nm">{r.roNo}</span>
                  </td>
                  <td>{dShow(r.month)}</td>
                  <td>
                    {r.campaign}
                    <br />
                    <small className="mut">
                      {r.status === "Cancelled" ? `Cancelled by ${r.cancelledBy ?? "—"}${r.cancelledOn ? " on " + dShow(r.cancelledOn) : ""}: ${r.cancelReason ?? ""}` : r.department}
                    </small>
                  </td>
                  <td>{r.vendorId}</td>
                  <td>{r.district}</td>
                  <td className="r">
                    <AmtCell r={r} />
                  </td>
                  <td>
                    <span className={`chip ${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
                  </td>
                  {pay && (
                    <td className="r">
                      {canCancel(user, r) && (
                        <button
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAct({ k: "cancel", o: r });
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {r.status === "Billed" && (
                        <button
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAct({ k: "pay", o: r });
                          }}
                        >
                          Mark paid
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">No release orders with this status in the selection.</div>
      )}
      {list.length > n && (
        <button className="btn more" onClick={() => setN(n + 30)}>
          Show 30 more
        </button>
      )}
    </div>
  );
}
