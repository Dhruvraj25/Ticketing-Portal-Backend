# Backend Notes — Support Hero Portal

## Timestamps

- All timestamps are stored in PostgreSQL `timestamp` columns and are written
  as UTC wall-clock values (the server always sends `new Date()` — UTC — when
  persisting).
- Every API response serializes `Date` values as ISO 8601 UTC strings
  (`2026-09-03T10:15:30.000Z`) — Express's default `JSON.stringify(Date)`
  behavior — so the frontend receives an unambiguous instant plus the `Z`
  suffix. The frontend is responsible for rendering in the user's selected
  `timezone`.
- Do NOT perform client-side timezone conversion on the backend and then send
  converted strings; convert only at display time. This avoids double
  conversions.
- Date-range report filters (`dateFrom`/`dateTo`) are interpreted in UTC
  (`dateTo` is normalized to `T23:59:59.999Z`).

## Ticket Workflow (backend is the source of truth)

The authoritative state machine lives in `src/lib/ticket-workflow.ts`. The
status endpoint (`PATCH /api/tickets/:id/status`) validates every transition
against the transition map AND the caller's role:

- Developer completes work → `manager_review` (never directly to client review).
- Manager Review → `client_review` (forward to client) or `rework` (internal).
- Client review → `closed` (approve) or `request_for_revision` (client revision).
- `rework` (manager-internal) and `request_for_revision` (client-initiated)
  are SEPARATE states.

## Client Tenant Model

- `user.accountId` groups client users into one organization; `user.clientType`
  is `approver` (one per org) or `standard`.
- A Standard Client's tickets are visible to the whole organization (creator,
  approver, other standard users of the same `accountId`) — enforced in ticket
  queries, ticket detail authorization, reports, and the client dashboard.
- Other organizations are fully isolated.

## Email

- All user-facing email content uses **Support Hero** branding.
- Every generated link uses `FRONTEND_URL` via `src/utils/frontend-url.ts`.
  In production a missing `FRONTEND_URL` throws — localhost is never used.
- Approval/review emails: every distinct approval event is sent through
  `POST /api/email/notification`; the bridge accepts an optional
  `idempotencyKey` and suppresses only exact duplicate submissions within a
  5-minute window. Distinct events always send. The dedupe lives in
  `src/utils/window-dedupe.ts` and is unit-tested (`tests/dedupe.test.ts`).

## Notification Preferences (Requirement #14)

- Storage: `notification_preferences` table (migration `0015_notification_preferences.sql`,
  NOT yet applied to any database). One row per (user, channel, eventType).
  Channels: `in_app` | `email` | `teams`.
- An ABSENT row means **use the default**, so existing behavior is preserved:
  - In-App: ON, Email: ON
  - Teams: client users follow the customer-level `enable_teams_notifications`
    flag (OFF unless enabled during onboarding); internal staff ON.
- Canonical event keys + human labels live in `src/lib/notification-preferences.ts`
  together with alias resolution (`ticket_resolved`/`awaiting_client_review` →
  `client_review`; `revision_requested`/`ticket_revision_requested` →
  `request_for_revision`, etc.). One preference governs every spelling.
- API:
  - `GET /api/notifications/preferences` →
    `{ channels: [{channel,label}], customerTeamsEnabled, preferences: [{eventType,label,group,inApp,email,teams}] }`
  - `PUT /api/notifications/preferences` body
    `{ preferences: [{ eventType, channel, enabled }] }` — only the
    authenticated user's own rows; eventType may be canonical or an alias.
- Enforcement is backend-only (the frontend is never trusted):
  - In-app creation consults the recipient's `in_app` row (`notification.service`).
  - Email dispatch consults `email` rows (ticket workflow + bridge filter).
  - Teams dispatch consults `teams` rows (workflow + bridge filter).

## Notification Dispatch (Requirements #21 / #3)

- `src/lib/notification-dispatcher.ts` is the single centralized pipeline:
  business event → `dispatchUserNotification(recipient, eventType, payload)` →
  per-channel preference check → In-App row + Email (when a template exists) +
  Teams (when `TEAMS_WEBHOOK_URL` is configured).
- Backend-owned events routed through it: ticket created (→ manager), ticket
  assigned (→ developer), manager review (→ manager), awaiting client review
  (→ client org), ticket closed (→ client org), rework (→ developer), client
  Requested for Revision (→ developer), estimate approved (→ manager).
  Teams is a no-op when disabled/unconfigured and never throws.
- Events that only have an email template on the frontend bridge (estimate
  requested/rejected, additional hours, wallet, welcome, etc.) keep flowing
  through `POST /api/email/notification`; that route enforces the same email
  preferences and requires an authenticated session.

## Frontend API contract (as implemented)

- `PATCH /api/tickets/:id/priority` body `{ priority }` (manager/admin)
- `PATCH /api/tickets/:id/dates` body `{ createdAt?: ISO, closedAt?: ISO|null }` (admin only)
- `PATCH /api/tickets/:id` body subset `{ title, description, type, priority, category, projectId, moduleId, estimatedHours, estimatedCompletionDate, estimateNotes }`
- `PATCH /api/tickets/:id/status` body `{ status }` — validated by the state machine in `src/lib/ticket-workflow.ts`
- `POST /api/projects/:id/reassign` body `{ clientId?, managerId? }` (admin or current project manager)
- `PATCH /api/users/me` body `{ about?, timezone? }`
- `POST /api/notifications` body `{ userId, title, message, link?, ticketId?, eventType? }`
- `POST /api/email/notification` body `{ eventType, to, data, immediate?, idempotencyKey? }`
- `POST /api/reports` body `{ reportType, dateFrom?, dateTo?, projectId?, moduleId?, developerId?, clientId?, status? }`
- `GET /api/reports/form-data`, `GET /api/reports/client-dashboard`,
  `GET /api/reports/revision-rework-counts`

## Tenant & privacy guards (Requirement #5)

- Onboarding directory endpoints (`/api/onboarding/clients`, `/managers`,
  `/history`) now require admin/project_manager (clients must never enumerate
  other organizations' users).
- Module read/write is project-scoped per role; module create/update/delete is
  admin/manager only.
- Wallet admin dashboards (`/api/wallets/stats`, `/low-balance`, `/alerts`)
  are admin-only; wallet lists and mutation are tenant-scoped for clients and
  project managers.