"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

/** Password rule shared by the change-password and new-user forms: at least 8 characters with a digit. */
export function passwordProblem(pw: string, min = 8): string | null {
  if (pw.length < min) return `Use at least ${min} characters.`;
  if (!/\d/.test(pw)) return "Include at least one digit.";
  return null;
}

/**
 * Small modal shell used by the admin screens. Closes on Escape or a click outside. Focus moves into the dialog once
 * when it opens, Tab stays inside it, and focus returns to the button that opened it on close.
 */
export function Dialog({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [...(box.current?.querySelectorAll<HTMLElement>("input,select,textarea,button,[href],[tabindex]:not([tabindex='-1'])") ?? [])].filter(
        (el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null,
      );
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      else if (e.key === "Tab") {
        const els = focusable();
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", k);
    // first field, else the first button after the close button
    const els = focusable();
    (els.find((el) => el.matches("input,select,textarea")) ?? els[1] ?? els[0])?.focus();
    return () => {
      window.removeEventListener("keydown", k);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  return (
    <div className="dlg-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <div className="ch">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Change your own password. `forced` is used right after signing in with a password the Commissioner's office issued:
 * the current password is already known, so it is passed in and not asked again.
 */
export function ChangePassword({ onClose, onDone, forced, current }: { onClose: () => void; onDone: () => void; forced?: boolean; current?: string }) {
  const [cur, setCur] = useState(current ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = passwordProblem(pw);
    if (!cur) return setErr("Enter your current password.");
    if (p) return setErr(p);
    if (pw !== pw2) return setErr("The two new passwords do not match.");
    setBusy(true);
    try {
      await api.post("/auth/password", { currentPassword: cur, newPassword: pw });
      onDone();
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={forced ? "Choose your own password" : "Change password"}
      sub={forced ? "You signed in with a temporary password. Set a new one to continue." : "At least 8 characters, with a digit."}
      onClose={onClose}
    >
      <form className="dlg-form" onSubmit={save} noValidate>
        {!forced && (
          <label>
            Current password
            <input className="nc-in" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </label>
        )}
        <label>
          New password
          <input className="nc-in" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label>
          New password again
          <input className="nc-in" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {err && (
          <p className="note bad" role="alert">
            {err}
          </p>
        )}
        <div className="dlg-acts">
          <button type="button" className="btn" onClick={onClose}>
            {forced ? "Later" : "Cancel"}
          </button>
          <button className="btn pri" type="submit" disabled={busy}>
            Change password
          </button>
        </div>
      </form>
    </Dialog>
  );
}
