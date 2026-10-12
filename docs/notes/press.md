# Press & journalists — press office

## What it does
- **Compose release** (button on "Recent releases in scope"): title, department, scope (State or a district), language (Kannada / English), hours after event (optional, default 1.4 h as in the prototype) and the release text. Saved as a **Draft** with id `DRF-n`.
- **Drafts awaiting approval** list sits above the releases table. Drafts carry no reach, kits or pickup and are not counted in any KPI.
- **Approve & issue**: the draft is replaced by an issued release `REL-(1875 + releases issued so far)` (prototype addRelease; skips a number already in use), `issuedAt` = now, `approvedBy` = approver's display name, reach = 1,210 for State and 58 for a district (prototype addRelease). It appears at the top of the table.
- **Release detail** (click any row): status, full text, drafted by/when, approved by/when, reach/kits/pickup. Seed releases have no text on file and say so.
- **⬇ Media kit**: downloads `REL-xxxx-media-kit.zip` with `release.txt` and `factsheet.txt`; every download adds 1 to the release's media-kit count (prototype kitDownload). Drafts have no kit.
- **Record pickup**: adds 1–5,000 outlets to the release's Pickup count.
- **Discard draft**: by the officer who drafted it, or an approver.
- KPIs, accreditation pipeline and press performance table are unchanged (seed numbers match the prototype).

## Who may do what (enforced on the server)
| Action | Who |
|---|---|
| See releases | roles with `press` or `ai` module; district-pinned users see State + own district only |
| See drafts | roles with `press` only |
| Draft | roles with the `press` module (today COMMISSIONER, JD_NEWS); a district-pinned user may draft only for their district, a department-scoped user only for their department |
| Approve & issue | COMMISSIONER, JD_NEWS (and must have `press`) |
| Discard draft | drafter or COMMISSIONER / JD_NEWS |
| Media kit download | anyone who can see the issued release (`press` or `ai`) |
| Record pickup | roles with `press` |

All writes are audited: `press.draft`, `press.issue`, `press.discard`, `press.kit`, `press.pickup`.

## API
- `GET /api/press/releases` (newest first; drafts by draft time), `GET /api/press/releases/{id}`
- `POST /api/press/releases` `{title, dept, district, body, language, hoursAfterEvent?}` → Draft
- `POST /api/press/releases/{id}/issue`, `POST /api/press/releases/{id}/discard`
- `GET /api/press/releases/{id}/kit` → zip (a GET so the browser download helper can use it; it counts the download)
- `POST /api/press/releases/{id}/pickup` `{outlets}`

## Notes
- New columns on `press_release`: status, language, body (≤20,000 chars), draftedBy, draftedAt, approvedBy. Rows without a status count as issued.
- The AI "Press Release Composer" approval still issues a release directly (the agent approval is the human sign-off); it now uses the same REL numbering and stores the text, the run's starter as drafter and the approver.
- Tests: `PressTest` (draft/issue numbering and reach, 403s for DIO and DD on draft/issue/pickup, drafts hidden from AI-only roles, validation, kit zip contents and counter, pickup).
