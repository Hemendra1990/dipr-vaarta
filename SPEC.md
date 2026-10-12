# Vaarta 360 (DIPR-Vaarta) — Specification

Source of truth: the HTML prototype `Vaarta360_Portal (1).html` (project files). This spec records what the
prototype does, who can do what, and the decisions taken while building the real application.
The user asked for no questions while they travel, so every open point below was decided here and is marked **Decision**.

## 1. Product

Vaarta 360 is the internal command portal of the Department of Information & Public Relations (DIPR),
Government of Karnataka. It joins WhatsApp outreach analytics, the fact-check tipline, press work,
advertisement spend, field publicity, culture/film records and administration into one console with a
State → Division → District → Taluk drill-down.

Geography: 4 revenue divisions, 31 districts, ~146 taluks (exact lists in `backend/src/main/resources/seed/reference.json`).

## 2. Users, roles and access

Seven sign-in roles, taken verbatim from the prototype (`PROLES`). Every user sees only the modules of
their role, and records are filtered to their scope **on the server**.

| Role key | Title | Demo user | Scope | Modules |
|---|---|---|---|---|
| `COMMISSIONER` | Commissioner, DIPR | `commr.dipr` | All of Karnataka, every wing | all 24 modules |
| `JD_NEWS` | Joint Director, News & Media | `jd.news` | Karnataka · news, media, outreach | overview, tipline, media, social, crisis, press, welfare, events, election, archive, ai, upload |
| `DD_ACCOUNTS` | Deputy Director, Accounts & Advertisement | `dd.accounts` | Karnataka · spend, empanelment, bills | spend, campaigns, empanel, bills, ads, outdoor, field, grants, admin, rti, ai, upload |
| `DIO` | District Information Officer | `dio.raichur` | Raichur district only | overview, tipline, offices, field, outdoor, events, media, crisis, welfare, campaigns, spend, rti, upload |
| `DEPT_NODAL` | Department Nodal Officer | `nodal.health` | Health & Family Welfare campaigns | spend, campaigns, bills, media |
| `VENDOR` | Empanelled Media / Vendor | `vendor.prk02` | Vendor PR-K02 · own orders and bills | spend ("My orders & payments"), bills, empanel |
| `FILM_SECTION` | Film & Academies Section | `film.section` | Film, academies, publications, archive | film, grants, publications, archive, upload |

Demo password for all seeded users: `demo@2026` (as in the prototype). Sign-in also needs the arithmetic
security check. **Decision:** the captcha is generated and checked by the server (single use, 5-minute expiry);
the prototype's note that production adds an OTP is left as a documented extension point.

### Scope rules (server-enforced)
- **District scope** (`DIO`): the user is pinned to their district; they cannot drill to state, division or another
  district (the API refuses, the UI shows "Outside your area"). District-tagged records are limited to their district;
  "Statewide" records are hidden. Registers marked *geo-all* in the prototype (campaigns, film, publications, grants)
  are not district-filtered, matching the prototype.
- **Department scope** (`DEPT_NODAL`): any record with a `department` field must equal their department
  (spend, budget, campaigns, bills, media clips).
- **Vendor scope** (`VENDOR`): any record with a `vendorId` must equal their vendor id; vendors cannot upload.
- **Outreach base data** for a district-scoped user only includes their district's taluks.
- Uploads: a user can upload only registers of modules they can see; DIO rows for other districts and nodal-officer
  rows for other departments are rejected row by row with a reason (as in the prototype).

### Actions and who may take them
| Action | Allowed roles | Notes |
|---|---|---|
| Tipline: triage, draft clarification, escalate, log a claim | COMMISSIONER, JD_NEWS, DIO (own district) | |
| Tipline: approve & publish a verdict | COMMISSIONER, JD_NEWS | **Decision:** "Every verdict needs a named human approver"; the approver's name is stored. |
| Release-order audit: send flag for review | COMMISSIONER, DD_ACCOUNTS | Sent to Deputy Director (Accounts); stored with who/when. |
| District offices: post a field pulse / daily report / escalation | DIO, COMMISSIONER | **Decision:** the prototype fed this from a WhatsApp bot; the app adds a small "Post an update" form so the feed is usable without the bot. |
| AI agents: run, approve, send back | roles with the `ai` module | Every run is stored with the approver. Approval side-effects match the prototype (new press release, claims moved to Triaged, notifications). |
| Data upload (validate, import append/replace, download template) | roles with the `upload` module, per register | Upload history is persisted. |

Every write is recorded in an audit log (`audit_event`).

## 3. Pages (modules)

Navigation groups and labels are exactly the prototype's `NAV`:

- **Command**: Command overview, AI agents
- **Outreach**: Tipline & claims, Media monitoring, Social media, Crisis advisories
- **Spend**: Spend analytics, Campaigns, Empanelment, Bills & payments, Release-order audit
- **Press & media**: Press & journalists, Journalist welfare, Events & coverage, Election period
- **Field**: District offices, Field & folk publicity, Outdoor displays
- **Culture & records**: Film sector, Publications, Photo & film archive, Academies & grants
- **Administration**: Offices & staff, RTI applications, Data upload

Shared shell: top bar (brand, signed-in chip, theme toggle, sign out), sidebar (select on mobile), breadcrumb with
drill-up, and on outreach modules (overview, tipline, press, offices, ai, ads) the global slicers
Period (7d/30d/quarter), Scheme, Language, Audience with "Clear filters".

