"use client";
import { useMemo, useState } from "react";
import { Dialog, passwordProblem } from "@/components/PasswordDialog";
import { api, ApiError } from "@/lib/api";
import { useApi, useApp } from "@/lib/store";
import type { AdminUser, UserOptions } from "@/lib/types";
import { ErrorNote, Loading } from "./common";

/** "8 Oct 2026, 4:05 pm" in Indian time, or a dash. */
export function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

const status = (u: AdminUser): [string, string] =>
  !u.active ? ["crit", "Deactivated"] : u.locked ? ["warn", "Locked"] : u.mustChangePassword ? ["ind", "Temporary password"] : ["good", "Active"];

type Modal = { kind: "new" } | { kind: "edit"; u: AdminUser } | { kind: "off"; u: AdminUser } | { kind: "reset"; u: AdminUser } | { kind: "temp"; u: AdminUser; pw: string };

export function Users() {
  const { data, error } = useApi<AdminUser[]>("/users");
  const { data: opts, error: oErr } = useApi<UserOptions>("/users/options");
  const { toast, invalidate } = useApp();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [st, setSt] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.filter(
      (u) =>
        (!s || (u.username + " " + u.displayName + " " + u.scope).toLowerCase().includes(s)) &&
        (!role || u.role === role) &&
        (!st || status(u)[1] === st),
    );
  }, [data, q, role, st]);

  if (error || oErr) return <ErrorNote msg={(error || oErr)!} />;
  if (!data || !opts) return <Loading what="users" />;

  const act = async (label: string, path: string, body: unknown, done: string) => {
    try {
      await api.post(path, body);
      toast(label, done);
      invalidate();
    } catch (x) {
      toast("Could not save", (x as Error).message);
    }
  };

  const reset = async (u: AdminUser) => {
    try {
      const r = await api.post<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`);
      setModal({ kind: "temp", u, pw: r.temporaryPassword });
      invalidate();
    } catch (x) {
      toast("Could not reset", (x as Error).message);
      setModal(null);
    }
  };

  const week = Date.now() - 7 * 864e5;
  return (
    <div className="grid">
      <div className="s12 modhead">
        <div>
          <h2>Users &amp; access</h2>
          <p>Who can sign in, with which role and area. Changes apply at once, including to people already signed in.</p>
        </div>
        <div className="mh-acts">
          <button className="btn pri" onClick={() => setModal({ kind: "new" })}>
            + Add a user
          </button>
        </div>
      </div>
      <div className="s12 kpis">
        <Kpi l="Users" v={data.length} />
        <Kpi l="Active" v={data.filter((u) => u.active).length} />
        <Kpi l="Signed in this week" v={data.filter((u) => u.lastSignInAt && new Date(u.lastSignInAt).getTime() > week).length} />
        <Kpi l="Locked now" v={data.filter((u) => u.locked).length} />
        <Kpi l="Deactivated" v={data.filter((u) => !u.active).length} />
      </div>
      <div className="card s12">
        <div className="ch">
          <div>
            <h3>All logins</h3>
            <p>
              {rows.length} of {data.length} shown · a login locks for 15 minutes after 5 wrong passwords in a row
            </p>
          </div>
        </div>
        <div className="fbar mini" style={{ marginBottom: 10 }}>
          <div className="slicer" style={{ flex: "1 1 200px" }}>
            <label htmlFor="us-q">Search</label>
            <input id="us-q" className="nc-in" placeholder="Name, user ID or area" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="slicer">
            <label htmlFor="us-role">Role</label>
            <select id="us-role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {opts.roles.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div className="slicer">
            <label htmlFor="us-st">Status</label>
            <select id="us-st" value={st} onChange={(e) => setSt(e.target.value)}>
              <option value="">Any</option>
              {["Active", "Temporary password", "Locked", "Deactivated"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="tbw">
          <table className="tb">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Area</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const [tone, txt] = status(u);
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="us-who">
                        <span className="ski sm" style={{ background: u.color }}>
                          {u.icon}
                        </span>
                        <span>
                          <b>{u.displayName}</b>
                          {u.self && <span className="chip"> you</span>}
                          <small>{u.username}</small>
                        </span>
                      </div>
                    </td>
                    <td>{u.roleTitle}</td>
                    <td>{u.scope}</td>
                    <td>
                      <span className={`chip ${tone}`} title={u.locked && u.lockedUntil ? "Until " + when(u.lockedUntil) : undefined}>
                        {txt}
                      </span>
                    </td>
                    <td className="nw">{when(u.lastSignInAt)}</td>
                    <td className="r">
                      <div className="us-acts">
                        <button className="btn" onClick={() => setModal({ kind: "edit", u })}>
                          Edit
                        </button>
                        <button className="btn" onClick={() => setModal({ kind: "reset", u })}>
                          Reset password
                        </button>
                        {u.locked && u.active && (
                          <button className="btn" onClick={() => act("Unlocked", `/users/${u.id}/unlock`, {}, `${u.username} can sign in again.`)}>
                            Unlock
                          </button>
                        )}
                        {u.active ? (
                          <button className="btn" disabled={u.self} title={u.self ? "You cannot deactivate your own login" : undefined} onClick={() => setModal({ kind: "off", u })}>
                            Deactivate
                          </button>
                        ) : (
                          <button className="btn" onClick={() => act("Reactivated", `/users/${u.id}/active`, { active: true }, `${u.username} can sign in again.`)}>
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No users match these filters.</div>}
        </div>
      </div>
      {modal?.kind === "new" && <UserForm opts={opts} onClose={() => setModal(null)} />}
      {modal?.kind === "edit" && <UserForm opts={opts} u={modal.u} onClose={() => setModal(null)} />}
      {modal?.kind === "off" && (
        <Dialog title={`Deactivate ${modal.u.username}?`} sub="They are signed out at once and cannot sign in until reactivated. Their records and audit history stay." onClose={() => setModal(null)}>
          <div className="dlg-acts">
            <button className="btn" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="btn pri"
              onClick={() => {
                act("Deactivated", `/users/${modal.u.id}/active`, { active: false }, `${modal.u.username} can no longer sign in.`);
                setModal(null);
              }}
            >
              Deactivate
            </button>
          </div>
        </Dialog>
      )}
      {modal?.kind === "reset" && (
        <Dialog title={`Reset password for ${modal.u.username}?`} sub="Their current password stops working. You get a temporary password to pass on; they choose their own when they next sign in." onClose={() => setModal(null)}>
          <div className="dlg-acts">
            <button className="btn" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="btn pri" onClick={() => reset(modal.u)}>
              Reset password
            </button>
          </div>
        </Dialog>
      )}
      {modal?.kind === "temp" && <TempPassword u={modal.u} pw={modal.pw} onClose={() => setModal(null)} />}
    </div>
  );
}

function Kpi({ l, v }: { l: string; v: number }) {
  return (
    <div className="kpi">
      <span className="l">{l}</span>
      <div className="row">
        <span className="v num">{v}</span>
      </div>
    </div>
  );
}

function TempPassword({ u, pw, onClose }: { u: AdminUser; pw: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog title="Temporary password" sub={`For ${u.displayName} (${u.username}). It is shown only once.`} onClose={onClose}>
      <div className="us-temp">
        <code>{pw}</code>
        <button
          className="btn"
          onClick={() =>
            navigator.clipboard?.writeText(pw).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="note">Pass it on in person or by phone, not by email. They are asked to choose their own password after signing in.</p>
      <div className="dlg-acts">
        <button className="btn pri" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}

function UserForm({ opts, u, onClose }: { opts: UserOptions; u?: AdminUser; onClose: () => void }) {
  const { toast, invalidate } = useApp();
  const [username, setUsername] = useState(u?.username ?? "");
  const [displayName, setDisplayName] = useState(u?.displayName ?? "");
  const [role, setRole] = useState(u?.role ?? "DIO");
  const [district, setDistrict] = useState(u?.district ?? "");
  const [department, setDepartment] = useState(u?.department ?? "");
  const [vendorId, setVendorId] = useState(u?.vendorId ?? "");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const need = opts.roles.find((r) => r.role === role)?.scopeNeeded ?? null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username.trim().toLowerCase()))
      return setErr("User ID: 3 to 40 characters, lower-case letters, digits, dot, dash or underscore.");
    if (!displayName.trim()) return setErr("Enter a display name.");
    if (need === "district" && !district) return setErr("Choose the district.");
    if (need === "department" && !department) return setErr("Choose the department.");
    if (need === "vendor" && !vendorId) return setErr("Choose the vendor.");
    if (!u) {
      const p = passwordProblem(password, opts.minPassword);
      if (p) return setErr("Initial password: " + p);
    }
    const body = {
      username: username.trim().toLowerCase(),
      displayName: displayName.trim(),
      role,
      district: need === "district" ? district : null,
      department: need === "department" ? department : null,
      vendorId: need === "vendor" ? vendorId : null,
      password: u ? undefined : password,
    };
    setBusy(true);
    try {
      const r = await api.post<AdminUser>(u ? `/users/${u.id}` : "/users", body);
      toast(u ? "User updated" : "User added", `${r.username} · ${r.roleTitle} · ${r.scope}`);
      invalidate();
      onClose();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={u ? `Edit ${u.username}` : "Add a user"} sub={u ? "Role and area take effect on their next click." : "They choose their own password after the first sign-in."} onClose={onClose}>
      <form className="dlg-form" onSubmit={save} noValidate>
        <label>
          User ID
          <input className="nc-in" value={username} disabled={!!u} autoComplete="off" placeholder="e.g. dio.mandya" onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Display name
          <input className="nc-in" value={displayName} placeholder="e.g. DIO, Mandya" onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          Role
          <select className="nc-in" value={role} disabled={u?.self} onChange={(e) => setRole(e.target.value)}>
            {opts.roles.map((r) => (
              <option key={r.role} value={r.role}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        {u?.self && <p className="note">You cannot change your own role.</p>}
        {need === "district" && (
          <label>
            District
            <select className="nc-in" value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">Choose…</option>
              {opts.districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {need === "department" && (
          <label>
            Department
            <select className="nc-in" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Choose…</option>
              {opts.departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {need === "vendor" && (
          <label>
            Vendor
            {opts.vendors.length ? (
              <select className="nc-in" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Choose…</option>
                {opts.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            ) : (
              <input className="nc-in" value={vendorId} placeholder="e.g. PR-K02" onChange={(e) => setVendorId(e.target.value.toUpperCase())} />
            )}
          </label>
        )}
        {!need && <p className="note">Area: {opts.roles.find((r) => r.role === role)?.defaultScope}</p>}
        {!u && (
          <label>
            Initial password
            <input className="nc-in" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <small>At least {opts.minPassword} characters, with a digit.</small>
          </label>
        )}
        {err && (
          <p className="note bad" role="alert">
            {err}
          </p>
        )}
        <div className="dlg-acts">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" type="submit" disabled={busy}>
            {u ? "Save changes" : "Add user"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
