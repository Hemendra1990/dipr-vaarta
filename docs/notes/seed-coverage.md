# Seed coverage, before and after the round-3 fill

Produced by `node tools/seed-coverage.mjs` (reads `backend/src/main/resources/seed`). For each dataset it lists the
divisions, districts and taluks (146 in all) with no rows. Geo-all registers (campaigns, film, publications, grants)
are not geographic and are left out. "Before" is the seed at the start of round 3, when no row except field and folk
shows carried a taluk, so every dataset was empty at every taluk.

## Before

```
register:empanel: 88 rows (38 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
register:bills: 526 rows (214 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
register:media: 430 rows (201 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
register:social: 380 rows (272 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 2/31 — Bengaluru Rural, Kodagu
  taluks with no rows:    146/146
register:crisis: 58 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 3/31 — Udupi, Uttara Kannada, Koppal
  taluks with no rows:    146/146
register:welfare: 360 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
register:events: 280 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
register:election: 150 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 2/31 — Kodagu, Chikkamagaluru
  taluks with no rows:    146/146
register:field: 540 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    9/146 — Doddaballapura (Bengaluru Rural), Hoskote (Bengaluru Rural), Nelamangala (Bengaluru Rural), Gauribidanur (Chikkaballapura), Mysuru (Mysuru), Kollegal (Chamarajanagara), Somwarpet (Kodagu), Gadag (Gadag), Karwar (Uttara Kannada)
register:outdoor: 230 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 6/31 — Shivamogga, Mandya, Chikkamagaluru, Vijayapura, Bidar, Vijayanagara
  taluks with no rows:    146/146
register:archive: 420 rows (221 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
register:admin: 32 rows (1 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
register:rti: 220 rows (129 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 6/31 — Chikkaballapura, Chitradurga, Chamarajanagara, Kodagu, Gadag, Yadgir
  taluks with no rows:    146/146
spend: 5845 rows (2478 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    146/146
claims: 8 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 23/31 — Bengaluru Rural, Ramanagara, Chikkaballapura, Kolar, Tumakuru, Chitradurga, Davanagere, Shivamogga, Chamarajanagara, Mandya, Hassan, Kodagu … (+11)
  taluks with no rows:    146/146
feed: 6 rows (0 statewide, 0 supplementary)
  divisions with no rows: Bengaluru
  districts with no rows: 26/31 — Bengaluru Urban, Bengaluru Rural, Ramanagara, Chikkaballapura, Kolar, Tumakuru, Chitradurga, Davanagere, Shivamogga, Mysuru, Chamarajanagara, Mandya … (+14)
  taluks with no rows:    146/146
ad-flags: 5 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 26/31 — Bengaluru Rural, Ramanagara, Chikkaballapura, Kolar, Tumakuru, Chitradurga, Davanagere, Shivamogga, Chamarajanagara, Mandya, Hassan, Kodagu … (+14)
  taluks with no rows:    146/146
releases: 6 rows (3 statewide, 0 supplementary)
  divisions with no rows: Bengaluru
  districts with no rows: 28/31 — Bengaluru Urban, Bengaluru Rural, Ramanagara, Chikkaballapura, Kolar, Tumakuru, Chitradurga, Davanagere, Shivamogga, Chamarajanagara, Mandya, Hassan … (+16)
  taluks with no rows:    146/146
outreach-base: 146 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
budget: 340 lines; department-years with no budget: Women & Child Development 2022-23, Energy 2022-23, Skill Development 2022-23, Food & Civil Supplies 2023-24
```

## After (follow-up: every taluk in every dataset, Health and PR-K02 coverage)

