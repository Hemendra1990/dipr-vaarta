// Number, money and date formatting, ported from the prototype so every figure reads the same.

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** FNV-1a hash scaled to [0,1]: the prototype's deterministic noise for synthetic variation. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function fmt(n: number | string): string {
  n = +n || 0;
  if (n >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(1) + " L";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n < 10 && n % 1 ? n.toFixed(1) : Math.round(n).toString();
}

export const pct = (v: number, d = 1) => (v * 100).toFixed(d) + "%";
export const rs = (v: number) => "₹" + (v >= 100 ? (v / 100).toFixed(2) + " Cr" : v.toFixed(1) + " L");
export const inr = (v: number | string) => "₹" + Math.round(+v || 0).toLocaleString("en-IN");
export const lakh = (v: number | string) => {
  v = +v || 0;
  return v >= 100 ? "₹" + (v / 100).toFixed(2) + " Cr" : "₹" + v.toFixed(v < 10 ? 2 : 1) + " L";
};
export const axisL = (v: number) => (v >= 100 ? "₹" + (v / 100).toFixed(v >= 1000 ? 0 : 1) + " Cr" : "₹" + Math.round(v) + " L");
export const nIN = (v: number | string) => Math.round(+v || 0).toLocaleString("en-IN");

export function sumA<T>(a: T[], f: (r: T) => number = (r: T) => (r as unknown as { amount: number }).amount): number {
  let s = 0;
  for (const r of a) s += f(r) || 0;
  return s;
}

export const isoL = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

export const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoL(d);
};

export function dShow(s: string | null | undefined): string {
  if (!s) return "—";
  const p = String(s).split("-");
  if (p.length === 2) return MON[+p[1] - 1] + " " + p[0];
  return `${+p[2]} ${MON[+p[1] - 1]} ${p[0]}`;
}

export const nowT = () => new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** "2h ago" style age for live records. */
export function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return m + "m";
  const h = m / 60;
  if (h < 48) return (h < 10 ? Math.round(h * 2) / 2 : Math.round(h)) + "h";
  return Math.round(h / 24) + "d";
}

export function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v || 1)),
    n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export const rateTone = (v: number) => (v < 0.55 ? "crit" : v < 0.65 ? "warn" : "good");
export const rateCol = (v: number) => `var(--${rateTone(v)})`;

/** Status words to chip tone, exactly as the prototype's toneOf. */
export function toneOf(v: unknown): string {
  const s = String(v);
  if (/overdue|reject|mismatch|returned|on hold|critical|missing|suspended|expired|negative|over budget/i.test(s)) return "crit";
  if (
    /pending|due|short|review|drafting|with department|renewal|screening|idle|proof check|scheduled|brief|creative|approval|in editing|at press|not digitised|received$|^received|logged|ahead|slow/i.test(
      s,
    )
  )
    return "warn";
  if (
    /paid|issued|verified|approved|disbursed|closed|published|adequate|positive|active|evaluated|sanctioned|distributed|tagged|displaying|replied|uc received|on track|released|attached|yes/i.test(
      s,
    )
  )
    return "good";
  return "ind";
}
