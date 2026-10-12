// Per-register KPIs, derived columns and AI notes, ported from the prototype's REGS definitions.
import { fmt, inr, lakh, nIN, pct, sumA } from "./format";
import { token } from "./api";
import type { CalendarInfo, RegisterDef, Row } from "./types";

type K = [string, string | number, string, string?];
type Num = (r: Row) => number;

export type RegCtx = { cal: CalendarInfo; ageD: (s: string) => number };

export function makeCtx(cal: CalendarInfo): RegCtx {
  const T0 = new Date(cal.asOf + "T00:00:00");
  return { cal, ageD: (s: string) => Math.round((T0.getTime() - new Date(s + "T00:00:00").getTime()) / 864e5) };
}

const n = (k: string): Num => (r) => +r[k] || 0;
const median = (a: number[]) => {
  const h = a.slice().sort((x, y) => x - y);
  return h.length ? h[h.length >> 1] : "—";
};

/** Derived columns shown in tables: days pending and days left, relative to the as-of date. */
export function derive(id: string, r: Row, c: RegCtx): Row {
  const o = { ...r };
  if (id === "bills") o._days = r.stage === "Paid" ? 0 : c.ageD(String(r.billDate));
  else if (id === "welfare") o._days = r.stage === "Paid / issued" ? 0 : c.ageD(String(r.applied));
  else if (id === "film") o._days = ["Disbursed", "Rejected"].includes(String(r.stage)) ? 0 : c.ageD(String(r.received));
  else if (id === "rti") o._left = ["Replied", "Closed"].includes(String(r.stage)) ? "" : 30 - c.ageD(String(r.received));
  return o;
}

