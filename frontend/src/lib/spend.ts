// Spend analytics model, ported from the prototype: filters, period roll-ups, budget comparison and insights.
import { MON, sumA } from "./format";
import type { BudgetRow, CalendarInfo, SpendRow } from "./types";
import type { Period } from "@/components/charts";

export type SpState = {
  fy: string; ctype: string; channel: string; dept: string; vendor: string | null; campaign: string | null;
  gran: "year" | "quarter" | "month"; cmp: string; l4l: boolean; allC: boolean; allV: boolean;
};

export const SP_DEFAULT: SpState = {
  fy: "All", ctype: "All", channel: "All", dept: "All", vendor: null, campaign: null, gran: "year", cmp: "Guarantee schemes awareness",
  l4l: true, allC: false, allV: false,
};

export const isBooked = (r: SpendRow) => r.status !== "RO issued";
export const monIdx = (ym: string) => (+ym.split("-")[1] + 8) % 12;

export function fyMonths(fy: string): string[] {
  const y = +fy.slice(0, 4);
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    return (i < 9 ? y : y + 1) + "-" + String(m).padStart(2, "0");
  });
}

export const chv = (channels: string[]) => (c: string) => "var(--ch" + (channels.indexOf(c) + 1) + ")";

type Ig = { fy?: boolean; ct?: boolean; ch?: boolean; vc?: boolean };

export class SpendModel {
  constructor(
    public rows: SpendRow[], public budget: BudgetRow[], public cal: CalendarInfo, public channels: string[],
    public geoOk: (r: SpendRow) => boolean, public atState: boolean, public isVendor: boolean,
  ) {}

  base(sp: SpState, ig: Ig = {}) {
    return this.rows.filter(
      (r) =>
        (ig.fy || sp.fy === "All" || r.fy === sp.fy) &&
        (ig.ct || sp.ctype === "All" || r.ctype === sp.ctype) &&
        (ig.ch || sp.channel === "All" || r.channel === sp.channel) &&
        (sp.dept === "All" || r.department === sp.dept) &&
        (ig.vc || !sp.vendor || r.vendorId === sp.vendor) &&
        (ig.vc || !sp.campaign || r.campaignId === sp.campaign) &&
        this.geoOk(r),
    );
  }

  budOk(sp: SpState) {
    return this.atState && !this.isVendor && sp.ctype === "All" && !sp.vendor && !sp.campaign;
  }

  budRows(sp: SpState, ig: Ig = {}) {
    return this.budget.filter((b) => (ig.fy || sp.fy === "All" || b.fy === sp.fy) && (ig.ch || sp.channel === "All" || b.channel === sp.channel) && (sp.dept === "All" || b.department === sp.dept));
  }

  expTo = (b: BudgetRow) => (b.fy === this.cal.curFy ? b.budget * this.cal.elapsed : b.budget);

  trend(sp: SpState): { P: Period[]; ser: number[][]; bud: number[] | null } {
    const g = sp.gran,
      FYS = this.cal.fys,
      CUR = this.cal.curFy,
      LAST = this.cal.lastYm;
    const fys = sp.fy === "All" ? FYS : [sp.fy];
    let P: Period[];
    if (g === "year") P = FYS.map((fy) => ({ key: fy, label: "FY " + fy.slice(2) + (fy === CUR ? " (H1)" : ""), fy, div: 1 }));
    else if (g === "quarter")
      P = fys.flatMap((fy) =>
        ["Q1", "Q2", "Q3", "Q4"].map((q) => ({
          key: fy + q,
          label: fys.length > 1 ? q + " " + fy.slice(2) : q + " · " + ({ Q1: "Apr–Jun", Q2: "Jul–Sep", Q3: "Oct–Dec", Q4: "Jan–Mar" } as Record<string, string>)[q],
          fy, q, div: 4,
          future: fy === CUR && fyMonths(fy)[["Q1", "Q2", "Q3", "Q4"].indexOf(q) * 3] > LAST,
        })),
      );
    else {
      P = fys.flatMap((fy) => fyMonths(fy).map((m) => ({ key: m, label: MON[+m.slice(5) - 1] + (fys.length > 1 ? " " + m.slice(2, 4) : ""), fy, div: 12, future: m > LAST })));
      if (fys.length > 1) P = P.filter((p) => !p.future);
    }
    const idx: Record<string, number> = {};
    P.forEach((p, i) => (idx[p.key] = i));
    const ser = this.channels.map(() => new Array(P.length).fill(0));
    this.base(sp, { fy: g === "year" }).forEach((r) => {
      if (!isBooked(r)) return;
      const i = idx[g === "year" ? r.fy : g === "quarter" ? r.fy + r.quarter : r.month];
      if (i !== undefined) ser[this.channels.indexOf(r.channel)][i] += r.amount;
    });
    let bud: number[] | null = null;
    if (this.budOk(sp)) {
      const bf: Record<string, number> = {};
      this.budRows(sp, { fy: g === "year" }).forEach((b) => (bf[b.fy] = (bf[b.fy] || 0) + b.budget));
      bud = P.map((p) => (bf[p.fy] || 0) / (p.div || 1));
    }
    return { P, ser, bud };
  }

