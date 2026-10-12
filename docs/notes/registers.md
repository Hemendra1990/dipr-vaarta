# Registers: records you can add, edit and move (feature notes)

Applies to the 16 generic registers (campaigns, empanel, bills, media, social, crisis, welfare, events, election, field,
outdoor, film, publications, archive, grants, admin, rti).

## API
| Endpoint | Purpose |
|---|---|
| `GET /api/registers/{id}/rows` | Rows in scope. Each row now carries its database id as `_id` (not a column; the UI ignores it). |
| `POST /api/registers/{id}/rows` | Add a record. Body: the row as `{fieldKey: value}`. |
| `PUT /api/registers/{id}/rows/{rowId}` | Edit a record (all schema fields are sent and validated; extra stored fields such as a bill's campaign name are kept). |
| `POST /api/registers/{id}/rows/{rowId}/advance` | Move to the next stage, or to `{"stage": "<name>"}` if given (must be a stage of the register). |
| `DELETE /api/registers/{id}/rows/{rowId}` | Delete a record. Commissioner only. |
| `GET /api/registers/{id}/export` | Excel (`Data` sheet) of the rows the user can see, with the upload template's headings and formats, so it can be edited and uploaded back. |

Validation errors return 400 `{message, errors: {fieldKey: message}}`; the form shows each message under its field.

## Decisions
- **Who may write:** any user who can open the register's module, except vendors (read-only). The `upload` module is not
  needed to add or edit single records (so a nodal officer can update their own campaigns).
- **Delete:** Commissioner only, with a confirm dialog.
- **Validation:** the same rules as Excel upload (FieldCoercer): required fields, numbers, dates, months, financial year,
  allowed lists, district names, Statewide only where the field allows it. The ID column (type `id`) must be unique within
  the whole register (case-insensitive), not only within the user's scope. Admin (offices) has no ID column, so no check.
- **District officer (DIO):** may add/edit/move only records of their own district. This also holds on geo-all registers
  (campaigns, film, publications, grants): they still see every row there, but statewide or other-district rows open read-only,
  and a new row must name their district (Statewide is refused).
- **Department nodal officer:** only rows of their department; a row's department cannot be changed to another one.
- **Next stage:** the next stage in the register's order, skipping exception stages that are not the normal next step:
  Returned, Rejected, On hold, Not needed, Referred to Returning Officer, Suspended, Expired, Idle, UC overdue. From an
  exception stage or the last stage there is no "Move to" button; any stage can still be set in the edit form or by name.
- **Move vs. unsaved edits:** "Move to …" is disabled until form changes are saved, so a move never discards edits.
- **Audit:** `register.create`, `register.update` (lists changed fields), `register.advance` (from -> to), `register.delete`.
  Export is a read and is not audited.
- **Export scope:** all rows the user can see in that register (server scope), not the on-screen filters or drill level.
- **UI:** module header has "⬇ Export Excel" (everyone who can open it), "⬆ Upload Excel" (unchanged), "+ Add record"
  (writers). Clicking a table row (or Enter on it) opens a side panel with a form generated from the schema: text/number
  inputs, date and month pickers, selects for lists, districts and Yes/No. District/department selects are narrowed to the
  user's own district/department. Esc or clicking outside closes it. New records default to the first stage, the user's
  district/department and the current financial year.
