"use client";
import { useEffect, useState } from "react";
import { api, setUnauthorizedHandler, token } from "@/lib/api";
import { clearApiCache, loadMeta } from "@/lib/store";
import type { Meta, User } from "@/lib/types";
import { Login } from "@/components/Login";
import { Console } from "@/components/Console";

export default function Home() {
  const [session, setSession] = useState<{ user: User; meta: Meta; fresh: boolean } | null>(null);
  const [ready, setReady] = useState(false);

  const signOut = () => {
    token.clear();
    clearApiCache();
    setSession(null);
    history.replaceState(null, "", location.pathname);
    window.scrollTo(0, 0);
  };

  const enter = async (user: User, fresh = false) => {
    const meta = await loadMeta();
    clearApiCache();
    setSession({ user, meta, fresh });
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    if (!token.get()) {
      setReady(true);
      return;
    }
    api
      .get<User>("/auth/me")
      .then((u) => enter(u))
      .catch(() => token.clear())
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (!session) return <Login onSignedIn={(u) => enter(u, true)} />;
  return <Console key={session.user.username} user={session.user} meta={session.meta} fresh={session.fresh} onSignOut={signOut} />;
}
