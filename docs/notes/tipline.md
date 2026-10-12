# Tipline, WhatsApp bot and live updates — notes for SPEC.md

## What was added
- **WhatsApp bot webhook** `POST /api/bot/inbound` (no JWT). The bot gateway sends the shared secret in the
  `X-Vaarta-Bot-Key` header. Missing key → 401, wrong key → 403 (constant-time compare).
- **Live updates** `GET /api/updates?since=<ISO instant>` → `{now, claims[], feed[]}`; the console polls it every 15 s.
- **Claim detail** `GET /api/tipline/claims/{id}` → `{claim, history[], related[], canEdit, canPublish}`.
- **Claim edit** `POST /api/tipline/claims/{id}/edit` `{verdict?, category?, clarification?}`.
- **Bot numbers** `GET /api/bot/contacts`, `POST /api/bot/contacts` `{phone, district, name?, username?, active?}`.
- Simulator: `node tools/bot-sim.mjs` (see below).
- New columns: `claim.clarification`, `claim.match_of`, `claim.contact`, `claim.created_by`, `feed_item.channel`,
  `feed_item.created_by`; new table `bot_contact` (phone, district, name, username, active).

## Bot key (README section to merge)
### WhatsApp bot
The bot gateway posts every incoming WhatsApp message to `POST /api/bot/inbound` with the header
`X-Vaarta-Bot-Key: <key>`. Set the key with the `VAARTA_BOT_KEY` environment variable (or property `vaarta.bot-key`).
The development default is `vaarta-dev-bot-key`; **change it in production**.

Body: `{ "from": "+91 98450 12345", "type": "claim|pulse|report|esc|rel", "text": "...", "lang": "Kannada",
"district": "Mysuru", "forwards": 40, "scheme": "Gruha Lakshmi", "sentiment": "Mixed" }` — only `from` and `text`
are required. The response is `{accepted, kind, id, status, reply}`; `reply` is the text the bot sends back.

Try it with the app running: `node tools/bot-sim.mjs` (all samples), `node tools/bot-sim.mjs claim dup pulse`,
`node tools/bot-sim.mjs --every 20` (random sample every 20 s), or
`node tools/bot-sim.mjs --text "Free laptops for all students" --district Mysuru`.
Env: `BOT_URL` (default `http://localhost:8080/api/bot/inbound`), `VAARTA_BOT_KEY`.

## Decisions
- **Message kinds.** `type` missing or `claim` → tipline claim. `pulse`, `report`, `esc` (citizen escalation) and
  `rel` (coverage) → ground-feed item. A DIO can instead start the text with `PULSE:`, `REPORT:`, `ESC:` or `COVERAGE:`.
- **Who can post to the ground feed over WhatsApp:** only numbers registered in `bot_contact` (one per District
  Information Office). The item always goes to the officer's own district, whatever district the message names.
  An unregistered number gets a polite refusal (`accepted: false`) and nothing is stored; the attempt is audited.
- **Demo numbers:** on first start every district gets `+91 90000 1nnnn`, nnnn = the district's position in the
  reference list (Raichur `+91 90000 10027`, Koppal `+91 90000 10028`). The Raichur number is linked to `dio.raichur`.
- **Registering numbers:** Commissioner only (`/api/bot/contacts`, audited). The integrator added a "WhatsApp numbers" card on
  Users & access.
- **Claims from the tipline:** district comes from the message (case-insensitive match to the 31 districts); if it is
  missing the bot asks for it and stores nothing. A claim from a registered DIO number uses that district and source
  "District office"; other claims have source "Tipline". The sender's number is stored masked (`+91 98450 xxx45`).
- **Category guess:** keyword rules, checked in order — Synthetic media (video, deepfake, audio, clip, morphed…),
  Fake recruitment (recruitment, posts, vacancy, job, exam fee, UPI…), Public safety (dam, flood, evacuate, riot…),
  Doctored circular (circular, notification, gazette, holiday, schools closed…), Price rumour (price, fare, ticket,
  hike, petrol, milk…); anything else is a Scheme rumour. Language: Kannada or Urdu script is detected, otherwise
  the language the bot reports, otherwise English. Officers can correct both in the claim panel.
- **Duplicate auto-match:** a new message is compared with every original Published claim by shared words
  (stop-words removed; Jaccard, or overlap with the shorter text × 0.85; threshold 0.6, at least 3 words). On a match
  the new claim is stored as **Published** with the original's verdict, type and clarification, `matchOf` = original
  id, and the same approver, and the bot replies with the existing verdict. This does not bypass the human approver
  rule: it repeats a verdict a named officer already approved.
- **Editing a claim:** verdict (free text ≤120, suggestions False / Misleading / Partly true / True / Unverified /
  Not of public interest), type (the six types) and clarification (≤1,000, sent to people who forwarded it) can be
  changed by anyone who can triage it (Commissioner, JD News, DIO for their district) while it is New, Triaged or
  Draft ready. Published and escalated claims are locked. Publishing stays Commissioner / JD News only, and now
  refuses a claim with no verdict. Every edit is audited with the before → after values.
- **History** in the claim panel is read from the audit log (events whose detail starts with the claim id). Sample
  claims have no history.
- **Live updates:** only items in the user's scope (tipline module → claims, offices module → feed; DIO → own
  district). Items the user created in the console are left out (they already saw their own toast). A `since` older
  than 24 h is clamped to 24 h; at most 50 of each per call. Without `since` the endpoint only returns `now`.
  The console asks for a 10 s overlap and de-duplicates by id, so an item saved during a poll is not lost; it does
  not poll while the tab is hidden and catches up when it is shown again.
- **Console behaviour (as the prototype's addClaim/addFeed):** toasts "New tipline claim" (… queued for triage /
  matched an existing clarification), "Field pulse received", "Citizen escalation", "Daily report filed",
  "Coverage uploaded"; at most three toasts per poll plus "N more updates". Unseen counters show as red badges on
  "Tipline & claims" and "District offices" (and in the mobile module picker) and clear when that module is opened.
  New rows flash with the prototype's `new` highlight for 2.5 s. Both modules show the "WhatsApp feed" chip.
- Feed rows show "via WhatsApp" for bot items and "posted by <name>" for console posts.

## Tests
`backend/src/test/java/gov/dipr/vaarta/BotAndTiplineTest.java`: bot key 401/403, claim ingest with category and
language guess, missing-district reply, duplicate auto-match, feed ingest scoped to the DIO's district and refused
for unregistered numbers, updates scoping for DIO / Commissioner / JD / DD, edit-before-publish rules and history.
