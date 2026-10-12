"use client";
import { useEffect, useState } from "react";
import { api, ApiError, setUnauthorizedHandler, token } from "@/lib/api";
import { clearApiCache, loadMeta } from "@/lib/store";
import type { Meta, User } from "@/lib/types";
import { Login } from "@/components/Login";
import { Console } from "@/components/Console";

export default function Home() {
  const [session, setSession] = useState<{ user: User; meta: Meta; fresh: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  // Why the sign-in screen is showing again (expired or revoked session), shown above the form.
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = () => {
    token.clear();
    setNotice(null);
    clearApiCache();
    setSession(null);
    history.replaceState(null, "", location.pathname);
    window.scrollTo(0, 0);
  };

  const enter = async (user: User, fresh = false) => {
    let meta: Meta;
    try {
      meta = await loadMeta();
    } catch (e) {
      token.clear();
      setSession(null);
      setNotice(e instanceof ApiError && e.status === 401 ? "Your session has ended. Sign in again to continue." : "The server is not reachable. Try again shortly.");
      return;
    }
    clearApiCache();
    setNotice(null);
    setSession({ user, meta, fresh });
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    // Any 401 on a signed-in request (token expired, login deactivated) ends the session.
    setUnauthorizedHandler(() => {
      clearApiCache();
      setSession((s) => {
        if (s) setNotice("Your session has ended. Sign in again to continue.");
        return null;
      });
    });
    if (!token.get()) {
      setReady(true);
      return;
    }
    api
      .get<User>("/auth/me")
      .then((u) => enter(u))
      .catch((e) => {
        token.clear();
        if (e instanceof ApiError && e.status === 401) setNotice("Your session has ended. Sign in again to continue.");
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (!session) return <Login notice={notice} onSignedIn={(u) => enter(u, true)} />;
  return <Console key={session.user.username} user={session.user} meta={session.meta} fresh={session.fresh} onSignOut={signOut} />;
}
