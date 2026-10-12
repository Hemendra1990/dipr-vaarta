"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { nIN } from "@/lib/format";
import { useApi, useApp } from "@/lib/store";
import type { FieldDef } from "@/lib/types";
import { ErrorNote, FmtCell, Loading } from "./common";

type UField = FieldDef & { typeLabel: string; allowed: string };
type Dataset = { id: string; title: string; group: string; module: string; schema: UField[]; count: number; sample: string[][] };
type RowError = { row: number; col: string; val: string; msg: string };
type Report = {
  uploadId: string | null; file: string; sheet: string; missing: string[]; extra: string[]; errors: RowError[]; errorCount: number;
  total: number; badRows: number; goodCount: number; preview: Record<string, string | number>[]; existing: number;
};
type Batch = {
  id: number; dataset: string; datasetTitle: string; fileName: string; mode: string; rowsImported: number; rowsSkipped: number;
  uploadedBy: string; uploadedByTitle: string; uploadedAt: string;
};

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STEPS = ["Check the format", "Choose your file", "Review and fix", "Import"];

/** Data upload: pick a register, then the prototype's 4-step wizard. Parsing and validation run on the server. */
export function UploadView() {
  const { user, uploadTarget, setTab, toast, invalidate } = useApp();
  const { data: list, error } = useApi<Dataset[]>("/uploads/datasets");
  const { data: hist } = useApi<Batch[]>("/uploads/history");
  const [ds, setDs] = useState<string | null>(uploadTarget ? uploadTarget.split("#")[0] : null);
  const [step, setStep] = useState(1);
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Report | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [done, setDone] = useState<Batch | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!uploadTarget) return;
    pick(uploadTarget.split("#")[0]);
  }, [uploadTarget]);

  function pick(id: string) {
    setDs(id);
    setStep(1);
    setAck(false);
    setCopied(null);
    setErr(null);
    setRes(null);
  }

  if (error) return <ErrorNote msg={error} />;
  if (!list) return <Loading what="registers" />;
  const d = list.find((x) => x.id === ds) ?? list[0];
  if (!d) return <div className="empty">Your login has no data to upload.</div>;
  const tabOf = (x: Dataset) => (x.id === "budget" ? "spend" : x.module);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr("The file is larger than 10 MB. Split it and upload in parts.");
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setErr("Choose an .xlsx, .xls or .csv file.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.upload<Report>(`/uploads/${d.id}/validate`, fd);
      setRes(r);
      setMode("append");
      setStep(3);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function doImport() {
    if (!res?.uploadId) return;
    setBusy(true);
    try {
      const b = await api.post<Batch>(`/uploads/${res.uploadId}/import`, { mode });
      setDone(b);
      setStep(4);
      toast("Data imported", `${nIN(b.rowsImported)} rows into ${b.datasetTitle}. Dashboards now use this data.`);
      invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed.";
      if (e instanceof ApiError && e.status === 404) {
        setErr(msg);
        setStep(2);
      } else toast("Import failed", msg);
    } finally {
      setBusy(false);
    }
  }

  async function template() {
    try {
      const name = await api.download(`/uploads/${d.id}/template`, `Vaarta360_${d.id}_template.xlsx`);
      toast("Template downloaded", `${name}. Fill the Data sheet and upload it here.`);
    } catch (e) {
      toast("Download failed", e instanceof Error ? e.message : "Try again.");
    }
  }

  function copyHeadings() {
    const h = d.schema.map((f) => f.h).join("\t");
    const show = () => setCopied(d.schema.map((f) => f.h).join(" | "));
    try {
      navigator.clipboard.writeText(h).then(() => toast("Headings copied", "Paste into cell A1 of your sheet."), show);
    } catch {
      show();
    }
  }

  let body: React.ReactNode;
  if (step === 1) {
    const ex: (string[] | null)[] = d.sample.length ? d.sample : [null];
    body = (
      <>
        <h4 className="sth">The Excel file must look like this</h4>
        <p className="cap">
          Put the data on the first sheet (or a sheet named <b>Data</b>). Row 1 holds these exact column headings, in any order. One record per row from row
          2. Extra columns are ignored.
        </p>
        <div className="xl" role="table" aria-label="Expected Excel layout">
          <div className="xlr xlh">
            <span className="xln" />
            {d.schema.map((f, i) => (
              <span key={f.k}>{COLS[i] || "Z" + i}</span>
            ))}
          </div>
          <div className="xlr xlhd">
            <span className="xln">1</span>
            {d.schema.map((f) => (
              <span key={f.k} title={f.h}>
                {f.h}
                {f.req && <b className="req">*</b>}
              </span>
            ))}
          </div>
          {ex.map((r, i) => (
            <div className="xlr" key={i}>
              <span className="xln">{i + 2}</span>
              {d.schema.map((f, j) => (
                <span key={f.k}>{r ? r[j] : ""}</span>
              ))}
            </div>
          ))}
        </div>
        <h4 className="sth">Column rules</h4>
        <div className="tbw">
          <table className="tb tight">
            <thead>
              <tr>
                <th>Col</th>
                <th>Heading</th>
                <th>Type</th>
                <th>Required</th>
                <th>Format or allowed values</th>
              </tr>
            </thead>
            <tbody>
              {d.schema.map((f, i) => (
                <tr key={f.k}>
                  <td className="num">{COLS[i]}</td>
                  <td>
                    <b>{f.h}</b>
                  </td>
                  <td>{f.typeLabel}</td>
                  <td>{f.req ? <span className="chip crit">Required</span> : <span className="chip">Optional</span>}</td>
                  <td className="allowed">{f.allowed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {user.district && (
          <div className="note" style={{ marginTop: 12 }}>
            Your login can upload {user.district} records only. Rows for other districts are rejected.
          </div>
        )}
        {user.department && (
          <div className="note" style={{ marginTop: 12 }}>
            Your login can upload {user.department} records only. Rows for other departments are rejected.
          </div>
        )}
        <div className="upacts">
          <button className="btn" onClick={template}>
            ⬇ Download Excel template
          </button>
          <button className="btn" onClick={copyHeadings}>
            Copy column headings
          </button>
        </div>
        {copied && (
          <div className="note">
            <span>Copy these headings into row 1:</span>
            <code className="hdrs">{copied}</code>
          </div>
        )}
        <p className="cap">The template has three sheets: Data (headings and sample rows), Allowed values, and Instructions.</p>
        <label className="ack">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> My file follows this format
        </label>
        <div className="upacts">
          <button className="btn pri" disabled={!ack} onClick={() => setStep(2)}>
            Continue to upload
          </button>
        </div>
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        <h4 className="sth">Choose the Excel or CSV file</h4>
        <label
          className={`drop ${over ? "over" : ""}`}
          htmlFor="u-file"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
        >
          <span className="dbig">{busy ? "Reading the file…" : "Drop the file here"}</span>
          <span>or select a file · .xlsx, .xls or .csv · up to 10 MB</span>
          <input id="u-file" ref={fileRef} type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => handleFile(e.target.files?.[0])} />
        </label>
        {err && <div className="note bad">{err}</div>}
        <div className="upacts">
          <button className="btn" onClick={() => setStep(1)}>
            ← Back to format
          </button>
        </div>
      </>
    );
  } else if (step === 3 && res) {
    body = (
      <>
        <h4 className="sth">
          {res.file} · sheet “{res.sheet}”
        </h4>
        <div className="kpis mini">
          <div className="kpi">
            <span className="l">Rows read</span>
            <span className="v">{nIN(res.total)}</span>
          </div>
          <div className="kpi kt-good">
            <span className="l">Ready to import</span>
            <span className="v">{nIN(res.goodCount)}</span>
          </div>
          <div className={`kpi ${res.errorCount ? "kt-crit" : ""}`}>
            <span className="l">Rows with problems</span>
            <span className="v">{nIN(res.badRows)}</span>
          </div>
        </div>
        {res.missing.length > 0 && (
          <div className="note bad">
            <b>Missing required columns:</b> {res.missing.join(", ")}. Add them to row 1 and upload again.
          </div>
        )}
        {res.extra.length > 0 && <div className="note">These columns are not part of the format and will be ignored: {res.extra.join(", ")}</div>}
        {res.errors.length > 0 && (
          <>
            <h4 className="sth">Problems to fix in Excel</h4>
            <div className="tbw errs">
              <table className="tb tight">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Column</th>
                    <th>Value</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {res.errors.slice(0, 100).map((e, i) => (
                    <tr key={i}>
                      <td className="num">{e.row}</td>
                      <td>{e.col}</td>
                      <td>
                        <code>{e.val || "(empty)"}</code>
                      </td>
                      <td>{e.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {res.errorCount > 100 && <p className="cap">Showing the first 100 of {nIN(res.errorCount)} problems.</p>}
          </>
        )}
        {res.goodCount > 0 && (
          <>
            <h4 className="sth">Preview of rows ready to import</h4>
            <div className="tbw">
              <table className="tb tight">
                <thead>
                  <tr>
                    {d.schema.map((f) => (
                      <th key={f.k}>{f.h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.preview.map((o, i) => (
                    <tr key={i}>
                      {d.schema.map((f) => (
                        <td key={f.k}>
                          <FmtCell f={f} v={o[f.k]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <fieldset className="mode">
              <legend>How to import</legend>
              <label>
                <input type="radio" name="umode" value="append" checked={mode === "append"} onChange={() => setMode("append")} /> Add to the existing{" "}
                {nIN(res.existing)} records
              </label>
              <label>
                <input type="radio" name="umode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace the existing
                records{user.district || user.department ? ` in your scope (${user.district || user.department})` : ""} with this file
              </label>
            </fieldset>
          </>
        )}
        <div className="upacts">
          <button className="btn" onClick={() => setStep(2)}>
            ← Choose another file
          </button>
          {res.goodCount > 0 && (
            <button className="btn pri" disabled={busy} onClick={doImport}>
              Import {nIN(res.goodCount)} rows{res.badRows ? `, skip ${nIN(res.badRows)}` : ""}
            </button>
          )}
        </div>
      </>
    );
  } else if (done) {
    body = (
      <>
        <div className="done">
          <span className="dk">✓</span>
          <div>
            <h4>
              {nIN(done.rowsImported)} rows imported into {d.title}
            </h4>
            <p>
              {done.mode === "replace" ? "The old records were replaced." : "Added to the existing records."}{" "}
              {done.rowsSkipped ? nIN(done.rowsSkipped) + " rows with problems were skipped." : ""} Dashboards now use this data.
            </p>
          </div>
        </div>
        <div className="upacts">
          <button className="btn pri" onClick={() => setTab(tabOf(d))}>
            Open {tabOf(d) === "spend" ? "Spend analytics" : d.title}
          </button>
          <button className="btn" onClick={() => setStep(2)}>
            Upload another file
          </button>
        </div>
      </>
    );
  }

  const grp: Record<string, Dataset[]> = {};
  list.forEach((x) => (grp[x.group] = grp[x.group] || []).push(x));
  const uploaded = new Set((hist ?? []).map((h) => h.dataset));

  return (
    <div className="grid">
      <div className="s12 modhead">
        <div>
          <h2>Data upload</h2>
          <p>Already keeping a register in Excel? Upload it here. You will see the expected format first, so the file can be prepared to match.</p>
        </div>
      </div>
      <div className="card s4 dslist">
        <div className="ch">
          <div>
            <h3>1. Pick what to upload</h3>
            <p>{list.length} registers available to your login</p>
          </div>
        </div>
        {Object.entries(grp).map(([g, a]) => (
          <div className="dsg" key={g}>
            <span className="ngl">{g}</span>
            {a.map((x) => (
              <button key={x.id} className={`dsb ${x.id === d.id ? "on" : ""}`} onClick={() => pick(x.id)}>
                <span>
                  <b>{x.title}</b>
                  <small>
                    {x.schema.length} columns · {nIN(x.count)} records{uploaded.has(x.id) ? " · uploaded" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="card s8">
        <div className="stepper">
          {STEPS.map((s, i) => (
            <span key={s} className={`st ${step === i + 1 ? "cur" : step > i + 1 ? "done" : ""}`}>
              <b>{i + 1}</b>
              {s}
            </span>
          ))}
        </div>
        <div className="upbody">
          <p className="dstitle">{d.title}</p>
          {body}
        </div>
      </div>
      <div className="card s12">
        <div className="ch">
          <div>
            <h3>Upload history</h3>
            <p>Last 50 uploads to registers your login can open</p>
          </div>
        </div>
        {hist && hist.length ? (
          <div className="tbw">
            <table className="tb tight">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>By</th>
                  <th>Register</th>
                  <th>File</th>
                  <th className="r">Imported</th>
                  <th className="r">Skipped</th>
                  <th>Mode</th>
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.id}>
                    <td className="nw">{new Date(h.uploadedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{h.uploadedByTitle}</td>
                    <td>{h.datasetTitle}</td>
                    <td>{h.fileName}</td>
                    <td className="r">{nIN(h.rowsImported)}</td>
                    <td className="r">{nIN(h.rowsSkipped)}</td>
                    <td>{h.mode === "replace" ? "Replaced" : "Added"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No uploads yet.</div>
        )}
      </div>
    </div>
  );
}
