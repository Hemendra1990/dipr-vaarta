# Administration and account security (feat/admin)

## Modules
Two new modules in the **Administration** nav group, both **Commissioner only** (added to `Role.Modules.ALL`, which only
`COMMISSIONER` uses; every other role's list is unchanged):

| Key | Label | Content |
|---|---|---|
| `users` | Users & access | KPIs (users, active, signed in this week, locked now, deactivated); search / role / status filters; table of every login with role, area (scope), status (Active, Temporary password, Locked, Deactivated) and last sign-in; per row: Edit, Reset password, Unlock (when locked), Deactivate / Reactivate; "+ Add a user" |
| `audit` | Audit log | Paged (50 per page, newest first) view of `audit_event`, filtered by user, action (exact action or a whole group like "Users & access (all)"), from / to date (IST days) and "detail contains" |

Every signed-in user also gets a **Password** button in the top bar (next to the theme toggle) to change their own password.

## API
| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/users` | Commissioner | All users with role, scope, active, locked, lockedUntil, lastSignInAt, createdAt, mustChangePassword, self |
| `GET /api/users/options` | Commissioner | Roles with the scope each needs, districts, departments, vendors, min password length |
| `POST /api/users` | Commissioner | Create `{username, displayName, role, district?, department?, vendorId?, password}` |
| `POST /api/users/{id}` | Commissioner | Edit display name, role and scope |
| `POST /api/users/{id}/active` | Commissioner | `{active: true|false}` deactivate / reactivate |
| `POST /api/users/{id}/reset-password` | Commissioner | Returns `{temporaryPassword}` once |
| `POST /api/users/{id}/unlock` | Commissioner | Clears a sign-in lock |
| `GET /api/audit?user=&action=&from=&to=&q=&page=&size=` | Commissioner | `{items, total, page, size, pages}`; size capped at 200 |
| `GET /api/audit/facets` | Commissioner | Distinct users, actions and action groups for the filters |
| `POST /api/auth/password` | any signed-in user | `{currentPassword, newPassword}` |

All writes use POST (the client has no PUT/DELETE helper), matching the rest of the API.

## Decisions
- **Usernames**: 3–40 characters, lower-case letters, digits, dot, dash, underscore; stored lower-case; unique ignoring case; cannot be changed after creation.
- **Scope follows the role** and is checked against reference data on the server: DIO needs one of the 31 districts;
  Department Nodal Officer needs a department from `reference.json` `departments`; Vendor needs a vendor code in the
  vendor directory (if the directory is empty, i.e. no sample data, the code must look like `PR-K02`). Roles without a
  scope drop any stray scope fields. The scope label is generated: "Mandya district only", "Energy campaigns",
  "PR-K01 · own orders and bills", or the role's default scope.
- **Self-protection**: the Commissioner cannot deactivate their own login or change their own role (so at least one
  Commissioner always remains). Editing their own display name is allowed.
- **Deactivation** is immediate: `JwtAuthFilter` already loads the user on every request and ignores inactive users, so
  open sessions stop at once. Role / scope edits also apply on the user's next request. Records and audit history stay.
  Reactivation also clears any lock.
- **Password rule** (create, reset, change): at least 8 characters with at least one digit, at most 128; a change must
  differ from the current password and needs the current password. BCrypt as before.
- **Reset password** generates a temporary password (`Abcdef-2345` style, from a secure random source), shows it to the
  Commissioner once, never stores it in clear, and clears any lock. New users and reset users are flagged
  `mustChangePassword`; after signing in with such a password the user is asked to choose their own (they may press
  "Later" — **Decision:** this is a prompt, not a hard block, so a field officer is never stuck out of the portal).
- **Lockout**: 5 wrong passwords in a row lock the login for 15 minutes; the message says when to retry in IST
  ("Try again after 4:29 PM IST.", response `code: "locked"`, `retryAt`). While locked even the right password is refused.
  A successful sign-in resets the count. The Commissioner can unlock early (Unlock, Reset password or Reactivate).
  Unknown user IDs get the same "user ID or password is wrong" message and do not lock anything.
- A deactivated user who enters the right password is told the login is deactivated (wrong passwords still get the generic message).
- **Last sign-in** time is stored on each successful sign-in and shown in Users & access.
- **Audit**: new actions `login.failed`, `login.locked`, `user.create`, `user.update`, `user.deactivate`,
  `user.reactivate`, `user.reset-password`, `user.unlock`, `password.change`. Failed sign-ins for unknown user IDs are
  recorded as `anonymous` with the attempted ID (first 60 characters). The audit log is read-only; there is no delete.
- Audit date filters are IST calendar days; times are shown in IST.
- Not done (documented extension points): existing JWTs are not revoked when a password is reset (deactivate does
  revoke); OTP at sign-in remains as in the prototype note.

## Schema
`app_user` gains nullable columns `failed_logins`, `locked_until`, `last_sign_in_at`, `created_at`,
`password_changed_at`, `must_change_password` (nullable so `ddl-auto: update` migrates existing databases).

## Tests
`AdminTest.java`: only the Commissioner can list/create users and read the audit log; username uniqueness and
scope validation against districts / departments / vendors; role edit clears old scope; cannot deactivate or demote
yourself; deactivation ends sessions and sign-in; reset password; password change rules; lockout after 5 wrong
passwords, refusal while locked, unlock, and the audit entries.
