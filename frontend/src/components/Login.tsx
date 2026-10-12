"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, token } from "@/lib/api";
import type { User } from "@/lib/types";
import { ChangePassword } from "./PasswordDialog";
import { ThemeButton } from "./Theme";

type Tile = { role: string; key: string; title: string; titleKn: string; scope: string; user: string; icon: string; color: string };

const DISTRICTS_RING = 31;

function Ring() {
  const lines = [];
  for (let i = 0; i < DISTRICTS_RING; i++) {
    const a = -Math.PI / 2 + (i / DISTRICTS_RING) * Math.PI * 2,
      r1 = 84,
      r2 = i % 5 === 0 ? 97 : 92;
    lines.push(<line key={i} x1={100 + r1 * Math.cos(a)} y1={100 + r1 * Math.sin(a)} x2={100 + r2 * Math.cos(a)} y2={100 + r2 * Math.sin(a)} />);
  }
  return (
    <svg className="ring" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="78" fill="none" className="rc" />
      <g className="rt">{lines}</g>
    </svg>
  );
}

export function Login({ onSignedIn, notice }: { onSignedIn: (u: User) => void; notice?: string | null }) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [demoPw, setDemoPw] = useState("");
  const [role, setRole] = useState("COMMISSIONER");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [cap, setCap] = useState<{ id: string; question: string } | null>(null);
  const [ans, setAns] = useState("");
  const [err, setErr] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);
  // Signed in with a password the Commissioner's office issued: ask for a new one before entering.
  const [pending, setPending] = useState<User | null>(null);

  const newCap = () => {
    setAns("");
    api.post<{ id: string; question: string }>("/auth/captcha").then(setCap, () => setErr("The server is not reachable. Try again shortly."));
  };

  useEffect(() => {
    api.get<{ roles: Tile[]; demoPassword: string }>("/auth/roles").then(
      (r) => {
        setTiles(r.roles);
        setDemoPw(r.demoPassword);
        const first = r.roles[0];
        if (first) {
          setUser(first.user);
          setPass(r.demoPassword);
        }
      },
      () => setErr("The server is not reachable. Try again shortly."),
    );
    newCap();
  }, []);

  // A notice that arrives while this screen is open (e.g. the console could not load after sign-in): show it and
  // ask a fresh question, because the last one was used up.
  const seen = useRef(notice);
  useEffect(() => {
    if (notice && notice !== seen.current) {
      setErr(notice);
      newCap();
    }
    seen.current = notice;
  }, [notice]);

  const pick = (t: Tile) => {
    setRole(t.role);
    setUser(t.user);
    setPass(demoPw);
    setErr(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !pass) {
      setErr("Enter your user ID and password.");
      return;
    }
    if (!cap) {
      setErr("The security question has not loaded yet. Press ↻ for a new one.");
      newCap();
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ token: string; user: User; mustChangePassword?: boolean }>("/auth/login", {
        username: user.trim(),
        password: pass,
        captchaId: cap.id,
        captchaAnswer: ans,
      });
      token.set(r.token);
      if (r.mustChangePassword) setPending(r.user);
      else onSignedIn(r.user);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Sign-in failed.");
      newCap();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="login" aria-label="Sign in">
      <div className="lg-art">
        <div className="bands" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="lg-top">
          <span>Government of Karnataka</span>
          <span className="kn">ಕರ್ನಾಟಕ ಸರ್ಕಾರ</span>
        </div>
        <div className="lg-mark">
          <Ring />
          <h1>
            <span className="kn">ವಾರ್ತಾ</span>
            <em>೩೬೦</em>
          </h1>
          <p className="lg-latin">Vaarta 360</p>
          <p className="lg-dept">
            Department of Information &amp; Public Relations
            <br />
            <span className="kn">ವಾರ್ತಾ ಮತ್ತು ಸಾರ್ವಜನಿಕ ಸಂಪರ್ಕ ಇಲಾಖೆ</span>
          </p>
        </div>
        <ul className="lg-facts">
          <li>
            <b>31</b>districts, one tick each
          </li>
          <li>
            <b>5</b>languages
          </li>
          <li>
            <b>24</b>functions in one view
          </li>
        </ul>
      </div>
      <div className="lg-panel">
        <div className="lg-tools">
          <ThemeButton />
        </div>
        <form className="lg-form" autoComplete="off" noValidate onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="lg-sub">Choose who you are. Each login sees only its own area and wing.</p>
          <fieldset className="stk">
            <legend>Sign in as</legend>
            {tiles.map((t) => (
              <label key={t.role} className={`sk ${t.role === role ? "on" : ""}`} title={t.titleKn ? `${t.title} · ${t.titleKn}` : undefined}>
                <input type="radio" name="stk" value={t.role} checked={t.role === role} onChange={() => pick(t)} />
                <span className="ski" style={{ background: t.color }}>
                  {t.icon}
                </span>
                <span className="skt">
                  <b>{t.title}</b>
                  <small>{t.scope}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="lg-fields">
            <div>
              <label htmlFor="lg-user">User ID</label>
              <input id="lg-user" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div>
              <label htmlFor="lg-pass">Password</label>
              <input id="lg-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="lg-cap">Security check</label>
            <div className="caprow">
              <span className="capbox" aria-live="polite">
                {cap?.question ?? "…"}
              </span>
              <span className="eq">=</span>
              <input id="lg-cap" inputMode="numeric" placeholder="Answer" autoComplete="off" value={ans} onChange={(e) => setAns(e.target.value)} />
              <button type="button" className="iconbtn" aria-label="New question" onClick={newCap}>
                ↻
              </button>
            </div>
          </div>
          {err && (
            <p className="lg-err" role="alert">
              {err}
            </p>
          )}
          <button className="btn pri big" type="submit" disabled={busy}>
            Sign in
          </button>
          <p className="lg-fine">
            Sample data for demonstration. User ID and password are filled in for the demo logins; answer the security check to continue. In production,
            sign-in adds an OTP to the officer’s registered mobile.
          </p>
        </form>
      </div>
      {pending && <ChangePassword forced current={pass} onClose={() => onSignedIn(pending)} onDone={() => onSignedIn(pending)} />}
    </section>
  );
}
