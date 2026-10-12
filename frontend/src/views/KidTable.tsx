"use client";
import { useState } from "react";
import { cl } from "@/lib/format";
import { CHILD_LVL, label, Node } from "@/lib/geo";
import type { Metrics } from "@/lib/outreach";
import { useApp } from "@/lib/store";

export type KidCol = { k: string; label: string; get: (m: Metrics) => number; fmt: (v: number) => string; bar?: boolean; colf?: (v: number) => string; chip?: (v: number) => string };

/** Children of the current area with sortable metric columns; a row drills down (prototype kidTable). */
export function KidTable({ n, cols }: { n: Node; cols: KidCol[] }) {
  const { outreach: o, filters, drillTo } = useApp();
  const [sort, setSort] = useState<string | null>(null);
  const [dir, setDir] = useState(-1);
  if (!o) return null;
  const kids = o.children(n);
  if (!kids.length) return null;
  const rows = kids.map((c) => ({ c, m: o.M(c, filters) }));
  const sk = sort || cols[0].k,
    sc = cols.find((x) => x.k === sk)!;
  rows.sort((a, b) => (sc.get(a.m) - sc.get(b.m)) * dir);
  const maxes: Record<string, number> = {};
  cols.forEach((c) => {
    if (c.bar) maxes[c.k] = Math.max(...rows.map((r) => c.get(r.m)));
  });
  const head = CHILD_LVL[n.lvl].replace(/^./, (s) => s.toUpperCase()).replace(/s$/, "");
  return (
    <div className="tbw">
      <table className="tb">
        <thead>
          <tr>
            <th>{head}</th>
            {cols.map((c) => (
              <th key={c.k} className="r">
                <button
                  onClick={() => {
                    if (sort === c.k) setDir(-dir);
                    else {
                      setSort(c.k);
                      setDir(-1);
                    }
                  }}
                >
                  {c.label}
                  {sk === c.k ? (dir < 0 ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, m }) => (
            <tr
              key={c.name}
              className="click"
              tabIndex={0}
              onClick={() => drillTo({ lvl: c.lvl, name: c.name })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  drillTo({ lvl: c.lvl, name: c.name });
                }
              }}
            >
              <td>
                <span className="nm">{label(c)}</span>
              </td>
              {cols.map((col) => {
                const v = col.get(m);
                return (
                  <td key={col.k} className="r">
                    {col.bar ? (
                      <div className="ib">
                        <span>{col.fmt(v)}</span>
                        <div className="t">
                          <i style={{ width: `${cl(v / (maxes[col.k] || 1), 0, 1) * 100}%`, background: col.colf ? col.colf(v) : "var(--indigo)" }} />
                        </div>
                      </div>
                    ) : col.chip ? (
                      <span className={`chip ${col.chip(v)}`}>{col.fmt(v)}</span>
                    ) : (
                      col.fmt(v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
