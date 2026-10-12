# Drill-down test and shell drill fixes (round 3, e2e)

## The test: `tools/e2e-drill.mjs`
Signs in as each of the 7 demo roles (one page per role, roles run in parallel) and opens every module in the role's
menu. In each module it starts at the top of the role's area and drills with the module's own controls:
hex tiles, division chips, children-table rows, by-area bars, scatter points and taluk tiles. It uses the least-used
control type first, so every type the module offers gets exercised. It drills to every division, then districts per
division (3 by default, 1 with `--quick`, all 31 with `--full`), then every taluk of the first district in each
division. The DIO gets Raichur and every Raichur taluk. It comes back up by alternating the breadcrumb and the
"↑ Drill up" button.

At every level it checks:
- the breadcrumb path, the current crumb, the level label ("Taluk view")
- the drill-up button state and the address (`#module/Division/District/Taluk`)
- nothing is stuck on "Loading", and there are no page errors, console errors (third-party files that cannot load
  offline are ignored), failed or 4xx/5xx `/api` calls
- no "no data" empty state: every `.empty` block, plus the views' empty phrases ("No records match", "No releases
  for this area", "No flagged orders", "No claims with this status", "No spend for this campaign type", "No release
  orders with this status", "No updates from this area", …)
- no NaN / undefined / Infinity / ∞ anywhere in the view

A geographic module (outreach modules, Spend, every register that is not geo-all) fails when its view has no control
for a child place. The test then reaches that place through the address so it can still check the place.
Non-geographic modules (AI agents, upload, users, audit, campaigns, film, publications, grants) are checked at one
place per level through the address.

Shell checks for each role:
- a place outside the login's area in the address is refused with "Outside your area" and the drill does not move
- Back returns to the previous module
- a link to Raichur › Sindhanur opens at that taluk after a reload

Output: a role × module × level table (pass count, or FAIL n/m with the top reasons), a JSON report (`--report`,
default `e2e-drill-report.json`), and full-page screenshots of failing places (`--shots dir`). It exits 1 when any
check fails. The default mode takes about 3.5 minutes for all roles with `--jobs 7` (3,357 checks).

### Allowed empties (whitelist, with the reason; also written into the JSON report)
| Where | Text | Why |
|---|---|---|
| AI agents | No agent runs yet | A fresh database has no runs until someone runs an agent. |
| Data upload | No uploads yet / Your login has no data to upload | A fresh database has no history; some roles have no datasets. |
| District offices | No open tasks from HQ | HQ tasks are created at run time, not seeded. |
| Offices & staff, taluk | No records match | One District Information Office per district, filed under the HQ taluk. |
| Empanelment, taluk | No records match | Vendors are empanelled per district or statewide, not per taluk. |
| Bills, taluk | No records match | Bills exist only for billed release orders, so not every taluk has one. |
| Vendor, every module | No records match / No release orders with this status | The demo vendor PR-K02 is a statewide outlet. All its rows are statewide. |
| Vendor, drill controls | (none needed) | For the same reason, the vendor has nothing below Karnataka to drill to. |

## Shell decisions and fixes (`components/Console.tsx`)
- **The address now carries the drill position.** It looks like `#tipline/Kalaburagi/Raichur/Sindhanur`, with spaces
  written as `+`.
  - Drilling rewrites the current history entry. Changing module adds an entry that keeps the place. So Back still
    moves between modules, and each module comes back at the place where it was left.
  - A link or a reload opens at that place.
  - An unknown place, or a place outside a district login's area, is refused with an "Outside your area" toast. The
    address then goes back to what is on screen. An unknown module still gives "Not available".
- **drillTo ignores names that are not places.** This covers a division not in the list, a district not in
  Karnataka's list, and a taluk that is not in the current district. Before, such a name produced an empty view at a
  made-up place.
- The rest matched the prototype and was checked by the test for every role:
  - The breadcrumb ("Karnataka › X Division › District › Taluk"; the DIO starts at Raichur, with the "Your district"
    chip).
  - The level label.
  - Drill-up is disabled at state, and for the DIO above taluk.
  - "Outside your area" for the DIO.
  - The drill is kept across modules.

`lib/store.tsx` needed no change: it has no stuck loading, stale data or cache errors at any level.

## Results against merged main (67ea29e + this branch, fresh data dir)
Default mode: 3,165 / 3,357 checks pass. The smoke test (`tools/e2e-smoke.mjs`) passes for all roles. Every shell
check passes for all 7 roles: breadcrumbs, level labels, drill-up, address, Back, deep link, and the out-of-area
guard. There are no page or console errors, no failed API calls, no stuck loading and no NaN values at any level.

### Known data gaps (seed; the views behave correctly)
| Module | Where | What the test sees |
|---|---|---|
| Tipline | most taluks (16/20 for Commissioner and JD; Raichur, Sindhanur, Lingasugur and Devadurga for the DIO) | "No claims with this status in <taluk>" with status All. Seed adds one claim per *district* with none, not per taluk. |
| Release-order audit | 16/20 taluks | "No flagged orders in this area." Ad flags are per district only. |
| District offices | most taluks (Commissioner, and the DIO's Raichur taluk) | "No updates from this area yet." Feed items are per district only. |
| Media monitoring for the Department nodal officer (Health) | 16 of 31 districts checked and 17/20 taluks | "No records match." The seed fills each district per register, not per department. Health media rows are missing in Ramanagara, Mysuru, Bagalkote, Bidar, Kalaburagi, Raichur and others. Because of this the view also has no taluk bars for Mysuru. |
| Spend, Release orders card | Mandya (Commissioner, DD Accounts) | "No release orders with this status in the selection." The payer's default status is **Billed** (Spend.tsx:1166), and Mandya has no order awaiting payment. Either the seed adds one billed order per district, or the view falls back to "All" when the default status is empty. |

### Real bugs in module views (not my files; for the owners)
1. **Spend (spendreg), `views/Spend.tsx` ~line 134:** no drill below district. `geoKids` is only built at state and
   division level. At district level the card becomes "District media buys" with no taluk bars, although every
   release order now has a taluk. Repro: Commissioner, DD Accounts or nodal → Spend → any district: no control
   reaches its taluks (60 failures). For the DIO, Spend at Raichur has no taluk drill at all. Fix: build
   `geoChildren(geo, n)` at district level too and show "By taluk".
2. **Spend (spendreg), "Same campaign type across years" card:** at taluk level (Aland, Belagavi, Gokak, Mysuru) the
   campaign-type select keeps the first type, "Achievements & anniversaries", and shows "No spend for this campaign
   type in the current selection." It should default to a type that has spend in the selection.
3. **District offices (outreach3), `views/Offices.tsx`:** no taluk drill. At district level the view has no control
   for the district's taluks (Commissioner at every district; DIO at Raichur shows "the view has no control that
   drills to its taluks"). The scorecard KidTable only lists divisions and districts. The taluk feed filter exists
   (`talukOf`), but you can only reach it through the address.
4. **Release-order audit scatter (outreach3), `components/charts.tsx` Scatter:** points overlap and the covered point
   cannot be clicked, because the neighbour's `<g>` (circle and label) captures the pointer.
   - Division level: Mysuru is under Mandya, and Raichur is under Koppal.
   - District level: Bengaluru North is under Yelahanka, Belagavi is under Gokak, and Chincholi is under Sedam.

   The keyboard (Tab + Enter) still works. Fix: make the labels `pointer-events: none`, or nudge points that collide.

All of these show in the JSON report with the exact place. Rerun after the fixes:
`node tools/e2e-drill.mjs http://localhost:3000 --module spend,offices,ads,tipline`.
