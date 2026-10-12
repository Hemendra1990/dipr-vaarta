# Audit: Command overview and AI agents (round 2)

Compared the app with the prototype side by side in Playwright (1440px and 390px, light and dark) as Commissioner,
Joint Director (News), Deputy Director (Accounts) and DIO Raichur.

## Command overview
Checked the full `#view` text line by line against the prototype at state, division, district and taluk level, with
these slicer combinations: defaults; 7d + Shakti; 90d + Tulu + Journalists; 90d + Tulu + Officers + Yuva Nidhi (taluk);
90d + Gruha Jyothi + Urdu + Citizens. KPI values, sparkline deltas, hex map values, legend, division chips, taluk tiles,
"What citizens in X are asking", insights, funnel, children table, scheme and language bars and "Department at a
glance" tiles were **identical** in every case (Commissioner, JD News, DIO).

| Finding | What was done |
|---|---|
| Read vs delivered chart had no hover | Added hover/tap: guide line, dots and a tooltip with the date, Read and Delivered values (`LineChart` series now take an optional `name`). |
| Glance tiles | Verified each of the 8 tiles opens its module. No change. |
| Map metric switch, legend ("Worse/Better" for claims and clarification time), red outline only for read rate | Verified. No change. |
| Children table sort (default subscribers ↓, toggle ↑) and row drill | Verified. No change. |
| Insight actions | "Drill in", "Open tipline", "Open district offices" keep the current drill like the prototype. "Plan a recovery campaign" / "Ask the planner agent" / "Plan a campaign" run the Campaign Planner for that area. |
| Planner target was resolved by name, so the taluk "Raichur" (or "Mysuru", "Hassan" ...) was read as the district | Insights now pass the drill node; a bare name prefers a child of the area in view. |
| DIO sees no "Plan …" buttons (prototype shows them, but its click lands on a tab the DIO cannot open) | **Decision:** kept hidden; the DIO has no AI agents module. |
| Release-order audit scatter points were mouse-only (integrator request) | Points are now focusable buttons with an aria-label and Enter/Space. |

## AI agents
| Finding | What was done |
|---|---|
| Any role with `ai` could run and approve every agent (e.g. DD Accounts could approve Claim Triage and the Press Release Composer) | Each agent needs the module its data comes from and its approval changes: press → Press, triage → Tipline, monitor → Media monitoring, planner → Command overview, adaudit → Release-order audit, query → Tipline, spend → Spend analytics. Press approval is Commissioner / JD (News) only, same as issuing a release. Cards the user cannot run show the reason and a disabled Run button. `GET /api/agents` returns `canRun`, `canApprove`, `note`. |
| Triage moved every New claim in the state | Only claims in the approver's scope; each claim gets a `claim.Triaged` audit entry, so it shows in the claim history. |
| Monitor, planner, adaudit, query and spend approvals only toasted | Every approval stores `sentTo` and `effect` on the run. Planner: adds the test to the Publicity campaigns register (`CMP-<next>`, "Read-rate recovery test · <target>", DIPR (own campaigns), Guarantee schemes awareness, starts the day after the as-of date, 14 days, stage "Creative in design", budget 0, district of the target or Statewide). Monitor → Minister's office and Secretary; query → Energy department; adaudit and spend → Commissioner, listed in a new "Reports sent to you" card for the Commissioner (`GET /api/agents/inbox`). |
| "Send back with comments" sent a fixed text | Opens a comment box; a comment is required (server: 400 if blank, ≤1,000 characters). |
| No run history in the UI | "Run history" card: last 20 runs of the agents the user can run (`GET /api/agents/runs` is filtered the same way), with starter, decision, outcome; selecting a run opens its output (and lets you decide it if still waiting). |
| "Run again" left the earlier run waiting forever | An undecided earlier run of the same agent by the same officer becomes "Superseded". |
| Step animation | 520 ms per step as in the prototype, 60 ms with reduced motion. |

### Ask Vaarta 360
Compared the answers for the 5 suggestions plus 9 other questions (vendors, channel, campaigns, uptake, rumours,
releases, another comparison, no-match) at state, division (7d) and taluk (Shakti) level: identical except two
**intentional** fixes of prototype bugs:
- "Where is ad spend highest per person?": the prototype's spend override catches the word "spend" and answers
  "Biggest campaigns"; the app answers spend per 1,000 people by area, which is what was asked.
- "Lowest press pickup": the prototype matches "low" first and answers read rates; the app answers press pickup.
- Spend questions for a login without Spend analytics say the data is not part of their access (the server does not
  send spend rows to them).

## Requests for other areas
- Registers/Campaigns: approved planner tests now appear as campaign rows (department "DIPR (own campaigns)").
- Live updates (UpdatesController/updates.ts, not mine): could also toast new "Reports sent to you" for the Commissioner.
