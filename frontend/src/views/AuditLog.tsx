"use client";
import { useState } from "react";
import { useApi } from "@/lib/store";
import type { AuditFacets, AuditPage } from "@/lib/types";
import { ErrorNote, Loading } from "./common";
import { when } from "./Users";

const SIZE = 50;

/** Plain names for the action groups in the filter. */
const GROUP: Record<string, string> = {
  login: "Sign-in", user: "Users & access", password: "Password", claim: "Tipline", upload: "Data upload", agent: "AI agents",
  feed: "District offices", adflag: "Release-order audit",
};

const tone = (a: string) => (a === "login.locked" || a === "user.deactivate" ? "crit" : a === "login.failed" ? "warn" : a.startsWith("user.") || a.startsWith("password") ? "ind" : "");

export function AuditLog() {
  const { data: facets } = useApi<AuditFacets>("/audit/facets");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const p = new URLSearchParams({ page: String(page), size: String(SIZE) });
  if (user) p.set("user", user);
  if (action) p.set("action", action);
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  if (q.trim()) p.set("q", q.trim());
  const { data, error } = useApi<AuditPage>("/audit?" + p.toString());

  const set = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    f(e.target.value);
    setPage(0);
  };
  const filtered = user || action || from || to || q;

  return (
    <div className="grid">
      <div className="s12 modhead">
        <div>
          <h2>Audit log</h2>
          <p>Every sign-in and every change made in Vaarta 360, newest first. Entries cannot be edited or deleted.</p>
        </div>
      </div>
      <div className="card s12">
        <div className="fbar mini" style={{ marginBottom: 10 }}>
          <div className="slicer">
            <label htmlFor="au-user">User</label>
            <select id="au-user" value={user} onChange={set(setUser)}>
              <option value="">Everyone</option>
              {facets?.users.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="slicer">
            <label htmlFor="au-act">Action</label>
            <select id="au-act" value={action} onChange={set(setAction)}>
              <option value="">All actions</option>
              {facets?.groups.length ? (
                <optgroup label="Groups">
                  {facets.groups.map((g) => (
                    <option key={"g" + g} value={g}>
                      {GROUP[g] ?? g} (all)
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Actions">
                {facets?.actions.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="slicer">
            <label htmlFor="au-from">From</label>
            <input id="au-from" className="nc-in" type="date" value={from} onChange={set(setFrom)} />
          </div>
          <div className="slicer">
            <label htmlFor="au-to">To</label>
            <input id="au-to" className="nc-in" type="date" value={to} onChange={set(setTo)} />
          </div>
          <div className="slicer" style={{ flex: "1 1 180px" }}>
            <label htmlFor="au-q">Detail contains</label>
            <input id="au-q" className="nc-in" placeholder="e.g. Raichur, CLM-, rows=" value={q} onChange={set(setQ)} />
          </div>
          {filtered && (
            <button
              className="clearf"
              onClick={() => {
                setUser("");
                setAction("");
                setFrom("");
                setTo("");
                setQ("");
                setPage(0);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {error ? (
          <ErrorNote msg={error} />
        ) : !data ? (
          <Loading what="the audit log" />
        ) : (
          <>
            <div className="tbw">
              <table className="tb">
                <thead>
                  <tr>
                    <th>When (IST)</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id}>
                      <td className="nw">{when(e.at)}</td>
                      <td className="nw">{e.username}</td>
                      <td className="nw">
                        <span className={`chip ${tone(e.action)}`}>{e.action}</span>
                      </td>
                      <td>{e.detail || <span className="mut">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && <div className="empty">No entries match these filters.</div>}
            <div className="au-pager">
              <span>
                {data.total ? `${data.page * data.size + 1}–${data.page * data.size + data.items.length} of ${data.total.toLocaleString("en-IN")}` : "0 entries"}
              </span>
              <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
                ‹ Newer
              </button>
              <button className="btn" disabled={page + 1 >= data.pages} onClick={() => setPage(page + 1)}>
                Older ›
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
