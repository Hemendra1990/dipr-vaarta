# Spend: release orders, bills, payments and budget edits

Decisions taken while building the release-order workflow on top of Spend analytics. Charts, filters and numbers
are unchanged for the seed data; the new parts are a header button, dialogs, an order detail panel and a
"Release orders" table at the end of the page.

## Lifecycle
`RO issued` → `Billed` → `Paid`. No other transitions, no cancel/undo (an RO issued in error is handled outside the
portal for now). Each step adds an entry to the order's history (time, user, action, note) and an audit event
(`spend.issue`, `spend.bill`, `spend.pay`, `spend.budget`).

## Who may do what (enforced on the server)
| Action | Who | Scope |
|---|---|---|
| Issue release order | Commissioner, DD Accounts | any district or Statewide |
| Issue release order | DIO | own district only (so only vendors based in that district) |
| Submit bill | Vendor | own RO only, while status is `RO issued` |
| Mark paid | Commissioner, DD Accounts | any order in status `Billed` |
| Edit budget line | Commissioner, DD Accounts | any FY × department × channel |
| Read orders / detail | everyone with `spend` | as before: DIO own district, nodal own department, vendor own code |

The department nodal officer is read-only. JD News, Film section have no Spend module and get 403.
An order outside the user's scope returns 403; an unknown order id returns 404.

## Issue rules
- RO number is generated: `RO/<FY start yy>/<5-digit serial>`, the serial running across years as in the seed
  (next after `RO/26/05845` is `RO/26/05846`).
- FY and quarter are derived from the month. The month must fall in the five financial years the portal shows.
- Campaign type, department and channel must be from the reference lists; district must be a known district or Statewide.
- Vendor must exist, its channel must equal the order channel, and its home district must equal the order district
  (statewide vendors take Statewide orders, district vendors take orders for their own district), as in the seed data.
- A campaign id keeps one type and one department: reusing an existing id with a different type/department is refused.
  New campaign ids are suggested as `CMP-<yy><next serial>` (the user may type another, max 20 characters).
- Amount in ₹ lakh, more than 0 and at most 10,000 per order; rounded to 2 decimals.

## Bill and payment rules
- Bill number required (≤40 chars); bill amount > 0 and ≤ RO amount + 5% (taxes, rounding); bill date defaults to today,
  cannot be in the future.
- Payment needs a reference (UTR/cheque, ≤60 chars); payment date defaults to today, not in the future and not before the bill date.
- Charts keep using the RO amount (as for seed data); the bill amount is shown in the order detail.

## Budget edit
- `PUT /api/spend/budget {fy, department, channel, budget}` sets the line, creating it if missing; duplicate lines for the
  same key (possible after uploads) are folded into one. Budget 0 to 1,00,000 ₹ lakh.
- UI: "Edit budget" button on the "Budget vs spent by department" card; the dialog shows the current value and the
  department's lines per channel for that FY.

## Endpoints
- `GET /api/spend/orders` (now also returns `id` and bill/payment fields when set)
- `GET /api/spend/orders/{id}` — one order with `history`
- `POST /api/spend/orders` — issue
- `POST /api/spend/orders/{id}/bill` — `{billNo, amount, billDate?}`
- `POST /api/spend/orders/{id}/pay` — `{reference, paidOn?}`
- `PUT /api/spend/budget`

## UI
- "＋ Issue release order" in the Spend header for Commissioner, DD Accounts and DIO (district locked for DIO; channel list
  limited to channels with vendors in the chosen place).
- Vendor view: "Submit bill" per open RO; clicking a row opens the detail panel.
- Non-vendor view: "Release orders" card (status filter; accounts users start on "Billed" with a "Mark paid" button per row).
- After every write the app calls `invalidate()`, so charts and KPIs update.
- `lib/spend.ts` has its own small PUT helper because `lib/api.ts` has no `put`; it can move into api.ts when merged.
