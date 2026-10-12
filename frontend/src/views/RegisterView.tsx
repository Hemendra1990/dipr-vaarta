"use client";
import { useEffect, useMemo, useState } from "react";
import { BarList, Kpi } from "@/components/charts";
import { fmt, lakh, nIN, toneOf } from "@/lib/format";
import { CHILD_LVL, geoChildren, label } from "@/lib/geo";
import { api } from "@/lib/api";
import { derive, formValues, makeCtx, nextStage, records, REG_LOGIC, RowError, type FormVals } from "@/lib/registers";
import { useApi, useApp } from "@/lib/store";
import type { FieldDef, Meta, RegisterDef, Row, User } from "@/lib/types";
import { colDef, Empty, ErrorNote, FmtCell, isNumT, Loading } from "./common";

const TONE_VAR: Record<string, string> = { crit: "crit", warn: "warn", good: "good", ind: "indigo" };

/** The generic register module: KPIs, stage pipeline, category and area bars, records table and AI note. */
export function RegisterView({ def }: { def: RegisterDef }) {
  const { node, geo, meta, canSee, drillTo, goUpload, user, toast } = useApp();
  const { data, error } = useApi<Row[]>(`/registers/${def.id}/rows`);
  const live = useApi<Meta>("/meta").data ?? meta;
  const ctx = useMemo(() => makeCtx(meta.calendar), [meta]);
  const [status, setStatus] = useState("All");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [dir, setDir] = useState(-1);
  const [limit, setLimit] = useState(30);
  const [panel, setPanel] = useState<{ row: Row | null } | null>(null);
  useEffect(() => setLimit(30), [node]);
  useEffect(() => setPanel(null), [def.id]);
  const canWrite = canSee(def.id) && !user.vendorId && user.role !== "VENDOR";

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
    list = list.filter((r) => Object.entries(r).some(([key, v]) => key !== "_id" && String(v).toLowerCase().includes(ql)));
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
          <button
            className="btn"
            onClick={() =>
              api
                .download(`/registers/${def.id}/export`, `Vaarta360_${def.id}_records.xlsx`)
                .then((f) => toast("Excel downloaded", `${f} has the ${def.title.toLowerCase()} records your login can see.`))
                .catch((e: Error) => toast("Export failed", e.message))
            }
          >
            ⬇ Export Excel
          </button>
          {canSee("upload") && (
            <button className="btn pri" onClick={() => goUpload(def.id)}>
              ⬆ Upload Excel
            </button>
          )}
          {canWrite && (
            <button className="btn pri" onClick={() => setPanel({ row: null })}>
              + Add record
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
                    <tr
                      key={r._id ?? i}
                      className={`click${panel?.row && panel.row._id === r._id ? " on" : ""}`}
                      tabIndex={0}
                      onClick={() => setPanel({ row: r })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setPanel({ row: r });
                      }}
                    >
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
      {panel && (
        <RecordPanel
          key={panel.row ? String(panel.row._id) : "new"}
          def={def}
          row={panel.row}
          user={user}
          districts={geo.ALL_D}
          fy={meta.calendar.curFy}
          canWrite={canWrite}
          onClose={() => setPanel(null)}
        />
      )}
      <div className="card s12 ainote">
        <span className="aiflag">AI agent</span>
        <p>{logic.ai(all, ctx)}</p>
      </div>
    </div>
  );
}

/** Whether this login may change this record: own district for district officers, own department for nodal officers. */
function rowWritable(u: User, r: Row | null): boolean {
  if (!r) return true;
  if (u.district && r.district !== u.district) return false;
  if (u.department && r.department && r.department !== u.department) return false;
  return true;
}

function options(f: FieldDef, u: User, districts: string[]): string[] | null {
  if (f.t === "enum") return f.k === "department" && u.department ? [u.department] : f.e ?? [];
  if (f.t === "district") return u.district ? [u.district] : [...(f.sw ? ["Statewide"] : []), ...districts];
  if (f.t === "yn") return ["Yes", "No"];
  return null;
}

