-- Migration 0015: Client-wise notification preferences
--
-- Requirement: Admin and Manager users manage notification preferences PER CLIENT.
-- Client users can no longer manage their own preferences.
--
-- Storage model: one row per (client, channel, eventType) — only stored when an
-- Admin or Manager explicitly changes a preference. An ABSENT row means "use the
-- default" (see src/lib/notification-preferences.ts), which preserves current
-- behavior:
--   - In-App : ON by default
--   - Email  : ON by default
--   - Teams  : follows the customer-level enable_teams_notifications flag for
--              client users (default OFF); ON for internal staff. Individual
--              per-event rows override this default when present.
--
-- Event keys are the canonical keys from src/lib/notification-preferences.ts
-- (e.g. ticket_assigned, manager_review, client_review, rework,
-- request_for_revision, ticket_closed, estimate_approved, ...). Alias event
-- type strings (e.g. ticket_resolved / awaiting_client_review) map to the same
-- canonical key so one preference governs all channel spellings of an event.
--
-- The clientId references the user table where role = 'client'. Each client
-- account (including its Standard Client and Approver users) shares the same
-- notification preferences.

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" serial PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "eventType" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- Uniqueness: one preference record per (client, channel, eventType)
CREATE UNIQUE INDEX IF NOT EXISTS "notification_pref_client_channel_event_idx"
  ON "notification_preferences" ("clientId", "channel", "eventType");

CREATE INDEX IF NOT EXISTS "notification_pref_client_idx"
  ON "notification_preferences" ("clientId");
