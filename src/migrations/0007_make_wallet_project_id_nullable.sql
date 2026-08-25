-- Migration 0007: Make support_wallet.projectId nullable
-- Allows creating support wallets for clients without requiring a project reference

ALTER TABLE support_wallet ALTER COLUMN "projectId" DROP NOT NULL;

-- Update existing wallets to have a projectId if they somehow don't
-- (no-op for existing data, but ensures consistency)

-- The foreign key constraint remains, so existing project references are preserved
-- and new client-only wallets can have NULL projectId
