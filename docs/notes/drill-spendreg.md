# Drill-down: Spend analytics and the 16 registers (round 3)

Checked in Playwright on a fresh data dir with the merged seed contract (taluk on every district row), for the
Commissioner, DIO (Raichur), Health nodal officer and vendor PR-K02: every register and Spend, drilled
State → Division → District → Taluk by clicking the first area bar at each level. KPIs, pipeline, category bars,
tables and AI notes changed with the node at every level; no card came up empty where the seed guarantees rows.

## Shared rule: how a row matches a taluk
- `placeOk` (lib/registers.ts) = `geo.geoOk`, plus a strict taluk match in districts whose rows carry taluks. So a
  row without a taluk (an order issued before taluks, a row uploaded without a Taluk column) is never counted in every
  taluk at once: it counts at district level and above only.
- In a district where no row carries a taluk (e.g. a register uploaded without the column), a taluk node falls back to
  the whole district, as geoOk does, and the register says so ("No taluk" note).
- At district level, rows of that district with no taluk are counted in a caption under the taluk bars
  ("N records have no taluk and count only at district level"), so the bars never silently disagree with the KPIs.

## Spend analytics
- The place card drills State → Division → District → Taluk: "By division", "By district", "By taluk" (when the
  district's orders carry taluks; otherwise the prototype's "District media buys" caption), each bar drills.
- At a taluk the card becomes "Taluk media buys": "₹X spent through N vendors in <taluk> in this selection" and the
  top 10 vendors as bars; selecting one sets the vendor filter (same as the vendor table), selecting again clears it.
- Every figure follows the node (KPIs, spend over time, channel/department bars, campaign and vendor tables, same
  campaign type across years, release orders card, insights card title), using the same taluk rule.
- Budget has no geography. As in the prototype, budget figures show only at state level with no campaign type,
  vendor or campaign filter; below state the Budget KPI shows "—" ("set by department and channel only"), Used "—",
  the dashed budget line is hidden and the channel card says "Budget comparison needs state level with no campaign or
  vendor filter". Spend bars in that card still follow the node.
- Statewide media note: the prototype computed it from node-filtered rows, so below state it said "₹0 went to
  statewide media". It now shows the statewide amount of the current selection at every level, and is hidden when
  that is zero (a DIO never receives statewide orders).
- Issue release order: new optional "Taluk (optional)" select ("Whole district" by default; pre-filled when issued
  from a taluk view; district pre-filled from a district or taluk view). Server: `taluk` on `POST /api/spend/orders`,
  must be a taluk of the order's district (case-insensitive, stored as spelt in the reference), refused on statewide
  orders (400). Shown in the order panel. Test: `SpendTalukTest`.
- DIO (pinned to Raichur) starts at "By taluk" and drills into its taluks; nodal officer and vendor scopes unchanged
  (the vendor page has no place card, as in the prototype, but its figures follow the shell's node).

## Registers
- Every non geo-all register drills to taluk now that rows carry taluks (before, only Field & folk did). Taluks with
  no rows show a 0 bar and, when selected, the prototype empty text.
- Geo-all registers (campaigns, film, publications, grants) stay not geographic, as in the prototype (no area card,
  same figures at every level). Below state they now say so: "Statewide register · <Title> are not tied to a place,
  so this page shows the whole state at every level. <Node> is not applied here."
- The statewide-records note keeps working at district and taluk level (DIO via `/statewide`).
- A vendor login (statewide vendor) sees zero area bars and the prototype empty text below state: its rows are
  statewide, exactly as in the prototype.
