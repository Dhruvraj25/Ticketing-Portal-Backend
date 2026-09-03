-- Migration 0012: User profile fields + client tenant model
--
-- Adds:
--   1. about / timezone — user profile fields persisted on the user row.
--   2. accountId / clientType — client tenant model. Each client organization
--      has one Client Approver (clientType='approver') and multiple Standard
--      Client users (clientType='standard'). accountId groups users of the
--      same organization so a Standard Client's tickets are visible to their
--      Client Approver while other organizations stay fully isolated.
--   3. Branding default renamed to Support Hero (user-facing product name).
--
-- Data safety:
--   - Existing client users become the approver of their own organization
--     (accountId = own id, clientType = 'approver'), preserving current
--     behavior: they keep creating and approving tickets as before.
--   - Internal staff (developer/project_manager/admin) get no tenant fields.

-- Profile fields
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "about" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;

-- Tenant fields
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "accountId" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "clientType" text;

-- Backfill: every existing client becomes the approver of their own org.
-- Safe to re-run (idempotent guards).
UPDATE "user"
SET "accountId" = "id", "clientType" = 'approver'
WHERE "role" = 'client' AND ("accountId" IS NULL OR "accountId" = '');

-- Only clients are governed by the tenant model.
UPDATE "user"
SET "clientType" = NULL, "accountId" = NULL
WHERE "role" <> 'client';

-- Indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS "user_account_id_idx" ON "user" ("accountId");
CREATE INDEX IF NOT EXISTS "user_client_type_idx" ON "user" ("clientType") WHERE "role" = 'client';

-- Branding default → Support Hero (user-facing product name).
ALTER TABLE "branding" ALTER COLUMN "companyName" SET DEFAULT 'Support Hero';