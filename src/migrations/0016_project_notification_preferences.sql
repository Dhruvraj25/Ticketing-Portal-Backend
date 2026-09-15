-- SupportHub: PROJECT-wise notification preferences (replaces client-wise as the
-- authoritative source). One row per (project, channel, eventType); only stored
-- when an Admin/Manager explicitly changes a preference. An ABSENT row means
-- "use the next fallback":
--
--   1. project_notification_preferences  (authoritative — project-wise)
--   2. notification_preferences          (legacy client-wise INHERITANCE fallback)
--   3. built-in defaults                 (in_app/email ON; Teams follows the
--                                         customer enable_teams_notifications flag)
--
-- The legacy client table is intentionally NOT modified or deleted: existing
-- client settings keep applying as an inheritance fallback until a project
-- explicitly overrides them (safe, reversible migration — no data copy).
--
-- Channels: in_app | email | teams. Event keys are the canonical keys from
-- src/lib/notification-preferences.ts (alias spellings map to the same key).

CREATE TABLE IF NOT EXISTS "project_notification_preferences" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "eventType" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- Uniqueness: one preference record per (project, channel, eventType)
CREATE UNIQUE INDEX IF NOT EXISTS "project_notif_pref_project_channel_event_idx"
  ON "project_notification_preferences" ("projectId", "channel", "eventType");

CREATE INDEX IF NOT EXISTS "project_notif_pref_project_idx"
  ON "project_notification_preferences" ("projectId");