```
register:empanel: 191 rows (38 statewide, 103 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:bills: 617 rows (214 statewide, 91 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:media: 557 rows (201 statewide, 127 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:social: 453 rows (272 statewide, 73 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:crisis: 153 rows (0 statewide, 95 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:welfare: 381 rows (0 statewide, 21 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:events: 303 rows (0 statewide, 23 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:election: 206 rows (0 statewide, 56 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:field: 549 rows (0 statewide, 9 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:outdoor: 307 rows (0 statewide, 77 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:archive: 472 rows (221 statewide, 52 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
register:admin: 32 rows (1 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    115/146 — Bengaluru South (Bengaluru Urban), Bengaluru East (Bengaluru Urban), Anekal (Bengaluru Urban), Yelahanka (Bengaluru Urban), Doddaballapura (Bengaluru Rural), Hoskote (Bengaluru Rural), Nelamangala (Bengaluru Rural), Channapatna (Ramanagara), Kanakapura (Ramanagara), Magadi (Ramanagara), Chintamani (Chikkaballapura), Gauribidanur (Chikkaballapura) … (+103)
register:rti: 305 rows (129 statewide, 85 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
spend: 5936 rows (2478 statewide, 91 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
claims: 146 rows (0 statewide, 138 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
feed: 146 rows (0 statewide, 140 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
ad-flags: 146 rows (0 statewide, 141 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
releases: 149 rows (3 statewide, 143 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
outreach-base: 146 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
budget: 340 lines; department-years with no budget: Women & Child Development 2022-23, Energy 2022-23, Skill Development 2022-23, Food & Civil Supplies 2023-24
```

What is left, on purpose:
- Offices and staff have one District Information Office per district, filed under the headquarters taluk. Their
  other taluks stay empty.
- Budget lines are set by department and channel, with no geography. The four department-years with no budget are
  the years before those schemes started in the prototype.

## Coverage by role (follow-up checks)
- **Health & Family Welfare (nodal.health):** every taluk has a booked Health release order in April–September 2026,
  so spend, the like-for-like chart and the orders card have data. Every taluk also has a Health bill and a Health
  media clip.
- **PR-K02 (vendor.prk02):** it has district-edition orders, each with its bill, in two districts per division:
  Chikkaballapura and Bengaluru Rural, Hassan and Mandya, Uttara Kannada and Haveri, Ballari and Kalaburagi.
- **Payer default "Billed":** every district has at least one order awaiting payment. Before, Mandya had none.

## Totals that change (state level)
Spend stays exactly as the prototype generated it:
- Total 67,816.80 L.
- Booked (billed or paid) 66,042.54 L.
- Every financial year, every department, Health 5,167.61 L and PR-K02 3,004.98 L.
- Bills total 9,008.93 L.

What does move:
- 30 statewide 2026-27 orders were reduced. Their 326.50 L now sits in 91 district orders (83 Health, 8 PR-K02).
  The bills of the reduced orders shrank by the same amounts.
- Small shifts follow from that, by channel (Print +98 L, Digital −166 L, Outdoor +66 L), by month (Sep 2026 +76 L,
  Jun 2026 −76 L) and by status (Billed +64 L, Paid −64 L).

| Register | Rows |
|---|---|
| Empanelled media and vendors | 88 → 191 (+103 local vendors, also in vendors.json) |
| Bills and payments | 526 → 617 (+91; amount unchanged at 9,008.93 L) |
| Media monitoring | 430 → 557 (+127, mostly Health clips) |
| Social media | 380 → 453 |
| Crisis advisories | 58 → 153 |
| Journalist welfare | 360 → 381 |
| Events and coverage | 280 → 303 |
| Election period | 150 → 206 |
| Field and folk | 540 → 549 |
| Outdoor displays | 230 → 307 |
| Photo and film archive | 420 → 472 |
| RTI applications | 220 → 305 |

| Live list | Rows | State KPIs |
|---|---|---|
| Tipline claims | 8 → 146 | New, Triaged, Draft ready and Escalated are unchanged: 7 open in queue. The fill claims are Published or Closed and 7–37 days old. |
| Ground feed | 6 → 146 | Unchanged: the fill items are daily reports, so pulse notes stay at 3 and escalations at 1. |
| Ad flags | 5 → 146 | 5 still Flagged. The fill flags are already Cleared or Resolved, numbered RO/2026/3239 and down, and listed after the live ones. "Orders flagged by audit agent" counts every flag, so it shows 146 at state level. |
| Press releases | 6 → 149 | The fill releases are issued 2–37 days ago, numbered REL-1858 and down. The next new release is still REL-1881. |
