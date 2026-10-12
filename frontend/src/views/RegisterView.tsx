"use client";
import { useEffect, useMemo, useState } from "react";
import { BarList, Kpi } from "@/components/charts";
import { fmt, lakh, nIN, toneOf } from "@/lib/format";
import { CHILD_LVL, geoChildren, label } from "@/lib/geo";
import { derive, makeCtx, REG_LOGIC } from "@/lib/registers";
import { useApi, useApp } from "@/lib/store";
import type { Meta, RegisterDef, Row } from "@/lib/types";
import { colDef, Empty, ErrorNote, FmtCell, isNumT, Loading } from "./common";

const TONE_VAR: Record<string, string> = { crit: "crit", warn: "warn", good: "good", ind: "indigo" };

/** The generic register module: KPIs, stage pipeline, category and area bars, records table and AI note. */
export function RegisterView({ def }: { def: RegisterDef }) {
  const { node, geo, meta, canSee, drillTo, goUpload } = useApp();
  const { data, error } = useApi<Row[]>(`/registers/${def.id}/rows`);
  const live = useApi<Meta>("/meta").data ?? meta;
  const ctx = useMemo(() => makeCtx(meta.calendar), [meta]);
  const [status, setStatus] = useState("All");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [dir, setDir] = useState(-1);
  const [limit, setLimit] = useState(30);
  useEffect(() => setLimit(30), [node]);

  const rows = useMemo(() => (data ?? []).map((r) => derive(def.id, r, ctx)), [data, def.id, ctx]);
  const all = useMemo(() => (def.geoAll ? rows : rows.filter((r) => geo.geoOk(r, node))), [rows, def.geoAll, geo, node]);

  if (error) return <ErrorNote msg={error} />;
  if (!data) return <Loading what={def.title.toLowerCase()} />;

  const logic = REG_LOGIC[def.id];
  const k = logic.kpis(all, ctx);
  const cnt: Record<string, number> = {};
  all.forEach((r) => (cnt[r[def.status]] = (cnt[r[def.status]] || 0) + 1));
  const pipe = def.order.map((s) => ({
    l: s, v: cnt[s] || 0, d: nIN(cnt[s] || 0), on: status === s, col: `var(--${TONE_VAR[toneOf(s)]})`,
    onClick: () => {
      setStatus(status === s ? "All" : s);
      setLimit(30);
    },
  }));
  const sumField = def.sum ? def.schema.find((f) => f.k === def.sum) : undefined;
  const cm: Record<string, number> = {};
  all.forEach((r) => {
    const key = String(r[def.dim]);
    cm[key] = (cm[key] || 0) + (def.sum ? +r[def.sum] || 0 : 1);
  });
  const cats = Object.entries(cm)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([l, v]) => ({
      l, v, d: sumField?.t === "money" ? lakh(v) : fmt(v), on: cat === l,
      onClick: () => {
        setCat(cat === l ? null : l);
        setLimit(30);
      },
    }));
  const kids = def.geoAll ? [] : geoChildren(geo, node).filter((ch) => ch.lvl !== "tlk" || all.some((r) => r.taluk));
  const geoItems = kids
    .map((ch) => ({ l: label(ch), v: all.filter((r) => geo.geoOk(r, ch)).length, ch }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 10)
    .map((x) => ({ l: x.l, v: x.v, d: nIN(x.v), onClick: () => drillTo({ lvl: x.ch.lvl, name: x.ch.name }) }));
  const sw = node.lvl !== "state" && !def.geoAll ? rows.filter((r) => r.district === "Statewide").length : 0;
  const src = live.sources?.[def.id];

  let list = all;
  if (status !== "All") list = list.filter((r) => r[def.status] === status);
  if (cat) list = list.filter((r) => String(r[def.dim]) === cat);
  if (q) {
    const ql = q.toLowerCase();
    list = list.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(ql)));
  }
  if (sort) {
    const s = sort;
    list = list.slice().sort((a, b) => {
      const x = a[s],
        y = b[s];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * dir;
    });
  }
  const cols = def.cols.map((c) => colDef(def.schema, c));
  const show = list.slice(0, limit);
  const hasGeo = kids.length > 0;

  return (
    <div className="grid">
      <div className="s12 modhead">
        <div>
          <h2>{def.title}</h2>
          <p>{def.sub}</p>
        </div>
        <div className="mh-acts">
          {src ? <span className="chip good">Uploaded · {src.file}</span> : <span className="chip">Sample data</span>}
          {def.wa && (
            <span className="chip wa" title={def.wa}>
              WhatsApp feed
            </span>
          )}
          {canSee("upload") && (
            <button className="btn pri" onClick={() => goUpload(def.id)}>
              ⬆ Upload Excel
            </button>
          )}
        </div>
      </div>
      {def.banner && (
        <div className="s12 note">
          <span className="chip warn">Note</span>
          <span>{def.banner}</span>
        </div>
      )}
      <div className="s12 kpis">
        {k.map(([l, v, s, t]) => (
          <Kpi key={l} l={l} v={v} s={s} t={t} />
        ))}
      </div>
      <div className={`card ${hasGeo ? "s4" : "s6"}`}>
        <div className="ch">
          <div>
            <h3>{colDef(def.schema, def.status).h}</h3>
            <p>Select a stage to filter the list</p>
          </div>
        </div>
        <BarList items={pipe} />
      </div>
      <div className={`card ${hasGeo ? "s4" : "s6"}`}>
        <div className="ch">
          <div>
            <h3>By {def.dimLabel.toLowerCase()}</h3>
            <p>{def.sum ? "By " + colDef(def.schema, def.sum).h.toLowerCase() : "Number of records"} · select to filter</p>
          </div>
        </div>
        <BarList items={cats} />
      </div>
      {hasGeo && (
        <div className="card s4">
          <div className="ch">
            <div>
              <h3>By {CHILD_LVL[node.lvl].replace(/s$/, "")}</h3>
              <p>Select to drill down</p>
            </div>
          </div>
          <BarList items={geoItems} />
        </div>
      )}
      <div className="card s12">
        <div className="ch">
          <div>
            <h3>Records</h3>
            <p>
              {`Showing ${Math.min(list.length, limit)} of ${nIN(list.length)}${status !== "All" ? " · " + status : ""}${cat ? " · " + cat : ""}`}
            </p>
          </div>
          <div className="tblbar">
            <input
              type="search"
              placeholder="Search records"
              aria-label="Search records"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(30);
              }}
            />
            {(status !== "All" || cat) && (
              <button
                className="btn"
                onClick={() => {
                  setStatus("All");
                  setCat(null);
                }}
              >
                Clear filters ×
              </button>
            )}
          </div>
        </div>
        {sw > 0 && (
          <div className="note" style={{ marginBottom: 10 }}>
            {sw} statewide records are not tied to a district and show only at state level.
          </div>
        )}
        {list.length ? (
          <>
            <div className="tbw">
              <table className="tb">
                <thead>
                  <tr>
                    {cols.map((f) => (
                      <th key={f.k} className={isNumT(f.t) ? "r" : ""}>
                        <button
                          onClick={() => {
                            if (sort === f.k) setDir(-dir);
                            else {
                              setSort(f.k);
                              setDir(-1);
                            }
                          }}
                        >
                          {f.h}
                          {sort === f.k ? (dir < 0 ? " ↓" : " ↑") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {show.map((r, i) => (
                    <tr key={i}>
                      {cols.map((f) => (
                        <td key={f.k} className={isNumT(f.t) ? "r" : ""}>
                          {f.k === "_days" && (r._days || 0) > 30 ? (
                            <span className="chip crit">{r._days}</span>
                          ) : f.k === "_left" && r._left !== "" && r._left !== undefined && +r._left < 0 ? (
                            <span className="chip crit">{r._left}</span>
                          ) : f.k === "_left" && r._left !== "" && r._left !== undefined && +r._left <= 7 ? (
                            <span className="chip warn">{r._left}</span>
                          ) : (
                            <FmtCell f={f} v={r[f.k]} statusKey={def.status} />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.length > limit && (
              <button className="btn more" onClick={() => setLimit(limit + 30)}>
                Show 30 more
              </button>
            )}
          </>
        ) : (
          <Empty>No records match. Clear the filters or upload this register from Excel.</Empty>
        )}
      </div>
      <div className="card s12 ainote">
        <span className="aiflag">AI agent</span>
        <p>{logic.ai(all, ctx)}</p>
      </div>
    </div>
  );
}
