# Audit: shell, sign-in, role access, administration (fix/shell)

I compared the prototype and the app side by side in Playwright at 1440 px and 390 px, in light and dark themes, for all 7 roles.

## Checked, same as the prototype
- Sign-in: split layout, Kannada wordmark and department line, the 31-tick ring with the 14th tick highlighted (static in the
  prototype too, so there is no animation to add), role tiles (picking one fills the user ID and demo password and clears
  the error), "Enter your user ID and password.", wrong answer → "The security check answer is wrong. Try the new
  question." with a new question and a cleared answer, ↻ new question, theme toggle, mobile layout (art band on top, facts hidden).
- Top bar chip (icon, title, scope), sidebar groups and labels for every role (identical to `PROLES`, plus Users & access
  and Audit log for the Commissioner), the mobile module select, breadcrumbs, "Your district" chip, drill-up disabled at
  state level and for the DIO at district level, "Outside your area" toast, slicers shown only on outreach modules,
  "Clear filters" shown only when a slicer is off its default, the 4.2 s toasts.

## Differences found → what I did
| # | Finding | Fix |
|---|---|---|
| 1 | Landing module followed the menu order, so Accounts opened AI agents; the prototype opens the role's first tab (Spend). | The landing module is the first module in the role's own list (`user.modules`, which is in `PROLES` order). |
| 2 | Module changes replaced the URL hash, so the browser Back button left the app. | Each module change adds a history entry (`#tipline`), and Back/Forward move between modules. The hash is set on entry. A hash the role cannot open falls back to the current module with a "Not available" toast. |
| 3 | An expired or revoked session (401) dropped to the sign-in screen with no explanation, and reloading with an expired token did the same. | The sign-in screen shows "Your session has ended. Sign in again to continue.". If the console fails to load after sign-in, the user sees a message (no unhandled promise) and gets a fresh question. |
| 4 | The sign-in button did nothing if the security question had not loaded. | Shows a message and asks a new question. |
| 5 | Admin dialogs pulled focus back to their first field whenever the console re-rendered (the 15 s live-update poll, toasts), so typing could jump fields. | The dialog focuses once on open. Tab stays inside the dialog, and focus returns to the opening button on close. Confirm dialogs focus Cancel, not ✕. |
| 6 | The audit log had no names for the press, spend, register and bot action groups. A reversed date range sent a request that returns nothing. The "detail contains" box queried on every key. The page had no way to refresh. | Added the group names. A reversed range shows "The From date is after the To date." without a request. The text filter is debounced (350 ms). Added a "↻ Refresh" button. |
| 7 | WhatsApp numbers were shown as raw digits (919000010027). | They are shown as "+91 90000 10027". The on/off buttons name the number for screen readers. |
| 8 | User-row buttons ("Edit", "Reset password", …) had the same accessible name on every row. | Each button now includes the user ID in its aria-label. |
| 9 | Role tiles did not use the Kannada role titles from `PROLES` (`kn`). | **Decision:** the prototype never displays them. They are now the tile's tooltip (`title`), and the visible text is unchanged. |

The foot-note says "Sample data generated for demonstration" instead of the prototype's "Prototype with synthetic data". This is intentional, because the app is not a prototype. The "Password" button in the top bar is the round-1 addition.

## Role access (server)
`RoleMatrixTest` checks every role (7 roles × every GET endpoint, 17 registers × rows/export, uploads per dataset)
against a written-out copy of `PROLES`:
- reads give 200 with the module and 403 without it
- `/auth/me` modules and the `/meta` register list match
- every API gives 401 without a token
- 80+ key writes give 403 (users, bot numbers, register delete, claims and feed outside the module, ad review, press issue/draft, agent runs, release order issue, bill and pay, budget edit, vendor register writes)
- a DIO cannot publish a verdict, but JD can
- DIO, nodal officer and vendor rows stay inside their scope

All of these passed against the current code, so Role.java and SecurityConfig.java needed no change.

## Issues outside my files (not changed)
- **AgentService.approve** checks only the `ai` module. As a result, the Deputy Director (Accounts), who has `ai` but neither `tipline` nor `press`, can approve the Claim Triage agent (it moves every New claim in the state to Triaged) and the Press Release Composer (it issues a REL release). Suggested rule: triage approval needs `tipline`, and press approval needs `press` and the Commissioner or JD (News). I sent this to the AI worker.
- **charts.tsx Scatter** (Release-order audit): the drillable points are `<g onClick>` and cannot be reached with the keyboard. They need `tabIndex=0`, `role="button"`, an aria-label and Enter/Space handling, like HexMap.