  insights(sp: SpState, all: SpendRow[]): { t: string; x: string }[] {
    const out: { t: string; x: string }[] = [];
    const CUR = this.cal.curFy,
      EL = this.cal.elapsed,
      FYS = this.cal.fys;
    const lakhH = (v: number) => (v >= 100 ? "₹" + (v / 100).toFixed(2) + " Cr" : "₹" + v.toFixed(v < 10 ? 2 : 1) + " L");
    const pct0 = (v: number) => (v * 100).toFixed(0) + "%";
    const curRows = this.rows.filter((r) => r.fy === CUR && isBooked(r) && this.geoOk(r) && (sp.dept === "All" || r.department === sp.dept));
    if (this.budOk(sp)) {
      const b = sumA(this.budget.filter((x) => x.fy === CUR && (sp.dept === "All" || x.department === sp.dept)), (x) => x.budget),
        s = sumA(curRows),
        p = s / EL;
      out.push({
        t: p > b ? "crit" : p < b * 0.85 ? "warn" : "good",
        x: `At the current run-rate, ${CUR} ends at <b>${lakhH(p)}</b> against a budget of <b>${lakhH(b)}</b> (${p > b ? "over by " + lakhH(p - b) : "under by " + lakhH(b - p)}).`,
      });
      const ch = this.channels
        .map((c) => {
          const a = sumA(curRows.filter((r) => r.channel === c)),
            bb = sumA(this.budget.filter((x) => x.fy === CUR && x.channel === c && (sp.dept === "All" || x.department === sp.dept)), (x) => x.budget);
          return { c, a, bb, r: bb ? a / (bb * EL) : 0 };
        })
        .filter((x) => x.bb)
        .sort((a, b) => b.r - a.r)[0];
      if (ch) out.push({ t: ch.r > 1.1 ? "warn" : "good", x: `<b>${ch.c}</b> is spending fastest: ${pct0(ch.a / ch.bb)} of its yearly budget used with half the year gone.` });
    }
    const d0 = sumA(all.filter((r) => r.fy === FYS[0] && r.channel === "Digital & social" && isBooked(r))),
      t0 = sumA(all.filter((r) => r.fy === FYS[0] && isBooked(r))),
      d1 = sumA(curRows.filter((r) => r.channel === "Digital & social")),
      t1 = sumA(curRows);
    if (t0 && t1)
      out.push({ t: "indigo", x: `Digital and social has grown from <b>${pct0(d0 / t0)}</b> of spend in ${FYS[0]} to <b>${pct0(d1 / t1)}</b> this year, while print’s share keeps falling.` });
    const vs: Record<string, number> = {};
    all.filter((r) => r.fy === CUR && isBooked(r)).forEach((r) => (vs[r.vendorId] = (vs[r.vendorId] || 0) + r.amount));
    const va = Object.values(vs).sort((a, b) => b - a),
      tt = va.reduce((a, b) => a + b, 0);
    if (tt) {
      const top = va.slice(0, 5).reduce((a, b) => a + b, 0) / tt;
      out.push({ t: top > 0.5 ? "warn" : "good", x: `The top 5 vendors received <b>${pct0(top)}</b> of this year’s spend across ${va.length} vendors.` });
    }
    return out.slice(0, 4);
  }
}
