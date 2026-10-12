# Audit: Spend analytics, My orders & payments, Data upload

Compared side by side with the prototype (Playwright, 1440px) for Commissioner, DD Accounts, DIO (Raichur), the Health
nodal officer and vendor PR-K02: default view, every filter (FY, campaign type, channel, department), year → quarter →
month drill by clicking bars, "↑ Up" twice, granularity buttons, bullet bars, department rows, campaign rows, vendor rows,
filter chips and Reset, "Show all" buttons, like-for-like toggle and campaign-type select, by-division drill, AI insights.
All KPIs, chart bar values (tooltips), tables and insight texts match the prototype exactly on the seed data, except as
listed below. Checked at 390px (no horizontal scroll) and in the dark theme.

## Fixed
| Finding | Fix |
|---|---|
| KPIs and charts counted the order amount after a bill arrived | Server returns `amount` = bill amount once Billed/Paid (order amount otherwise) and `orderAmount`; "RO issued" stays committed at the order amount. Seed rows have no bill amount, so seed figures are unchanged. Spend Forecaster uses the same rule. |
| An issued RO could not be cancelled | `POST /api/spend/orders/{id}/cancel` (Commissioner, DD Accounts, only while "RO issued", reason required, audited `spend.cancel`). Cancelled orders are excluded from every figure, greyed with who/why in the Release orders card ("Cancelled" filter) and in the vendor's list. |
| `isBooked` treated any status other than "RO issued" as spent (would count cancelled orders) | Booked = Billed or Paid. |
| Same campaign type card: when the selected type had no spend (e.g. after picking a department) the fallback type did not stick, so after clearing the filter the card jumped back; the prototype keeps the fallback | The fallback now becomes the selected type, as in the prototype. |
| Vendor order list broke ties within a month differently from the prototype (different 25 rows) | Same stable sort as the prototype. |
| Insight said "across 1 vendors" | Singular when one vendor. |
| Upload: an error message stayed when moving between wizard steps | Cleared on every step change, as in the prototype. |
| Upload: "Replace" did not say how many records would go; for geo-all registers (e.g. Campaigns) a DIO sees every record but replace removes only Raichur rows | Validate returns `replaceCount`; the replace option shows "N records will be removed". |
| Upload template examples could show a cancelled order (status not allowed in the template) | Samples skip cancelled orders. |

## Intentionally different
- DIO: no "⬆ Upload budget" button (budget is state level; the server refuses it for district logins).
- DIO and nodal officer: no "Run Spend Forecaster" button (the agents need the AI module, which these roles do not have).
- DIO insights use only Raichur orders (the server never sends other districts' orders), so "Digital and social…" and
  "top 5 vendors…" are district figures, not state ones.
- Additions from the workflow round: "＋ Issue release order", "Edit budget", the Release orders card, order panel and dialogs.
- Upload history is persisted (last 50, all users) rather than "this session"; template download comes from the server.
