// SVG charts ported from the prototype: same geometry, classes and colours, rendered as React elements.
"use client";
import React from "react";
import { axisL, cl, fmt, niceMax } from "@/lib/format";

export function Spark({ vals, col = "var(--indigo)" }: { vals: number[]; col?: string }) {
  const W = 84,
    H = 26,
    mx = Math.max(...vals),
    mn = Math.min(...vals),
    x = (i: number) => 2 + ((W - 4) * i) / (vals.length - 1),
    y = (v: number) => H - 3 - (H - 6) * ((v - mn) / (mx - mn || 1));
  const p = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polygon points={`2,${H} ${p} ${W - 2},${H}`} fill={col} opacity=".12" />
      <polyline points={p} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="2.4" fill={col} />
    </svg>
  );
}

export function KpiTile({ l, v, d, sp, invert }: { l: string; v: string; d: number; sp?: React.ReactNode; invert?: boolean }) {
  const up = d >= 0,
    good = invert ? !up : up;
  return (
    <div className="kpi">
      <span className="l">{l}</span>
      <div className="row">
        <span className="v num">{v}</span>
        {sp}
      </div>
      <span className={`delta ${good ? "up" : "dn"}`}>
        {up ? "▲" : "▼"} {Math.abs(d * 100).toFixed(1)}%{" "}
        <span style={{ color: "var(--muted)", fontFamily: "var(--f-body)", fontWeight: 500 }}>vs previous</span>
      </span>
    </div>
  );
}

/** Static KPI tile used by registers and spend (label, value, sub-line, tone). */
export function Kpi({ l, v, s, t }: { l: string; v: React.ReactNode; s?: string; t?: string }) {
  return (
    <div className={`kpi ${t ? "kt-" + t : ""}`}>
      <span className="l">{l}</span>
      <span className="v num">{v}</span>
      <small className="ks">{s || ""}</small>
    </div>
  );
}

