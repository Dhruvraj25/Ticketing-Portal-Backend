# Final Requirements Audit — Support Hero Backend

Audit date: 2026-09-03 · Scope: Backend folder only · Frontend NOT modified.

Verification executed: `npm test` (49/49 pass), `npx tsc --noEmit` (clean),
`npm run build` (clean).

---

## 1. Files modified

| File | Change |
| --- | --- |
| `apply-migration.mjs` | Removed hard-coded production DB credential; now requires `DATABASE_URL` env var |
| `src/lib/notification-dispatcher.ts` | Rewritten into the centralized, preference-aware pipeline (in-app + email + Teams); legacy `dispatch`/`NotificationDispatcher` kept |
| `src/lib/notification-preferences.ts` | (new) Event catalog, alias map, channel defaults, resolution + recipient-filter helpers |
| `src/repositories/notification-preference.repository.ts` | (new) Preference persistence (find/upsert by user & user set) |
| `src/repositories/notification.repository.ts` | (unchanged this pass — service-level in-app enforcement added) |
| `src/services/notification.service.ts` | `createNotification` now enforces the recipient's In-App preference per event |
| `src/services/notification-preference.service.ts` | (new) GET/PUT semantics + bulk preference loader |
| `src/controllers/notification.controller.ts` | Preference handlers (user resolved from DB session) |
| `src/routes/notifications.ts` | Added `GET/PUT /api/notifications/preferences`; POST now reports pref skips |
| `src/routes/email-notification.ts` | `requireAuth` on the bridge; server-side per-recipient Email preference filter; dedupe extracted to util |
| `src/routes/teams-notification.ts` | `requireAuth` + internal-staff guard on admin endpoints; per-event Teams preference enforcement |
| `src/services/ticket.service.ts` | Ticket workflow notifications routed through the centralized dispatcher (created/assigned/manager_review/awaiting-review/closed/rework/revision/estimate-approved) |
| `src/services/user.service.ts` | `getCurrentUser` / `getClientApprovers` expose `enableTeamsNotifications` for defaults |
| `src/repositories/user.repository.ts` | `findByPk` / `findByAccountId` select `enableTeamsNotifications` |
| `src/models/schema.ts` | `notificationPreference` table + relation |
| `src/routes/onboarding.ts` | Person-directory endpoints gated to internal staff |
| `src/services/module.service.ts`, `src/controllers/module.controller.ts`, `src/routes/modules.ts` | Role/project scoping for module browse; admin/manager-only for module writes |
| `src/services/wallet.service.ts`, `src/controllers/wallet.controller.ts` | Tenant scoping (clients → own org, managers → their project clients, admin → all); admin-only wallet dashboards; client cannot add hours |
| `src/repositories/wallet.repository.ts` | Added `findManyByClientIds` |
| `src/services/email/email.transporter.ts`, `src/server.ts`, `src/routes/dev-email.ts` | Branding/comments/log prefixes cleaned to Support Hero; stale doc references removed |
| `docs/backend-notes.md` | Architecture + notification-preferences + frontend API contract documented |

## 2. Files created

- `src/migrations/0015_notification_preferences.sql`
- `src/lib/notification-preferences.ts`
- `src/repositories/notification-preference.repository.ts`
- `src/services/notification-preference.service.ts`
- `src/utils/window-dedupe.ts`
- `tests/notification-preferences.test.ts`
- `tests/dedupe.test.ts`
- `docs/requirements-audit.md` (this file)

## 3. Database migrations created

- `src/migrations/0015_notification_preferences.sql` — `notification_preferences`
  (userId, channel, eventType, enabled, timestamps; unique (userId,channel,eventType),
  user index, FK → user ON DELETE CASCADE). Absent row = default, so no backfill
  needed and current behavior is preserved.

## 4. Migrations applied?

**NOT applied.** Migrations 0012–0015 were reviewed only. Migration ordering and
idempotency were checked (0012 backfills idempotently, 0013 is duplicate-safe,
0014 uses `ADD COLUMN IF NOT EXISTS`). No migration is executed automatically by
application code. Apply in the target DB deliberately, e.g.:

```bash
DATABASE_URL="$(your database url)" node apply-migration.mjs   # legacy helper
# then apply 0015 (or run through your usual migration tool):
#   psql "$DATABASE_URL" -f src/migrations/0015_notification_preferences.sql
```

## 5. API changes

- `GET /api/notifications/preferences`, `PUT /api/notifications/preferences`
  (body `{ preferences: [{ eventType, channel, enabled }] }`) — Requirement #14.
- `POST /api/email/notification` now requires authentication and skips
  recipients who disabled the event on Email.
- `POST /api/teams/notification` requires authentication; `/test`, `/status`,
  `/config/validate`, `/queue*`, `/monitor*` require admin/project_manager.
- `/api/onboarding/clients`, `/managers`, `/history` → admin/project_manager only.
- Module endpoints now enforce role/project scope (403 on violation).
- Wallet endpoints now tenant-scope lists/detail; `/stats`, `/low-balance`,
  `/alerts` → admin only; clients blocked from `/add-hours`.
