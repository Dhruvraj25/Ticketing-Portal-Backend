-- Migration 0015: Per-user notification preferences
--
-- Requirement #14: the portal supports SEPARATE ON/OFF preferences for EVERY
-- notification event under EACH channel (Teams / Email / In-App). A single
-- global toggle is not sufficient.
--
-- Storage model: one row per (user, channel, eventType) — only stored when the
-- user explicitly changes a preference. An ABSENT row means "use the default"
-- (see src/lib/notification-preferences.ts), which preserves current behavior:
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
-- Data safety: no backfill is needed — existing rows are untouched and absent
-- preference rows keep today's notification behavior.

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "eventType" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_pref_user_channel_event_idx"
  ON "notification_preferences" ("userId", "channel", "eventType");

CREATE INDEX IF NOT EXISTS "notification_pref_user_idx"
  ON "notification_preferences" ("userId");