/** Trend lines (prototype lineChart). Hovering or tapping a day shows a guide line and every series' value for it. */
export function LineChart({ series, labels }: { series: { vals: number[]; col: string; name?: string }[]; labels: string[] }) {
  const [hov, setHov] = React.useState<number | null>(null);
  const W = 640,
    H = 220,
    L = 52,
    R = 14,
    T = 12,
    B = 28,
    all = series.flatMap((s) => s.vals),
    mx = niceMax(Math.max(...all) * 1.06),
    N = labels.length;
  const x = (i: number) => L + ((W - L - R) * i) / (N - 1),
    y = (v: number) => T + (H - T - B) * (1 - v / mx);
  const step = Math.ceil(N / 7);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend chart">
      <g className="grid">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (mx * k) / 4;
          return (
            <React.Fragment key={k}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
              <text x={L - 8} y={y(v) + 3.5} textAnchor="end">
                {fmt(v)}
              </text>
            </React.Fragment>
          );
        })}
      </g>
      {series.map((s, si) => {
        const p = s.vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        return (
          <React.Fragment key={si}>
            {si === 0 && <polygon points={`${x(0)},${y(0)} ${p} ${x(N - 1)},${y(0)}`} fill={s.col} opacity=".1" />}
            <polyline points={p} fill="none" stroke={s.col} strokeWidth="2" strokeLinejoin="round" strokeDasharray={si ? "4 3" : undefined} />
            <circle cx={x(N - 1)} cy={y(s.vals[N - 1])} r="3.5" fill={s.col} />
          </React.Fragment>
        );
      })}
      {labels.map((l, i) =>
        i % step === 0 || i === N - 1 ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle">
            {l}
          </text>
        ) : null,
      )}
      {hov !== null && (
        <g className="hov" pointerEvents="none">
          <line x1={x(hov)} x2={x(hov)} y1={T} y2={H - B} />
          {series.map((s, si) => (
            <circle key={si} cx={x(hov)} cy={y(s.vals[hov])} r="3.5" fill={s.col} stroke="var(--surface)" strokeWidth="1.5" />
          ))}
          {(() => {
            const tw = 150,
              th = 22 + 16 * series.length,
              tx = x(hov) + 10 + tw > W - R ? x(hov) - 10 - tw : x(hov) + 10;
            return (
              <g className="tip" transform={`translate(${tx},${T + 4})`}>
                <rect width={tw} height={th} rx="6" />
                <text x="10" y="16" className="tl">
                  {labels[hov]}
                </text>
                {series.map((s, si) => (
                  <g key={si} transform={`translate(10,${32 + si * 16})`}>
                    <rect y="-7" width="8" height="8" rx="2" fill={s.col} className="sw" />
                    <text x="14" y="0">
                      {(s.name || `Series ${si + 1}`) + ": " + fmt(s.vals[hov])}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}
        </g>
      )}
      <g onMouseLeave={() => setHov(null)}>
        {labels.map((l, i) => {
          const x0 = i === 0 ? L : (x(i - 1) + x(i)) / 2,
            x1 = i === N - 1 ? W - R : (x(i) + x(i + 1)) / 2;
          return (
            <rect
              key={i}
              x={x0}
              y={T}
              width={Math.max(0, x1 - x0)}
              height={H - T - B}
              fill="transparent"
              onMouseEnter={() => setHov(i)}
              onClick={() => setHov(i)}
            />
          );
        })}
      </g>
    </svg>
  );
}

export type HBarItem = { l: string; v: number; d: string; on?: boolean; col?: string };

export function HBars({ items, max }: { items: HBarItem[]; max?: number | null }) {
  const mx = max || Math.max(...items.map((i) => i.v));
  return (
    <div className="hb">
      {items.map((i) => (
        <div key={i.l} className={`r ${i.on ? "on" : ""}`}>
          <span title={i.l}>{i.l}</span>
          <div className="t">
            <i style={{ width: `${((i.v / mx) * 100).toFixed(1)}%`, ...(i.col ? { background: i.col } : {}) }} />
          </div>
          <span className="v">{i.d}</span>
        </div>
      ))}
    </div>
  );
}

export type BarItem = HBarItem & { onClick?: () => void };

/** Clickable bar list (register pipelines, categories, by-area). */
export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const mx = max || Math.max(1, ...items.map((i) => i.v));
  return (
    <div className="hb">
      {items.map((i) => (
        <button key={i.l} className={`r rbtn ${i.on ? "on" : ""}`} onClick={i.onClick}>
          <span title={i.l}>{i.l}</span>
          <span className="t">
            <i style={{ width: `${((i.v / mx) * 100).toFixed(1)}%`, ...(i.col ? { background: i.col } : {}) }} />
          </span>
          <span className="v">{i.d}</span>
        </button>
      ))}
    </div>
  );
}

/** Inline bar inside a table cell. */
export function InlineBar({ text, v, max, col }: { text: React.ReactNode; v: number; max: number; col: string }) {
  return (
    <div className="ib">
      <span>{text}</span>
      <div className="t">
        <i style={{ width: `${cl(v / (max || 1), 0, 1) * 100}%`, background: col }} />
      </div>
    </div>
  );
}

export type ScatterPt = { key: string; label: string; short: string; x: number; y: number; onClick: () => void };

export function Scatter({ pts }: { pts: ScatterPt[] }) {
  const W = 640,
    H = 260,
    L = 48,
    R = 16,
    T = 14,
    B = 34,
    mx = niceMax(Math.max(...pts.map((p) => p.x)) * 1.1),
    ylo = Math.floor(Math.min(...pts.map((p) => p.y)) / 10) * 10 - 5,
    yhi = Math.ceil(Math.max(...pts.map((p) => p.y)) / 10) * 10 + 5;
  const x = (v: number) => L + ((W - L - R) * v) / mx,
    y = (v: number) => T + (H - T - B) * (1 - (v - ylo) / (yhi - ylo));
  const ax = pts.reduce((a, p) => a + p.x, 0) / pts.length,
    ay = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Spend versus uptake">
      <g className="grid">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = ylo + ((yhi - ylo) * k) / 4;
          return (
            <React.Fragment key={k}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
              <text x={L - 8} y={y(v) + 3.5} textAnchor="end">
                {v.toFixed(0)}
              </text>
            </React.Fragment>
          );
        })}
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (mx * k) / 4;
          return (
            <text key={"x" + k} x={x(v)} y={H - 14} textAnchor="middle">
              ₹{v.toFixed(0)}
            </text>
          );
        })}
        <text x={W - R} y={H - 2} textAnchor="end">
          Spend per 1,000 people (₹)
        </text>
        <text x={L} y={T - 2}>
          Uptake index
        </text>
      </g>
      <line x1={x(ax)} x2={x(ax)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="3 3" />
      <line x1={L} x2={W - R} y1={y(ay)} y2={y(ay)} stroke="var(--muted)" strokeDasharray="3 3" />
      {pts.map((p) => {
        const lo = p.x > ax && p.y < ay;
        return (
          <g
            key={p.key}
            className="hx"
            tabIndex={0}
            role="button"
            aria-label={`${p.label}: ₹${p.x.toFixed(0)} per 1,000 people, uptake ${p.y.toFixed(0)}. Drill down`}
            onClick={p.onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                p.onClick();
              }
            }}
          >
            <title>{`${p.label}: ₹${p.x.toFixed(0)} per 1,000, uptake ${p.y.toFixed(0)}`}</title>
            <circle cx={x(p.x)} cy={y(p.y)} r="6" fill={lo ? "var(--crit)" : "var(--indigo)"} opacity=".85" />
            <text x={x(p.x) + 9} y={y(p.y) + 3.5} style={{ fill: "var(--ink)" }}>
              {p.short}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type Period = { key: string; label: string; fy: string; div?: number; q?: string; future?: boolean };

export function StackChart({
  periods, ser, bud, colors, proj, curFy, elapsed, sel, onSelect, maxLabels, aria,
}: {
  periods: Period[]; ser: number[][]; bud: number[] | null; colors: string[]; proj?: boolean; curFy: string; elapsed: number;
  sel?: number; onSelect?: (i: number) => void; maxLabels?: number; aria?: string;
}) {
  const W = 760,
    H = 300,
    L = 58,
    R = 14,
    T = 16,
    B = 44,
    N = periods.length;
  const tot = periods.map((_, i) => ser.reduce((s, a) => s + a[i], 0)),
    pr = periods.map((p, i) => (proj && p.fy === curFy ? tot[i] / elapsed : 0));
  const mx = niceMax(Math.max(1, ...tot, ...pr, ...(bud || [0])) * 1.08),
    pw = (W - L - R) / N,
    bw = Math.max(3, Math.min(64, pw * 0.68)),
    x = (i: number) => L + pw * i + pw / 2,
    y = (v: number) => T + (H - T - B) * (1 - v / mx);
  const step = Math.ceil(N / (maxLabels || 12));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria || "Spend chart"}>
      <g className="grid">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (mx * k) / 4;
          return (
            <React.Fragment key={k}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
              <text x={L - 8} y={y(v) + 3.5} textAnchor="end">
                {axisL(v)}
              </text>
            </React.Fragment>
          );
        })}
      </g>
      {periods.map((p, i) => {
        let acc = 0;
        const segs = ser.map((a, ci) => {
          const v = a[i];
          if (v <= 0) return null;
          const y0 = y(acc),
            y1 = y(acc + v);
          acc += v;
          return (
            <rect key={ci} x={(x(i) - bw / 2).toFixed(1)} y={y1.toFixed(1)} width={bw.toFixed(1)} height={Math.max(0.5, y0 - y1).toFixed(1)} fill={colors[ci]} />
          );
        });
        const clickable = !!onSelect;
        return (
          <g
            key={p.key}
            className={`spbar ${sel === i ? "sel" : ""} ${p.future ? "fut" : ""}`}
            {...(clickable
              ? {
                  tabIndex: 0,
                  role: "button",
                  onClick: () => onSelect!(i),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect!(i);
                    }
                  },
                }
              : {})}
          >
            <title>{`${p.label}: ${lakhT(tot[i])}${bud && bud[i] ? " · budget " + lakhT(bud[i]) : ""}`}</title>
            <rect className="hit" x={(x(i) - pw / 2).toFixed(1)} y={T} width={pw.toFixed(1)} height={H - T - B} fill="transparent" />
            {segs}
            {pr[i] > tot[i] && (
              <>
                <rect
                  x={(x(i) - bw / 2).toFixed(1)}
                  y={y(pr[i]).toFixed(1)}
                  width={bw.toFixed(1)}
                  height={(y(tot[i]) - y(pr[i])).toFixed(1)}
                  fill="none"
                  stroke="var(--muted)"
                  strokeDasharray="4 3"
                />
                <text x={x(i)} y={y(pr[i]) - 5} textAnchor="middle">
                  run-rate
                </text>
              </>
            )}
            {N <= 20 && tot[i] > 0 && (
              <text x={x(i)} y={y(tot[i]) - 6} textAnchor="middle" className="bt">
                {axisL(tot[i])}
              </text>
            )}
          </g>
        );
      })}
      {bud && bud.some((v) => v > 0) && (
        <>
          <polyline points={bud.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="6 4" />
          {bud.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.6" />
          ))}
        </>
      )}
      {periods.map((p, i) =>
        i % step === 0 || i === N - 1 ? (
          <text key={"l" + i} x={x(i)} y={H - B + 16} textAnchor="middle">
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

const lakhT = (v: number) => (v >= 100 ? "₹" + (v / 100).toFixed(2) + " Cr" : "₹" + v.toFixed(v < 10 ? 2 : 1) + " L");
