# Audit: the 16 generic registers (round 2)

Method: the prototype and the app were run side by side in Playwright (1440px) and every register was compared field by
field: header chips (text, class, WhatsApp tooltip), banner, the five KPIs (label, value, sub-text, tone), stage pipeline
bars (value, width, colour), category bars, by-area bars, record count line, statewide note, table headings, first rows
with chips (days pending / days left), "Show 30 more", empty text and AI note.
- Roles and levels: Commissioner at State, Kalaburagi Division, Raichur District and a Raichur taluk (all 17 modules);
  JD, DD, nodal officer, vendor and film section at State/Division/District; DIO at District and taluk.
- Interactions (Commissioner, DIO, nodal officer, every register): stage filter, stage + category filter, "Clear filters ×",
  category toggle on/off, search, every column sorted both ways, "Show 30 more", empty search, switching registers.
- Also checked: 390px width (no horizontal page scroll, edit panel full width), dark theme (table, bars, edit panel),
  "Uploaded · <file>" chip after an Excel export was uploaded back (replace mode, KPIs unchanged).

## Findings and what was done
| # | Finding | Action |
|---|---|---|
| 1 | All KPIs, bars, counts, rows, chips, AI notes and empty states matched the prototype for every role and level checked (402 interaction states for the Commissioner, 0 differences). | None needed. |
| 2 | DIO: the prototype shows "N statewide records are not tied to a district and show only at state level." on Media monitoring and RTI; the app showed nothing because the server never sends statewide rows to a district officer. | New `GET /api/registers/{id}/statewide` → `{count}` (department/vendor scope, not district). The view uses it for district-pinned logins. |
| 3 | Module texts promise steps that "Move to next stage" could not do: renew empanelment, return a bill for proof, RTI reply/close, UC received / overdue, rejections, field proof hold. | Named one-click actions in the edit panel (see registers.md, "Actions"). Server-side, scoped and audited (`register.action`). |
| 4 | A bill with proof "Missing" could be moved or edited to Sanctioned/Paid. | Refused on the server (edit: error on the Proof field; move: message). |
| 5 | Edit form round-trip for every field type (enum, date, month, fy, money, inr, num, yn, district incl. Statewide, optional blanks). | New test `RegisterRoundTripTest` saves ~25 seeded rows of each register back exactly as the form sends them and checks nothing changes. All pass; no fixes were needed. |
| 6 | The edit panel did not show the deadline the table shows. | Panel subtitle adds "N days left to reply" / "N days past the 30-day deadline" (RTI) and "pending N days" (bills, welfare, film). |

## Intentionally different
- The app header has "⬇ Export Excel" and "+ Add record" next to the prototype's chips and "⬆ Upload Excel" (round 1 workflows).
- Rows open an edit panel on click (the prototype table is read-only).
- "Send reminder" style AI promises (UC reminders 60/30/7 days, welfare "which document is missing" on WhatsApp) are agent
  descriptions in the prototype, not buttons; they are left as AI notes.
- Vendors stay read-only in registers (they renew and send certificates through the WhatsApp feed, as the chip says).
