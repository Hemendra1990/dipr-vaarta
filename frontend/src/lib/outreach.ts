// WhatsApp outreach metric engine, ported from the prototype (mult/leaf/agg/fin/M): slices taluk base metrics by
// period, scheme, language and audience and aggregates them up the drill tree.
import { cl, hash } from "./format";
import { Geo, Node, nodeKey } from "./geo";

export type Filters = { period: "7d" | "30d" | "90d"; scheme: string; lang: string; aud: string };
export const DEFAULT_FILTERS: Filters = { period: "30d", scheme: "All", lang: "All", aud: "All" };
export const sig = (f: Filters) => [f.period, f.scheme, f.lang, f.aud].join("|");

export type Base = Record<string, number>;
export type Metrics = Record<string, number>;

export const LANGS = ["Kannada", "English", "Urdu", "Tulu", "Konkani"];

export function langShare(d: string, l: string): number {
  let sh: Record<string, number> = { Kannada: 0.8, English: 0.1, Urdu: 0.07, Tulu: 0.02, Konkani: 0.01 };
  if (d === "Dakshina Kannada" || d === "Udupi") sh = { Kannada: 0.58, English: 0.12, Urdu: 0.05, Tulu: 0.19, Konkani: 0.06 };
  else if (d === "Uttara Kannada") sh = { Kannada: 0.73, English: 0.08, Urdu: 0.07, Tulu: 0.02, Konkani: 0.1 };
  else if (["Bidar", "Kalaburagi", "Vijayapura"].includes(d)) sh = { Kannada: 0.74, English: 0.07, Urdu: 0.17, Tulu: 0.01, Konkani: 0.01 };
  else if (d === "Bengaluru Urban") sh = { Kannada: 0.6, English: 0.28, Urdu: 0.08, Tulu: 0.02, Konkani: 0.02 };
  return sh[l];
}

export class Outreach {
  private TB: Record<string, Base> = {};
  private memo = new Map<string, Metrics>();
  /** Districts this user has data for (all 31, or just their own). */
  districts: string[];

  constructor(public geo: Geo, base: Array<Record<string, unknown>>, private SCH: Record<string, number>, private today: Date) {
    for (const b of base) {
      const { district, taluk, ...m } = b;
      this.TB[district + "|" + taluk] = m as Base;
    }
    this.districts = geo.ALL_D.filter((d) => geo.TALUKS[d].some((t) => this.TB[d + "|" + t]));
  }

  children(n: Node): Node[] {
    const g = this.geo;
    if (n.lvl === "state")
      return Object.keys(g.DIVS).filter((v) => g.DIVS[v].some((d) => this.districts.includes(d))).map((v) => ({ lvl: "div", name: v, div: v }));
    if (n.lvl === "div")
      return g.DIVS[n.div!].filter((d) => this.districts.includes(d)).map((d) => ({ lvl: "dist", name: d, div: n.div, dist: d }));
    if (n.lvl === "dist") return g.TALUKS[n.dist!].filter((t) => this.TB[n.dist + "|" + t]).map((t) => ({ lvl: "tlk", name: t, div: n.div, dist: n.dist }));
    return [];
  }

  private mult(d: string, f: Filters) {
    const p = { "7d": 0.24, "30d": 1, "90d": 3.05 }[f.period];
    let share = 1,
      rd = 0,
      rp = 0;
    if (f.scheme !== "All") {
      share *= this.SCH[f.scheme] * (0.75 + 0.5 * hash(d + f.scheme));
      rd += (hash(f.scheme + d + "r") - 0.5) * 0.12;
    }
    if (f.lang !== "All") {
      share *= langShare(d, f.lang);
      rd += ({ Kannada: 0.02, English: 0.04, Urdu: -0.05, Tulu: -0.02, Konkani: -0.03 } as Record<string, number>)[f.lang];
    }
    if (f.aud !== "All") {
      const a = ({ Citizens: [0.975, 0, 0], Journalists: [0.006, 0.14, 0.05], Officers: [0.004, 0.18, 0.08] } as Record<string, number[]>)[f.aud];
      share *= a[0];
      rd += a[1];
      rp += a[2];
    }
    return { p, share, rd, rp };
  }

