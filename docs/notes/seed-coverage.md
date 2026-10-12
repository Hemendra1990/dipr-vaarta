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

## After

```
register:empanel: 88 rows (38 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    103/146 — Bengaluru East (Bengaluru Urban), Anekal (Bengaluru Urban), Yelahanka (Bengaluru Urban), Doddaballapura (Bengaluru Rural), Hoskote (Bengaluru Rural), Ramanagara (Ramanagara), Kanakapura (Ramanagara), Magadi (Ramanagara), Chintamani (Chikkaballapura), Gauribidanur (Chikkaballapura), Bagepalli (Chikkaballapura), Kolar (Kolar) … (+91)
register:bills: 526 rows (214 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    19/146 — Hoskote (Bengaluru Rural), Channapatna (Ramanagara), Sidlaghatta (Chikkaballapura), Chitradurga (Chitradurga), Challakere (Chitradurga), T. Narasipura (Mysuru), Belur (Hassan), Belthangady (Dakshina Kannada), Karkala (Udupi), Gokak (Belagavi), Bailhongal (Belagavi), Ron (Gadag) … (+7)
register:media: 462 rows (201 statewide, 32 supplementary)
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
spend: 5845 rows (2478 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
claims: 31 rows (0 statewide, 23 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    115/146 — Bengaluru North (Bengaluru Urban), Bengaluru East (Bengaluru Urban), Anekal (Bengaluru Urban), Yelahanka (Bengaluru Urban), Devanahalli (Bengaluru Rural), Doddaballapura (Bengaluru Rural), Nelamangala (Bengaluru Rural), Ramanagara (Ramanagara), Channapatna (Ramanagara), Magadi (Ramanagara), Chikkaballapura (Chikkaballapura), Chintamani (Chikkaballapura) … (+103)
feed: 32 rows (0 statewide, 26 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    114/146 — Bengaluru South (Bengaluru Urban), Bengaluru East (Bengaluru Urban), Anekal (Bengaluru Urban), Yelahanka (Bengaluru Urban), Devanahalli (Bengaluru Rural), Doddaballapura (Bengaluru Rural), Hoskote (Bengaluru Rural), Ramanagara (Ramanagara), Channapatna (Ramanagara), Kanakapura (Ramanagara), Chikkaballapura (Chikkaballapura), Chintamani (Chikkaballapura) … (+102)
ad-flags: 31 rows (0 statewide, 26 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    115/146 — Bengaluru South (Bengaluru Urban), Bengaluru East (Bengaluru Urban), Anekal (Bengaluru Urban), Yelahanka (Bengaluru Urban), Devanahalli (Bengaluru Rural), Doddaballapura (Bengaluru Rural), Hoskote (Bengaluru Rural), Channapatna (Ramanagara), Kanakapura (Ramanagara), Magadi (Ramanagara), Chikkaballapura (Chikkaballapura), Chintamani (Chikkaballapura) … (+103)
releases: 34 rows (3 statewide, 28 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    115/146 — Bengaluru North (Bengaluru Urban), Bengaluru South (Bengaluru Urban), Bengaluru East (Bengaluru Urban), Yelahanka (Bengaluru Urban), Devanahalli (Bengaluru Rural), Doddaballapura (Bengaluru Rural), Hoskote (Bengaluru Rural), Ramanagara (Ramanagara), Kanakapura (Ramanagara), Magadi (Ramanagara), Chikkaballapura (Chikkaballapura), Gauribidanur (Chikkaballapura) … (+103)
outreach-base: 146 rows (0 statewide, 0 supplementary)
  divisions with no rows: none
  districts with no rows: 0/31
  taluks with no rows:    0/146
budget: 340 lines; department-years with no budget: Women & Child Development 2022-23, Energy 2022-23, Skill Development 2022-23, Food & Civil Supplies 2023-24
```

Left on purpose:
- Empanelled vendors, bills and offices have rows in every district but not every taluk. They are tied to real vendors,
  release orders and one office per district, so invented taluk rows would make them inconsistent (see seed.md).
  Register records as a whole still cover every taluk.
- Claims, ground feed, ad flags and press releases have rows in every district, not every taluk. These are short,
  hand-written lists in the prototype, and filling all 146 taluks would bury the prototype's own items.
- Budget lines are set by department and channel, with no geography. The four department-years with no budget are
  the years before those schemes started in the prototype. They are not changed.