export const REG_LOGIC: Record<string, { kpis: (a: Row[], c: RegCtx) => K[]; ai: (a: Row[], c: RegCtx) => string }> = {
  campaigns: {
    kpis: (a, c) => {
      const cu = a.filter((r) => r.fy === c.cal.curFy),
        b = sumA(cu, n("budget")),
        s = sumA(cu, n("spent"));
      const prep = a.filter((r) => ["Brief received", "Creative in design", "Department approval"].includes(String(r.stage))).length;
      return [
        ["Campaigns", nIN(a.length), "all years"],
        ["Running now", a.filter((r) => r.stage === "Released").length, "released, not yet evaluated"],
        ["In preparation", prep, "brief to approval", prep > 4 ? "warn" : ""],
        ["Budget " + c.cal.curFy, lakh(b), "campaign budgets"],
        ["Spent " + c.cal.curFy, lakh(s), b ? pct(s / b, 0) + " of budget" : ""],
      ];
    },
    ai: (a) =>
      `${a.filter((r) => r.stage === "Department approval").length} campaigns are waiting for department approval. The Campaign Brief agent drafts the media plan and cost for each new brief from the rates of past campaigns of the same type.`,
  },
  empanel: {
    kpis: (a) => {
      const over = a.filter((r) => +r.audited && +r.claimed / +r.audited > 1.5).length;
      return [
        ["Empanelled vendors", a.length, "all media"],
        ["Active", a.filter((r) => r.stage === "Active").length, ""],
        ["Renewal due", a.filter((r) => r.stage === "Renewal due").length, "within 120 days", "warn"],
        ["Claims > 1.5× audit", over, "circulation or reach", over ? "crit" : ""],
        ["No audit on file", a.filter((r) => !+r.audited).length, "", "warn"],
      ];
    },
    ai: (a) =>
      `${a.filter((r) => +r.audited && +r.claimed / +r.audited > 1.5).length} vendors claim more than 1.5 times their audited circulation or reach. The Empanelment agent checks claims against audit certificates and postal registrations before each renewal.`,
  },
  bills: {
    kpis: (a) => {
      const p = a.filter((r) => r.stage !== "Paid"),
        o = p.filter((r) => (r._days || 0) > 30);
      return [
        ["Bills", nIN(a.length), "since March 2026"],
        ["Pending", nIN(p.length), lakh(sumA(p, n("amount")))],
        ["Pending > 30 days", o.length, lakh(sumA(o, n("amount"))), o.length ? "crit" : ""],
        ["Returned for proof", a.filter((r) => r.stage === "Returned").length, "", "warn"],
        ["Paid", lakh(sumA(a.filter((r) => r.stage === "Paid"), n("amount"))), ""],
      ];
    },
    ai: (a) => {
      const o = a.filter((r) => r.stage !== "Paid" && (r._days || 0) > 30);
      return `${o.length} bills worth ${lakh(sumA(o, n("amount")))} have waited more than 30 days. Small district papers depend on these payments. The audit agent can clear bills whose proof already matches the release order.`;
    },
  },
  media: {
    kpis: (a) => {
      const N = a.length || 1,
        h = a.filter((r) => r.stage === "Issued").map((r) => +r.hours);
      return [
        ["Clips tagged", nIN(a.length), "last 120 days"],
        ["Positive", pct(a.filter((r) => r.tone === "Positive").length / N, 0), ""],
        ["Negative", pct(a.filter((r) => r.tone === "Negative").length / N, 0), "", "warn"],
        ["Rejoinders pending", a.filter((r) => ["Drafting", "With department"].includes(String(r.stage))).length, "", "warn"],
        ["Median hours to rejoinder", median(h), ""],
      ];
    },
    ai: (a) => {
      const d: Record<string, number> = {};
      a.filter((r) => r.tone === "Negative").forEach((r) => (d[r.department] = (d[r.department] || 0) + 1));
      const top = Object.entries(d).sort((x, y) => y[1] - x[1])[0];
      return top
        ? `${top[0]} has the most negative coverage (${top[1]} clips). The Media Monitor agent drafts rejoinders with the department's own figures and sends them for approval.`
        : "No negative coverage in this area.";
    },
  },
  social: {
    kpis: (a) => {
      const p = a.filter((r) => r.stage === "Published"),
        re = sumA(p, n("reach")),
        en = sumA(p, n("engagements"));
      return [
        ["Posts", nIN(p.length), "published, last 90 days"],
        ["Reach", fmt(re), ""],
        ["Engagement rate", re ? pct(en / re, 1) : "—", ""],
        ["Replies pending", nIN(sumA(p, n("pendingReplies"))), "citizen comments", "warn"],
        ["Scheduled", a.filter((r) => r.stage !== "Published").length, "next 7 days"],
      ];
    },
    ai: () =>
      "Video posts earn about twice the engagement of image cards here. The content calendar agent drafts Kannada captions and schedules posts. It works on official handles only; it does not track individuals.",
  },
  crisis: {
    kpis: (a) => [
      ["Advisories", a.length, "last 12 months"],
      ["Active now", a.filter((r) => r.stage === "Active").length, "", "warn"],
      ["Median minutes to issue", median(a.map((r) => +r.minutes)), "target 30"],
      ["People reached", fmt(sumA(a, n("reached"))), ""],
      ["Rumours flagged", nIN(sumA(a, n("rumours"))), "during advisories"],
    ],
    ai: () =>
      "Advisories in one language reach fewer people in Tulu and Urdu-speaking areas. The advisory agent drafts all five language versions from the district administration’s order for approval.",
  },
  welfare: {
    kpis: (a) => {
      const p = a.filter((r) => r.stage !== "Paid / issued");
      return [
        ["Cases", nIN(a.length), "last 6 months"],
        ["Pending", p.length, ""],
        ["Pending > 30 days", p.filter((r) => (r._days || 0) > 30).length, "", "crit"],
        ["Health claims paid", inr(sumA(a.filter((r) => r.scheme === "Health scheme claim" && r.stage === "Paid / issued"), n("amount"))), ""],
        ["Pensioners", a.filter((r) => r.scheme === "Senior journalist pension").length, ""],
      ];
    },
    ai: () => "Most delays are in health claims waiting for hospital bills. The Welfare agent tells each journalist on WhatsApp exactly which document is missing.",
  },
  events: {
    kpis: (a) => [
      ["Events covered", a.length, "last 120 days"],
      ["CM and minister events", a.filter((r) => ["Chief Minister", "Minister"].includes(String(r.vip))).length, ""],
      ["Releases pending", a.filter((r) => r.stage === "Pending").length, "", "warn"],
      ["Median hours to release", median(a.filter((r) => r.stage === "Issued").map((r) => +r.hours)), ""],
      ["Photos uploaded", nIN(sumA(a, n("photos"))), ""],
    ],
    ai: () => "The Press Release Composer turns an officer’s photos and voice notes into a bilingual release within an hour of the event.",
  },
  election: {
    kpis: (a) => [
      ["Requests", a.length, "Mar–Jun 2024"],
      ["Approved", a.filter((r) => r.stage === "Approved").length, ""],
      ["Rejected", a.filter((r) => r.stage === "Rejected").length, "", "warn"],
      ["Paid-news cases", a.filter((r) => r.reqType === "Paid news case").length, "", "crit"],
      ["Median hours to decide", median(a.map((r) => +r.hours)), "target 48"],
    ],
    ai: () =>
      "Before any government message goes out during a Model Code period, the compliance agent checks it for names, photos and new announcements that the Code does not allow.",
  },
  field: {
    kpis: (a) => {
      const au = sumA(a, n("audience")),
        c = sumA(a, n("cost"));
      return [
        ["Shows", nIN(a.length), "last 6 months"],
        ["People reached", nIN(au), ""],
        ["Geo-verified", pct(a.filter((r) => r.geo === "Verified").length / (a.length || 1), 0), "photo + location + time"],
        ["Cost per person", au ? inr(c / au) : "—", ""],
        ["On hold", a.filter((r) => r.stage === "On hold").length, "proof problems", "crit"],
      ];
    },
    ai: (a) =>
      `${a.filter((r) => r.stage === "On hold").length} shows are on hold because the photo location or time does not match the plan. The verification agent checks each geo-tagged photo before payment is released.`,
  },
  outdoor: {
    kpis: (a) => [
      ["Sites", a.length, ""],
      ["Displaying now", a.filter((r) => r.stage === "Displaying").length, ""],
      ["Idle sites", a.filter((r) => r.stage === "Idle").length, "paid but no campaign", "warn"],
      ["Proof mismatch", a.filter((r) => r.proof === "Mismatch").length, "", "crit"],
      ["Cost", lakh(sumA(a, n("cost"))), ""],
    ],
    ai: (a) => `${a.filter((r) => r.stage === "Idle").length} sites are idle between campaigns. The planner can fill them with health or safety messages at no extra rent.`,
  },
  film: {
    kpis: (a) => {
      const p = a.filter((r) => !["Disbursed", "Rejected"].includes(String(r.stage)));
      return [
        ["Applications", a.length, "last 20 months"],
        ["Pending", p.length, ""],
        ["Pending > 180 days", p.filter((r) => (r._days || 0) > 180).length, "", "crit"],
        ["Sanctioned, not paid", lakh(sumA(a.filter((r) => r.stage === "Sanctioned"), n("amount"))), "", "warn"],
        ["Disbursed", lakh(sumA(a.filter((r) => r.stage === "Disbursed"), n("amount"))), ""],
      ];
    },
    ai: () =>
      "The screening committee meets only when enough films are ready. The agent checks each application for missing documents and drafts the committee agenda once a batch is complete.",
  },
  publications: {
    kpis: (a) => {
      const p = sumA(a, n("printRun")),
        d = sumA(a, n("distributed"));
      return [
        ["Issues", a.length, "last 18 months"],
        ["Copies printed", nIN(p), ""],
        ["Distributed", p ? pct(d / p, 0) : "—", "of copies printed"],
        ["Digital reads", nIN(sumA(a, n("reads"))), ""],
        ["Cost per copy", p ? inr((sumA(a, n("cost")) * 1e5) / p) : "—", ""],
      ];
    },
    ai: () => "Digital reads are growing faster than print distribution. The agent turns each magazine issue into short WhatsApp stories and voice notes in Kannada.",
  },
  archive: {
    kpis: (a) => {
      const N = a.length || 1;
      return [
        ["Assets catalogued", nIN(a.length), "sample of the collection"],
        ["Digitised", pct(a.filter((r) => r.stage !== "Not digitised").length / N, 0), ""],
        ["Tagged", pct(a.filter((r) => ["Tagged", "Published"].includes(String(r.stage))).length / N, 0), ""],
        ["Pre-1985 not digitised", a.filter((r) => +r.year < 1985 && r.stage === "Not digitised").length, "oldest, most at risk", "crit"],
        ["Requests", nIN(sumA(a, n("requests"))), ""],
      ];
    },
    ai: () =>
      "Negatives from before 1985 are the most at risk. The Archive agent tags faces, places and events in scanned images so that staff can search the archive in Kannada.",
  },
  grants: {
    kpis: (a) => {
      const o = a.filter((r) => r.stage === "UC overdue");
      return [
        ["Grants", a.length, "3 years"],
        ["Released", lakh(sumA(a, n("released"))), ""],
        ["UC overdue", o.length, lakh(sumA(o, n("released"))), "crit"],
        ["UC due soon", a.filter((r) => r.stage === "UC due").length, "next 90 days", "warn"],
        ["UC received", a.filter((r) => r.stage === "UC received").length, ""],
      ];
    },
    ai: () => "Overdue utilisation certificates hold up the next year’s release. The agent sends reminders 60, 30 and 7 days before each due date.",
  },
  admin: {
    kpis: (a, c) => {
      const s = sumA(a, n("sanctioned")),
        f = sumA(a, n("filled")),
        b = sumA(a, n("budgetAlloc")),
        sp = sumA(a, n("budgetSpent"));
      return [
        ["Offices", a.length, ""],
        ["Posts filled", s ? pct(f / s, 0) : "—", `${nIN(f)} of ${nIN(s)}`],
        ["Critical shortage", a.filter((r) => r.stage === "Critical").length, "offices", "crit"],
        ["Office budget used", b ? pct(sp / b, 0) : "—", `${Math.round(c.cal.elapsed * 100)}% of the year gone`],
        ["Cameras", nIN(sumA(a, n("cameras"))), ""],
      ];
    },
    ai: () => "Offices short of staff also file fewer daily reports. The agent suggests where to post staff on deputation during peak events such as Dasara.",
  },
  rti: {
    kpis: (a) => {
      const o = a.filter((r) => r._left !== "" && r._left !== undefined);
      return [
        ["Applications", a.length, "last 5 months"],
        ["Open", o.length, ""],
        ["Due in 7 days", o.filter((r) => +r._left! >= 0 && +r._left! <= 7).length, "", "warn"],
        ["Past 30 days", o.filter((r) => +r._left! < 0).length, "", "crit"],
        ["First appeals", a.filter((r) => r.stage === "First appeal").length, ""],
      ];
    },
    ai: () =>
      "Most RTI applications ask about advertisement spend by outlet. The agent drafts replies straight from the spend data, so the Advertisement wing only reviews and signs.",
  },
};