- Response payloads for the audited frontend endpoints are unchanged
  (see "Frontend API contract" in `docs/backend-notes.md`).

## 6. Notification architecture

`src/lib/notification-dispatcher.ts` is now the single centralized pipeline and
IS referenced by the backend business flow (`src/services/ticket.service.ts`):

```
business event
  → dispatchUserNotification(recipient, eventType, payload)   (backend resolves recipient)
  → preference check per channel (in_app | email | teams)
  → create In-App notification when enabled
  → send Email when enabled AND an email template exists
  → send Teams when enabled AND TEAMS_WEBHOOK_URL configured (else no-op)
```

Backend-owned events: ticket_created (manager), ticket_assigned (developer),
manager_review (manager), awaiting client review / resolved → client_review
(client org), ticket_closed (client org), rework (developer), request_for_revision
(developer), estimate_approved (manager). Frontend-originated events still enter
through `POST /api/email/notification` / `POST /api/teams/notification`, which
enforce the same preference rules — the backend no longer depends on the frontend
remembering to email. No second notification system was introduced; the existing
routes/controllers/services remain the transports.

## 7. Notification preference implementation

- Per-user, per-channel (`in_app`/`email`/`teams`), per-event ON/OFF rows;
  defaults preserve prior behavior (In-App/Email ON; Teams follows the
  customer-level `enable_teams_notifications` flag for clients, ON for staff).
- Alias map ensures one toggle governs all spellings of an event
  (e.g. `ticket_resolved`/`awaiting_client_review` → `client_review`).
- Enforced server-side at: in-app creation, workflow email dispatch, Teams
  dispatch, and both frontend bridge routes. Settings can only be read/written
  for the authenticated user (PUT binds `user.id` from the session).
- Contract documented; a settings screen in the frontend should call
  `GET/PUT /api/notifications/preferences`.

## 8. Email behavior

- Distinct events always email; only exact duplicate retries of the same key
  are suppressed for 5 minutes (`src/utils/window-dedupe.ts`, unit-tested).
  Approval emails are per-cycle on the bridge (frontend supplies per-cycle
  `idempotencyKey`) AND estimate-approval is now emitted by the backend on the
  `estimate_approved` status transition (each transition is a distinct event —
  no global suppression).
- Backend-originated workflow emails resolve recipients server-side from the
  ticket's own tenant (creator + Client Approver; manager; developer).
- Email templates are Support Hero branded and use `FRONTEND_URL` only;
  production refuses localhost fallback (tested).

## 9. Teams behavior

- `notification-dispatcher.ts` now drives Teams for backend events. Teams is
  graceful: `enabled + TEAMS_WEBHOOK_URL` → queued delivery; disabled → no-op;
  unconfigured → no crash. Per-event Teams preferences are consulted, with the
  legacy customer-level default intact.

## 10. Client privacy / security

Verified/stripped at the backend serializer/query layer for clients:
ticket detail + list fields (identity/assignment/estimate bookkeeping stripped),
history (only created/closed, actor identity removed), comments (internal staff
identity hidden), attachments (uploader identity hidden), notifications (own
rows only), reports (client reports tenant-scoped; actual-vs-estimated denies
clients), onboarding user directory (now internal staff only). Status strings
and role checks are unchanged to preserve the shipped frontend contract.

## 11. Tenant isolation

Ticket/project/report/dashboard queries scope clients to `accountId` org;
approver sees standard users' tickets and vice versa. Wallet and module access
were scoped this pass (clients → own org; managers → their project clients).
Client from Org A changing an ID in a request cannot reach Org B rows (asserted
per-object via `assertTicketAccess`, `assertModuleAccess`, `assertWalletAccess`).

## 12. Workflow / state machine

`src/lib/ticket-workflow.ts` remains authoritative and is enforced by
`PATCH /api/tickets/:id/status` (transition map + role rules). Developer →
manager_review enforced; developer → client_review/resolved rejected; manager
rework and client Requested for Revision remain distinct states; unauthorized
role transitions rejected (unit-tested). The Manager Review → Client Review /
Rework flow was preserved unchanged.

## 13. Reports

Actual vs Estimated (developer/date/project/task dimensions, estimated/actual/
variance/variance %) — implemented and unit-tested for authorization (clients
denied). KPI and client-dashboard report endpoints exist and are scoped. Report
functions remain unchanged apart from already-existing tenant scoping.

## 14. Reassignment / dates authorization

`POST /api/projects/:id/reassign` validates target users by role and caller by
admin/current-manager; arbitrary IDs cannot bypass checks (service-level).
`PATCH /api/tickets/:id/dates` is admin-only, validates dates, and records the
authenticated admin (never body-supplied actor) in ticket history.

## 15. Tests executed

- `npm test` — **49 passed, 0 failed**
- `npx tsc --noEmit` — clean
- `npm run build` — clean

Coverage: notification preference persistence shape (migration/model),
preference defaults + alias resolution + enforcement helpers (9 tests),
approval email idempotency semantics (6 tests), client privacy, workflow state
machine, actual-vs-estimated authorization, email normalization, Support Hero
branding and FRONTEND_URL production behavior. Test-file classification:

