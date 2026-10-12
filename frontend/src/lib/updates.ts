// Live updates from the WhatsApp bot: polls /api/updates every 15 s, raises the prototype's toasts, keeps unseen
// counters for the Tipline and District offices nav items, and remembers which rows just arrived so views can flash them.
"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ClaimInfo, FeedEntry, LiveUpdates, User } from "./types";

export const POLL_MS = 15_000;
const FRESH_MS = 2_500;
/** Ask for a little overlap with the previous poll so an item saved while the last poll ran is not missed. */
const OVERLAP_MS = 10_000;

const fresh = new Map<string, number>();
const markFresh = (key: string) => fresh.set(key, Date.now() + FRESH_MS);
/** True for a claim or feed row that arrived through live updates in the last few seconds. */
export const isFresh = (kind: "claim" | "feed", id: string | number) => (fresh.get(kind + ":" + id) ?? 0) > Date.now();

export const feedTitle = (t: string) =>
  t === "pulse" ? "Field pulse received" : t === "esc" ? "Citizen escalation" : t === "report" ? "Daily report filed" : "Coverage uploaded";

const clip = (s: string) => (s.length > 80 ? s.slice(0, 80) + "…" : s);

export type Unseen = { tipline: number; offices: number };

export function useLiveUpdates(opts: { user: User; tab: string; toast: (title: string, body: string) => void; invalidate: () => void }): Unseen {
  const { user, tab } = opts;
  const watch = user.modules.includes("tipline") || user.modules.includes("offices");
  const [unseen, setUnseen] = useState<Unseen>({ tipline: 0, offices: 0 });
  const live = useRef(opts);
  live.current = opts;

  // opening a module clears its counter
  useEffect(() => {
    if (tab === "tipline" || tab === "offices") setUnseen((u) => (u[tab] ? { ...u, [tab]: 0 } : u));
  }, [tab]);

  useEffect(() => {
    if (!watch) return;
    let since: string | null = null;
    let floor = 0; // nothing older than the first poll is news
    let busy = false;
    let stopped = false;
    const seen = new Set<string>();

    const apply = (claims: ClaimInfo[], feed: FeedEntry[]) => {
      const { toast, invalidate, tab: cur } = live.current;
      const nc = claims.filter((c) => !seen.has("claim:" + c.id));
      const nf = feed.filter((f) => !seen.has("feed:" + f.id));
      if (!nc.length && !nf.length) return;
      const notes: [string, string][] = [];
      nc.forEach((c) => {
        seen.add("claim:" + c.id);
        markFresh("claim:" + c.id);
        notes.push(["New tipline claim", `${c.id} from ${c.district} · ${c.status === "Published" ? "matched an existing clarification" : "queued for triage"}`]);
      });
      nf.forEach((f) => {
        seen.add("feed:" + f.id);
        markFresh("feed:" + f.id);
        notes.push([feedTitle(f.type), `${f.district}: ${clip(f.note)}`]);
      });
      setUnseen((u) => ({
        tipline: u.tipline + (cur === "tipline" ? 0 : nc.length),
        offices: u.offices + (cur === "offices" ? 0 : nf.length),
      }));
      notes.slice(0, 3).forEach(([t, b]) => toast(t, b));
      if (notes.length > 3) toast(`${notes.length - 3} more updates`, "Open Tipline & claims or District offices to see them.");
      invalidate();
    };

    const poll = async () => {
      if (busy || stopped || (typeof document !== "undefined" && document.hidden && since)) return;
      busy = true;
      try {
        const q = since ? "?since=" + encodeURIComponent(new Date(Math.max(floor, Date.parse(since) - OVERLAP_MS)).toISOString()) : "";
        const r = await api.get<LiveUpdates>("/updates" + q);
        if (stopped) return;
        if (since) apply(r.claims, r.feed);
        else floor = Date.parse(r.now);
        since = r.now;
      } catch {
        /* offline or signed out: try again on the next tick */
      } finally {
        busy = false;
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVis = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [watch]);

  return unseen;
}
