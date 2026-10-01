-- SupportHub: company-wide Support Wallet (schema only — additive, idempotent).
-- Mirror of Frontend/lib/db/migrations/0035_add_company_wallet.sql.
--
--   company                     — the customer organisation (authoritative).
--   user.companyId              — which company a client user belongs to.
--   support_wallet.companyId    — the company that owns the wallet; UNIQUE, so
--                                 a company has at most one wallet.
--
-- No data is changed here. Existing users/wallets are linked to companies by
-- scripts/migrate-company-wallets.ts (dry-run report first, then --apply),
-- which preserves every wallet row id, balance and wallet_transaction.
--
-- support_wallet.clientId is intentionally KEPT (NOT NULL, FK) as the wallet's
-- primary contact so already-deployed code keeps working during rollout; it no
-- longer decides who can see or use a wallet. support_wallet.companyId stays
-- nullable at the DB level for the same reason (older code inserts wallets
-- without it); the application always sets it, and the migration script links
-- any row left without one. After every environment runs the new code it can
-- be tightened with:
--   ALTER TABLE support_wallet ALTER COLUMN "companyId" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "company" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
-- A company code, when set, identifies exactly one company (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS "company_code_unique_idx" ON "company" (lower("code")) WHERE "code" IS NOT NULL;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
DO $$ BEGIN
  ALTER TABLE "user" ADD CONSTRAINT "user_companyId_company_id_fk"
    FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "user_company_id_idx" ON "user" ("companyId");

ALTER TABLE "support_wallet" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
DO $$ BEGIN
  ALTER TABLE "support_wallet" ADD CONSTRAINT "support_wallet_companyId_company_id_fk"
    FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ONE wallet per company (NULLs — not yet linked — are not constrained).
CREATE UNIQUE INDEX IF NOT EXISTS "support_wallet_company_id_unique_idx" ON "support_wallet" ("companyId");
