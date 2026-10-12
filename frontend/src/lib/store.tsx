// App-wide state: the signed-in user, reference data, current module and drill position, global slicers,
// toasts, and a small cache for API reads that mutations can invalidate.
"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Geo, Node } from "./geo";
import { Filters, Outreach } from "./outreach";
import type { AgentRun, Meta, User } from "./types";

export type Toast = { id: number; title: string; body: string };

export type AppState = {
  user: User;
  meta: Meta;
  geo: Geo;
  tab: string;
  setTab: (t: string) => void;
  node: Node;
  drillTo: (o: { lvl: Node["lvl"]; name?: string }) => void;
  drillUp: () => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  toast: (title: string, body: string) => void;
  canSee: (k: string) => boolean;
  allowedTabs: string[];
  version: number;
  invalidate: () => void;
  outreach: Outreach | null;
  agent: AgentRun | null;
  setAgent: (r: AgentRun | null) => void;
  goUpload: (dataset: string) => void;
  uploadTarget: string | null;
};

export const AppCtx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

const cache = new Map<string, { v: number; p: Promise<unknown> }>();

/** Cached GET. Re-fetches when the app's data version changes (after any write). */
export function useApi<T>(path: string | null): { data: T | undefined; error: string | null; loading: boolean } {
  const { version } = useApp();
  const [state, setState] = useState<{ data: T | undefined; error: string | null; key: string | null }>({ data: undefined, error: null, key: null });
  const key = path ? path + "@" + version : null;
  useEffect(() => {
    if (!path || !key) return;
    let alive = true;
    let e = cache.get(path);
    if (!e || e.v !== version) {
      e = { v: version, p: api.get<T>(path) };
      cache.set(path, e);
    }
    e.p.then(
      (d) => alive && setState({ data: d as T, error: null, key }),
      (err: Error) => {
        cache.delete(path);
        if (alive) setState({ data: undefined, error: err.message, key });
      },
    );
    return () => {
      alive = false;
    };
  }, [path, key, version]);
  const fresh = state.key === key;
  return { data: state.data, error: fresh ? state.error : null, loading: !fresh };
}

export function clearApiCache() {
  cache.clear();
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const toast = useCallback((title: string, body: string) => {
    const id = ++n.current;
    setToasts((t) => [...t, { id, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return { toasts, toast };
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="k" />
          <div>
            <b>{t.title}</b>
            {t.body}
          </div>
        </div>
      ))}
    </div>
  );
}

export async function loadMeta(): Promise<Meta> {
  return api.get<Meta>("/meta");
}
