"use client";
import React from "react";
import { dShow, inr, lakh, nIN, toneOf } from "@/lib/format";
import type { FieldDef } from "@/lib/types";

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Loading({ what = "data" }: { what?: string }) {
  return <div className="empty">Loading {what}…</div>;
}

export function ErrorNote({ msg }: { msg: string }) {
  return <div className="note bad">{msg}</div>;
}

export const XCOL: Record<string, { h: string; t: string }> = { _days: { h: "Days pending", t: "num" }, _left: { h: "Days left", t: "num" } };

export function colDef(schema: FieldDef[], k: string): FieldDef {
  return schema.find((f) => f.k === k) || (XCOL[k] ? ({ k, req: false, ...XCOL[k] } as FieldDef) : { k, h: k, t: "text", req: false });
}

/** A cell rendered by field type, as the prototype's fmtCell. */
export function FmtCell({ f, v, statusKey }: { f?: FieldDef; v: unknown; statusKey?: string }) {
  if (v === "" || v == null) return <span className="mut">—</span>;
  if (!f) return <>{typeof v === "number" ? nIN(v) : String(v)}</>;
  if (statusKey && f.k === statusKey) return <span className={`chip ${toneOf(v)}`}>{String(v)}</span>;
  switch (f.t) {
    case "money":
      return <>{lakh(v as number)}</>;
    case "inr":
      return <>{inr(v as number)}</>;
    case "num":
      return <>{nIN(v as number)}</>;
    case "date":
    case "month":
      return <span className="nw">{dShow(String(v))}</span>;
    case "yn":
      return <span className={`chip ${v === "Yes" ? "good" : ""}`}>{String(v)}</span>;
    default:
      return <>{String(v)}</>;
  }
}

export const isNumT = (t: string) => ["num", "money", "inr"].includes(t);
