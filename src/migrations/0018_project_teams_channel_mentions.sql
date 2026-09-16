-- Migration 0018: optional Team ID / Channel ID on project_teams_channel
--
-- Enables real Microsoft Teams @mention delivery via Microsoft Graph
-- (services/teams/teams-graph-client.ts). A webhook URL alone has no
-- extractable team/channel identity, so an admin who wants @mentions must
-- separately supply the Team ID and Channel ID for that project's channel.
--
-- Both columns are NULLABLE and OPTIONAL:
--   - Existing rows are unaffected (webhook-only delivery continues exactly
--     as before — no mention attempt is made when either is NULL).
--   - No existing data is touched, no table is dropped or renamed.
--
-- Purely additive: ADD COLUMN IF NOT EXISTS twice. Safe to run more than once.

ALTER TABLE "project_teams_channel" ADD COLUMN IF NOT EXISTS "teamId" text;
ALTER TABLE "project_teams_channel" ADD COLUMN IF NOT EXISTS "channelId" text;