/** Side panel to add or edit one record, with a form generated from the register's schema. */
function RecordPanel({ def, row, user, districts, fy, canWrite, onClose }: {
  def: RegisterDef; row: Row | null; user: User; districts: string[]; fy: string; canWrite: boolean; onClose: () => void;
}) {
  const { invalidate, toast } = useApp();
  const init = useMemo(() => formValues(def, row, { district: user.district, department: user.department, fy }), [def, row, user, fy]);
  const [vals, setVals] = useState<FormVals>(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = canWrite && rowWritable(user, row);
  const isNew = !row;
  const id = row ? Number(row._id) : 0;
  const dirty = def.schema.some((f) => (vals[f.k] ?? "") !== (init[f.k] ?? ""));
  const next = row ? nextStage(def, row[def.status]) : null;
  const idF = def.schema.find((f) => f.t === "id");
  const name = row ? String((idF ? row[idF.k] : row[def.schema[0].k]) ?? "") : "";

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const run = async (what: () => Promise<unknown>, title: string, body: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await what();
      invalidate();
      toast(title, body);
      onClose();
    } catch (e) {
      const er = e instanceof RowError ? e : new RowError(0, (e as Error).message);
      setErrs(er.errors);
      setMsg(er.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => (isNew ? records.create(def.id, vals) : records.update(def.id, id, vals)),
      isNew ? "Record added" : "Record saved",
      `${def.title}: ${(idF && vals[idF.k]) || name || "record"} ${isNew ? "added" : "updated"}.`,
    );
  const move = () => next && run(() => records.advance(def.id, id), "Stage moved", `${name || "Record"} moved to ${next}.`);
  const del = () => {
    if (!window.confirm(`Delete ${name || "this record"} from ${def.title}? This cannot be undone.`)) return;
    run(() => records.remove(def.id, id), "Record deleted", `${name || "Record"} removed from ${def.title}.`);
  };

  return (
    <div className="rp-scrim" onClick={onClose}>
      <aside className="card rp" role="dialog" aria-modal="true" aria-label={isNew ? "Add record" : "Edit record"} onClick={(e) => e.stopPropagation()}>
        <div className="ch">
          <div>
            <h3>{isNew ? `Add record · ${def.title}` : name || "Record"}</h3>
            <p>
              {isNew
                ? "Fill in the fields. Required fields are marked *."
                : editable
                  ? `${def.title} · ${String(row?.[def.status] ?? "")}`
                  : "Your login can view this record but not change it."}
            </p>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {msg && <div className="note bad rp-msg">{msg}</div>}
        <form
          className="rp-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (editable && !busy) save();
          }}
        >
          {def.schema.map((f) => {
            const opts = options(f, user, districts);
            const v = vals[f.k] ?? "";
            const set = (x: string) => {
              setVals((o) => ({ ...o, [f.k]: x }));
              if (errs[f.k]) setErrs((o) => ({ ...o, [f.k]: "" }));
            };
            const fid = `rp-${def.id}-${f.k}`;
            return (
              <div key={f.k} className={`rp-f${errs[f.k] ? " bad" : ""}`}>
                <label htmlFor={fid}>
                  {f.h}
                  {f.req && " *"}
                </label>
                {opts ? (
                  <select id={fid} value={v} disabled={!editable} onChange={(e) => set(e.target.value)}>
                    {(!f.req || !opts.includes(v)) && <option value="">{v && !opts.includes(v) ? v : "—"}</option>}
                    {opts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={fid}
                    type={f.t === "date" ? "date" : f.t === "month" ? "month" : isNumT(f.t) ? "number" : "text"}
                    step={isNumT(f.t) ? "any" : undefined}
                    placeholder={f.t === "fy" ? "2026-27" : f.ex ?? ""}
                    value={v}
                    readOnly={!editable}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
                {errs[f.k] && <span className="rp-err">{errs[f.k]}</span>}
              </div>
            );
          })}
          {editable && (
            <div className="rp-acts">
              <button type="submit" className="btn pri" disabled={busy || (!isNew && !dirty)}>
                {isNew ? "Add record" : "Save"}
              </button>
              {next && (
                <button type="button" className="btn" disabled={busy || dirty} title={dirty ? "Save your changes first" : undefined} onClick={move}>
                  Move to {next} →
                </button>
              )}
              {!isNew && user.role === "COMMISSIONER" && (
                <button type="button" className="btn rp-del" disabled={busy} onClick={del}>
                  Delete
                </button>
              )}
            </div>
          )}
        </form>
      </aside>
    </div>
  );
}
