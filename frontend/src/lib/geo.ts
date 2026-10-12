// Geography and the State → Division → District → Taluk drill nodes.
import type { Reference } from "./types";

export type Lvl = "state" | "div" | "dist" | "tlk";
export type Node = { lvl: Lvl; name: string; div?: string; dist?: string };

export const LVL: Record<Lvl, string> = { state: "State", div: "Division", dist: "District", tlk: "Taluk" };
export const CHILD_LVL: Record<Lvl, string> = { state: "divisions", div: "districts", dist: "taluks", tlk: "" };

export class Geo {
  DIVS: Record<string, string[]>;
  DIV_OF: Record<string, string> = {};
  ALL_D: string[];
  TALUKS: Record<string, string[]>;
  CODE: Record<string, string>;
  HEX: Record<string, [number, number]>;
  POP: Record<string, number>;

  constructor(ref: Reference) {
    this.DIVS = ref.divisions;
    for (const [v, ds] of Object.entries(ref.divisions)) ds.forEach((d) => (this.DIV_OF[d] = v));
    this.ALL_D = Object.values(ref.divisions).flat();
    this.TALUKS = ref.taluks;
    this.CODE = ref.codes;
    this.HEX = ref.hex;
    this.POP = ref.population;
  }

  distNode = (d: string): Node => ({ lvl: "dist", name: d, div: this.DIV_OF[d], dist: d });

  /** Prototype geoOk: does a record's district fall inside node n (statewide records only at state level)? */
  geoOk(r: Record<string, unknown>, n: Node): boolean {
    const d = r.district as string | undefined;
    if (n.lvl === "state") return true;
    if (!d || d === "Statewide") return false;
    if (n.lvl === "div") return this.DIV_OF[d] === n.div;
    if (d !== n.dist) return false;
    if (n.lvl === "tlk" && r.taluk) return r.taluk === n.name;
    return true;
  }

  /**
   * Prototype inNode: records tagged "State" or no district count only at state level. With a taluk (round-3 data
   * contract) a record shows at its own taluk only; a district record without a taluk shows at every taluk of it.
   */
  inNode(dist: string | undefined, n: Node, taluk?: string | null): boolean {
    if (!dist || dist === "State" || dist === "Statewide") return n.lvl === "state";
    if (n.lvl === "state") return true;
    if (n.lvl === "div") return this.DIV_OF[dist] === n.div;
    if (dist !== n.dist) return false;
    if (n.lvl === "tlk" && taluk) return taluk === n.name;
    return true;
  }

  /** Statewide records show at every level (press releases); district records follow inNode. */
  inScope(dist: string, n: Node, taluk?: string | null) {
    return dist === "State" || dist === "Statewide" || this.inNode(dist, n, taluk);
  }
}

/** The taluk a row is tagged with, if any (rows from /tipline, /press, /ads and /offices carry `taluk`). */
export const talukOf = (r: object): string | null => ((r as { taluk?: string | null }).taluk ?? null) || null;

/** "District · Taluk" for a row's place column. */
export const placeOf = (dist: string, r: object): string => {
  const t = talukOf(r);
  return t ? `${dist} · ${t}` : dist;
};

export const label = (n: Node) => (n.lvl === "div" ? n.name + " Division" : n.name);
export const nodeKey = (n: Node) => [n.lvl, n.div || "", n.dist || "", n.name].join("/");

/** Full geographic children of a node (registers drill over all places, not only places with outreach data). */
export function geoChildren(g: Geo, n: Node): Node[] {
  if (n.lvl === "state") return Object.keys(g.DIVS).map((v) => ({ lvl: "div", name: v, div: v }));
  if (n.lvl === "div") return g.DIVS[n.div!].map((d) => ({ lvl: "dist", name: d, div: n.div, dist: d }));
  if (n.lvl === "dist") return g.TALUKS[n.dist!].map((t) => ({ lvl: "tlk", name: t, div: n.div, dist: n.dist }));
  return [];
}