  private leaf(b: Base, d: string, f: Filters): Metrics {
    const m = this.mult(d, f),
      subs = b.pop * 1e5 * b.optin * m.share,
      sent = subs * 7.4 * m.p,
      deliv = sent * b.deliv,
      rr = cl(b.read + m.rd, 0.12, 0.97),
      read = deliv * rr,
      reply = read * cl(b.reply + m.rp, 0.004, 0.5);
    const aud = f.aud === "All" || f.aud === "Citizens" ? 1 : 0.25,
      claims = (subs / 1000) * b.claimK * m.p * aud;
    const sch = f.scheme === "All" ? 1 : this.SCH[f.scheme] * 1.4,
      lg = f.lang === "All" ? 1 : Math.min(1, langShare(d, f.lang) * 1.3);
    const rel = b.rel * m.p * sch * lg,
      spend = b.ad * m.p * (f.scheme === "All" ? 1 : this.SCH[f.scheme]) * (f.lang === "All" ? 1 : langShare(d, f.lang));
    return {
      pop: b.pop, subs, sent, deliv, read, reply, claims, tatW: b.tat * claims, rel, pickW: b.pickup * rel, uptW: b.uptake * b.pop,
      posW: b.pos * read, compW: b.comp, n: 1, events: b.events * m.p, pulse: b.pulse * m.p, tasks: b.tasks, jour: b.jour,
      falseN: claims * b.falseR, spend,
    };
  }

  private static agg(arr: Metrics[]) {
    const o: Metrics = {};
    for (const a of arr) for (const k in a) o[k] = (o[k] || 0) + a[k];
    return o;
  }

  private static fin(a: Metrics): Metrics {
    const o = { ...a };
    o.delivR = o.deliv / o.sent;
    o.readR = o.read / o.deliv;
    o.replyR = o.reply / o.read;
    o.tat = o.tatW / (o.claims || 1);
    o.pickup = o.pickW / (o.rel || 1);
    o.uptake = o.uptW / o.pop;
    o.pos = o.posW / (o.read || 1);
    o.comp = o.compW / o.n;
    o.per1k = (o.subs / (o.pop * 1e5)) * 1000;
    o.claimsPerL = o.claims / ((o.subs || 1) / 1e5);
    o.spendPer1k = (o.spend * 1e5) / (o.pop * 100);
    o.falseR = o.falseN / (o.claims || 1);
    return o;
  }

  private rawM(n: Node, f: Filters): Metrics {
    return n.lvl === "tlk" ? this.leaf(this.TB[n.dist + "|" + n.name], n.dist!, f) : Outreach.agg(this.children(n).map((c) => this.rawM(c, f)));
  }

  M(n: Node, f: Filters): Metrics {
    const k = nodeKey(n) + "§" + sig(f);
    let v = this.memo.get(k);
    if (!v) {
      v = Outreach.fin(this.rawM(n, f));
      this.memo.set(k, v);
    }
    return v;
  }

  /** Period-over-period delta shown under each KPI. */
  dlt(n: Node, k: string, f: Filters) {
    return (hash(nodeKey(n) + k + f.period + f.scheme + f.lang) - 0.42) * 0.22;
  }

  trend(n: Node, total: number, k: string, f: Filters): number[] {
    const N = { "7d": 7, "30d": 30, "90d": 13 }[f.period],
      h = hash(nodeKey(n) + k) * 6,
      out: number[] = [];
    for (let i = 0; i < N; i++)
      out.push(
        Math.max(
          0.3,
          1 + 0.18 * Math.sin((i / N) * 12.56 + h) + 0.16 * (hash(nodeKey(n) + k + i + f.period) - 0.5) + (i > N * 0.62 && i < N * 0.76 ? 0.32 : 0),
        ),
      );
    const sm = out.reduce((a, b) => a + b, 0);
    return out.map((v) => (v / sm) * total);
  }

  tLabels(f: Filters): string[] {
    const N = { "7d": 7, "30d": 30, "90d": 13 }[f.period],
      out: string[] = [];
    for (let i = 0; i < N; i++) {
      const d = new Date(this.today);
      d.setDate(d.getDate() - (N - 1 - i) * (f.period === "90d" ? 7 : 1));
      out.push(d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
    }
    return out;
  }
}

export type MetricDef = { label: string; get: (m: Metrics) => number; fmt: (v: number) => string; inv?: boolean };

export const MM: Record<string, MetricDef> = {
  read: { label: "Read rate", get: (m) => m.readR, fmt: (v) => (v * 100).toFixed(0) + "%" },
  per1k: { label: "Subscribers per 1,000 people", get: (m) => m.per1k, fmt: (v) => (v < 10 ? v.toFixed(1) : v.toFixed(0)) },
  claims: { label: "Claims per lakh subscribers", get: (m) => m.claimsPerL, fmt: (v) => v.toFixed(0), inv: true },
  uptake: { label: "Scheme uptake index", get: (m) => m.uptake, fmt: (v) => v.toFixed(0) },
  tat: { label: "Clarification time (hours)", get: (m) => m.tat, fmt: (v) => v.toFixed(1), inv: true },
};
