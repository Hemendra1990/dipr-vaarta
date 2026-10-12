# Audit: Tipline, Press, Release-order audit, District offices (round 2)

Compared with the prototype (`VIEWS.tipline/press/ads/offices`) side by side in Playwright at 1440 px for
Commissioner, JD News, DD Accounts and DIO Raichur, at State, Division (Kalaburagi, Bengaluru, Belagavi), District
(Raichur, Belagavi) and Taluk (Sindhanur) level, plus 390 px and dark theme. View text was diffed line by line.

## What matched already
- Every KPI value and delta, sparkline, governance note, narratives bars, "Claims by …" table, releases table
  (reach bars, kits, pickup), accreditation pipeline, press performance table, ads KPIs, scatter (axes, average
  lines, red dots, tooltip `<title>`, click-to-drill), spend by medium, office profile bars and the DIO scorecard
  were identical to the prototype at every level tried, with the default and changed slicers.
- Vendor and nodal officer cannot open any of the four modules (no nav entry; the APIs answer 403).
- No horizontal page scroll at 390 px (wide tables scroll inside their card, as in the prototype). Dark theme fine.

## Differences found → what was done
| # | Area | Finding | Action |
|---|---|---|---|
| 1 | Tipline | Governance says claims not of public interest "are closed without action", but there was no way to close one. | New status **Closed**. "Not of public interest" link on New / Triaged / Draft ready claims; verdict set to "Not of public interest", who closed it is stored. Added a "Closed" filter chip; Closed claims are not counted in "Open in queue". |
| 2 | Tipline | Escalated claims stayed "With district admin" for ever. | "Mark handled" link closes them with verdict "Handled by district administration" (chip "Handled by district admin"). |
| 3 | Tipline | "+ Log a claim" sat inside the status filter as if it were a filter. | Separate button next to the filter. Empty state now carries the prototype's bot hint too. |
| 4 | Tipline | Server accepted any claim type, language, negative forwards, unlimited text. | Validated: type ∈ the six types, language ∈ reference languages, forwards 0–1 crore, text ≤ 1,000. |
| 5 | Tipline | Queue order: prototype lists the seed array order; app lists newest first. | Kept newest first (a live queue; bot claims arrive on top in both). Intentional. |
| 6 | Ads | "Send for review" only toggled to "Sent"; nobody could act on the review; who sent it was only a tooltip. | Row shows "Sent by <name> · <time>". The **Deputy Director (Accounts)** records the outcome: **Clear**, **Withhold payment** (reason required) or **Mark resolved**; a withheld order can later be released (cleared) or resolved. Outcome chip, decider, time and note persist and show to both roles. Re-sending an already-sent order is refused. |
| 7 | Ads | Restricted note said "Commissioner and Secretary only", but the module is the Commissioner's and DD Accounts'. | Now "Commissioner and Deputy Director (Accounts) only". |
| 8 | Offices | "Open tasks from HQ" was three hard-coded lines for every office. | Real tasks (`office_task`). Seeded with the prototype's three per district (due as-of + 3 d, + 5 d, and one a day late, so the first view matches the prototype). Commissioner adds tasks ("+ Add task", due date); the DIO (or Commissioner) marks them done; done ones fold under "Show n done". |
| 9 | Offices | "Open HQ tasks" KPI and scorecard column used a synthetic base figure unrelated to the list. | Both now count open tasks in the area (fall back to the base figure while loading). Deltas stay as in the prototype. |
| 10 | Offices | Citizen escalations could not be acted on. | "Resolve" on each escalation (optional note), shows "Resolved · who · when · note". DIO for own district, Commissioner anywhere. |
| 11 | Offices | No way to filter the ground feed. | Filter chips: All, Field pulse, Daily report, Escalation, Coverage, Open escalations (n). |
| 12 | Offices | Post-an-update accepted any sentiment and unlimited text. | Sentiment ∈ Positive/Mixed/Negative, note ≤ 1,000, scheme ≤ 60. |
| 13 | Press | Release rows opened the detail on click only. | Rows are focusable and open with Enter/Space. Everything else matched; no change. |

## Decisions (merge into SPEC §2 actions table)
| Action | Who |
|---|---|
| Tipline: close a claim as not of public interest; mark an escalated claim handled | whoever may triage it (Commissioner, JD News, DIO own district) |
| Release-order audit: record the review outcome (clear / withhold payment / resolved) | DD_ACCOUNTS only (the order was sent to them); a reason is required to withhold |
| District offices: assign an HQ task | COMMISSIONER |
| District offices: mark an HQ task done | DIO (own district), COMMISSIONER |
| District offices: resolve a citizen escalation | DIO (own district), COMMISSIONER |

- Withholding is recorded on the flag only; the sample flags' order numbers are not in the release-order table,
  so it does not block a payment in Spend. When real flags carry real RO numbers, Spend's "Mark paid" should refuse
  a withheld order (left for the Spend owner).
- Audit actions: `claim.Closed`, `adflag.cleared|withheld|resolved`, `feed.resolve`, `task.assign`, `task.done`.

## API (merge into SPEC §5)
- `POST /api/tipline/claims/{id}/transition` now also takes `{to: "Closed", note?}`.
- `POST /api/ads/flags/decide` `{ro, outcome: cleared|withheld|resolved, note?}`; flags now carry
  `sentAt, outcomeNote, decidedBy, decidedAt`.
- `POST /api/offices/feed/{id}/resolve` `{note?}`; feed items carry `resolvedBy, resolvedAt, resolution`.
- `GET /api/offices/tasks`, `POST /api/offices/tasks` `{district, title, due: YYYY-MM-DD}`, `POST /api/offices/tasks/{id}/done` `{note?}`.

## Tests
`OutreachAuditTest`: review → withhold (reason required) → resolve, 403 for Commissioner/JD/DIO deciding, re-send
refused; closing claims (both paths, locked afterwards, input validation); escalation resolve scoping and type
check; HQ task assign (Commissioner only, validation), DIO scope, done once.
