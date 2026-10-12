# Spend: release orders, bills, payments and budget edits

Decisions taken while building the release-order workflow on top of Spend analytics. Charts, filters and numbers
are unchanged for the seed data; the new parts are a header button, dialogs, an order detail panel and a
"Release orders" table at the end of the page.

## Lifecycle
`RO issued` → `Billed` → `Paid`, or `RO issued` → `Cancelled`. A billed or paid order cannot be cancelled, and nothing
can be undone. Each step adds an entry to the order's history (time, user, action, note) and an audit event
(`spend.issue`, `spend.bill`, `spend.pay`, `spend.cancel`, `spend.budget`).

## Who may do what (enforced on the server)
| Action | Who | Scope |
|---|---|---|
| Issue release order | Commissioner, DD Accounts | any district or Statewide |
| Issue release order | DIO | own district only (so only vendors based in that district) |
| Submit bill | Vendor | own RO only, while status is `RO issued` |
| Mark paid | Commissioner, DD Accounts | any order in status `Billed` |
| Cancel release order | Commissioner, DD Accounts | any order in status `RO issued`; reason required (≤300 chars) |
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
- Spend figures use the bill amount once an order is `Billed` or `Paid`; `RO issued` orders count as committed at the
  order amount. Seed and uploaded rows have no bill amount, so they keep the order amount and the seed numbers still
  match the prototype exactly.

## Cancel rules
- Only while `RO issued`; the reason is stored with who and when (`cancelledBy`, `cancelledOn`, `cancelReason`) and
  added to the history. A cancelled order cannot be billed or paid. Its RO number is not reused.
- Cancelled orders count in no figure: `GET /api/spend/orders` leaves them out unless `?cancelled=true`, so the
  overview, the AI answers and the Spend Forecaster (which uses `SpendOrder.booked()` / `spendAmount()`) ignore them.
- Spend page: the "Release orders" card has a "Cancelled" filter; cancelled rows are greyed with the RO struck through
  and "Cancelled by <user> on <date>: <reason>". The vendor's "My release orders" lists them greyed with the reason;
  the vendor KPI "Orders received" counts only live orders and notes how many were cancelled.

## Budget edit
- `PUT /api/spend/budget {fy, department, channel, budget}` sets the line, creating it if missing; duplicate lines for the
  same key (possible after uploads) are folded into one. Budget 0 to 1,00,000 ₹ lakh.
- UI: "Edit budget" button on the "Budget vs spent by department" card; the dialog shows the current value and the
  department's lines per channel for that FY.

## Endpoints
- `GET /api/spend/orders[?cancelled=true]` — `amount` is the figure spend counts (bill amount once billed/paid),
  `orderAmount` the RO amount; also `id`, bill/payment/cancel fields when set
- `POST /api/spend/orders/{id}/cancel` — `{reason}`
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
- "Cancel" per open row in the Release orders card and "Cancel release order" in the order panel (Commissioner, DD Accounts).
  Amount cells show the counted amount, with "order ₹X" underneath when the bill differs. The order panel shows
  "Counts in spend as".
- After every write the app calls `invalidate()`, so charts and KPIs update.
- `lib/spend.ts` has its own small PUT helper because `lib/api.ts` has no `put`; it can move into api.ts when merged.
