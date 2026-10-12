# Vaarta 360 (DIPR-Vaarta)

The internal command portal of the Department of Information & Public Relations, Government of Karnataka, built from
the HTML prototype `Vaarta360_Portal (1).html`. What it does, who can do what, and every decision taken while building
it are in [SPEC.md](SPEC.md).

- `backend/`: Spring Boot 3.5 (Java 21). Sign-in, role and scope enforcement, data, workflows, Excel upload.
- `frontend/`: Next.js 15 (React 19, TypeScript). Every screen, map and chart of the prototype.
- `tools/`: the scripts that extract the sample data from the prototype, plus a browser smoke test.

## Run it

You need Java 21, Maven 3.9 and Node 20 or later.

```bash
# 1. Backend on :8080. On first start it creates the database and loads the sample data.
cd backend
mvn package            # runs the tests; add -DskipTests to skip them
cd ..
scripts/backend.sh start          # stop | restart; logs and data go in .run/

# 2. Frontend on :3000. It forwards /api to the backend.
cd frontend
npm install
npm run build
npm start              # or: npm run dev
```

Open http://localhost:3000 and pick a role. All demo users have the password `demo@2026`; answer the sum to sign in.

| Sign in as | User ID | Sees |
|---|---|---|
| Commissioner, DIPR | `commr.dipr` | everything, plus Users & access and Audit log |
| Joint Director, News & Media | `jd.news` | news, media, outreach, AI agents, upload |
| Deputy Director, Accounts & Advertisement | `dd.accounts` | spend, empanelment, bills, audit, AI agents, upload |
| District Information Officer | `dio.raichur` | Raichur district only |
| Department Nodal Officer | `nodal.health` | Health & Family Welfare spend, campaigns, bills, media |
| Empanelled Media / Vendor | `vendor.prk02` | their own release orders and bills |
| Film & Academies Section | `film.section` | film, grants, publications, archive, upload |

## Settings

Backend settings are in `backend/src/main/resources/application.yml` and can be overridden by environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `VAARTA_DATA_DIR` | `./data` (inside the run directory) | Where the H2 database file lives. Delete it to reload the sample data. |
| `VAARTA_AS_OF` | `2026-10-07` | The "today" the dashboards use. The sample data ends on this date; set `today` for live data. |
| `VAARTA_JWT_SECRET` | a development secret | **Set this in any shared or production environment.** |
| `SPRING_PROFILES_ACTIVE=postgres` | off | Use PostgreSQL (`DB_URL`, `DB_USER`, `DB_PASSWORD`) instead of H2. |

The frontend reads `BACKEND_URL` (default `http://localhost:8080`) at build time for the `/api` proxy.

## WhatsApp bot

The bot gateway posts each incoming WhatsApp message to `POST /api/bot/inbound` with the header
`X-Vaarta-Bot-Key`. Set the key with `VAARTA_BOT_KEY`; the development default is `vaarta-dev-bot-key`, so
**change it in any shared environment**. Tipline claims come from anyone. Field pulses, reports and escalations are
accepted only from numbers registered under Users & access → WhatsApp numbers (the demo numbers are
`+91 90000 1nnnn`; Raichur is `+91 90000 10027`). Try it with the app running:

```bash
node tools/bot-sim.mjs              # sends all sample messages
node tools/bot-sim.mjs --every 20   # a random message every 20 s
```

New claims and feed items appear in the console within 15 seconds, with a toast and a badge on the menu.

## Tests

```bash
cd backend && mvn test     # 58 tests: role matrix, registers, press, spend, tipline/bot, outreach, agents, admin, upload

# browser smoke test: signs in as every role and opens every module (backend and frontend running)
NODE_PATH=$(npm root -g) node tools/e2e-smoke.mjs http://localhost:3000
```

The smoke test needs the `playwright` package installed globally (`npm i -g playwright`).

## Sample data

`backend/src/main/resources/seed/*.json` was produced by running the prototype's own data generators:

```bash
node tools/dump-seed.js     # rewrites the seed files from tools/proto-data.js
```

So the numbers on every screen match the prototype. Uploading Excel files through **Data upload** adds to or replaces
this data, just as real registers would.
