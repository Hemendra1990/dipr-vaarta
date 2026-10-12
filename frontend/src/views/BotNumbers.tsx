"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi, useApp } from "@/lib/store";
import { Loading } from "./common";

type Contact = { phone: string; district: string; name: string | null; username: string | null; active: boolean };

/** "919000010027" → "+91 90000 10027" (stored numbers are digits only). */
const showPhone = (p: string) => (/^91\d{10}$/.test(p) ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : /^\d+$/.test(p) ? "+" + p : p);

/** Registered WhatsApp numbers: field reports from the bot are accepted only from these, for their district. */
export function BotNumbers() {
  const { geo, toast, invalidate } = useApp();
  const { data, error } = useApi<Contact[]>("/bot/contacts");
  const [f, setF] = useState({ phone: "", district: "", name: "", username: "" });
  const [err, setErr] = useState<string | null>(null);

  const save = async (c: Partial<Contact> & { phone: string; district: string }, done: string) => {
    setErr(null);
    try {
      await api.post("/bot/contacts", c);
      toast("WhatsApp number saved", done);
      invalidate();
      return true;
    } catch (x) {
      setErr((x as Error).message);
      return false;
    }
  };

  return (
    <div className="card s12">
      <div className="ch">
        <div>
          <h3>WhatsApp numbers</h3>
          <p>Field pulses, daily reports and escalations from the bot are accepted only from these numbers, and always for the number&apos;s district.</p>
        </div>
        <span className="chip wa">WhatsApp feed</span>
      </div>
      <form
        className="botnum-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save({ ...f, active: true }, `${f.phone} can now report for ${f.district}.`)) setF({ phone: "", district: "", name: "", username: "" });
        }}
      >
        <input aria-label="Phone number" placeholder="+91 9xxxx xxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        <select aria-label="District" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} required>
          <option value="">District…</option>
          {geo.ALL_D.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <input aria-label="Officer name" placeholder="Officer name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input aria-label="Linked user ID" placeholder="User ID (optional)" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <button className="btn pri" type="submit">
          Add number
        </button>
      </form>
      {err && <div className="note bad">{err}</div>}
      {error ? (
        <div className="note bad">{error}</div>
      ) : !data ? (
        <Loading what="numbers" />
      ) : (
        <div className="tbw">
          <table className="tb tight">
            <thead>
              <tr>
                <th>Number</th>
                <th>District</th>
                <th>Officer</th>
                <th>User ID</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.phone}>
                  <td className="num nw">{showPhone(c.phone)}</td>
                  <td>{c.district}</td>
                  <td>{c.name || "—"}</td>
                  <td>{c.username || "—"}</td>
                  <td>{c.active ? <span className="chip good">Active</span> : <span className="chip">Off</span>}</td>
                  <td className="r">
                    <button
                      className="btn"
                      aria-label={`${c.active ? "Turn off" : "Turn on"} ${showPhone(c.phone)}`}
                      onClick={() =>
                        save(
                          { phone: c.phone, district: c.district, name: c.name ?? "", username: c.username ?? "", active: !c.active },
                          c.active ? `${showPhone(c.phone)} no longer reports.` : `${showPhone(c.phone)} can report again.`,
                        )
                      }
                    >
                      {c.active ? "Turn off" : "Turn on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
