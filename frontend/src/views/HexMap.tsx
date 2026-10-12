"use client";
import { Geo, Node } from "@/lib/geo";
import { Filters, MM, Outreach } from "@/lib/outreach";

/** Karnataka district tile map: one hex per district, shaded by the chosen metric, as in the prototype. */
export function HexMap({ n, mm, o, geo, f, onPick }: { n: Node; mm: string; o: Outreach; geo: Geo; f: Filters; onPick: (d: string) => void }) {
  const r = 27,
    w = Math.sqrt(3) * r,
    vh = 1.5 * r,
    pad = 6,
    m = MM[mm];
  const ds = geo.ALL_D.filter((d) => o.districts.includes(d));
  const vals = ds.map((d) => m.get(o.M(geo.distNode(d), f)));
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  const low3 = mm === "read" ? [...ds].sort((a, b) => o.M(geo.distNode(a), f).readR - o.M(geo.distNode(b), f).readR).slice(0, 3) : [];
  const W = pad * 2 + w * 6.5,
    H = pad * 2 + r * 2 + vh * 8;
  return (
    <svg className="hexmap" viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} role="group" aria-label="Karnataka district tile map">
      {ds.map((d, i) => {
        const [c, row] = geo.HEX[d],
          cx = pad + w / 2 + c * w + (row % 2 ? w / 2 : 0),
          cy = pad + r + row * vh;
        let t = (vals[i] - lo) / (hi - lo || 1);
        if (m.inv) t = 1 - t;
        const pts = [0, 1, 2, 3, 4, 5]
          .map((k) => {
            const a = (Math.PI / 180) * (60 * k - 90);
            return (cx + r * 0.95 * Math.cos(a)).toFixed(1) + "," + (cy + r * 0.95 * Math.sin(a)).toFixed(1);
          })
          .join(" ");
        const inDiv = n.lvl === "state" || geo.DIV_OF[d] === n.div,
          tc = t > 0.55 ? "var(--on-heat)" : "var(--ink)";
        return (
          <g
            key={d}
            className={`hx ${inDiv ? "" : "dim"} ${n.dist === d ? "sel" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={`${d}, ${m.label} ${m.fmt(vals[i])}`}
            onClick={() => onPick(d)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(d);
              }
            }}
          >
            <title>{`${d} (${geo.DIV_OF[d]} Division) · ${m.label}: ${m.fmt(vals[i])}`}</title>
            <polygon
              points={pts}
              className={low3.includes(d) ? "flag" : ""}
              style={{ fill: `color-mix(in oklab,var(--heat-hi) ${Math.round(8 + t * 92)}%,var(--heat-lo))` }}
            />
            <text x={cx} y={cy - 2} className="hc" style={{ fill: tc }}>
              {geo.CODE[d]}
            </text>
            <text x={cx} y={cy + 10} className="hv" style={{ fill: tc }}>
              {m.fmt(vals[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