| Module | Content (all as in the prototype) |
|---|---|
| Sign in | Split screen, role tiles, user ID/password, security check, theme toggle |
| Command overview | "Department at a glance" tiles (only for modules the role can see); 6 KPI tiles with sparklines and deltas; district **hex tile map** with metric switch (read rate, per 1,000, claims/lakh, uptake, clarification time) + legend + division chips (state/division level), taluk tiles (district level) or top citizen intents (taluk level); AI "What needs attention" insights with actions; read vs delivered line chart; engagement funnel; children table (sortable, drillable); read by scheme and subscribers by language bars |
| Tipline & claims | KPIs, governance note, live claim queue with status filter and next-step workflow buttons, narratives bars, claims-by-area table |
| Press & journalists | KPIs, releases in scope (reach bars), accreditation pipeline, press performance table |
| Release-order audit | Restricted note, KPIs, spend-vs-uptake scatter (drillable), spend by medium, flagged orders with "Send for review" |
| District offices | KPIs, ground feed, office profile (district/taluk), DIO scorecard table |
| AI agents | "Ask Vaarta 360" question box with suggestions; 7 agent cards (Press Release Composer, Claim Triage, Media Monitor, Campaign Planner, Ad Spend Auditor, Citizen Query Agent, Spend Forecaster); run log, output, approve / send back |
| Spend analytics | Filters (FY, campaign type, channel, department; locked for nodal officer), KPIs, stacked spend-over-time chart (year → quarter → month drill, budget line, run-rate outline), AI insights, budget vs spent by channel (bullet bars) and by department, spend by campaign (channel mix), spend by vendor (running share), same campaign type across years (like-for-like), by division/district. Vendor sees "My release orders and payments". |
| 16 registers | Campaigns, Empanelment, Bills, Media monitoring, Social media, Crisis advisories, Journalist welfare, Events, Election period, Field & folk, Outdoor, Film, Publications, Archive, Academies & grants, Offices & staff, RTI. Each: header with source chip / WhatsApp chip / Upload button, optional banner, KPIs, stage pipeline (filter), category bars (filter), by-area bars (drill), searchable sortable records table with "Show 30 more", AI note |
| Data upload | Pick register → 4-step wizard: check the format (Excel layout preview, column rules, template download, copy headings, acknowledgement) → choose file (.xlsx/.xls/.csv ≤10 MB) → review & fix (rows read/ready/problems, missing/extra columns, row-level errors, preview, append/replace) → import; upload history |

## 4. Architecture

```
frontend/  Next.js 15 (App Router, TypeScript)  ──►  /api/*  ──►  backend/  Spring Boot 3.5 (Java 21)
                                                                    H2 file DB (default) / PostgreSQL profile
```

- **Backend owns** users, authentication (BCrypt + JWT), role → module and scope enforcement, all data storage,
  workflows (claims, ad-flag review, field feed, agent runs), Excel/CSV parsing and validation (Apache POI),
  template generation, upload history and audit log.
- **Frontend owns** presentation and the analytics math. **Decision:** the dashboards' aggregation and chart code is
  ported line-for-line from the prototype into TypeScript so that every number, map, chart and filter matches the
  prototype exactly. The backend only ever sends rows the user is allowed to see, so moving the math to the client
  does not widen access. Data volumes are small (≈5.8k release orders, ≤540 rows per register).
- **Sample data:** **Decision:** generated by running the prototype's own data generators in Node
  (`tools/dump-seed.js`) and loading the JSON into the database on first start, so sample data is identical to the
  prototype. Uploading files replaces/extends it like real data.
- **As-of date:** the sample data is anchored to 7 Oct 2026 and FY 2026-27 data covers April–September, as in the
  prototype. `vaarta.as-of-date` (default `2026-10-07`) drives "days pending", run-rate and FY maths; set it to
  `today` for live data.
- **AI:** **Decision:** agents and "Ask" are deterministic and computed from the same data, as in the prototype
  (no external LLM is called). Each agent stops for a named officer's approval. The agent service is the place to
  plug in an LLM later.

## 5. API (all JSON, `Authorization: Bearer <jwt>` except auth)

| Method & path | Purpose |
|---|---|
| `GET /api/auth/roles` | Sign-in tiles (role, title, scope, demo user id) |
| `POST /api/auth/captcha` | New security question `{id, question}` |
| `POST /api/auth/login` | `{username,password,captchaId,captchaAnswer}` → `{token,user}` |
| `GET /api/auth/me` | Current user, role, scope, modules |
| `GET /api/meta` | Geography, enums, as-of info, register definitions visible to the user |
| `GET /api/outreach/base` | Taluk-level outreach base metrics (scoped) |
| `GET /api/tipline/claims`, `POST /api/tipline/claims`, `POST /api/tipline/claims/{id}/transition` | Claim queue and workflow |
| `GET /api/press/releases` | Press releases |
| `GET /api/ads/flags`, `POST /api/ads/flags/review` (`{ro}`) | Audit flags |
| `GET /api/offices/feed`, `POST /api/offices/feed` | Ground feed |
| `GET /api/spend/orders`, `GET /api/spend/budget`, `GET /api/spend/vendors` | Spend data (scoped) |
| `GET /api/registers/{id}/rows` | Register records (scoped) |
| `GET /api/uploads/datasets` | Uploadable datasets with schema, counts, samples |
| `GET /api/uploads/{dataset}/template` | Excel template (Data, Allowed values, Instructions sheets) |
| `POST /api/uploads/{dataset}/validate` | Multipart file → validation report + `uploadId` |
| `POST /api/uploads/{uploadId}/import` | `{mode: append|replace}` |
| `GET /api/uploads/history` | Upload history |
| `GET /api/agents/runs`, `POST /api/agents/{agent}/runs`, `POST /api/agents/runs/{id}/approve`, `.../reject` | Agent runs |

## 6. Running

See `README.md`. Backend on :8080, frontend on :3000 (proxies `/api` to the backend).