// ---------- Record editing: stage moves, form values and the write calls ----------

/** Stages off the main path (returned, rejected, on hold ...). "Move to next stage" skips them, as the server does. */
export const SIDE_STAGES = ["Returned", "Rejected", "On hold", "Not needed", "Referred to Returning Officer", "Suspended", "Expired", "Idle", "UC overdue"];

export function nextStage(def: RegisterDef, cur: unknown): string | null {
  const s = String(cur ?? "");
  const i = def.order.indexOf(s);
  if (i < 0 || SIDE_STAGES.includes(s)) return null;
  return def.order.slice(i + 1).find((x) => !SIDE_STAGES.includes(x)) ?? null;
}

export type FormVals = Record<string, string>;

/** Form values for a record (or a blank record with sensible defaults for the user's scope). */
export function formValues(def: RegisterDef, row: Row | null, d: { district?: string | null; department?: string | null; fy: string }): FormVals {
  const o: FormVals = {};
  def.schema.forEach((f) => {
    const v = row ? row[f.k] : undefined;
    if (v !== undefined && v !== null) o[f.k] = String(v);
    else if (f.k === def.status) o[f.k] = def.order[0];
    else if (f.t === "district") o[f.k] = d.district ?? "";
    else if (f.k === "department") o[f.k] = d.department ?? "";
    else if (f.t === "fy") o[f.k] = d.fy;
    else o[f.k] = "";
  });
  return o;
}