A. **Unit/static tests — executed** (49/49 green; tsc/build green)
B. **Database integration tests — NOT executed** (no database available;
   preference persistence, per-recipient filtering, dispatcher events, cross-tenant
   queries, reassignment/date guards require a live Postgres)
C. **Email delivery tests — NOT executed** (provider is env-driven; SMTP/Graph
   delivery needs credentials)
D. **Production deployment verification — NOT executed**

## 16. Build result

`npm run build` (tsc) — success. No runtime smoke test was run.

## 17. Remaining issues

1. **Production DB credential rotation REQUIRED.** `apply-migration.mjs` contained
   a live Neon credential and it is still present in git history
   (commit `cca62aa`, `Initial backend`). The working tree now reads
   `DATABASE_URL` from the environment, but the exposed credential must be
   rotated/revoked (Neon: create a new password / rotate the role) because it
   was committed. No secrets are printed in logs/tests/errors.
2. **Migration 0015 not applied** to any database.
3. Some workflow events (manager_review, rework) have in-app + Teams dispatch
   but **no dedicated email template exists** — no email is invented for them.
   If an email is desired, add a template + dispatcher case.
4. If the frontend still posts emails/Teams for events the backend now emits
   (assigned, closed, awaiting review, estimate approved…), remove those
   frontend posts to avoid duplicates.
5. `enable_teams_notifications` has no backend writer endpoint visible in this
   repo (read at onboarding/frontend layer); confirm the frontend/onboarding
   path that sets it still exists, otherwise add one.
6. `/api/onboarding/existing-modules` and the duplicate-check endpoints remain
   broadly readable (module names/booleans only) — low risk, left for
   frontend-contract compatibility.
7. Email bridge `requireAuth` added — verify the frontend server actions forward
   the session cookie (standard for same-origin server actions).

## 18. Production deployment steps

1. **Rotate the leaked database credential** (see issue 1) and update
   `DATABASE_URL` in the production environment.
2. Set `FRONTEND_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `EMAIL_PROVIDER`
   (+ Microsoft SMTP or Resend credentials) and `TEAMS_WEBHOOK_URL` (optional) in
   the deployment environment (see `.env.example`).
3. Apply migrations 0012–0015 in order against production (manually, not from
   app code); 0015 creates the preferences table (defaults preserve behavior,
   no backfill).
4. Deploy the backend; verify health endpoint, login, ticket creation, and one
   full workflow cycle in staging first.
5. Verify in-app/email/Teams notifications fire for assigned → manager review →
   client review → closed, and that the notification settings API reads/writes.
6. Confirm frontend notification settings UI matches the documented payloads.

---

## Requirement status matrix

Original requirements referenced in the audit brief (the remaining ~25 were not
enumerated in the brief and are not assessed here):

| Req | Area | Status | Notes |
| --- | --- | --- | --- |
| #5 | Client privacy / tenant isolation | **COMPLETE** | Serializer + history/comment/attachment redaction, tenant-scoped queries, internal-staff onboarding directory guard. Status-string semantics intentionally unchanged for frontend contract. |
| #9 | Approval emails per distinct cycle | **COMPLETE** | Backend emits on `estimate_approved`/close transitions; bridge dedupe is exact-key only within 5 min (tested); no global suppression. |
| #14 | Per-event notification preferences (Teams/Email/In-App) | **COMPLETE** | Model + migration 0015 + GET/PUT API + backend enforcement in all three channels; defaults preserve behavior; users manage only their own. |
| #21 | Every business event dispatches its own notifications | **PARTIAL** | Centralized preference-aware dispatcher now used by backend workflow events; frontend-originated events still enter via bridges (which now enforce prefs + auth). Email only where a template exists — manager_review/rework have none. |
| #3 | Teams dispatcher wired, graceful | **COMPLETE** | `notification-dispatcher.ts` referenced by ticket.service; Teams no-ops when disabled/unconfigured; per-event prefs respected. |
| #7 | Workflow state machine | **COMPLETE** | Authoritative transitions + role rules enforced & tested; manager rework vs client revision distinct; flow preserved. |
| #16 | Hard-coded production DB credential | **COMPLETE (code)** | Removed from source; env var required. Rotation of leaked credential still outstanding (operator action). |
| #17 | Migrations review | **COMPLETE** | 0012–0015 reviewed/ordered/idempotent; not applied anywhere. |
| #18 | Tests | **PARTIAL** | Unit/static green (49). DB integration / email delivery / deployment verification not executable here (no DB/credentials). |

**Frontend-contract compatibility (#8), FRONTEND_URL/branding (#9/URL), email
recipient security (#10), email normalization (#11), timezone handling (#12),
actual-vs-estimated (#13), reassignment authorization (#14-area), admin date
editing (#15-area), and client-approver visibility (#6-area) were re-verified
this pass; existing implementations were found complete and are covered by code
review, existing tests, or both. Cross-cutting verification against the actual
frontend (contract) still requires the frontend repo; documented payloads in
`docs/backend-notes.md`.**
