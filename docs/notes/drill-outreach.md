# Drill-down: command overview and outreach modules (round 3)

Area: Command overview (Glance, hex map, KidTable, insights), Tipline, Press, Release-order audit (Ads), District offices, AI agents.

## What was checked
Every place-showing element, as the Commissioner (State → Kalaburagi Division → Raichur → each Raichur taluk) and as the DIO
(pinned to Raichur → each taluk → back). `tools/e2e-drill-outreach.mjs` walks all of it and checks that list rows belong to the area.

| Element | Drill | Filtered to the node |
|---|---|---|
| Hex map tile | State/division → district (as the prototype, one click to the district) | metric engine |
| Division chips / "All divisions" | State ↔ division | metric engine |
| Taluk tiles (Overview at district) | district → taluk | metric engine |
| Child tables (Overview, Tipline "Claims by …", Press "Press performance by …", Offices scorecard) | one level down, down to taluk | metric engine |
| Scatter dots (Ads) | one level down; at taluk the single dot is the taluk itself (prototype) | metric engine |
| Spend by medium, KPIs, funnel, trend, narratives, accreditation pipeline | — | metric engine (taluk leaf → aggregated) |
| Tipline claim queue, "Open in queue" KPI | — | **now by taluk** |
| Press releases in scope | — | statewide always; district rows **now by taluk** |
| Ads flagged orders, "Orders flagged" KPI | — | **now by taluk** |
| Offices ground feed, pulse/escalation KPIs | — | **now by taluk** |
| Office profile + HQ tasks (district and taluk level) | — | district office (tasks belong to the office, not a taluk) |
| Glance tiles | open the module; the drill position is kept (it is global) | geo.geoOk, honours `taluk` |
| Breadcrumbs / Drill up | back one level; DIO cannot leave Raichur (up disabled at the district) | — |

## Changes
- `lib/geo.ts`: `inNode(dist, n, taluk?)` and `inScope(dist, n, taluk?)` take the row's taluk (round-3 data contract). At a taluk
  a tagged row shows only at its own taluk; an untagged district row (e.g. a claim or update logged live without a taluk) still shows
  at every taluk of its district, the same rule as the prototype's `geoOk`. New helpers `talukOf(row)` and `placeOf(dist, row)`.
- Tipline, Press, Ads, Offices filter with the taluk. The District / Scope / feed place columns show "District · Taluk" when tagged.
- AI view: the spend answers ("top vendors", "spend by channel", "biggest campaigns") are now limited to the area in view, with a
  plain "No spend booked in … yet." when the area has none. A question naming a taluk of the district in view opens that taluk
  ("How is Sindhanur doing?"), like the prototype does for district names.
- Empty states at a taluk use the existing prototype texts ("No claims with this status in …", "No flagged orders in this area.",
  "No updates from this area yet…"). The seed guarantees taluk coverage for registers and spend only, so tipline / press / ads / feed
  can legitimately be empty at some taluks.

## Decisions
- No server-side taluk filter: all four endpoints already return the user's scope; filtering is client-side as in the prototype.
- New claims, releases and feed updates logged from the console are not tagged with a taluk (the form has no taluk field);
  they show at every taluk of their district. Adding a taluk field to those forms is left for later.
- Scatter dots can overlap at division level (as in the prototype); each dot is also keyboard-focusable and drills on Enter.

## Verified
`node tools/e2e-drill-outreach.mjs http://localhost:3292` passes with a local test seed that tagged a few Raichur rows with taluks
(Sindhanur claim and pulse, Devadurga report, Manvi release, a Lingasugur ad flag): each row showed only at its taluk, statewide
releases at every level, and the empty texts elsewhere.