/** A failed write. `errors` maps a field key to the server's message for it. */
export class RowError extends Error {
  constructor(public status: number, message: string, public errors: Record<string, string> = {}) {
    super(message);
  }
}

async function write<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token.get();
  if (t) headers.Authorization = "Bearer " + t;
  const res = await fetch("/api" + path, { method, headers, body: JSON.stringify(body ?? {}) });
  const text = await res.text();
  let j: { message?: string; errors?: Record<string, string> } | null = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new RowError(res.status, j?.message || res.statusText || "Request failed", j?.errors || {});
  return j as T;
}

export const records = {
  create: (reg: string, row: FormVals) => write<Row>("POST", `/registers/${reg}/rows`, row),
  update: (reg: string, id: number, row: FormVals) => write<Row>("PUT", `/registers/${reg}/rows/${id}`, row),
  advance: (reg: string, id: number, stage?: string) => write<Row>("POST", `/registers/${reg}/rows/${id}/advance`, stage ? { stage } : {}),
  act: (reg: string, id: number, action: string) => write<Row>("POST", `/registers/${reg}/rows/${id}/action`, { action }),
  remove: (reg: string, id: number) => write<{ deleted: number }>("DELETE", `/registers/${reg}/rows/${id}`),
};

/** A named one-click action of a register (from GET /api/registers/{id}/actions). */
export type RegAction = { key: string; label: string; from: string[]; to: string; set: Record<string, string>; hint: string };
