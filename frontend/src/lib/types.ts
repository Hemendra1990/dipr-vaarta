export type FieldDef = { k: string; h: string; t: string; req: boolean; e?: string[]; sw?: boolean; ex?: string };

export type RegisterDef = {
  id: string; group: string; title: string; sub: string; schema: FieldDef[]; status: string; order: string[];
  dim: string; dimLabel: string; sum: string | null; cols: string[]; geoAll: boolean; wa: string | null; banner: string | null;
};

export type Reference = {
  divisions: Record<string, string[]>;
  population: Record<string, number>;
  codes: Record<string, string>;
  hex: Record<string, [number, number]>;
  taluks: Record<string, string[]>;
  schemes: Record<string, number>;
  languages: string[];
  channels: string[];
  departments: string[];
  campaignTypes: string[];
  schemesList: string[];
};

export type CalendarInfo = { asOf: string; curFy: string; lastYm: string; elapsed: number; fys: string[] };

export type Meta = {
  reference: Reference;
  calendar: CalendarInfo;
  registers: RegisterDef[];
  sources: Record<string, { file: string; when: string }>;
};

export type User = {
  username: string; displayName: string; role: string; roleKey: string; title: string; titleKn: string; scope: string;
  district: string | null; department: string | null; vendorId: string | null; modules: string[]; icon: string; color: string;
};

export type Row = Record<string, string | number> & { _days?: number; _left?: number | "" };

export type SpendRow = {
  roNo: string; fy: string; month: string; quarter: string; campaignId: string; campaign: string; ctype: string;
  department: string; channel: string; vendorId: string; vendor: string; district: string; amount: number; status: string;
};

export type BudgetRow = { fy: string; department: string; channel: string; budget: number };

export type VendorInfo = { id: string; kind: string; channel: string; district: string; language: string; name: string };

export type Claim = {
  id: string; text: string; lang: string; district: string; category: string; status: string; verdict: string;
  receivedAt: string; forwards: number; source: string; approvedBy: string | null;
};

export type Release = { id: string; title: string; dept: string; district: string; hoursAfterEvent: number; reach: number; kits: number; pickup: number };

export type FeedItem = { id: number; type: string; district: string; scheme: string | null; sentiment: string | null; note: string; author: string; createdAt: string };

export type AdFlag = { ro: string; publication: string; issue: string; amount: number; district: string; severity: string; reviewStatus: string; sentBy: string | null };

export type AgentInfo = { id: string; name: string; does: string; guard: string };

export type AgentRun = {
  id: number; agentId: string; name: string; target: string | null; status: string; steps: string[]; output: string;
  approveLabel: string; startedBy: string; decidedBy: string | null; toast?: { title: string; body: string };
};

/** Press office: a release with its draft/issue trail (GET /api/press/releases). */
export type PressRelease = Release & {
  status: "Draft" | "Issued"; issuedAt: string | null; language: string | null; body: string | null;
  draftedBy: string | null; draftedAt: string | null; approvedBy: string | null;
};
// --- Tipline and live updates (WhatsApp bot) ---
export type ClaimInfo = Claim & { clarification?: string | null; matchOf?: string | null; contact?: string | null; updatedAt?: string };
export type FeedEntry = FeedItem & { channel?: string | null };
export type ClaimHistory = { at: string; who: string; action: string; detail: string };
export type ClaimDetail = { claim: ClaimInfo; history: ClaimHistory[]; related: ClaimInfo[]; canEdit: boolean; canPublish: boolean };
export type LiveUpdates = { now: string; claims: ClaimInfo[]; feed: FeedEntry[] };
// ---- Users & access, audit log (admin feature) ----
export type AdminUser = {
  id: number; username: string; displayName: string; role: string; roleTitle: string; icon: string; color: string; scope: string;
  district: string | null; department: string | null; vendorId: string | null; active: boolean; locked: boolean;
  lockedUntil: string | null; lastSignInAt: string | null; createdAt: string | null; mustChangePassword: boolean; self: boolean;
};
export type UserOptions = {
  roles: { role: string; title: string; scopeNeeded: "district" | "department" | "vendor" | null; defaultScope: string }[];
  districts: string[]; departments: string[]; vendors: { id: string; name: string }[]; minPassword: number;
};
export type AuditRow = { id: number; username: string; action: string; detail: string | null; at: string };
export type AuditPage = { items: AuditRow[]; total: number; page: number; size: number; pages: number };
export type AuditFacets = { users: string[]; actions: string[]; groups: string[] };

// Outreach audit (round 2): ad-flag review outcome, escalation resolution, HQ tasks
export type AdFlagReview = AdFlag & { sentAt?: string | null; outcomeNote?: string | null; decidedBy?: string | null; decidedAt?: string | null };
export type FeedResolvable = FeedEntry & { resolvedBy?: string | null; resolvedAt?: string | null; resolution?: string | null };
export type OfficeTask = {
  id: number; district: string; title: string; due: string; status: "Open" | "Done"; assignedBy: string; assignedAt: string;
  doneBy: string | null; doneAt: string | null; doneNote: string | null;
// --- AI agents (command area) ---
/** An agent card for the signed-in user (GET /api/agents). */
export type AgentCard = AgentInfo & { canRun: boolean; canApprove: boolean; note: string | null };
/** A stored agent run with its decision and what approving it changed (GET /api/agents/runs, /inbox). */
export type AgentRunFull = AgentRun & {
  startedAt: string; decidedAt: string | null; comment: string | null; area: string | null; sentTo: string | null; effect: string | null;
};
