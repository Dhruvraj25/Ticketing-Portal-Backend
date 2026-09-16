-- Migration 0017: Project-wise Microsoft Teams channel configuration
--
-- One row per project. Admin-only (enforced in the route layer, not here).
-- webhookUrl is a secret (Teams webhook URLs embed an auth signature) — it is
-- never read back by any API response; only configured/enabled/updatedAt are
-- ever returned to the frontend (see Backend/src/routes/teams-notification.ts).
--
-- Purely additive: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Does not touch any existing table, column, index, or row.

CREATE TABLE IF NOT EXISTS "project_teams_channel" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL UNIQUE REFERENCES "project"("id") ON DELETE CASCADE,
  "webhookUrl" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "configuredBy" text REFERENCES "user"("id") ON DELETE SET NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_teams_channel_enabled_idx"
  ON "project_teams_channel" ("enabled");
