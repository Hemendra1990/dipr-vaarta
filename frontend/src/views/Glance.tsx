"use client";
import { dShow, lakh, pct, sumA } from "@/lib/format";
import { label } from "@/lib/geo";
import { derive, makeCtx } from "@/lib/registers";
import { useApi, useApp } from "@/lib/store";
import type { BudgetRow, Row, SpendRow } from "@/lib/types";

/** "Department at a glance": one tile per wing the user can open, for the area in view. */
export function Glance() {
  const { canSee, node: n, geo, meta, setTab } = useApp();
  const cal = meta.calendar,
    ctx = makeCtx(cal);
  const sp = useApi<SpendRow[]>(canSee("spend") ? "/spend/orders" : null).data;
  const bud = useApi<BudgetRow[]>(canSee("spend") ? "/spend/budget" : null).data;
  const reg = (id: string) => {
    const def = meta.registers.find((r) => r.id === id);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const d = useApi<Row[]>(canSee(id) ? `/registers/${id}/rows` : null).data;
    return (d ?? []).filter((r) => def?.geoAll || geo.geoOk(r, n)).map((r) => derive(id, r, ctx));
  };
  const bills = reg("bills"),
    camps = reg("campaigns"),
    med = reg("media"),
    welA = reg("welfare"),
    fldA = reg("field"),
    filmA = reg("film"),
    rtiA = reg("rti");
  const cur = (sp ?? []).filter((r) => r.fy === cal.curFy && r.status !== "RO issued" && geo.geoOk(r, n)),
    spent = sumA(cur);
  const b = n.lvl === "state" ? sumA((bud ?? []).filter((x) => x.fy === cal.curFy), (x) => x.budget) : 0;
  const late = bills.filter((r) => r.stage !== "Paid" && (r._days || 0) > 30),
    wel = welA.filter((r) => r.stage !== "Paid / issued"),
    fld = fldA.filter((r) => ctx.ageD(String(r.date)) <= 30),
    film = filmA.filter((r) => !["Disbursed", "Rejected"].includes(String(r.stage))),
    rti = rtiA.filter((r) => r._left !== "" && r._left !== undefined && +r._left <= 7);
  const el = cal.elapsed;
  const t: [string, string, string | number, string, string][] = [
    ["spend", "Spend this year", lakh(spent), b ? `${pct(spent / b, 0)} of budget · ${Math.round(el * 100)}% of year gone` : "District media buys only", b && spent / b > el + 0.08 ? "warn" : ""],
    [
      "campaigns", "Campaigns running", camps.filter((r) => r.stage === "Released").length,
      `${camps.filter((r) => ["Brief received", "Creative in design", "Department approval"].includes(String(r.stage))).length} in preparation`, "",
    ],
    ["bills", "Bills pending > 30 days", late.length, lakh(sumA(late, (r) => +r.amount)) + " held", late.length ? "crit" : ""],
    [
      "media", "Rejoinders pending", med.filter((r) => ["Drafting", "With department"].includes(String(r.stage))).length,
      `${med.filter((r) => r.tone === "Negative").length} negative clips in 120 days`, "",
    ],
    ["field", "Field shows, 30 days", fld.length, `${pct(fld.filter((r) => r.geo === "Verified").length / (fld.length || 1), 0)} geo-verified`, ""],
    [
      "welfare", "Welfare cases pending", wel.length, `${wel.filter((r) => (r._days || 0) > 30).length} older than 30 days`,
      wel.filter((r) => (r._days || 0) > 30).length ? "warn" : "",
    ],
    ["film", "Film applications pending", film.length, `${film.filter((r) => (r._days || 0) > 180).length} older than 180 days`, ""],
    [
      "rti", "RTI replies due in 7 days", rti.filter((r) => +r._left! >= 0).length, `${rti.filter((r) => +r._left! < 0).length} past the deadline`,
      rti.filter((r) => +r._left! < 0).length ? "crit" : "",
    ],
  ];
  const tiles = t.filter((x) => canSee(x[0]));
  if (!tiles.length) return null;
  return (
    <div className="card glcard">
      <div className="ch">
        <div>
          <h3>Department at a glance · {label(n)}</h3>
          <p>All wings in one row. Select a tile to open that module.</p>
        </div>
        <span className="chip ind">
          {cal.curFy} · as of {dShow(cal.asOf)}
        </span>
      </div>
      <div className="glance">
        {tiles.map((x) => (
          <button key={x[0]} className={`gl ${x[4]}`} onClick={() => setTab(x[0])}>
            <span className="l">{x[1]}</span>
            <span className="v num">{x[2]}</span>
            <small>{x[3]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
